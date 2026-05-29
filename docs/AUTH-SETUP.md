# Настройка регистрации (Finstat.kz)

## Сейчас (рекомендуется, если была ошибка с почтой)

1. В Supabase оставьте **Confirm email — ВЫКЛЮЧЕН** (как сейчас).
2. В Netlify **не добавляйте** `NEXT_PUBLIC_REQUIRE_EMAIL_CONFIRMATION` (или = `false`).
3. Выполните SQL-миграцию (триал, админка) — файл  
   `supabase/migrations/20260529_auth_subscription_admin.sql`
4. Добавьте `SUPABASE_SERVICE_ROLE_KEY` в Netlify.

Регистрация: email + телефон проверяются, вход сразу после регистрации, триал 30 дней.

---

## Позже: включить подтверждение email

Типичные причины ошибки раньше:

| Причина | Решение |
|---------|---------|
| Неверный Redirect URL | Supabase → Authentication → URL Configuration → добавить `https://finstat.kz/auth/callback` |
| Не настроен Site URL | Site URL = `https://finstat.kz` |
| Лимит писем Supabase | Project Settings → Auth → SMTP или свой почтовый сервис |
| Письмо в спаме | Проверить папку «Спам» |

Когда всё настроено в Supabase:

1. Включить **Confirm email**
2. В Netlify добавить: `NEXT_PUBLIC_REQUIRE_EMAIL_CONFIRMATION` = `true`
3. Сделать **Deploy** заново

---

## Переменные Netlify

| Переменная | Обязательно |
|------------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Да |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Да |
| `SUPABASE_SERVICE_ROLE_KEY` | Да (удаление в админке) |
| `PLATFORM_ADMIN_EMAIL` | Да (`kashebaev@gmail.com`) |
| `NEXT_PUBLIC_REQUIRE_EMAIL_CONFIRMATION` | Нет (только когда включите почту) |
