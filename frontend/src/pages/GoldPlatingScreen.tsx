import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useWizard } from "../context/WizardContext";
import { checkGoldPlating } from "../api/client";
import type { OilGasSector, GoldPlatingFlaggedItem } from "../types";

const severityColors: Record<string, string> = {
  high: "bg-red-100 text-red-800 border-red-300",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
  low: "bg-blue-100 text-blue-800 border-blue-300",
};

const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };

export default function GoldPlatingScreen() {
  const { state, setSector, setGoldPlatingReport } = useWizard();
  const navigate = useNavigate();

  const [sector, setLocalSector] = useState<OilGasSector>(state.sector || "upstream");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checked, setChecked] = useState(false);
  const [passed, setPassed] = useState(false);
  const [flaggedItems, setFlaggedItems] = useState<GoldPlatingFlaggedItem[]>([]);

  const runCheck = async () => {
    if (!state.scopeId) return;
    setLoading(true);
    setError("");
    try {
      setSector(sector);
      const res = await checkGoldPlating(state.scopeId, sector);
      setPassed(res.passed);
      setFlaggedItems(res.flagged_items);
      setGoldPlatingReport(res);
      setChecked(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gold plating check failed");
    } finally {
      setLoading(false);
    }
  };

  // Auto-run on mount if sector is already set
  useEffect(() => {
    if (state.sector && state.scopeId && !checked) {
      setLocalSector(state.sector);
      runCheck();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-800">Gold Plating Check</h2>
        <p className="text-sm text-gray-500 mt-1">
          Verify that scope requirements align with industry standards and avoid unnecessary over-specification.
        </p>
      </div>

      {/* Sector selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Oil &amp; Gas Sector
        </label>
        <div className="flex gap-3">
          {(["upstream", "midstream", "downstream"] as OilGasSector[]).map((s) => (
            <button
              key={s}
              onClick={() => {
                setLocalSector(s);
                setChecked(false);
              }}
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

      {!checked && (
        <button
          onClick={runCheck}
          disabled={loading}
          className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white hover:bg-primary/90 transition disabled:opacity-50"
        >
          {loading ? "Analyzing scope..." : "Run Gold Plating Check"}
        </button>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {checked && passed && (
        <div className="rounded-2xl bg-green-50 border-2 border-green-300 p-6 text-center">
          <div className="text-3xl mb-2">&#10003;</div>
          <h3 className="font-semibold text-green-800 text-lg">No Gold Plating Detected</h3>
          <p className="text-sm text-green-600 mt-1">
            The scope aligns with {sector} sector industry standards.
          </p>
        </div>
      )}

      {checked && !passed && flaggedItems.length > 0 && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-yellow-50 border border-yellow-300 p-4">
            <h3 className="font-semibold text-yellow-800">
              {flaggedItems.length} item{flaggedItems.length > 1 ? "s" : ""} flagged as potential gold plating
            </h3>
          </div>

          {[...flaggedItems].sort((a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2)).map((item, idx) => (
            <div
              key={idx}
              className={`rounded-2xl border-2 p-5 space-y-3 ${severityColors[item.severity] || severityColors.medium}`}
            >
              <div className="flex items-start justify-between">
                <h4 className="font-semibold text-sm flex-1">{item.item}</h4>
                <span className={`text-xs px-2 py-1 rounded-full font-medium uppercase ${
                  item.severity === "high" ? "bg-red-200" :
                  item.severity === "medium" ? "bg-yellow-200" : "bg-blue-200"
                }`}>
                  {item.severity}
                </span>
              </div>
              <div>
                <p className="text-xs font-medium opacity-70">Why it's gold plating:</p>
                <p className="text-sm">{item.reason}</p>
              </div>
              <div>
                <p className="text-xs font-medium opacity-70">Recommended alternative:</p>
                <p className="text-sm">{item.recommendation}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-3 pt-4">
        <button
          onClick={() => navigate("/scope-editor")}
          className="rounded-xl border border-gray-300 px-6 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
        >
          Back to Editor
        </button>
        {checked && (
          <button
            onClick={() => navigate("/similarity")}
            className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 transition"
          >
            Continue to Similarity Check
          </button>
        )}
      </div>
    </div>
  );
}
