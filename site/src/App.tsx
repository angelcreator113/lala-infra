import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import FanDashboard from "./dashboards/FanDashboard";
import BestieDashboard from "./dashboards/BestieDashboard";
import CreatorDashboard from "./dashboards/CreatorDashboard";
import CollabDashboard from "./dashboards/CollabDashboard";
import AdminDashboard from "./dashboards/AdminDashboard";
import { login, logout, getSignedInIdentity } from "./auth";

export default function App() {
  const [who, setWho] = useState(getSignedInIdentity());

  useEffect(() => {
    const refresh = () => setWho(getSignedInIdentity());
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    // light heartbeat in case token expires silently
    const t = setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
      clearInterval(t);
    };
  }, []);

  return (
    <BrowserRouter>
      <div className="wrap">
        <header className="topbar flex items-center justify-between">
          <h1 className="text-2xl font-semibold">✨ Lala Platform</h1>
          <nav className="flex items-center gap-4">
            <Nav to="/">Fan</Nav>
            <Nav to="/bestie">Bestie</Nav>
            <Nav to="/creator">Creator</Nav>
            <Nav to="/collab">Collaborator</Nav>
            <Nav to="/admin">Admin</Nav>

            {/* Auth controls + identity */}
            <div className="flex items-center gap-3">
              {who && (
                <span
                  className="text-sm text-gray-600"
                  title={who.claims.email ?? ""}
                >
                  Signed in as <strong>{who.label}</strong>
                </span>
              )}
              <button
                className="px-3 py-1 rounded-xl border bg-white text-gray-900 border-gray-300 hover:bg-gray-50"
                onClick={login}
              >
                Login
              </button>
              <button
                className="px-3 py-1 rounded-xl border bg-white text-gray-900 border-gray-300 hover:bg-gray-50"
                onClick={logout}
              >
                Logout
              </button>
            </div>
          </nav>
        </header>

        <Routes>
          <Route path="/" element={<FanDashboard />} />
          <Route path="/bestie" element={<BestieDashboard />} />
          <Route path="/creator" element={<CreatorDashboard />} />
          <Route path="/collab" element={<CollabDashboard />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

function Nav({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-3 py-1 rounded-xl border transition ${
          isActive
            ? "bg-gray-900 text-white border-gray-900"
            : "bg-white text-gray-900 border-gray-300 hover:bg-gray-50"
        }`
      }
    >
      {children}
    </NavLink>
  );
}


