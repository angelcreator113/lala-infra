import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import FanDashboard from "./dashboards/FanDashboard";
import BestieDashboard from "./dashboards/BestieDashboard";
import CreatorDashboard from "./dashboards/CreatorDashboard";
import CollabDashboard from "./dashboards/CollabDashboard";
import AdminDashboard from "./dashboards/AdminDashboard";
import { LoginLogout } from "./components/LoginLogout";


export default function App() {
  return (
    <BrowserRouter>
      <div className="wrap">
        <header className="topbar">
          <h1 className="text-2xl font-semibold">✨ Lala Platform</h1>
          <nav className="flex items-center gap-4">
            <Nav to="/">Fan</Nav>
            <Nav to="/bestie">Bestie</Nav>
            <Nav to="/creator">Creator</Nav>
            <Nav to="/collab">Collaborator</Nav>
            <Nav to="/admin">Admin</Nav>
            <LoginLogout />
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

