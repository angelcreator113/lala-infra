// src/components/LoginLogout.tsx
import { useEffect, useState } from "react";
import { login, logout, getIdToken } from "../auth";

type Who = { email?: string; name?: string } | null;

function decodeIdToken(t?: string): Who {
  if (!t) return null;
  try {
    const base64 = t.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/") ?? "";
    const json = atob(base64);
    const p = JSON.parse(json);
    return { email: p.email, name: p.name ?? p["cognito:username"] };
  } catch {
    return null;
  }
}

export function LoginLogout() {
  const [who, setWho] = useState<Who>(decodeIdToken(getIdToken() ?? undefined));

  // keep label in sync if tokens change (new login/logout in another tab)
  useEffect(() => {
    const update = () => setWho(decodeIdToken(getIdToken() ?? undefined));
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, []);

  return (
    <div className="row">
      {who && (
        <span className="signed">
          Signed in as <strong>{who.name ?? who.email}</strong>
        </span>
      )}
      <button className="btn btn-ghost" onClick={login}>Login</button>
      <button className="btn btn-ghost" onClick={logout}>Logout</button>
    </div>
  );
}
