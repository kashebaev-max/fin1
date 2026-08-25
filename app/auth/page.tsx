"use client";

import { useState, useEffect, Suspense } from "react";
import { createClient } from "@/lib/supabase-browser";
import { useRouter, useSearchParams } from "next/navigation";
import { isValidEmail, isValidKZPhone, normalizePhone } from "@/lib/auth-utils";
import { REQUIRE_EMAIL_CONFIRMATION } from "@/lib/auth-config";

function AuthForm() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("finerp-theme") : null;
    document.documentElement.setAttribute("data-theme", saved || "dark");

    if (searchParams.get("blocked") === "1") {
      setError("Ваш аккаунт заблокирован администратором. Свяжитесь с support@finstat.kz");
    }
    if (searchParams.get("confirm") === "required") {
      setError("Подтвердите email — проверьте почту (и папку «Спам»).");
      setPendingConfirm(true);
    }
  }, [searchParams]);

  async function resendConfirmation() {
    if (!email.trim()) {
      setError("Введите email для повторной отправки письма");
      return;
    }
    setLoading(true);
    setError("");
    const { error: resendErr } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);
    if (resendErr) setError(resendErr.message);
    else setSuccess("Письмо отправлено повторно. Проверьте почту.");
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setPendingConfirm(false);
    setLoading(true);

    const trimmedEmail = email.trim().toLowerCase();

    try {
      if (!isValidEmail(trimmedEmail)) {
        throw new Error("Укажите корректный email (например name@company.kz)");
      }

      if (isLogin) {
        const { data, error: signInErr } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (signInErr) throw signInErr;

        if (REQUIRE_EMAIL_CONFIRMATION && data.user && !data.user.email_confirmed_at) {
          await supabase.auth.signOut();
          setPendingConfirm(true);
          throw new Error(
            "Email не подтверждён. Откройте ссылку из письма или нажмите «Отправить письмо снова»."
          );
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("is_blocked")
          .eq("id", data.user!.id)
          .maybeSingle();

        if (profile?.is_blocked) {
          await supabase.auth.signOut();
          throw new Error("Аккаунт заблокирован. Обратитесь в поддержку.");
        }

        router.push("/dashboard");
        router.refresh();
      } else {
        if (!fullName.trim()) throw new Error("Укажите ФИО");
        if (!companyName.trim()) throw new Error("Укажите название организации");
        if (!isValidKZPhone(phone)) {
          throw new Error("Укажите телефон в формате 87001234567 (привязанный к Kaspi)");
        }

        const normalizedPhone = normalizePhone(phone);

        const { data, error: signUpErr } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              company_name: companyName.trim(),
              phone: normalizedPhone,
            },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (signUpErr) throw signUpErr;

        if (data.session) {
          setSuccess("Регистрация успешна! Тестовый период 30 дней активирован.");
          router.push("/dashboard");
          router.refresh();
          return;
        }

        if (data.user && !data.session && REQUIRE_EMAIL_CONFIRMATION) {
          setPendingConfirm(true);
          setSuccess(
            "На " +
              trimmedEmail +
              " отправлено письмо. Подтвердите email, затем войдите. Триал 30 дней начнётся после входа."
          );
          setIsLogin(true);
          return;
        }

        setSuccess("Регистрация успешна! Войдите с email и паролем. Триал 30 дней активирован.");
        setIsLogin(true);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Произошла ошибка";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-3 mb-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-extrabold text-white"
            style={{ background: "linear-gradient(135deg, #6366F1, #A855F7)" }}
          >
            F
          </div>
          <div>
            <div className="text-2xl font-extrabold" style={{ color: "var(--t1)" }}>
              Finstat.kz
            </div>
            <div className="text-xs tracking-widest" style={{ color: "var(--t3)" }}>
              КАЗАХСТАН • НК РК 2026
            </div>
          </div>
        </div>
        <p className="text-sm" style={{ color: "var(--t3)" }}>
          Бухгалтерия, склад, касса, документы — всё в одном месте
        </p>
      </div>

      <div className="rounded-2xl p-8" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => {
              setIsLogin(true);
              setError("");
            }}
            className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: isLogin ? "var(--accent)" : "transparent",
              color: isLogin ? "#fff" : "var(--t3)",
              border: isLogin ? "none" : "1px solid var(--brd)",
            }}
          >
            Вход
          </button>
          <button
            type="button"
            onClick={() => {
              setIsLogin(false);
              setError("");
            }}
            className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: !isLogin ? "var(--accent)" : "transparent",
              color: !isLogin ? "#fff" : "var(--t3)",
              border: !isLogin ? "none" : "1px solid var(--brd)",
            }}
          >
            Регистрация
          </button>
        </div>

        {!isLogin && (
          <div
            className="rounded-lg p-3 mb-4 text-xs"
            style={{ background: "#A855F710", border: "1px solid #A855F730", color: "var(--t2)" }}
          >
            🎁 <b>30 дней бесплатно</b> при регистрации. Затем — 10 000 ₸/мес или 100 000 ₸/год.
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {!isLogin && (
            <>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--t3)" }}>
                  ФИО
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Касымов Марат Тулегенович"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--t3)" }}>
                  Название организации
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder='ТОО «Ваша Компания»'
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--t3)" }}>
                  Телефон (привязанный к Kaspi)
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="87001234567"
                  required
                />
                <div className="text-[10px] mt-1" style={{ color: "var(--t3)" }}>
                  Нужен для оплаты подписки через Kaspi после триала
                </div>
              </div>
            </>
          )}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "var(--t3)" }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="info@company.kz"
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "var(--t3)" }}>
              Пароль
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Минимум 6 символов"
              required
              minLength={6}
              autoComplete={isLogin ? "current-password" : "new-password"}
            />
          </div>

          {error && (
            <div className="text-sm p-3 rounded-lg" style={{ background: "#EF444420", color: "#EF4444" }}>
              {error}
            </div>
          )}
          {success && (
            <div className="text-sm p-3 rounded-lg" style={{ background: "#10B98120", color: "#10B981" }}>
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #6366F1, #A855F7)" }}
          >
            {loading ? "Загрузка..." : isLogin ? "Войти" : "Зарегистрироваться"}
          </button>

          {REQUIRE_EMAIL_CONFIRMATION && (pendingConfirm || isLogin) && (
            <button
              type="button"
              disabled={loading || !email.trim()}
              onClick={resendConfirmation}
              className="w-full py-2 rounded-lg text-xs font-semibold"
              style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}
            >
              Отправить письмо подтверждения снова
            </button>
          )}
        </form>
      </div>

      <div className="text-center mt-6 text-xs" style={{ color: "var(--t3)" }}>
        НДС 16% • ИПН 10%/15% • ОПВ 10% • МРП 4 325 ₸
        <br />
        Все расчёты по Налоговому Кодексу РК 2026
        <br />
        <span className="mt-2 inline-flex gap-3 justify-center">
          <a href="/legal/terms" className="no-underline" style={{ color: "var(--t2)" }}>Оферта</a>
          <a href="/legal/privacy" className="no-underline" style={{ color: "var(--t2)" }}>Конфиденциальность</a>
        </span>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "var(--bg)", transition: "background 0.3s" }}
    >
      <Suspense fallback={<div style={{ color: "var(--t3)" }}>Загрузка...</div>}>
        <AuthForm />
      </Suspense>
    </div>
  );
}
