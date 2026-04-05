import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPurchaseRequest } from "../api/client";
import { useWizard } from "../context/WizardContext";
import type { ItemDraft } from "../types";

export default function ReviewScreen() {
  const { state, deleteItem, reset } = useWizard();
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const navigate = useNavigate();

  useEffect(() => {
    if (!state.items.length) {
      navigate("/");
    }
  }, [state.items.length, navigate]);

  const handleSubmitAll = async () => {
    setSubmitting(true);
    setError(null);
    setSubmitResult(null);
    try {
      const payloads = await Promise.all(
        state.items.map((item) =>
          createPurchaseRequest({
            type: item.type,
            initial_description: item.initial_description,
            parameters: item.parameters,
            need_by_date: item.commercial.need_by_date,
            budget_type: item.commercial.budget_type,
            wbs: item.commercial.wbs ?? null,
            cost_center: item.commercial.cost_center ?? null,
            gl_account: item.commercial.gl_account,
          })
        )
      );
      setSubmitResult(JSON.stringify(payloads.map((p) => p.payload), null, 2));
      reset();
    } catch (e: any) {
      setError(e?.message || "Failed to submit items");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddAnother = () => {
    navigate("/");
  };

  const handleSendToTendering = () => {
    if (!state.items.length) return;
    // Navigate the parent window (Autonomous Sourcing) to the tendering/sourcing page
    const target = window.parent !== window ? window.parent : window;
    target.location.href = "/sourcing";
  };

  const renderCostCodes = (item: ItemDraft) => {
    if (item.commercial.budget_type === "CAPEX") {
      return `WBS: ${item.commercial.wbs || "-"} · GL: ${item.commercial.gl_account}`;
    }
    return `Cost Center: ${item.commercial.cost_center || "-"} · GL: ${item.commercial.gl_account}`;
  };

  const toggleSpecs = (idx: number) => {
    setExpanded((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const renderSpecs = (item: ItemDraft) => {
    const entries = Object.entries(item.parameters || {});
    if (!entries.length) return <p className="text-sm text-muted">No specs captured.</p>;
    return (
      <ul className="mt-2 grid gap-1 text-sm text-gray-800 md:grid-cols-2">
        {entries.map(([k, v]) => (
          <li key={k} className="rounded-lg bg-surface px-2 py-1">
            <span className="font-semibold text-primary">{k}: </span>
            <span className="break-all">{String(v ?? "-")}</span>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">Review</p>
          <h2 className="mt-1 text-2xl font-semibold text-gray-900">Review & submit</h2>
          <p className="text-sm text-muted">Confirm items, pricing, and cost codes. Add or remove before submitting.</p>
        </div>
        <span className="badge">Summary</span>
      </div>

      <div className="space-y-3">
        {state.items.map((item, idx) => {
          const lineTotal = item.commercial.estimate_price * item.commercial.quantity;
          const isOpen = expanded[idx];
          return (
            <div
              key={idx}
              className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm uppercase text-muted">Item {idx + 1}</p>
                  <p className="text-lg font-semibold text-gray-900">{item.initial_description}</p>
                  <p className="text-sm text-muted">
                    Type: {item.type} · Need-by: {item.commercial.need_by_date} · {renderCostCodes(item)}
                  </p>
                  <p className="text-sm text-gray-800">
                    Est. price: {item.commercial.currency} {item.commercial.estimate_price.toLocaleString()} · Qty:{" "}
                    {item.commercial.quantity} · Line total: {item.commercial.currency}{" "}
                    {lineTotal.toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => toggleSpecs(idx)}
                    className="rounded-full border border-primary/50 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/5"
                  >
                    {isOpen ? "Hide specs" : "View specs"}
                  </button>
                  <button
                    onClick={() => deleteItem(idx)}
                    className="rounded-full border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:border-primary hover:text-primary"
                  >
                    Delete
                  </button>
                </div>
              </div>
              {isOpen && <div className="mt-3">{renderSpecs(item)}</div>}
            </div>
          );
        })}
      </div>

      {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {submitResult && (
        <div className="rounded-2xl border border-primary/30 bg-surface p-4 text-sm text-gray-800">
          <p className="text-base font-semibold text-primary">Submitted payloads</p>
          <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-white p-3 text-xs text-gray-800 shadow-inner">{submitResult}</pre>
        </div>
      )}

      <div className="flex flex-wrap gap-3 justify-between">
        <button
          onClick={handleAddAnother}
          className="rounded-full border border-primary/50 px-4 py-3 text-sm font-semibold text-primary hover:bg-primary/5"
        >
          Add another item
        </button>
        <div className="flex gap-3">
          <button
            onClick={handleSubmitAll}
            disabled={submitting || !state.items.length}
            className="rounded-full border border-primary/50 px-6 py-3 text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-60"
          >
            {submitting ? "Submitting..." : "Send to SAP"}
          </button>
          <button
            onClick={handleSendToTendering}
            disabled={!state.items.length}
            className="rounded-full bg-primary px-6 py-3 text-white font-semibold shadow-card transition hover:translate-y-[-1px] hover:shadow-lg disabled:opacity-60"
          >
            Send to Tendering
          </button>
        </div>
      </div>
    </div>
  );
}
