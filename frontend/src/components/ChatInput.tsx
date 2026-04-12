import { useState } from "react";
import type { KeyboardEvent } from "react";

interface ChatInputProps {
  onSend: (message: string) => void;
  loading: boolean;
  streaming?: boolean;
  disabled?: boolean;
}

const QUICK_PROMPTS = [
  "Add a RACI matrix for approval workflows",
  "Change hypercare to 3 months",
  "Include penalty clauses for SLA breaches",
  "Add detail on HSE requirements",
];

export default function ChatInput({
  onSend,
  loading,
  streaming = false,
  disabled = false,
}: ChatInputProps) {
  const [text, setText] = useState("");

  const handleSend = () => {
    if (!text.trim() || loading || disabled) return;
    onSend(text.trim());
    setText("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3 space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={2}
        disabled={loading || disabled}
        placeholder="Tell the agent what to add, change, or remove... (Ctrl+Enter to send)"
        className="w-full rounded-xl border border-gray-300 bg-white p-2.5 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none disabled:bg-gray-100"
      />

      {!text.trim() && !disabled && (
        <div className="flex flex-wrap gap-1.5">
          {QUICK_PROMPTS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={loading}
              onClick={() => setText(s)}
              className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] text-gray-600 hover:bg-primary/5 hover:border-primary/30 transition disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <button
        onClick={handleSend}
        disabled={loading || disabled || !text.trim()}
        className="w-full rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition disabled:opacity-50"
      >
        {streaming ? "Streaming response..." : loading ? "Revising scope..." : "Send"}
      </button>
    </div>
  );
}
