// src/auth.ts
import {
  AWS_REGION,            // if you need it
  COGNITO_DOMAIN,
  COGNITO_CLIENT_ID,
  REDIRECT_URI,
} from "./config";

// Config
const cfg = {
  region: AWS_REGION ?? "us-east-1",
  userPoolDomain: COGNITO_DOMAIN.replace(/^https?:\/\//, "").replace(/\/+$/, ""),
  clientId: COGNITO_CLIENT_ID,
  redirectUri: REDIRECT_URI.replace(/\/?$/, "/"),
};

// Fail loudly if required config is missing
function assertCfg() {
  const missing: string[] = [];
  if (!cfg.userPoolDomain) missing.push("COGNITO_DOMAIN");
  if (!cfg.clientId)       missing.push("COGNITO_CLIENT_ID");
  if (!cfg.redirectUri)    missing.push("REDIRECT_URI");
  if (missing.length) {
    const msg = `Cognito config missing: ${missing.join(", ")} (check src/config.ts).`;
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
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Base64Url(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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
  TOK_STORE.removeItem(K.idToken);
  TOK_STORE.removeItem(K.accessToken);
  TOK_STORE.removeItem(K.refreshToken);

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
  if (!code) return;

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
    PKCE_STORE.removeItem(K.pkceVerifier);
    PKCE_STORE.removeItem(K.pkceState);
    cleanUrl();
  }
}

// ---------- Helpers ----------
function cleanUrl() {
  const clean = window.location.origin + window.location.pathname + window.location.hash;
  window.history.replaceState({}, "", clean);
}

// --- ID token helpers --------------------------------------------------------

type IdClaims = {
  email?: string;
  name?: string;
  exp?: number;  // seconds since epoch
  aud?: string | string[];
};

function decodeJwt<T = any>(jwt: string): T | null {
  try {
    const payload = jwt.split(".")[1];
    const norm = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(norm);
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/** Returns the id_token if present and not expired (60s skew). */
export function getIdTokenValid(): string | null {
  const t = getIdToken();
  if (!t) return null;
  const c = decodeJwt<IdClaims>(t);
  if (!c?.exp) return null;
  const now = Date.now() / 1000;
  return now < (c.exp - 60) ? t : null;
}

/** Lightweight identity for UI: name or email, plus raw claims if needed. */
export function getSignedInIdentity():
  | { label: string; claims: IdClaims }
  | null {
  const t = getIdTokenValid();
  if (!t) return null;
  const claims = decodeJwt<IdClaims>(t) ?? {};
  const label = claims.name || claims.email || "Signed in";
  return { label, claims };
}
