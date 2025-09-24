import SectionCard from "../components/SectionCard";

export default function BestieDashboard() {
  return (
    <div className="space-y-6">
      <SectionCard title="Digital Fan Passport">
        <p className="muted">Your streaks, badges & perks (placeholder).</p>
      </SectionCard>

      <SectionCard title="Friend Feed">
        <p className="muted">Bestie-only content & updates (placeholder).</p>
      </SectionCard>

      <SectionCard title="Subscription Box">
        <p className="muted">Curated monthly drops (placeholder).</p>
      </SectionCard>
    </div>
  );
}
