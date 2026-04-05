import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useWizard } from "../context/WizardContext";
import { checkSimilarity } from "../api/client";
import type { SimilarityMatch } from "../types";

export default function SimilarityScreen() {
  const { state, setSimilarityResults } = useWizard();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [matches, setMatches] = useState<SimilarityMatch[]>([]);
  const [checked, setChecked] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const runCheck = async () => {
    if (!state.scopeId) return;
    setLoading(true);
    setError("");
    try {
      const res = await checkSimilarity(state.scopeId);
      setMatches(res.matches);
      setSimilarityResults(res.matches);
      setChecked(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Similarity check failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (state.scopeId && !checked) {
      runCheck();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scoreColor = (score: number) => {
    if (score >= 0.7) return "text-green-700 bg-green-100";
    if (score >= 0.4) return "text-yellow-700 bg-yellow-100";
    return "text-gray-700 bg-gray-100";
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-800">Scope Similarity Check</h2>
        <p className="text-sm text-gray-500 mt-1">
          Compare your scope against existing reference scopes to identify overlaps and reuse opportunities.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-center py-12">
          <div className="inline-block h-8 w-8 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
          <p className="text-sm text-gray-500 mt-3">Comparing against reference scopes...</p>
        </div>
      )}

      {checked && matches.length === 0 && (
        <div className="rounded-2xl bg-gray-50 border-2 border-gray-200 p-6 text-center">
          <h3 className="font-semibold text-gray-700 text-lg">No Similar Scopes Found</h3>
          <p className="text-sm text-gray-500 mt-1">
            No existing reference scopes match this scope of work. This appears to be a unique scope.
          </p>
        </div>
      )}

      {checked && matches.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Found <strong>{matches.length}</strong> similar reference scope{matches.length > 1 ? "s" : ""}:
          </p>

          {matches.map((match, idx) => (
            <div
              key={match.reference_id}
              className="rounded-2xl border border-gray-200 overflow-hidden"
            >
              <button
                onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition text-left"
              >
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-sm font-bold ${scoreColor(match.score)}`}>
                    {Math.round(match.score * 100)}%
                  </span>
                  <div>
                    <h4 className="font-semibold text-gray-800">{match.title}</h4>
                    <p className="text-xs text-gray-500">
                      {(match as Record<string, unknown>).source === "contract_intelligence"
                        ? "Contract Intelligence"
                        : "SOW Reference"}{" "}
                      &middot; ID: {match.reference_id}
                    </p>
                  </div>
                </div>
                <span className="text-gray-400 text-sm">
                  {expandedIdx === idx ? "Hide" : "Show"} details
                </span>
              </button>

              {expandedIdx === idx && match.matching_sections.length > 0 && (
                <div className="border-t border-gray-200 p-4 bg-gray-50">
                  <p className="text-xs font-medium text-gray-600 mb-2">Matching sections:</p>
                  <ul className="space-y-1">
                    {match.matching_sections.map((section, sIdx) => (
                      <li key={sIdx} className="text-sm text-gray-700 flex items-start gap-2">
                        <span className="text-primary mt-0.5">&#8226;</span>
                        {section}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-3 pt-4">
        <button
          onClick={() => navigate("/gold-plating")}
          className="rounded-xl border border-gray-300 px-6 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
        >
          Back
        </button>
        {checked && (
          <button
            onClick={() => navigate("/scope-output")}
            className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 transition"
          >
            Continue to Outputs
          </button>
        )}
      </div>
    </div>
  );
}
