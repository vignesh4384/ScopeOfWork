import type { FormEvent } from "react";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { classify, fetchScope, getChatHistory, getSessions } from "../api/client";
import { useWizard } from "../context/WizardContext";
import type { OilGasSector, SessionListItem } from "../types";

const examples = ["Compressor for refinery operations", "Annual HVAC maintenance service", "Cloud security assessment"];

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    if (diffHours < 24) {
      return `Today, ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    }
    if (diffHours < 48) {
      return `Yesterday, ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function statusBadge(status: string): { label: string; classes: string } {
  if (status === "finalised") {
    return { label: "Finalised", classes: "bg-green-100 text-green-800 border-green-200" };
  }
  return { label: "Active", classes: "bg-blue-100 text-blue-800 border-blue-200" };
}

export default function InitialScreen() {
  const {
    state,
    setInitialDescription,
    setType,
    setParameters,
    setScopeId,
    setScopeText,
    setRefinedScopeText,
    setSector,
    setChatSessionId,
  } = useWizard();
  const [input, setInput] = useState(state.initialDescription);
  const [error, setError] = useState<string | null>(null);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const navigate = useNavigate();

  const sessionsQuery = useQuery({
    queryKey: ["sessions"],
    queryFn: getSessions,
    staleTime: 10_000,
  });

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

  const handleResume = async (item: SessionListItem) => {
    setResumingId(item.session_id);
    setError(null);
    try {
      // Fetch full scope record
      const scope = (await fetchScope(item.service_scope_id)) as Record<string, unknown>;
      const refined = (scope.refined_scope_text as string) || (scope.raw_scope_text as string) || "";
      const raw = (scope.raw_scope_text as string) || "";
      const sector = scope.oil_gas_sector as OilGasSector | undefined;

      // Fetch the latest revision's scope_document via history
      await getChatHistory(item.service_scope_id, item.session_id);

      // Populate wizard context
      setInitialDescription(item.title);
      setType("service"); // critical: stepper shows 8 service steps
      setScopeId(item.service_scope_id);
      setScopeText(raw);
      setRefinedScopeText(refined);
      if (sector) setSector(sector);
      setChatSessionId(item.session_id);

      navigate("/scope-editor");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to resume session");
    } finally {
      setResumingId(null);
    }
  };

  const sessions = sessionsQuery.data || [];

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

      {/* Session list — resume previous sessions */}
      {sessions.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
              or continue a previous session
            </span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {sessions.map((item, idx) => {
              const badge = statusBadge(item.status);
              const isFeatured = idx === 0;
              const isResuming = resumingId === item.session_id;
              return (
                <div
                  key={item.session_id}
                  className={`rounded-2xl border p-4 space-y-3 transition ${
                    isFeatured
                      ? "border-primary/40 bg-gradient-to-br from-primary/5 to-white"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`h-2 w-2 rounded-full flex-shrink-0 ${
                          item.status === "finalised" ? "bg-green-500" : "bg-blue-500"
                        }`}
                      />
                      <h3 className="font-semibold text-gray-900 text-sm truncate">{item.title}</h3>
                    </div>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold flex-shrink-0 ${badge.classes}`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  <div className="text-[11px] text-gray-500">
                    Rev {item.revision_count}
                    {item.sector && ` · Sector: ${item.sector}`}
                  </div>

                  <div className="border-l-2 border-primary/40 pl-3">
                    <p className="text-xs text-gray-700 leading-relaxed line-clamp-4">
                      {item.scope_snippet || "(no preview)"}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 text-[10px] text-gray-500 pt-1 border-t border-gray-100">
                    <span>{item.revision_count} revs</span>
                    <span>·</span>
                    <span>{item.turn_count} turns</span>
                    <span>·</span>
                    <span>{item.word_count.toLocaleString()} words</span>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-gray-500">{formatTimestamp(item.last_revision_at)}</span>
                    <button
                      type="button"
                      disabled={isResuming}
                      onClick={() => handleResume(item)}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 transition disabled:opacity-50"
                    >
                      {isResuming
                        ? "Loading…"
                        : item.status === "finalised"
                          ? "View scope →"
                          : "Resume editing →"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
