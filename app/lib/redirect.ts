export function safeRedirect(
  target: string | null | undefined,
  fallback = "/admin",
): string {
  if (!target) return fallback;
  if (!target.startsWith("/")) return fallback;
  if (target.startsWith("//")) return fallback;
  if (target.includes("\\")) return fallback;
  return target;
}
