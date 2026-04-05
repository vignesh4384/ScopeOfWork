import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWizard } from "../context/WizardContext";
import { refineScope } from "../api/client";
import ScopeRenderer from "../components/ScopeRenderer";

export default function ScopeEditorScreen() {
  const { state, setScopeText, setRefinedScopeText } = useWizard();
  const navigate = useNavigate();

  const [editableText, setEditableText] = useState(
    state.refinedScopeText || state.scopeText || "",
  );
  const [feedback, setFeedback] = useState("");
  const [changesSummary, setChangesSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editMode, setEditMode] = useState(false);

  const handleRefine = async () => {
    if (!state.scopeId) return;
    setLoading(true);
    setError("");
    try {
      const res = await refineScope(
        state.scopeId,
        feedback || undefined,
        editableText || undefined,
      );
      setEditableText(res.refined_scope_text);
      setRefinedScopeText(res.refined_scope_text);
      setChangesSummary(res.changes_summary);
      setFeedback("");
      setEditMode(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Refinement failed");
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = () => {
    setScopeText(editableText);
    setRefinedScopeText(editableText);
    navigate("/gold-plating");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-800">Scope Editor</h2>
        <p className="text-sm text-gray-500 mt-1">
          Review and refine your scope of work. Edit directly or use AI to improve it.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {/* Left: Scope display/edit */}
        <div className="md:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700">Scope of Work</label>
            <button
              onClick={() => setEditMode(!editMode)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
              {editMode ? "Preview" : "Edit"}
            </button>
          </div>
          {editMode ? (
            <textarea
              value={editableText}
              onChange={(e) => setEditableText(e.target.value)}
              rows={20}
              className="w-full rounded-xl border border-gray-300 p-4 text-sm font-mono leading-relaxed focus:ring-2 focus:ring-primary/30 focus:border-primary resize-y"
            />
          ) : (
            <div className="max-h-[520px] overflow-y-auto rounded-xl border border-gray-200 bg-white p-5">
              <ScopeRenderer text={editableText} />
            </div>
          )}
        </div>

        {/* Right: AI refinement panel */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 p-4 space-y-3">
            <h3 className="font-semibold text-gray-800 text-sm">AI Refinement</h3>
            <p className="text-xs text-gray-500">
              Provide feedback or instructions for the AI to refine the scope.
            </p>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={4}
              placeholder="e.g., Add more detail on HSE requirements, simplify the acceptance criteria..."
              className="w-full rounded-xl border border-gray-300 p-3 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary resize-y"
            />
            <button
              onClick={handleRefine}
              disabled={loading}
              className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 transition disabled:opacity-50"
            >
              {loading ? "Refining..." : "Refine with AI"}
            </button>
          </div>

          {changesSummary && (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-4 space-y-2">
              <h4 className="text-sm font-semibold text-green-800">Changes Made</h4>
              <p className="text-xs text-green-700 whitespace-pre-wrap">{changesSummary}</p>
            </div>
          )}

          <div className="rounded-2xl bg-gray-50 border border-gray-200 p-4 space-y-2">
            <p className="text-xs text-gray-500">
              <strong>Source:</strong> {state.scopeSource === "uploaded" ? "Uploaded file" : "AI generated"}
            </p>
            <p className="text-xs text-gray-500">
              <strong>Scope ID:</strong> {state.scopeId}
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button
          onClick={() => navigate("/scope-source")}
          className="rounded-xl border border-gray-300 px-6 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
        >
          Back
        </button>
        <button
          onClick={handleAccept}
          disabled={!editableText.trim()}
          className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 transition disabled:opacity-50"
        >
          Accept &amp; Check Gold Plating
        </button>
      </div>
    </div>
  );
}
