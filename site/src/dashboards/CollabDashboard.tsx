import SectionCard from "../components/SectionCard";

export default function CollabDashboard() {
  return (
    <div className="space-y-6">
      <SectionCard title="Closet Coordination">
        <p className="muted">Share mood boards, looks, and sizing with creators (placeholder).</p>
      </SectionCard>

      <SectionCard title="Upload Zone">
        <p className="muted">Drop clips/images for editors with auto-tagging (placeholder).</p>
      </SectionCard>

      <SectionCard title="Reminders & Tasks">
        <p className="muted">Automated prompts for deadlines, approvals, and deliverables (placeholder).</p>
      </SectionCard>
    </div>
  );
}
