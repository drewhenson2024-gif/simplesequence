export function profileUrlFromLinkedInAccount(account: {
  connection_params?: {
    im?: string | { publicIdentifier?: string; username?: string };
  };
}): string | undefined {
  const im = account.connection_params?.im;
  if (!im || typeof im === "string") return undefined;
  const extra = im as { public_identifier?: string };
  const slug = (im.publicIdentifier || extra.public_identifier || im.username || "").trim();
  if (!slug) return undefined;
  if (/^https?:\/\//i.test(slug)) return slug;
  return `https://www.linkedin.com/in/${slug.replace(/^\/+|\/+$/g, "")}`;
}

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
