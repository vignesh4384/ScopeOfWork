import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useWizard } from "../context/WizardContext";
import { generateScope, uploadScope } from "../api/client";
import type { OilGasSector } from "../types";

export default function ScopeSourceScreen() {
  const { state, setScopeId, setScopeSource, setScopeText, setSector } = useWizard();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [activeAction, setActiveAction] = useState<"generate" | "upload" | null>(null);
  const [error, setError] = useState("");
  const [sector, setLocalSector] = useState<OilGasSector | "">("");

  const handleGenerate = async () => {
    if (!state.initialDescription || activeAction) return;
    setActiveAction("generate");
    setError("");
    try {
      const sectorVal = sector || undefined;
      if (sectorVal) setSector(sectorVal);
      const res = await generateScope(state.initialDescription, sectorVal);
      setScopeId(res.scope_id);
      setScopeSource("new");
      setScopeText(res.raw_scope_text);
      navigate("/scope-editor");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to generate scope");
    } finally {
      setActiveAction(null);
    }
  };

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || activeAction) return;
    setActiveAction("upload");
    setError("");
    try {
      const sectorVal = sector || undefined;
      if (sectorVal) setSector(sectorVal);
      const res = await uploadScope(file, state.initialDescription, sectorVal);
      setScopeId(res.scope_id);
      setScopeSource("uploaded");
      setScopeText(res.raw_scope_text);
      navigate("/scope-editor");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to upload scope");
    } finally {
      setActiveAction(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-800">Scope Source</h2>
        <p className="text-sm text-gray-500 mt-1">
          Choose how to create your scope of work for: <strong>{state.initialDescription}</strong>
        </p>
      </div>

      {/* Sector selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Oil &amp; Gas Sector (optional)
        </label>
        <div className="flex gap-3">
          {(["upstream", "midstream", "downstream"] as OilGasSector[]).map((s) => (
            <button
              key={s}
              onClick={() => setLocalSector(s)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                sector === s
                  ? "bg-primary text-white shadow"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* New Scope Card */}
        <div className="rounded-2xl border-2 border-gray-200 p-6 hover:border-primary/50 transition space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
              +
            </div>
            <div>
              <h3 className="font-semibold text-gray-800">Create New Scope</h3>
              <p className="text-xs text-gray-500">AI generates a scope from your description</p>
            </div>
          </div>
          <p className="text-sm text-gray-600">
            Our AI will generate a comprehensive scope of work based on your service description,
            tailored to Oil &amp; Gas industry standards.
          </p>
          <button
            onClick={handleGenerate}
            disabled={!!activeAction || !state.initialDescription}
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary/90 transition disabled:opacity-50"
          >
            {activeAction === "generate" ? "Generating..." : "Generate Scope with AI"}
          </button>
        </div>

        {/* Upload Existing Scope Card */}
        <div className="rounded-2xl border-2 border-gray-200 p-6 hover:border-primary/50 transition space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent font-bold text-lg">
              ^
            </div>
            <div>
              <h3 className="font-semibold text-gray-800">Upload Existing Scope</h3>
              <p className="text-xs text-gray-500">Upload a PDF or DOCX file</p>
            </div>
          </div>
          <p className="text-sm text-gray-600">
            Have an existing scope document? Upload it and our AI will extract, clean,
            and structure the content for review.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx"
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
          />
          <button
            onClick={handleUpload}
            disabled={!!activeAction}
            className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white hover:bg-accent/90 transition disabled:opacity-50"
          >
            {activeAction === "upload" ? "Uploading..." : "Upload & Extract Scope"}
          </button>
        </div>
      </div>
    </div>
  );
}
