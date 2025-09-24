import SectionCard from "../components/SectionCard";

export default function AdminDashboard() {
  return (
    <div className="space-y-6">
      <SectionCard title="AI Scheduling Assistant">
        <p className="muted">Auto-plan episode drops & socials across platforms (placeholder).</p>
      </SectionCard>

      <SectionCard title="Roles & Permissions">
        <p className="muted">Manage creators, collaborators, and fans (placeholder).</p>
      </SectionCard>

      <SectionCard title="Content Licensing">
        <p className="muted">Set clip usage rights & expirations (placeholder).</p>
      </SectionCard>
    </div>
  );
}
