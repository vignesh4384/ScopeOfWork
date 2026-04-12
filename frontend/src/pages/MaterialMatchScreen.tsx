import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchMaterialMatches } from "../api/client";
import { useWizard } from "../context/WizardContext";
import type { MaterialMatchItem } from "../types";

export default function MaterialMatchScreen() {
  const { state, setSelectedMaterial } = useWizard();
  const navigate = useNavigate();
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!state.initialDescription || !state.type) {
      navigate("/");
    }
  }, [state.initialDescription, state.type, navigate]);

  const { data, isFetching, error } = useQuery({
    queryKey: ["material-match", state.initialDescription, state.parameters],
    queryFn: () => fetchMaterialMatches(state.initialDescription, state.parameters),
    enabled: !!state.initialDescription && state.type === "material",
  });

  const matches = data?.matches ?? [];

  const scoreColor = (score: number) => {
    if (score >= 0.8) return "text-green-700 bg-green-100";
    if (score >= 0.6) return "text-yellow-700 bg-yellow-100";
    return "text-gray-700 bg-gray-100";
  };

  const handleSelect = (match: MaterialMatchItem) => {
    setSelectedMaterial(match);
    navigate("/commercial");
  };

  const handleSkip = () => {
    setSelectedMaterial(undefined);
    navigate("/commercial");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">Step 3 &middot; Material Match</p>
          <h2 className="mt-1 text-2xl font-semibold text-gray-900">
            Match with existing materials
          </h2>
          <p className="text-sm text-muted">
            We searched the material master for items matching your specification. Select one to reuse, or skip to proceed as a new material.
          </p>
        </div>
        <span className="badge">AI matching</span>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error instanceof Error ? error.message : "Material matching failed. You can skip and continue."}
        </div>
      )}

      {isFetching && (
        <div className="text-center py-12">
          <div className="inline-block h-8 w-8 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
          <p className="text-sm text-gray-500 mt-3">Searching material master...</p>
        </div>
      )}

      {!isFetching && matches.length === 0 && !error && (
        <div className="rounded-2xl bg-gray-50 border-2 border-gray-200 p-6 text-center">
          <h3 className="font-semibold text-gray-700 text-lg">No Matching Materials Found</h3>
          <p className="text-sm text-gray-500 mt-1">
            No existing materials closely match your specification. This will be treated as a new material.
          </p>
        </div>
      )}

      {!isFetching && matches.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Found <strong>{matches.length}</strong> potential match{matches.length > 1 ? "es" : ""}:
          </p>

          {matches.map((match, idx) => (
            <div
              key={`${match.material}-${idx}`}
              className="rounded-2xl border border-gray-200 overflow-hidden bg-white"
            >
              <div className="flex items-start justify-between p-4">
                <button
                  onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                  className="flex-1 text-left flex items-start gap-3"
                >
                  <span className={`mt-0.5 shrink-0 px-3 py-1 rounded-full text-sm font-bold ${scoreColor(match.similarity_score)}`}>
                    {Math.round(match.similarity_score * 100)}%
                  </span>
                  <div className="min-w-0">
                    <h4 className="font-semibold text-gray-800">
                      {match.material} &mdash; {match.material_description}
                    </h4>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-gray-500">
                      {match.manufacturer_name && (
                        <span>Mfr: {match.manufacturer_name}</span>
                      )}
                      {match.manufacturer_part_number && (
                        <span>Part#: {match.manufacturer_part_number}</span>
                      )}
                      {match.material_type && (
                        <span>Type: {match.material_type}</span>
                      )}
                      {match.material_group && (
                        <span>Group: {match.material_group}</span>
                      )}
                      {match.base_unit && (
                        <span>Unit: {match.base_unit}</span>
                      )}
                      {match.moving_price && (
                        <span>Price: {match.moving_price}</span>
                      )}
                    </div>
                    <span className="inline-block mt-1.5 text-xs text-primary font-medium">
                      {expandedIdx === idx ? "Hide details" : "View details"}
                    </span>
                  </div>
                </button>
                <button
                  onClick={() => handleSelect(match)}
                  className="shrink-0 ml-3 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition"
                >
                  Select
                </button>
              </div>

              {expandedIdx === idx && (
                <div className="border-t border-gray-200 p-4 bg-gray-50 space-y-3">
                  {match.long_text ? (
                    <div>
                      <p className="text-xs font-semibold text-gray-600 mb-1.5">Long description / specification:</p>
                      <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed bg-white rounded-xl p-3 border border-gray-100">
{match.long_text}
                      </pre>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 italic">No long description available for this material.</p>
                  )}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {[
                      ["Material Number", match.material],
                      ["Description", match.material_description],
                      ["Type", match.material_type],
                      ["Group", match.material_group],
                      ["Unit", match.base_unit],
                      ["Moving Price", match.moving_price],
                      ["Manufacturer", match.manufacturer_name],
                      ["Mfr Part#", match.manufacturer_part_number],
                    ]
                      .filter(([, val]) => val)
                      .map(([label, val]) => (
                        <div key={label} className="rounded-lg bg-white border border-gray-100 px-2.5 py-1.5">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase">{label}</p>
                          <p className="text-sm text-gray-800 break-all">{val}</p>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between pt-4">
        <button
          onClick={() => navigate("/details")}
          className="rounded-full border border-gray-300 px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
        >
          Back
        </button>
        <button
          onClick={handleSkip}
          disabled={isFetching}
          className="rounded-full bg-gray-200 px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-300 transition disabled:opacity-60"
        >
          Skip &mdash; no existing material
        </button>
      </div>
    </div>
  );
}
