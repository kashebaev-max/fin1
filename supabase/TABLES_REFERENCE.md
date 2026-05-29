# Справочник таблиц (по коду приложения)

Список таблиц `public.*`, к которым обращается Next.js-клиент и API. Не все могут существовать в вашей БД — миграция `20260601` пропускает отсутствующие.

## Платформа и биллинг

| Таблица | Назначение |
|---------|------------|
| `profiles` | Профиль пользователя, БИН, блокировка |
| `subscriptions` | Триал / active / suspended |
| `subscription_events` | Журнал изменений подписки |
| `payments` | Платежи Apipay / Kaspi |
| `page_views` | Аналитика посещений |
| `user_sessions` | Сессии для аналитики |

## Учёт и документы

`documents`, `journal_entries`, `document_scans`, `recurring_documents`, `edo_documents`, `esf_documents`, `fno_declarations`, `bank_operations`, `cash_operations`, `bank_statements`, `bank_statement_lines`, `currency_rates`, `currency_operations`

## Справочники

`counterparties`, `counterparty_contacts`, `counterparty_notes`, `nomenclature`, `products`, `employees`, `user_companies`, `contracts`, `orders`, `warehouses`, `warehouse_stocks`, `stock_batches`, `batch_movements`

## Склад, производство, розница

`assembly_operations`, `inventory_acts`, `production_orders`, `production_outputs`, `pos_shifts`, `pos_receipts`, `retail_stores`, `retail_shifts`, `fixed_assets`

## CRM, бюджет, зарплата

`crm_leads`, `crm_deals`, `crm_tasks`, `crm_events`, `budgets`, `budget_items`, `budget_lines`, `cfo_units`, `salary_deductions`, `deduction_history`, `payment_schedules`, `vacations`, `business_trips`

## Лояльность, транспорт, workflow

`discounts`, `loyalty_cards`, `loyalty_transactions`, `transport_vehicles`, `transport_waybills`, `workflow_instances`

## AI и уведомления

`chat_messages`, `ai_actions_log`, `ai_insights`, `ai_business_snapshot`, `notifications`, `notification_runs`

## Прочее

`module_preferences`, `scheduled_tasks`, `task_runs`, `migration_jobs`

## RLS write-guard (миграция 20260601)

На таблицах с колонкой `user_id` из списка в `20260601_subscription_write_guard.sql` действует:

- **SELECT** — всегда свои строки (`auth.uid() = user_id`)
- **INSERT/UPDATE/DELETE** — только при активном триале или подписке (`subscription_is_active()`)

Исключения: `profiles` (обновление своего профиля всегда), админские таблицы через service role.
