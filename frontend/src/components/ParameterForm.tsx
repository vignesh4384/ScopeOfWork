import type { ParameterField } from "../types";

type Props = {
  fields: ParameterField[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
};

export default function ParameterForm({ fields, values, onChange }: Props) {
  const updateField = (name: string, value: unknown) => {
    onChange({ ...values, [name]: value });
  };

  return (
    <div className="space-y-4">
      {fields.map((field) => (
        <div key={field.name} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <label className="block text-sm font-semibold text-gray-800">{field.name}</label>
          {field.description && <p className="text-sm text-muted mt-1">{field.description}</p>}
          <div className="mt-3">
            {field.input_type === "select" && field.options ? (
              <select
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-base focus:border-primary focus:ring-primary"
                value={(values[field.name] as string) ?? ""}
                onChange={(e) => updateField(field.name, e.target.value)}
              >
                <option value="">Select...</option>
                {field.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={field.input_type === "date" ? "date" : field.input_type === "number" ? "number" : "text"}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-base focus:border-primary focus:ring-primary"
                placeholder={field.example || ""}
                value={(values[field.name] as string | number | undefined) ?? ""}
                onChange={(e) => updateField(field.name, e.target.value)}
              />
            )}
          </div>
          {!field.required && <p className="mt-1 text-xs text-muted">Optional</p>}
        </div>
      ))}
      {!fields.length && (
        <div className="rounded-xl border border-dashed border-primary/40 bg-surface p-4 text-sm text-muted">
          No suggestions available. Add details manually on the next step.
        </div>
      )}
    </div>
  );
}
