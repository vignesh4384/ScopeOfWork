import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWizard } from "../context/WizardContext";

export default function CommercialScreen() {
  const { state, setCommercial, addItem } = useWizard();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    need_by_date: "",
    budget_type: "CAPEX",
    wbs: "111.12.1130.11",
    cost_center: "711010020",
    gl_account: "60102020",
    estimate_price: "",
    quantity: "1",
    currency: "USD",
  });

  useEffect(() => {
    // Allow staying on this screen if we already have items in progress.
    if (!state.type && state.items.length === 0) {
      navigate("/");
    }
  }, [state.type, state.items.length, navigate]);

  // Pre-fill estimated price from selected material's moving_price
  useEffect(() => {
    if (state.selectedMaterial?.moving_price && !form.estimate_price) {
      setForm((prev) => ({ ...prev, estimate_price: state.selectedMaterial!.moving_price! }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.selectedMaterial]);

  const update = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.need_by_date || !form.gl_account) {
      setError("Need-by date and GL account are required.");
      return;
    }
    if (!form.estimate_price || Number.isNaN(Number(form.estimate_price))) {
      setError("Estimated price is required and must be numeric.");
      return;
    }
    if (!form.quantity || Number.isNaN(Number(form.quantity))) {
      setError("Quantity is required and must be numeric.");
      return;
    }
    if (!form.currency.trim()) {
      setError("Currency is required.");
      return;
    }
    if (form.budget_type === "CAPEX" && !form.wbs) {
      setError("WBS is required for CAPEX.");
      return;
    }
    if (form.budget_type === "OPEX" && !form.cost_center) {
      setError("Cost center is required for OPEX.");
      return;
    }
    setError(null);
    const commercialData = {
      need_by_date: form.need_by_date,
      budget_type: form.budget_type as "CAPEX" | "OPEX",
      wbs: form.budget_type === "CAPEX" ? form.wbs : null,
      cost_center: form.budget_type === "OPEX" ? form.cost_center : null,
      gl_account: form.gl_account,
      estimate_price: Number(form.estimate_price),
      quantity: Number(form.quantity),
      currency: form.currency.trim(),
    };
    setCommercial(commercialData);
    addItem(commercialData);
    navigate("/review");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">Step {state.type === "material" ? 4 : 3} · Commercial</p>
          <h2 className="mt-1 text-2xl font-semibold text-gray-900">Commercial & accounting details</h2>
          <p className="text-sm text-muted">Capture the finance data we need before generating the SAP-ready payload.</p>
        </div>
        <span className="badge">SAP-ready</span>
      </div>

      {state.selectedMaterial && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm">
          <span className="font-semibold text-green-800">Matched material:</span>{" "}
          <span className="text-green-700">
            {state.selectedMaterial.material} &mdash; {state.selectedMaterial.material_description}
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-semibold text-gray-800">
            Need-by date
            <input
              type="date"
              className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-base focus:border-primary focus:ring-primary"
              value={form.need_by_date}
              onChange={(e) => update("need_by_date", e.target.value)}
              required
            />
          </label>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-800">Budget type</p>
            <div className="flex gap-3">
              {(["CAPEX", "OPEX"] as const).map((type) => (
                <label
                  key={type}
                  className={`flex flex-1 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 ${
                    form.budget_type === type ? "border-primary bg-surface" : "border-gray-200 bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="budget"
                    value={type}
                    checked={form.budget_type === type}
                    onChange={() =>
                      setForm((prev) => ({
                        ...prev,
                        budget_type: type,
                        wbs: type === "CAPEX" ? "111.12.1130.11" : "",
                        cost_center: type === "OPEX" ? "711010020" : "",
                        gl_account: "60102020",
                      }))
                    }
                  />
                  <span className="text-sm font-semibold text-gray-800">{type}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {form.budget_type === "CAPEX" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-semibold text-gray-800">
              WBS
              <input
                type="text"
                className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-base focus:border-primary focus:ring-primary"
                value={form.wbs}
                onChange={(e) => update("wbs", e.target.value)}
                required
              />
            </label>
            <label className="block text-sm font-semibold text-gray-800">
              GL account
              <input
                type="text"
                className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-base focus:border-primary focus:ring-primary"
                value={form.gl_account}
                onChange={(e) => update("gl_account", e.target.value)}
                required
              />
            </label>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-semibold text-gray-800">
              Cost center
              <input
                type="text"
                className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-base focus:border-primary focus:ring-primary"
                value={form.cost_center}
                onChange={(e) => update("cost_center", e.target.value)}
                required
              />
            </label>
            <label className="block text-sm font-semibold text-gray-800">
              GL account
              <input
                type="text"
                className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-base focus:border-primary focus:ring-primary"
                value={form.gl_account}
                onChange={(e) => update("gl_account", e.target.value)}
                required
              />
            </label>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <label className="block text-sm font-semibold text-gray-800">
            Estimated price (per unit)
            <input
              type="number"
              className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-base focus:border-primary focus:ring-primary"
              value={form.estimate_price}
              onChange={(e) => update("estimate_price", e.target.value)}
              required
              min="0"
              step="0.01"
            />
          </label>
          <label className="block text-sm font-semibold text-gray-800">
            Quantity
            <input
              type="number"
              className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-base focus:border-primary focus:ring-primary"
              value={form.quantity}
              onChange={(e) => update("quantity", e.target.value)}
              required
              min="1"
            />
          </label>
          <label className="block text-sm font-semibold text-gray-800">
            Currency
            <input
              type="text"
              className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-base focus:border-primary focus:ring-primary uppercase"
              value={form.currency}
              onChange={(e) => update("currency", e.target.value.toUpperCase())}
              required
              maxLength={10}
            />
          </label>
        </div>

        {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="flex justify-end">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-white font-semibold shadow-card transition hover:translate-y-[-1px] hover:shadow-lg disabled:opacity-60"
          >
            Review items
          </button>
        </div>
      </form>
    </div>
  );
}
