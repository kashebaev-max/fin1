"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { useRouter } from "next/navigation";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("finerp-theme") : null;
    document.documentElement.setAttribute("data-theme", saved || "dark");
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSuccess(""); setLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/dashboard");
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: fullName, company_name: companyName } },
        });
        if (error) throw error;
        if (data.user) {
          await supabase.from("profiles").update({ full_name: fullName, company_name: companyName }).eq("id", data.user.id);
        }
        setSuccess("Регистрация успешна! Проверьте email для подтверждения или войдите.");
        setIsLogin(true);
      }
    } catch (err: any) {
      setError(err.message || "Произошла ошибка");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)", transition: "background 0.3s" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-extrabold text-white" style={{ background: "linear-gradient(135deg, #6366F1, #A855F7)" }}>F</div>
            <div>
              <div className="text-2xl font-extrabold" style={{ color: "var(--t1)" }}>Finstat.kz</div>
              <div className="text-xs tracking-widest" style={{ color: "var(--t3)" }}>КАЗАХСТАН • НК РК 2026</div>
            </div>
          </div>
          <p className="text-sm" style={{ color: "var(--t3)" }}>Бухгалтерия, склад, касса, документы — всё в одном месте</p>
        </div>

        <div className="rounded-2xl p-8" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
          <div className="flex gap-2 mb-6">
            <button onClick={() => { setIsLogin(true); setError(""); }}
              className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{ background: isLogin ? "var(--accent)" : "transparent", color: isLogin ? "#fff" : "var(--t3)", border: isLogin ? "none" : "1px solid var(--brd)" }}>
              Вход
            </button>
            <button onClick={() => { setIsLogin(false); setError(""); }}
              className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{ background: !isLogin ? "var(--accent)" : "transparent", color: !isLogin ? "#fff" : "var(--t3)", border: !isLogin ? "none" : "1px solid var(--brd)" }}>
              Регистрация
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {!isLogin && (
              <>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--t3)" }}>ФИО</label>
                  <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Касымов Марат Тулегенович" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--t3)" }}>Название организации</label>
                  <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder='ТОО «Ваша Компания»' required />
                </div>
              </>
            )}
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "var(--t3)" }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="info@company.kz" required />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "var(--t3)" }}>Пароль</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Минимум 6 символов" required minLength={6} />
            </div>

            {error && <div className="text-sm p-3 rounded-lg" style={{ background: "#EF444420", color: "#EF4444" }}>{error}</div>}
            {success && <div className="text-sm p-3 rounded-lg" style={{ background: "#10B98120", color: "#10B981" }}>{success}</div>}

            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #6366F1, #A855F7)" }}>
              {loading ? "Загрузка..." : isLogin ? "Войти" : "Зарегистрироваться"}
            </button>
          </form>
        </div>

        <div className="text-center mt-6 text-xs" style={{ color: "var(--t3)" }}>
          НДС 16% • ИПН 10%/15% • ОПВ 10% • МРП 4 325 ₸<br />
          Все расчёты по Налоговому Кодексу РК 2026
        </div>
      </div>
    </div>
  );
}
