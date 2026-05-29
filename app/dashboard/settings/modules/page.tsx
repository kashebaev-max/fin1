"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { HOME_MODULE, MODULE_GROUPS, PRESETS, isModuleRequired } from "@/lib/modules-config";

export default function ModuleManagementPage() {
  const supabase = createClient();
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [disabled, setDisabled] = useState<Set<string>>(new Set());
  const [originalDisabled, setOriginalDisabled] = useState<Set<string>>(new Set());
  const [activePreset, setActivePreset] = useState<string>("all");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data } = await supabase.from("module_preferences").select("*").eq("user_id", user.id).maybeSingle();
    const list = (data?.disabled_modules && Array.isArray(data.disabled_modules)) ? data.disabled_modules : [];
    setDisabled(new Set(list));
    setOriginalDisabled(new Set(list));
    setActivePreset(data?.active_preset || "all");
    setLoading(false);
  }

  function toggleModule(key: string) {
    if (isModuleRequired(key)) {
      setMsg("⚠ Этот модуль обязателен и не может быть отключён");
      setTimeout(() => setMsg(""), 3000);
      return;
    }
    const next = new Set(disabled);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setDisabled(next);
    setActivePreset("custom");
  }

  function toggleGroup(groupKey: string) {
    const group = MODULE_GROUPS.find(g => g.key === groupKey);
    if (!group) return;
    // Если все в группе отключены — включаем все. Иначе — отключаем все (кроме required)
    const allDisabled = group.items.every(i => disabled.has(i.key) || isModuleRequired(i.key));
    const next = new Set(disabled);
    if (allDisabled) {
      // Включаем всю группу
      group.items.forEach(i => next.delete(i.key));
    } else {
      // Отключаем всю группу, кроме обязательных
      group.items.forEach(i => { if (!isModuleRequired(i.key)) next.add(i.key); });
    }
    setDisabled(next);
    setActivePreset("custom");
  }

  function applyPreset(presetKey: string) {
    const preset = PRESETS.find(p => p.key === presetKey);
    if (!preset) return;
    if (!confirm(`Применить пресет «${preset.name}»? Текущие настройки будут заменены.`)) return;
    // Из пресета убираем обязательные модули (защита)
    const filtered = preset.disabled.filter(k => !isModuleRequired(k));
    setDisabled(new Set(filtered));
    setActivePreset(presetKey);
    setMsg(`✓ Применён пресет «${preset.name}» — не забудьте сохранить!`);
    setTimeout(() => setMsg(""), 4000);
  }

  async function saveChanges() {
    setSaving(true);
    const list = Array.from(disabled);

    // Upsert
    const { data: existing } = await supabase.from("module_preferences").select("id").eq("user_id", userId).maybeSingle();

    if (existing) {
      await supabase.from("module_preferences").update({
        disabled_modules: list,
        active_preset: activePreset,
        updated_at: new Date().toISOString(),
      }).eq("user_id", userId);
    } else {
      await supabase.from("module_preferences").insert({
        user_id: userId,
        disabled_modules: list,
        active_preset: activePreset,
      });
    }

    setOriginalDisabled(new Set(list));
    setSaving(false);
    setMsg("✅ Настройки сохранены. Обновите страницу для применения в сайдбаре.");
    setTimeout(() => setMsg(""), 5000);
  }

  function resetChanges() {
    if (!confirm("Отменить все несохранённые изменения?")) return;
    setDisabled(new Set(originalDisabled));
    setActivePreset("all");
  }

  function reloadSidebar() {
    router.refresh();
    window.location.reload();
  }

  // Stats
  const totalModules = 1 + MODULE_GROUPS.reduce((a, g) => a + g.items.length, 0);
  const enabledCount = totalModules - disabled.size;
  const hasChanges = disabled.size !== originalDisabled.size ||
    Array.from(disabled).some(k => !originalDisabled.has(k)) ||
    Array.from(originalDisabled).some(k => !disabled.has(k));

  if (loading) return <div className="text-center py-8 text-sm" style={{ color: "var(--t3)" }}>Загрузка...</div>;

  return (
    <div className="flex flex-col gap-5">
      {msg && <div className="rounded-xl p-4 text-sm font-semibold" style={{ background: msg.startsWith("⚠") ? "#F59E0B20" : "#10B98120", color: msg.startsWith("⚠") ? "#F59E0B" : "#10B981" }}>{msg}</div>}

      <div className="text-xs" style={{ color: "var(--t3)" }}>
        Управление видимостью модулей в сайдбаре. Отключение модуля скрывает его из навигации, но не удаляет данные. Все можно вернуть в любой момент.
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6366F1" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📦 Всего модулей</div>
          <div className="text-xl font-bold" style={{ color: "#6366F1" }}>{totalModules}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #10B981" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>✓ Включено</div>
          <div className="text-xl font-bold" style={{ color: "#10B981" }}>{enabledCount}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #6B7280" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>○ Отключено</div>
          <div className="text-xl font-bold" style={{ color: "#6B7280" }}>{disabled.size}</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: "3px solid #F59E0B" }}>
          <div className="text-xs mb-1" style={{ color: "var(--t3)" }}>📌 Активный пресет</div>
          <div className="text-sm font-bold mt-1" style={{ color: "#F59E0B" }}>
            {activePreset === "custom" ? "Свой набор" : PRESETS.find(p => p.key === activePreset)?.name || "Все модули"}
          </div>
        </div>
      </div>

      {/* Save bar */}
      {hasChanges && (
        <div className="rounded-xl p-4 flex items-center justify-between" style={{ background: "#F59E0B15", border: "1px solid #F59E0B40" }}>
          <div className="text-xs font-semibold" style={{ color: "#F59E0B" }}>⚠ Есть несохранённые изменения</div>
          <div className="flex gap-2">
            <button onClick={resetChanges} className="px-3 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отменить</button>
            <button onClick={saveChanges} disabled={saving} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "#10B981", opacity: saving ? 0.5 : 1 }}>
              {saving ? "Сохранение..." : "💾 Сохранить"}
            </button>
          </div>
        </div>
      )}

      {!hasChanges && (
        <div className="rounded-xl p-3 flex items-center justify-between" style={{ background: "#10B98110", border: "1px solid #10B98130" }}>
          <div className="text-xs" style={{ color: "#10B981" }}>✓ Все изменения сохранены</div>
          <button onClick={reloadSidebar} className="px-3 py-1.5 rounded-lg text-[11px] cursor-pointer border-none" style={{ background: "#10B98120", color: "#10B981" }}>↻ Обновить сайдбар</button>
        </div>
      )}

      {/* Presets */}
      <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <div className="text-sm font-bold mb-3">🎯 Готовые пресеты</div>
        <div className="text-[11px] mb-3" style={{ color: "var(--t3)" }}>
          Быстрая настройка под тип бизнеса. Один клик — и сайдбар адаптирован.
        </div>
        <div className="grid grid-cols-3 gap-3">
          {PRESETS.map(p => {
            const isActive = activePreset === p.key;
            return (
              <div key={p.key}
                onClick={() => applyPreset(p.key)}
                className="rounded-xl p-3 transition-all"
                style={{
                  background: isActive ? "var(--accent-dim)" : "var(--bg)",
                  border: `1px solid ${isActive ? "var(--accent)" : "var(--brd)"}`,
                  cursor: "pointer",
                }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span style={{ fontSize: 22 }}>{p.icon}</span>
                  <div>
                    <div className="text-[12px] font-bold">{p.name}</div>
                    <div className="text-[9px]" style={{ color: "var(--t3)" }}>
                      Включено: {(1 + MODULE_GROUPS.reduce((a, g) => a + g.items.length, 0)) - p.disabled.length} модулей
                    </div>
                  </div>
                </div>
                <div className="text-[10px]" style={{ color: "var(--t3)" }}>{p.description}</div>
                {isActive && <div className="text-[10px] mt-1.5 font-bold" style={{ color: "var(--accent)" }}>✓ Применён</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Главная (нельзя отключить) */}
      <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: "var(--card)", border: "1px solid var(--brd)" }}>
        <span style={{ fontSize: 18 }}>{HOME_MODULE.icon}</span>
        <div className="flex-1">
          <div className="text-[12px] font-bold">{HOME_MODULE.name}</div>
          <div className="text-[10px]" style={{ color: "var(--t3)" }}>{HOME_MODULE.description}</div>
        </div>
        <span className="text-[10px] font-bold px-2 py-1 rounded" style={{ background: "#10B98120", color: "#10B981" }}>🔒 Обязательный</span>
      </div>

      {/* Группы с модулями */}
      <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t3)" }}>📦 Модули по разделам</div>

      {MODULE_GROUPS.map(group => {
        const enabledInGroup = group.items.filter(i => !disabled.has(i.key)).length;
        const totalInGroup = group.items.length;
        const allOff = enabledInGroup === 0;
        const allOn = enabledInGroup === totalInGroup;

        return (
          <div key={group.key} className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--brd)", borderLeft: `3px solid ${group.color}` }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 20 }}>{group.icon}</span>
                <div>
                  <div className="text-sm font-bold" style={{ color: group.color }}>{group.name}</div>
                  <div className="text-[10px]" style={{ color: "var(--t3)" }}>{group.description}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-[10px]" style={{ color: "var(--t3)" }}>
                  {enabledInGroup} / {totalInGroup} включено
                </div>
                <button onClick={() => toggleGroup(group.key)} className="px-3 py-1.5 rounded-lg text-[11px] cursor-pointer border-none" style={{ background: allOff ? "#10B98120" : allOn ? "#6B728020" : group.color + "20", color: allOff ? "#10B981" : allOn ? "#6B7280" : group.color }}>
                  {allOff ? "✓ Включить все" : allOn ? "○ Отключить все" : "⊟ Переключить"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {group.items.map(item => {
                const isOff = disabled.has(item.key);
                const required = isModuleRequired(item.key);
                return (
                  <div key={item.key}
                    onClick={() => !required && toggleModule(item.key)}
                    className="rounded-lg p-3 flex items-center gap-3 transition-all"
                    style={{
                      background: isOff ? "var(--bg)" : group.color + "08",
                      border: `1px solid ${isOff ? "var(--brd)" : group.color + "30"}`,
                      cursor: required ? "not-allowed" : "pointer",
                      opacity: isOff ? 0.55 : 1,
                    }}>
                    <span style={{ fontSize: 16 }}>{item.icon}</span>
                    <div className="flex-1">
                      <div className="text-[12px] font-semibold flex items-center gap-2">
                        {item.name}
                        {item.adminOnly && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#F59E0B20", color: "#F59E0B" }}>ADMIN</span>}
                      </div>
                      {item.description && <div className="text-[10px]" style={{ color: "var(--t3)" }}>{item.description}</div>}
                    </div>
                    {required ? (
                      <span className="text-[9px] font-bold" style={{ color: "var(--t3)" }}>🔒</span>
                    ) : (
                      <div className="flex-shrink-0" style={{
                        width: 36, height: 20, borderRadius: 10,
                        background: isOff ? "var(--brd)" : group.color,
                        position: "relative",
                        transition: "background 0.2s",
                      }}>
                        <div style={{
                          position: "absolute",
                          top: 2,
                          left: isOff ? 2 : 18,
                          width: 16, height: 16,
                          borderRadius: "50%",
                          background: "#fff",
                          transition: "left 0.2s",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                        }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Save bar bottom (sticky-like) */}
      {hasChanges && (
        <div className="rounded-xl p-4 flex items-center justify-between sticky bottom-2" style={{ background: "var(--card)", border: "2px solid #F59E0B" }}>
          <div className="text-xs font-semibold" style={{ color: "#F59E0B" }}>⚠ Есть несохранённые изменения</div>
          <div className="flex gap-2">
            <button onClick={resetChanges} className="px-3 py-2 rounded-lg text-xs cursor-pointer" style={{ background: "transparent", border: "1px solid var(--brd)", color: "var(--t2)" }}>Отменить</button>
            <button onClick={saveChanges} disabled={saving} className="px-4 py-2 rounded-lg text-white text-xs font-semibold border-none cursor-pointer" style={{ background: "#10B981", opacity: saving ? 0.5 : 1 }}>
              {saving ? "Сохранение..." : "💾 Сохранить настройки"}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl p-3 text-[10px]" style={{ background: "var(--card)", border: "1px solid var(--brd)", color: "var(--t3)" }}>
        💡 <b>Что происходит при отключении модуля:</b> он исчезает из сайдбара, но <b>данные сохраняются</b>. Если включить обратно — все записи на месте.<br/>
        💡 <b>Прямой URL</b> по-прежнему работает (например, /dashboard/production откроется), но в навигации модуль скрыт.<br/>
        💡 <b>🔒 Обязательные модули</b> нельзя отключить: Главная, Организации, Настройки.
      </div>
    </div>
  );
}
