export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email.trim());
}

export function normalizePhone(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("7")) return "8" + digits.slice(1);
  if (digits.length === 11 && digits.startsWith("8")) return digits;
  if (digits.length === 10) return "8" + digits;
  return digits;
}

export function isValidKZPhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  return normalized.length === 11 && normalized.startsWith("8");
}
