import { useEffect, useState } from "react";
import { login, logout, getIdToken } from "../auth";

export function LoginLogout() {
  const [who, setWho] = useState<string>("Signed out");

  useEffect(() => {
    const t = getIdToken();
    if (!t) {
      setWho("Signed out");
      return;
    }
    try {
      const payload = JSON.parse(atob((t.split(".")[1] || "").replace(/-/g, "+").replace(/_/g, "/")));
      setWho(payload?.email || payload?.sub || "Signed in");
    } catch {
      setWho("Signed in");
    }
  }, []);

  return (
    <div className="flex items-center gap-2">
      <button className="btn btn-ghost" onClick={login}>Login</button>
      <button className="btn btn-ghost" onClick={logout}>Logout</button>
      <span className="muted">{who}</span>
    </div>
  );
}
