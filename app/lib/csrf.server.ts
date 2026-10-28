export function assertSameOrigin(request: Request): void {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    throw new Response("Forbidden", { status: 403 });
  }

  const origin = request.headers.get("origin");
  if (!origin) return;

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) {
    throw new Response("Forbidden", { status: 403 });
  }

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    throw new Response("Forbidden", { status: 403 });
  }

  if (originUrl.host !== host) {
    throw new Response("Forbidden", { status: 403 });
  }
}
