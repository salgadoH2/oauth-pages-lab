const GOOGLE_DISCOVERY_URL =
  "https://accounts.google.com/.well-known/openid-configuration";

function base64UrlToBytes(value) {
  const normalized = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");

  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function decodeJsonPart(value) {
  const bytes = base64UrlToBytes(value);
  return JSON.parse(new TextDecoder().decode(bytes));
}

function decodeJwt(jwt) {
  const parts = jwt.split(".");

  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }

  return {
    header: decodeJsonPart(parts[0]),
    payload: decodeJsonPart(parts[1]),
    signature: base64UrlToBytes(parts[2]),
    signingInput: `${parts[0]}.${parts[1]}`,
  };
}

async function getGoogleOpenIdConfiguration() {
  const response = await fetch(GOOGLE_DISCOVERY_URL);

  if (!response.ok) {
    throw new Error("Unable to fetch Google OIDC configuration");
  }

  return response.json();
}

async function getGoogleJwks(jwksUri) {
  const response = await fetch(jwksUri);

  if (!response.ok) {
    throw new Error("Unable to fetch Google JWKS");
  }

  return response.json();
}

async function verifySignature(signingInput, signature, jwk) {
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["verify"]
  );

  return crypto.subtle.verify(
    {
      name: "RSASSA-PKCS1-v1_5",
    },
    publicKey,
    signature,
    new TextEncoder().encode(signingInput)
  );
}

function validateClaims(payload, expectedClientId, expectedNonce) {
  const now = Math.floor(Date.now() / 1000);
  const clockSkew = 300;

  if (payload.iss !== "https://accounts.google.com") {
    throw new Error("Invalid issuer");
  }

  const audienceValid =
    payload.aud === expectedClientId ||
    (Array.isArray(payload.aud) &&
      payload.aud.includes(expectedClientId));

  if (!audienceValid) {
    throw new Error("Invalid audience");
  }

  if (typeof payload.exp !== "number") {
    throw new Error("Missing expiration");
  }

  if (payload.exp <= now - clockSkew) {
    throw new Error("Token expired");
  }

  if (typeof payload.iat !== "number") {
    throw new Error("Missing issued-at time");
  }

  if (payload.iat > now + clockSkew) {
    throw new Error("Token issued in the future");
  }

  if (payload.nonce !== expectedNonce) {
    throw new Error("Invalid nonce");
  }

  if (!payload.sub || typeof payload.sub !== "string") {
    throw new Error("Missing subject");
  }

  return {
    subject: payload.sub,
    email:
      typeof payload.email === "string"
        ? payload.email
        : null,
    displayName:
      typeof payload.name === "string"
        ? payload.name
        : null,
  };
}

export async function validateGoogleIdToken(
  idToken,
  expectedClientId,
  expectedNonce
) {
  if (
    typeof idToken !== "string" ||
    idToken.trim() === ""
  ) {
    throw new Error("Missing Google id_token");
  }

  const { header, payload, signature, signingInput } =
    decodeJwt(idToken);

  if (header.alg !== "RS256") {
    throw new Error("Unsupported JWT algorithm");
  }

  if (!header.kid) {
    throw new Error("Missing JWT key id");
  }

  const discovery = await getGoogleOpenIdConfiguration();

  if (
    discovery.issuer !==
    "https://accounts.google.com"
  ) {
    throw new Error("Unexpected Google issuer");
  }

  const jwks = await getGoogleJwks(discovery.jwks_uri);

  const jwk = jwks.keys.find(
    (key) =>
      key.kid === header.kid &&
      key.kty === "RSA" &&
      key.alg === "RS256"
  );

  if (!jwk) {
    throw new Error("Google signing key not found");
  }

  const validSignature = await verifySignature(
    signingInput,
    signature,
    jwk
  );

  if (!validSignature) {
    throw new Error("Invalid Google token signature");
  }

  return validateClaims(
    payload,
    expectedClientId,
    expectedNonce
  );
}