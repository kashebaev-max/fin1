// Платформенный администратор Finstat.kz (владелец сервиса).
// Не путать с сотрудниками компании в модуле «Кадры» (таблица employees).

export const PLATFORM_ADMIN_EMAIL =
  process.env.PLATFORM_ADMIN_EMAIL || "kashebaev@gmail.com";

export type PlatformProfile = {
  email?: string | null;
  is_platform_admin?: boolean | null;
};

export function isPlatformAdmin(profile: PlatformProfile | null | undefined): boolean {
  if (!profile) return false;
  if (profile.is_platform_admin) return true;
  return (profile.email || "").toLowerCase() === PLATFORM_ADMIN_EMAIL.toLowerCase();
}
