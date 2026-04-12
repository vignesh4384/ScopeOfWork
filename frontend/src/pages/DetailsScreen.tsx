import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchMaterialDetails, fetchServiceQuestions } from "../api/client";
import { useWizard } from "../context/WizardContext";
import type { ParameterField } from "../types";
import ParameterForm from "../components/ParameterForm";

export default function DetailsScreen() {
  const { state, setParameters } = useWizard();
  const navigate = useNavigate();

  const [formValues, setFormValues] = useState<Record<string, unknown>>(state.parameters || {});

  useEffect(() => {
    if (!state.initialDescription || !state.type) {
      navigate("/");
    }
  }, [state.initialDescription, state.type, navigate]);

  const { data: materialData, isFetching: loadingMaterial, error: materialError } = useQuery({
    queryKey: ["material-details", state.initialDescription],
    queryFn: () => fetchMaterialDetails(state.initialDescription),
    enabled: state.type === "material" && !!state.initialDescription,
    staleTime: Infinity,      // never refetch — LLM responses are non-deterministic
    refetchOnWindowFocus: false,
  });

  const { data: serviceData, isFetching: loadingService, error: serviceError } = useQuery({
    queryKey: ["service-questions", state.initialDescription],
    queryFn: () => fetchServiceQuestions(state.initialDescription),
    enabled: state.type === "service" && !!state.initialDescription,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const fields: ParameterField[] = useMemo(() => {
    if (state.type === "material" && materialData) {
      return materialData.mandatory_parameters.concat(materialData.optional_parameters || []);
    }
    if (state.type === "service" && serviceData) {
      return serviceData.questions;
    }
    return [];
  }, [state.type, materialData, serviceData]);

  const handleNext = () => {
    setParameters(formValues);
    if (state.type === "material") {
      navigate("/material-match");
    } else {
      navigate("/commercial");
    }
  };

  const loading = loadingMaterial || loadingService;
  const error = materialError || serviceError;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">Step 2 · Details</p>
          <h2 className="mt-1 text-2xl font-semibold text-gray-900">
            {state.type === "material" ? "Material parameters" : "Service refinement"}
          </h2>
          <p className="text-sm text-muted">
            We proposed fields based on your description. Adjust anything before continuing.
          </p>
        </div>
        <span className="badge">LLM suggestions</span>
      </div>

      {loading && <div className="rounded-xl bg-white p-4 shadow-sm text-sm text-gray-700">Loading suggestions...</div>}
      {error && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          Could not load suggestions. You can still continue by filling fields manually.
        </div>
      )}

      {state.type === "material" && materialData && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="col-span-2">
            <ParameterForm fields={fields} values={formValues} onChange={setFormValues} />
          </div>
          <div className="space-y-3">
            <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
              <p className="text-sm font-semibold text-gray-800">Suggested manufacturers</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {materialData.manufacturers.map((mfr) => (
                  <span key={mfr} className="rounded-full bg-surface px-3 py-1 text-sm text-gray-800">
                    {mfr}
                  </span>
                ))}
              </div>
              {materialData.price_range && (
                <p className="mt-3 text-sm text-gray-700">
                  <span className="font-semibold">Price range:</span> {materialData.price_range}
                </p>
              )}
              {materialData.references && materialData.references.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-semibold text-gray-800">References</p>
                  <ul className="mt-1 space-y-1">
                    {materialData.references.map((ref) => (
                      <li key={ref}>
                        <a className="text-sm text-primary underline" href={ref} target="_blank" rel="noreferrer">
                          {ref}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {state.type === "service" && serviceData && (
        <ParameterForm fields={fields} values={formValues} onChange={setFormValues} />
      )}

      <div className="flex justify-end">
        <button
          onClick={handleNext}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-white font-semibold shadow-card transition hover:translate-y-[-1px] hover:shadow-lg disabled:opacity-60"
        >
          Next
        </button>
      </div>
    </div>
  );
}
