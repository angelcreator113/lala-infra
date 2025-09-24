// src/auth.ts
// --- Config from Vite envs ---
const cfg = {
  region: import.meta.env.VITE_AWS_REGION ?? "us-east-1",
  userPoolDomain: (import.meta.env.VITE_COGNITO_DOMAIN ?? "")
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, ""),
  clientId: import.meta.env.VITE_COGNITO_CLIENT_ID ?? "",
  redirectUri: (import.meta.env.VITE_REDIRECT_URI ?? "http://localhost:5173").replace(/\/?$/, "/"),
};

// Fail loudly if required config is missing
function assertCfg() {
  const missing: string[] = [];
  if (!cfg.userPoolDomain) missing.push("VITE_COGNITO_DOMAIN");
  if (!cfg.clientId)       missing.push("VITE_COGNITO_CLIENT_ID");
  if (!cfg.redirectUri)    missing.push("VITE_REDIRECT_URI");
  if (missing.length) {
    const msg = `Cognito config missing: ${missing.join(", ")}.\nEdit site/.env.local and restart 'npm run dev'.`;
    console.error(msg, cfg);
    alert(msg);
    throw new Error(msg);
  }
}

// Storage: PKCE bits in sessionStorage; tokens in localStorage
const PKCE_STORE = sessionStorage;
const TOK_STORE  = localStorage;

const K = {
  pkceVerifier: "pkce_verifier",
  pkceState: "pkce_state",
  idToken: "id_token",
  accessToken: "access_token",
  refreshToken: "refresh_token",
};

function randomString(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  // base64url (no padding)
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Base64Url(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(hash)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------- Public API ----------

export async function login() {
  assertCfg();
  const verifier = randomString(64);
  const challenge = await sha256Base64Url(verifier);
  const state = randomString(32);

  PKCE_STORE.setItem(K.pkceVerifier, verifier);
  PKCE_STORE.setItem(K.pkceState, state);

  const authUrl = new URL(`https://${cfg.userPoolDomain}/oauth2/authorize`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", cfg.clientId);
  authUrl.searchParams.set("redirect_uri", cfg.redirectUri);
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("state", state);

  window.location.assign(authUrl.toString());
}

export function logout() {
  assertCfg();
  // Clear local tokens first
  TOK_STORE.removeItem(K.idToken);
  TOK_STORE.removeItem(K.accessToken);
  TOK_STORE.removeItem(K.refreshToken);

  // End Hosted UI session as well
  const url = new URL(`https://${cfg.userPoolDomain}/logout`);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("logout_uri", cfg.redirectUri);
  window.location.assign(url.toString());
}

export function getIdToken() {
  return TOK_STORE.getItem(K.idToken);
}

export async function handleAuthCallback() {
  assertCfg();
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");

  if (!code) return; // nothing to do

  // Verify state & presence of verifier
  const expectedState = PKCE_STORE.getItem(K.pkceState);
  if (!expectedState || expectedState !== returnedState) {
    console.error("State mismatch; aborting token exchange");
    cleanUrl();
    return;
  }

  const verifier = PKCE_STORE.getItem(K.pkceVerifier) ?? "";
  if (!verifier) {
    console.error("Missing PKCE verifier; aborting token exchange");
    cleanUrl();
    return;
  }

  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: cfg.clientId,
      code,
      redirect_uri: cfg.redirectUri,
      code_verifier: verifier,
    });

    const tokenUrl = `https://${cfg.userPoolDomain}/oauth2/token`;
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!res.ok) {
      console.error("Token exchange failed", await res.text());
      return;
    }

    const tokens = await res.json();
    TOK_STORE.setItem(K.idToken, tokens.id_token);
    TOK_STORE.setItem(K.accessToken, tokens.access_token ?? "");
    if (tokens.refresh_token) TOK_STORE.setItem(K.refreshToken, tokens.refresh_token);

  } catch (err) {
    console.error("Token exchange error", err);
  } finally {
    // Clean one-time PKCE values and strip query params from URL
    PKCE_STORE.removeItem(K.pkceVerifier);
    PKCE_STORE.removeItem(K.pkceState);
    cleanUrl();
  }
}

// ---------- Helpers ----------

function cleanUrl() {
  // Remove ?code=...&state=... without navigating away
  const clean = window.location.origin + window.location.pathname + window.location.hash;
  window.history.replaceState({}, "", clean);
}
