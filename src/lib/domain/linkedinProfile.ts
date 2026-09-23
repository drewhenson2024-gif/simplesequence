export function linkedInProfileHref(value: string | null | undefined): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  if (host !== "linkedin.com" && host !== "www.linkedin.com") return null;
  if (!url.pathname.toLowerCase().startsWith("/in/")) return null;
  return url.toString();
}
