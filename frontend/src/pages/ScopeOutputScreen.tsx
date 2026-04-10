import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useWizard } from "../context/WizardContext";
import { constructOutputs, constructOutputsStream } from "../api/client";
import { exportDetailedScopePDF, exportExecutiveSummaryPDF, exportBoQExcel } from "../utils/exportOutputs";
import ScopeRenderer from "../components/ScopeRenderer";
import type { BoQLineItem } from "../types";

type StepStatus = "pending" | "running" | "done";
interface Step {
  key: string;
  label: string;
  status: StepStatus;
}

const DEFAULT_STEPS: Step[] = [
  { key: "detailed_scope", label: "Building detailed scope of work", status: "running" },
  { key: "executive_summary", label: "Writing executive summary", status: "running" },
  { key: "bill_of_quantities", label: "Preparing bill of quantities", status: "running" },
];

type Tab = "detailed" | "summary" | "boq";

const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
);

const EditIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
);

export default function ScopeOutputScreen() {
  const { state, setScopeOutputs } = useWizard();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<Tab>("detailed");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detailedScope, setDetailedScope] = useState("");
  const [executiveSummary, setExecutiveSummary] = useState("");
  const [boq, setBoq] = useState<BoQLineItem[]>([]);
  const [built, setBuilt] = useState(false);
  const [editing, setEditing] = useState<"detailed" | "summary" | null>(null);
  const [steps, setSteps] = useState<Step[]>(DEFAULT_STEPS);

  const buildOutputs = async () => {
    if (!state.scopeId) return;
    setLoading(true);
    setError("");
    setSteps(DEFAULT_STEPS.map((s) => ({ ...s, status: "running" })));

    try {
      let detailed = "";
      let summary = "";
      let boqItems: BoQLineItem[] = [];

      for await (const event of constructOutputsStream(state.scopeId)) {
        if (event.type === "start") {
          setSteps(
            event.steps.map((s) => ({ key: s.key, label: s.label, status: "running" as StepStatus })),
          );
        } else if (event.type === "step_done") {
          setSteps((prev) =>
            prev.map((s) => (s.key === event.key ? { ...s, status: "done" as StepStatus } : s)),
          );
        } else if (event.type === "done") {
          detailed = event.detailed_scope;
          summary = event.executive_summary;
          boqItems = event.bill_of_quantities;
        } else if (event.type === "error") {
          throw new Error(event.detail);
        }
      }

      if (detailed) {
        setDetailedScope(detailed);
        setExecutiveSummary(summary);
        setBoq(boqItems);
        setScopeOutputs({
          detailed_scope: detailed,
          executive_summary: summary,
          bill_of_quantities: boqItems,
        });
        setBuilt(true);
      }
    } catch (streamErr: unknown) {
      // Fallback to non-streaming endpoint
      try {
        const res = await constructOutputs(state.scopeId);
        setDetailedScope(res.detailed_scope);
        setExecutiveSummary(res.executive_summary);
        setBoq(res.bill_of_quantities);
        setScopeOutputs(res);
        setBuilt(true);
      } catch (fallbackErr: unknown) {
        const msg =
          fallbackErr instanceof Error
            ? fallbackErr.message
            : streamErr instanceof Error
              ? streamErr.message
              : "Output construction failed";
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (state.scopeId && !built) {
      buildOutputs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalCost = boq.reduce((sum, item) => sum + item.quantity * item.estimated_cost, 0);

  const tabs: { key: Tab; label: string }[] = [
    { key: "detailed", label: "Detailed Scope" },
    { key: "summary", label: "Executive Summary" },
    { key: "boq", label: "Bill of Quantities" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-800">Scope Outputs</h2>
        <p className="text-sm text-gray-500 mt-1">
          Review the constructed outputs before proceeding to commercial details.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 max-w-xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            <p className="text-sm font-semibold text-gray-800">
              Constructing outputs in parallel…
            </p>
          </div>
          <ul className="space-y-2.5">
            {steps.map((step) => (
              <li key={step.key} className="flex items-center gap-3 text-sm">
                {step.status === "done" ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white flex-shrink-0">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-3 w-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                ) : step.status === "running" ? (
                  <span className="h-5 w-5 rounded-full border-2 border-primary/40 border-t-primary animate-spin flex-shrink-0" />
                ) : (
                  <span className="h-5 w-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
                )}
                <span
                  className={
                    step.status === "done"
                      ? "text-gray-900 font-medium"
                      : step.status === "running"
                        ? "text-gray-700"
                        : "text-gray-400"
                  }
                >
                  {step.label}
                </span>
                {step.status === "done" && (
                  <span className="ml-auto text-[11px] font-semibold uppercase tracking-wide text-primary">
                    Done
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-gray-400">
            Each output is generated by an independent LLM call and streamed as it completes.
          </p>
        </div>
      )}

      {built && (
        <>
          {/* Tab navigation */}
          <div className="flex border-b border-gray-200">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setEditing(null); }}
                className={`px-5 py-3 text-sm font-semibold border-b-2 transition ${
                  activeTab === tab.key
                    ? "border-primary text-primary"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="min-h-[300px]">
            {activeTab === "detailed" && (
              <div className="rounded-2xl border border-gray-200 p-6 space-y-4">
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setEditing(editing === "detailed" ? null : "detailed")}
                    className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
                  >
                    <EditIcon />
                    {editing === "detailed" ? "Preview" : "Edit"}
                  </button>
                  <button
                    onClick={() => exportDetailedScopePDF(detailedScope, state.initialDescription)}
                    className="flex items-center gap-2 rounded-lg bg-primary/10 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/20 transition"
                  >
                    <DownloadIcon />
                    Download PDF
                  </button>
                </div>
                {editing === "detailed" ? (
                  <textarea
                    value={detailedScope}
                    onChange={(e) => setDetailedScope(e.target.value)}
                    rows={18}
                    className="w-full rounded-xl border border-gray-300 p-4 text-sm font-mono leading-relaxed focus:ring-2 focus:ring-primary/30 focus:border-primary resize-y"
                  />
                ) : (
                  <div className="max-h-[500px] overflow-y-auto rounded-xl border border-gray-100 bg-white p-5">
                    <ScopeRenderer text={detailedScope} />
                  </div>
                )}
              </div>
            )}

            {activeTab === "summary" && (
              <div className="rounded-2xl border border-gray-200 p-6 space-y-4">
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setEditing(editing === "summary" ? null : "summary")}
                    className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
                  >
                    <EditIcon />
                    {editing === "summary" ? "Preview" : "Edit"}
                  </button>
                  <button
                    onClick={() => exportExecutiveSummaryPDF(executiveSummary, state.initialDescription)}
                    className="flex items-center gap-2 rounded-lg bg-primary/10 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/20 transition"
                  >
                    <DownloadIcon />
                    Download PDF
                  </button>
                </div>
                {editing === "summary" ? (
                  <textarea
                    value={executiveSummary}
                    onChange={(e) => setExecutiveSummary(e.target.value)}
                    rows={12}
                    className="w-full rounded-xl border border-gray-300 p-4 text-sm leading-relaxed focus:ring-2 focus:ring-primary/30 focus:border-primary resize-y"
                  />
                ) : (
                  <div className="max-h-[500px] overflow-y-auto rounded-xl border border-gray-100 bg-white p-5">
                    <ScopeRenderer text={executiveSummary} />
                  </div>
                )}
              </div>
            )}

            {activeTab === "boq" && (
              <div className="rounded-2xl border border-gray-200 overflow-hidden">
                <div className="flex justify-end p-4 pb-0">
                  <button
                    onClick={() => exportBoQExcel(boq, state.initialDescription)}
                    className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-100 transition"
                  >
                    <DownloadIcon />
                    Download Excel
                  </button>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-3 font-semibold text-gray-700">#</th>
                      <th className="text-left p-3 font-semibold text-gray-700">Item</th>
                      <th className="text-right p-3 font-semibold text-gray-700">Qty</th>
                      <th className="text-center p-3 font-semibold text-gray-700">Unit</th>
                      <th className="text-right p-3 font-semibold text-gray-700">Est. Cost</th>
                      <th className="text-right p-3 font-semibold text-gray-700">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boq.map((item, idx) => (
                      <tr key={idx} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="p-3 text-gray-500">{idx + 1}</td>
                        <td className="p-3 text-gray-800">{item.item}</td>
                        <td className="p-3 text-right text-gray-700">{item.quantity}</td>
                        <td className="p-3 text-center text-gray-500">{item.unit}</td>
                        <td className="p-3 text-right text-gray-700">
                          {item.estimated_cost.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                        </td>
                        <td className="p-3 text-right font-medium text-gray-800">
                          {(item.quantity * item.estimated_cost).toLocaleString("en-US", {
                            style: "currency",
                            currency: "USD",
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                    <tr>
                      <td colSpan={5} className="p-3 text-right font-bold text-gray-800">
                        Total Estimated Cost
                      </td>
                      <td className="p-3 text-right font-bold text-primary text-lg">
                        {totalCost.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <div className="flex justify-end gap-3 pt-4">
        <button
          onClick={() => navigate("/similarity")}
          className="rounded-xl border border-gray-300 px-6 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
        >
          Back
        </button>
        {built && (
          <button
            onClick={() => navigate("/commercial")}
            className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 transition"
          >
            Proceed to Commercial
          </button>
        )}
      </div>
    </div>
  );
}
