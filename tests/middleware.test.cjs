const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync('middleware.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function setup({ user = null, blocked = false, confirmation = false } = {}) {
  let calls = 0;
  function jar() {
    const values = new Map();
    return { getAll: () => [...values.values()], set: (name, value, options = {}) => {
      const cookie = typeof name === 'object' ? name : { name, value, ...options };
      values.set(cookie.name, cookie);
    }};
  }
  const response = (url) => ({ url, cookies: jar() });
  const context = { exports: {}, process: { env: { NEXT_PUBLIC_REQUIRE_EMAIL_CONFIRMATION: String(confirmation) } }, require(name) {
    if (name === 'next/server') return { NextResponse: { next: () => response(null), redirect: url => response(url) } };
    return { createServerClient(_url, _key, { cookies }) {
      calls++;
      return { auth: {
        getUser: async () => ({ data: { user } }),
        signOut: async () => cookies.setAll([{ name: 'session', value: '', options: { maxAge: 0 } }]),
      }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { is_blocked: blocked } }) }) }) }) };
    }};
  }};
  vm.runInNewContext(source, context);
  return { run(path) { const url = new URL('https://finstat.kz' + path); url.clone = () => new URL(url); return context.exports.middleware({ nextUrl: url, cookies: jar() }); }, calls: () => calls };
}
test('public auth does not contact authentication service', async () => {
  const app = setup(); assert.equal((await app.run('/auth')).url, null); assert.equal(app.calls(), 0);
});
test('anonymous visitor cannot enter dashboard', async () => {
  assert.equal((await setup().run('/dashboard/documents')).url.pathname, '/auth');
});
test('blocked user is redirected and sign-out cookies survive redirect', async () => {
  const result = await setup({ user: { id: 'user-1' }, blocked: true }).run('/dashboard');
  assert.equal(result.url.searchParams.get('blocked'), '1');
  assert.equal(result.cookies.getAll()[0].maxAge, 0);
});
test('email confirmation requirement stays enforced', async () => {
  const result = await setup({ user: { id: 'user-1' }, confirmation: true }).run('/dashboard');
  assert.equal(result.url.searchParams.get('confirm'), 'required');
  assert.equal(result.cookies.getAll()[0].value, '');
});
test('confirmed active user can enter dashboard', async () => {
  const result = await setup({ user: { id: 'user-1', email_confirmed_at: '2026-01-01' }, confirmation: true }).run('/dashboard');
  assert.equal(result.url, null);
});
