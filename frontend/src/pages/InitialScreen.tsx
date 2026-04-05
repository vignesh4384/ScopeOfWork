import type { FormEvent } from "react";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { classify } from "../api/client";
import { useWizard } from "../context/WizardContext";

const examples = ["Compressor for refinery operations", "Annual HVAC maintenance service", "Cloud security assessment"];

export default function InitialScreen() {
  const { state, setInitialDescription, setType, setParameters } = useWizard();
  const [input, setInput] = useState(state.initialDescription);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: (description: string) => classify(description),
    onSuccess: (data) => {
      setInitialDescription(input);
      setType(data.type);
      setParameters({});
      navigate(data.type === "service" ? "/scope-source" : "/details");
    },
    onError: (err: Error) => {
      setError(err.message || "Failed to classify request");
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!input.trim()) {
      setError("Please describe what you want to buy.");
      return;
    }
    mutation.mutate(input.trim());
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">Step 1 · Describe</p>
          <h2 className="mt-1 text-2xl font-semibold text-gray-900">What do you need to purchase?</h2>
          <p className="text-sm text-muted">We will classify it as a material or a service and guide you to the right form.</p>
        </div>
        <div className="badge">Agent powered</div>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm font-medium text-gray-800">
          Describe what you want to buy
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g., compressor, consulting service, software license"
            className="mt-2 w-full rounded-2xl border border-gray-200 bg-white p-4 text-base shadow-sm focus:border-primary focus:ring-primary"
            rows={3}
          />
        </label>
        {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <button
          type="submit"
          disabled={mutation.isPending}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-white font-semibold shadow-card transition hover:translate-y-[-1px] hover:shadow-lg disabled:opacity-60"
        >
          {mutation.isPending ? "Thinking..." : "Next"}
        </button>
      </form>

      <div className="rounded-2xl border border-gray-100 bg-white p-4">
        <p className="text-sm font-semibold text-gray-800 mb-2">Try an example</p>
        <div className="flex flex-wrap gap-2">
          {examples.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setInput(ex)}
              className="rounded-full bg-surface px-3 py-2 text-sm text-gray-800 hover:border-primary hover:text-primary border border-transparent"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
