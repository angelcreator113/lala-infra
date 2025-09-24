import { useState } from "react";
import { getIdToken } from "../auth";

const UPLOADS_API = import.meta.env.VITE_UPLOADS_API as string;

export default function UploadsTester() {
  const [out, setOut] = useState("");
  const [file, setFile] = useState<File | null>(null);

  async function doUpload() {
    if (!file) return setOut("Pick a file first.");
    const idToken = getIdToken();
    if (!idToken) return setOut("Login first.");

    const sub = parseJwt(idToken)?.sub;
    const key = `uploads/${sub}/${Date.now()}-${file.name}`;

    const signRes = await fetch(`${UPLOADS_API}sign`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: idToken },
      body: JSON.stringify({ key, contentType: file.type || "application/octet-stream" }),
    });
    if (!signRes.ok) return setOut(`Sign failed: ${signRes.status}`);
    const { url } = await signRes.json();

    const put = await fetch(url, { method: "PUT", body: file });
    if (!put.ok) return setOut(`Upload failed: ${put.status}`);

    setOut(`Uploaded OK -> ${key}`);
  }

  return (
    <div className="card">
      <h3 className="text-base font-semibold mb-3">Upload to S3 (presigned URL)</h3>

      {/* add label + id/aria to satisfy a11y */}
      <label htmlFor="upload-file" className="block mb-1">Choose a file to upload</label>
      <input
        id="upload-file"
        name="upload-file"
        type="file"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        className="block"
      />

      <div className="row">
        {/* make buttons type=button so they don't submit any implicit form */}
        <button type="button" className="btn" onClick={doUpload}>Upload</button>
      </div>

      <pre className="mt-3 text-sm" aria-live="polite">{out}</pre>
    </div>
  );
}

function parseJwt(token: string) {
  try { return JSON.parse(atob(token.split(".")[1])); } catch { return null; }
}
