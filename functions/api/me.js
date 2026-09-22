import { getCookie } from "../_shared/cookies.js";
import { sha256Base64Url } from "../_shared/crypto.js";

function unauthorized() {
  return Response.json(
    { error: "Unauthorized" },
    {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.DB) {
    return Response.json(
      { error: "Database not configured" },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  const sessionCookie = getCookie(request, "__Host-session");
  if (!sessionCookie) return unauthorized();

  const sessionIdHash = await sha256Base64Url(sessionCookie);
  const now = Math.floor(Date.now() / 1000);

  const session = await env.DB.prepare(
    `SELECT issuer, subject, email, display_name, expires_at
     FROM sessions
     WHERE id_hash = ?
       AND expires_at > ?`
  )
    .bind(sessionIdHash, now)
    .first();

  if (!session) return unauthorized();

  return Response.json(
    {
      issuer: session.issuer,
      subject: session.subject,
      email: session.email,
      displayName: session.display_name,
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
