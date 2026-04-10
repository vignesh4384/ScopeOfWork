import { useState } from "react";
import type { KeyboardEvent } from "react";

interface ChatInputProps {
  onSend: (message: string) => void;
  loading: boolean;
  streaming?: boolean;
  disabled?: boolean;
  latestChangesSummary?: string;
  metadata?: {
    source?: string;
    scopeId?: number;
    revisionCount?: number;
    sector?: string;
  };
}

const SUGGESTIONS = [
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
  latestChangesSummary,
  metadata,
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
    <div className="flex flex-col h-full space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Refine with chat</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Tell the agent what to change. Ctrl+Enter to send.
          </p>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={4}
          disabled={loading || disabled}
          placeholder="e.g., Add a RACI matrix and tighten the acceptance criteria"
          className="w-full rounded-xl border border-gray-300 p-3 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary resize-y disabled:bg-gray-50"
        />

        <button
          onClick={handleSend}
          disabled={loading || disabled || !text.trim()}
          className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 transition disabled:opacity-50"
        >
          {streaming ? "Streaming response…" : loading ? "Revising scope…" : "Send"}
        </button>

        {!disabled && (
          <div className="space-y-1.5 pt-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
              Quick prompts
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={loading}
                  onClick={() => setText(s)}
                  className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] text-gray-700 hover:bg-primary/5 hover:border-primary/30 transition disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {latestChangesSummary && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4 space-y-1.5">
          <h4 className="text-xs font-bold uppercase tracking-wide text-green-800">
            Latest changes
          </h4>
          <pre className="whitespace-pre-wrap font-sans text-xs text-green-900 leading-relaxed">
            {latestChangesSummary}
          </pre>
        </div>
      )}

      {metadata && (
        <div className="rounded-2xl bg-gray-50 border border-gray-200 p-4 space-y-1 text-xs text-gray-500">
          {metadata.source && (
            <p>
              <strong>Source:</strong> {metadata.source}
            </p>
          )}
          {metadata.scopeId !== undefined && (
            <p>
              <strong>Scope ID:</strong> {metadata.scopeId}
            </p>
          )}
          {metadata.revisionCount !== undefined && (
            <p>
              <strong>Revisions:</strong> {metadata.revisionCount}
            </p>
          )}
          {metadata.sector && (
            <p>
              <strong>Sector:</strong> {metadata.sector}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
