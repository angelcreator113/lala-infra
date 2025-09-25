import SectionCard from "../components/SectionCard";
import UploadsTester from "../components/UploadsTester";

export default function CreatorDashboard() {
  return (
    <div className="space-y-6">
      <SectionCard title="S3 Uploads (Dev Tester)">
        <UploadsTester />
      </SectionCard>

      <SectionCard title="Template Packs">
        <p className="muted">Upload & manage outfit templates (placeholder).</p>
      </SectionCard>

      <SectionCard title="Soft Life Credits">
        <p className="muted">Track earnings & redemption (placeholder).</p>
      </SectionCard>

      <SectionCard title="Guest Pitch Tool">
        <p className="muted">Submit collab pitches (placeholder).</p>
      </SectionCard>

      <SectionCard title="Smart DM Inbox">
        <p className="muted">Prioritized fan messages (placeholder).</p>
      </SectionCard>
    </div>
  );
}
