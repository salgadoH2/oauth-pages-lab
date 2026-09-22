const providers = {
  google: {
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    issuer: "https://accounts.google.com",
    scope: "openid email profile",
  },

  github: {
    authorizationEndpoint: "https://github.com/login/oauth/authorize",
    tokenEndpoint: "https://github.com/login/oauth/access_token",
    issuer: "https://github.com",
    scope: null,
  },
};

export function getProvider(provider) {
  return providers[provider] ?? null;
}

export function getRedirectUri(provider, env) {
  const baseUrl = env.PUBLIC_BASE_URL;

  if (provider === "google") {
    return `${baseUrl}/oauth/callback/google`;
  }

  if (provider === "github") {
    return `${baseUrl}/oauth/callback/github`;
  }

  return null;
}

export function buildAuthorizationUrl({
  provider,
  env,
  state,
  codeChallenge,
  nonce,
}) {
  const config = getProvider(provider);

  if (!config) {
    throw new Error("Unsupported provider");
  }

  const redirectUri = getRedirectUri(provider, env);

  const params = new URLSearchParams({
    client_id:
      provider === "google"
        ? env.GOOGLE_CLIENT_ID
        : env.GITHUB_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  if (provider === "google") {
    params.set("scope", config.scope);
    params.set("nonce", nonce);
  }

  return `${config.authorizationEndpoint}?${params.toString()}`;
}