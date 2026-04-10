import { useEffect, useRef } from "react";
import type { ChatRevisionSummary } from "../types";

interface ConversationHistoryProps {
  revisions: ChatRevisionSummary[];
  selectedRevision: number | null;
  currentRevision: number;
  onSelectRevision: (revisionNumber: number) => void;
  onRevert: (revisionNumber: number) => void;
  loading?: boolean;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function ConversationHistory({
  revisions,
  selectedRevision,
  currentRevision,
  onSelectRevision,
  onRevert,
  loading = false,
}: ConversationHistoryProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest when new revision arrives
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [revisions.length]);

  return (
    <div className="flex flex-col h-full rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Conversation</h3>
          <p className="text-xs text-gray-500">
            {revisions.length} revision{revisions.length === 1 ? "" : "s"}
          </p>
        </div>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          Rev {currentRevision}
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {revisions.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-8">
            No revisions yet. Start by sending a message.
          </p>
        )}

        {revisions.map((rev) => {
          const isCurrent = rev.revision_number === currentRevision;
          const isSelected =
            selectedRevision !== null && rev.revision_number === selectedRevision;
          const hasUserMessage = rev.user_instruction && rev.user_instruction.trim() !== "";
          const isReverted = rev.user_instruction.startsWith("[Reverted");

          return (
            <div key={rev.revision_number} className="space-y-2">
              {/* User bubble */}
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

              {/* Agent bubble */}
              <div className="flex justify-start">
                <button
                  type="button"
                  onClick={() => onSelectRevision(rev.revision_number)}
                  className={`max-w-[90%] text-left rounded-2xl rounded-tl-sm px-3 py-2 text-sm border transition ${
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
                  <p className="text-xs text-gray-700 leading-relaxed mb-1.5">{rev.agent_reply}</p>
                  {rev.changes_summary && (
                    <pre className="mt-1 whitespace-pre-wrap font-sans text-[11px] text-gray-600 bg-white/60 rounded p-1.5 border border-gray-100">
                      {rev.changes_summary}
                    </pre>
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

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-tl-sm bg-gray-50 border border-gray-200 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"></span>
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: "0.15s" }}></span>
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: "0.3s" }}></span>
                <span className="ml-2 text-xs text-gray-500">Revising scope…</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
