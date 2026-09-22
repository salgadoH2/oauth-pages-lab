import {
  randomToken,
  sha256Base64Url,
  createCodeChallenge,
} from "../../_shared/crypto.js";

import {
  createTransactionCookie,
} from "../../_shared/cookies.js";

import {
  buildAuthorizationUrl,
} from "../../_shared/providers.js";

export async function onRequestGet(context) {
  const { request, env, params } = context;

  const providerName = params.provider;

  if (providerName !== "google" && providerName !== "github") {
    return new Response("Not Found", {
      status: 404,
    });
  }

  if (!env.DB) {
    return new Response("Database not configured", {
      status: 500,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

  const provider = getProvider(providerName);

  if (!provider) {
    return new Response("Not Found", {
      status: 404,
    });
  }

  const transactionId = randomToken(32);
  const state = randomToken(32);
  const codeVerifier = randomToken(32);

  const nonce =
    providerName === "google"
      ? randomToken(32)
      : null;

  const codeChallenge =
    await createCodeChallenge(codeVerifier);

  const idHash =
    await sha256Base64Url(transactionId);

  const stateHash =
    await sha256Base64Url(state);

  const expiresAt =
    Math.floor(Date.now() / 1000) + 600;

  await env.DB.prepare(
    `INSERT INTO oauth_transactions
      (
        id_hash,
        provider,
        state_hash,
        nonce,
        code_verifier,
        expires_at
      )
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(
      idHash,
      providerName,
      stateHash,
      nonce,
      codeVerifier,
      expiresAt
    )
    .run();

  const authorizationUrl =
    buildAuthorizationUrl({
      provider: providerName,
      env,
      state,
      codeChallenge,
      nonce,
    });

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizationUrl,
      "Set-Cookie": createTransactionCookie(
        transactionId
      ),
      "Cache-Control": "no-store",
    },
  });
}