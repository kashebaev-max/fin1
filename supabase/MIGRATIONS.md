# Миграции Supabase (Finstat.kz)

Выполняйте файлы **по порядку** в [Supabase Dashboard](https://supabase.com/dashboard) → SQL Editor → New query → вставить файл → Run.

| № | Файл | Назначение |
|---|------|------------|
| 1 | `migrations/20260529_auth_subscription_admin.sql` | Триал 30 дней, `subscriptions`, `is_platform_admin`, RLS profiles |
| 2 | `migrations/20260530_fix_admin_see_users.sql` | Админ видит всех пользователей в `profiles` |
| 3 | `migrations/20260531_fix_analytics_rls.sql` | Аналитика: `page_views`, `get_analytics_summary` |
| 4 | `migrations/20260532_analytics_rls_policies_only.sql` | Опционально, если шаг 3 частично применён |
| 5 | `migrations/20260601_subscription_write_guard.sql` | **Фаза 1:** read-only при истёкшей подписке (RLS на запись) |

## После миграции 20260601

- Пользователь с истёкшим триалом/подпиской **видит** свои данные, но **не может** создавать/менять/удалять (кроме профиля и страниц оплаты).
- Платформенный админ (`is_platform_admin` или `PLATFORM_ADMIN_EMAIL`) не ограничен.
- Убедитесь, что в Netlify задеплоена новая версия фронта (баннер, `ReadOnlyFormGuard`, проверка AI).

## Справочник таблиц

См. [`TABLES_REFERENCE.md`](./TABLES_REFERENCE.md) — список таблиц, используемых в коде приложения. Полный дамп продакшен-схемы в репозитории пока не выгружен; источник истины для деплоя — миграции выше + существующая БД.

## Переменные окружения

- `SUPABASE_SERVICE_ROLE_KEY` — админ API (блокировка пользователей, аналитика)
- `PLATFORM_ADMIN_EMAIL` — email платформенного админа
- См. также `docs/AUTH-SETUP.md`
