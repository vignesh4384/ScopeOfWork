import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { ChatRevisionSummary } from "../types";

interface ChatPanelProps {
  revisions: ChatRevisionSummary[];
  currentRevision: number;
  selectedRevision: number | null;
  onSelectRevision: (revisionNumber: number) => void;
  onRevert: (revisionNumber: number) => void;
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

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function countChanges(summary: string): number {
  return summary
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0).length;
}

export default function ChatPanel({
  revisions,
  currentRevision,
  selectedRevision,
  onSelectRevision,
  onRevert,
  onSend,
  loading,
  streaming = false,
  disabled = false,
}: ChatPanelProps) {
  const [text, setText] = useState("");
  const [expandedChanges, setExpandedChanges] = useState<Record<number, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  // Count user turns (non-reverted messages)
  const turnCount = revisions.filter(
    (r) => r.user_instruction && !r.user_instruction.startsWith("[Reverted"),
  ).length;

  // Auto-scroll to bottom when a new turn arrives or streaming/loading toggles
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [revisions.length, loading, streaming]);

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

  const toggleChanges = (rev: number) => {
    setExpandedChanges((prev) => ({ ...prev, [rev]: !prev[rev] }));
  };

  return (
    <div className="flex flex-col h-full rounded-2xl border border-gray-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Refine your scope</h3>
          <p className="text-xs text-gray-500">
            {revisions.length} revision{revisions.length === 1 ? "" : "s"} · {turnCount} turn
            {turnCount === 1 ? "" : "s"}
          </p>
        </div>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          Rev {currentRevision}
        </span>
      </div>

      {/* Messages list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {revisions.length === 0 && !loading && (
          <p className="text-xs text-gray-400 text-center py-8">
            No revisions yet. Send your first instruction below.
          </p>
        )}

        {revisions.map((rev) => {
          const isCurrent = rev.revision_number === currentRevision;
          const isSelected =
            selectedRevision !== null && rev.revision_number === selectedRevision;
          const hasUserMessage = rev.user_instruction && rev.user_instruction.trim() !== "";
          const isReverted = rev.user_instruction.startsWith("[Reverted");
          const isExpanded = !!expandedChanges[rev.revision_number];
          const changeCount = rev.changes_summary ? countChanges(rev.changes_summary) : 0;

          return (
            <div key={rev.revision_number} className="space-y-2">
              {/* User message bubble */}
              {hasUserMessage && (
                <div className="flex justify-end">
                  <div
                    className={`max-w-[85%] rounded-2xl rounded-tr-sm px-3 py-2 text-sm ${
                      isReverted
                        ? "bg-amber-100 text-amber-900 border border-amber-200"
                        : "bg-primary text-white"
                    }`}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{rev.user_instruction}</p>
                  </div>
                </div>
              )}

              {/* Agent reply bubble */}
              <div className="flex justify-start">
                <button
                  type="button"
                  onClick={() => onSelectRevision(rev.revision_number)}
                  className={`w-full max-w-[92%] text-left rounded-2xl rounded-tl-sm px-3 py-2 text-sm border transition ${
                    isSelected
                      ? "bg-primary/5 border-primary"
                      : isCurrent
                        ? "bg-white border-gray-300 hover:border-primary/40"
                        : "bg-gray-50 border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                      Rev {rev.revision_number}
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] font-semibold text-primary">CURRENT</span>
                    )}
                    <span className="text-[10px] text-gray-400 ml-auto">
                      {formatTime(rev.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-700 leading-relaxed">{rev.agent_reply}</p>

                  {rev.changes_summary && changeCount > 0 && (
                    <div className="mt-2">
                      <span
                        role="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleChanges(rev.revision_number);
                        }}
                        className="text-[11px] font-medium text-primary hover:underline cursor-pointer select-none"
                      >
                        {isExpanded ? "▾" : "▸"} View {changeCount} change
                        {changeCount === 1 ? "" : "s"}
                      </span>
                      {isExpanded && (
                        <pre className="mt-1.5 whitespace-pre-wrap font-sans text-[11px] text-gray-600 bg-gray-50 rounded p-2 border border-gray-100">
                          {rev.changes_summary}
                        </pre>
                      )}
                    </div>
                  )}

                  {!isCurrent && !isReverted && (
                    <div className="mt-2 flex justify-end">
                      <span
                        role="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRevert(rev.revision_number);
                        }}
                        className="text-[10px] font-semibold text-primary hover:underline cursor-pointer"
                      >
                        Revert &amp; branch →
                      </span>
                    </div>
                  )}
                </button>
              </div>
            </div>
          );
        })}

        {(loading || streaming) && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-tl-sm bg-gray-50 border border-gray-200 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"></span>
                <span
                  className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"
                  style={{ animationDelay: "0.15s" }}
                ></span>
                <span
                  className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"
                  style={{ animationDelay: "0.3s" }}
                ></span>
                <span className="ml-2 text-xs text-gray-500">
                  {streaming ? "Streaming response…" : "Revising scope…"}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input area (pinned bottom) */}
      <div className="border-t border-gray-200 bg-gray-50/50 p-3 space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          disabled={loading || disabled}
          placeholder="Tell the agent what to add, change, or remove… (Ctrl+Enter to send)"
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
          {streaming ? "Streaming response…" : loading ? "Revising scope…" : "Send"}
        </button>
      </div>
    </div>
  );
}
