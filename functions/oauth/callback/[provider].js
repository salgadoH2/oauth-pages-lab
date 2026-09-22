import {
  randomToken,
  sha256Base64Url,
} from "../../../_shared/crypto.js";

import {
  getCookie,
  clearTransactionCookie,
  createSessionCookie,
} from "../../../_shared/cookies.js";

import {
  getProvider,
  getRedirectUri,
} from "../../../_shared/providers.js";

import {
  validateGoogleIdToken,
} from "../../../_shared/oidc.js";

function errorResponse(message, status = 400) {
  return new Response(message, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

async function exchangeGoogleCode({
  code,
  codeVerifier,
  redirectUri,
  env,
}) {
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });

  const response = await fetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body,
    }
  );

  if (!response.ok) {
    throw new Error("Google token exchange failed");
  }

  return response.json();
}

async function exchangeGithubCode({
  code,
  codeVerifier,
  redirectUri,
  env,
}) {
  const body = new URLSearchParams({
    code,
    client_id: env.GITHUB_CLIENT_ID,
    client_secret: env.GITHUB_CLIENT_SECRET,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const response = await fetch(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body,
    }
  );

  if (!response.ok) {
    throw new Error("GitHub token exchange failed");
  }

  return response.json();
}

async function getGithubUser(accessToken) {
  const response = await fetch(
    "https://api.github.com/user",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
      },
    }
  );

  if (!response.ok) {
    throw new Error("GitHub profile request failed");
  }

  const user = await response.json();

  if (
    !Number.isInteger(user.id)
  ) {
    throw new Error("Invalid GitHub user id");
  }

  return user;
}

async function revokeGithubAuthorization({
  accessToken,
  env,
}) {
  const credentials = btoa(
    `${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`
  );

  const response = await fetch(
    `https://api.github.com/applications/${encodeURIComponent(
      env.GITHUB_CLIENT_ID
    )}/grant`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Basic ${credentials}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2026-03-10",
      },
      body: JSON.stringify({
        access_token: accessToken,
      }),
    }
  );

  if (response.status !== 204) {
    throw new Error("GitHub authorization revocation failed");
  }
}

export async function onRequestGet(context) {
  const { request, env, params } = context;

  const providerName = params.provider;

  if (
    providerName !== "google" &&
    providerName !== "github"
  ) {
    return errorResponse("Not Found", 404);
  }

  if (!env.DB) {
    return errorResponse(
      "Database not configured",
      500
    );
  }

  const url = new URL(request.url);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return errorResponse("OAuth authorization failed");
  }

  if (!code || !state) {
    return errorResponse("Missing code or state");
  }

  const transactionCookie = getCookie(
    request,
    "__Host-oauth-tx"
  );

  if (!transactionCookie) {
    return errorResponse(
      "Missing OAuth transaction",
      401
    );
  }

  const transactionIdHash =
    await sha256Base64Url(transactionCookie);

  const stateHash =
    await sha256Base64Url(state);

  const now = Math.floor(Date.now() / 1000);

  const transaction = await env.DB.prepare(
    `SELECT
      id_hash,
      provider,
      state_hash,
      nonce,
      code_verifier,
      expires_at
    FROM oauth_transactions
    WHERE id_hash = ?
      AND provider = ?
      AND expires_at > ?`
  )
    .bind(
      transactionIdHash,
      providerName,
      now
    )
    .first();

  if (!transaction) {
    return errorResponse(
      "Invalid or expired OAuth transaction",
      401
    );
  }

  if (transaction.state_hash !== stateHash) {
    await env.DB.prepare(
      `DELETE FROM oauth_transactions
       WHERE id_hash = ?`
    )
      .bind(transactionIdHash)
      .run();

    return errorResponse(
      "Invalid OAuth state",
      401
    );
  }

  // A transaction must not be reusable.
  await env.DB.prepare(
    `DELETE FROM oauth_transactions
     WHERE id_hash = ?`
  )
    .bind(transactionIdHash)
    .run();

  const redirectUri = getRedirectUri(
    providerName,
    env
  );

  let issuer;
  let subject;
  let email = null;
  let displayName = null;

  try {
    if (providerName === "google") {
      const tokenResponse =
        await exchangeGoogleCode({
          code,
          codeVerifier:
            transaction.code_verifier,
          redirectUri,
          env,
        });

      if (
        !tokenResponse.id_token ||
        typeof tokenResponse.id_token !== "string"
      ) {
        throw new Error(
          "Google id_token missing"
        );
      }

      const identity =
        await validateGoogleIdToken(
          tokenResponse.id_token,
          env.GOOGLE_CLIENT_ID,
          transaction.nonce
        );

      issuer = "https://accounts.google.com";
      subject = identity.subject;
      email = identity.email;
      displayName = identity.displayName;
    }

    if (providerName === "github") {
      const tokenResponse =
        await exchangeGithubCode({
          code,
          codeVerifier:
            transaction.code_verifier,
          redirectUri,
          env,
        });

      if (
        !tokenResponse.access_token ||
        typeof tokenResponse.access_token !== "string"
      ) {
        throw new Error(
          "GitHub access_token missing"
        );
      }

      if (
        typeof tokenResponse.token_type !== "string" ||
        tokenResponse.token_type.toLowerCase() !==
          "bearer"
      ) {
        throw new Error(
          "Invalid GitHub token type"
        );
      }

      const user =
        await getGithubUser(
          tokenResponse.access_token
        );

      await revokeGithubAuthorization({
        accessToken:
          tokenResponse.access_token,
        env,
      });

      issuer = "https://github.com";
      subject = String(user.id);

      email =
        typeof user.email === "string"
          ? user.email
          : null;

      displayName =
        typeof user.name === "string"
          ? user.name
          : typeof user.login === "string"
            ? user.login
            : null;
    }
  } catch (error) {
    console.error(
      "OAuth authentication error:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return errorResponse(
      "Authentication failed",
      401
    );
  }

  const sessionToken = randomToken(32);

  const sessionIdHash =
    await sha256Base64Url(sessionToken);

  const createdAt =
    Math.floor(Date.now() / 1000);

  const expiresAt = createdAt + 28800;

  await env.DB.prepare(
    `INSERT INTO sessions
      (
        id_hash,
        issuer,
        subject,
        email,
        display_name,
        expires_at,
        created_at
      )
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      sessionIdHash,
      issuer,
      subject,
      email,
      displayName,
      expiresAt,
      createdAt
    )
    .run();

  const headers = new Headers();

  headers.set(
    "Location",
    env.PUBLIC_BASE_URL
  );

  headers.append(
    "Set-Cookie",
    clearTransactionCookie()
  );

  headers.append(
    "Set-Cookie",
    createSessionCookie(sessionToken)
  );

  headers.set(
    "Cache-Control",
    "no-store"
  );

  return new Response(null, {
    status: 302,
    headers,
  });
}