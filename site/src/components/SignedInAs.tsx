// src/components/SignedInAs.tsx
import { getSignedInIdentity, getIdTokenValid } from "../auth";
import { useEffect, useState } from "react";

function shorten(s: string, n = 28) {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

export default function SignedInAs() {
  const [label, setLabel] = useState<string | null>(null);
  const [title, setTitle] = useState<string>("");

  const compute = () => {
    const id = getSignedInIdentity();
    if (!getIdTokenValid()) {
      setLabel(null);
      setTitle("");
      return;
    }
    if (id) {
      const shown = id.claims.name || id.claims.email || id.label;
      setLabel(shorten(shown));
      setTitle(id.claims.email || shown);
    } else {
      setLabel(null);
      setTitle("");
    }
  };

  useEffect(() => {
    compute();
    // Update when visibility changes (e.g., token refreshed elsewhere)
    const onVis = () => compute();
    const onHash = () => compute();
    window.addEventListener("visibilitychange", onVis);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("hashchange", onHash);
    };
  }, []);

  if (!label) return null;
  return (
    <span className="muted" title={title}>
      Signed in as <strong>{label}</strong>
    </span>
  );
}
