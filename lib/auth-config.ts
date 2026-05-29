// Подтверждение email: включать только когда в Supabase включён Confirm email
// и настроены Redirect URLs (см. docs/AUTH-SETUP.md).
//
// Пока в Supabase Confirm email ВЫКЛЮЧЕН — оставьте false (по умолчанию).
export const REQUIRE_EMAIL_CONFIRMATION =
  process.env.NEXT_PUBLIC_REQUIRE_EMAIL_CONFIRMATION === "true";
