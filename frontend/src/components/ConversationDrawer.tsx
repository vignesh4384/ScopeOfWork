import { useEffect, useRef } from "react";
import type { ChatRevisionSummary } from "../types";

interface ConversationDrawerProps {
  isOpen: boolean;
  onToggle: () => void;
  revisions: ChatRevisionSummary[];
  currentRevision: number;
  selectedRevision: number | null;
  onSelectRevision: (revisionNumber: number) => void;
  onRevert: (revisionNumber: number) => void;
  loading: boolean;
  streaming?: boolean;
}

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

export default function ConversationDrawer({
  isOpen,
  onToggle,
  revisions,
  currentRevision,
  selectedRevision,
  onSelectRevision,
  onRevert,
  loading,
  streaming = false,
}: ConversationDrawerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [isOpen, revisions.length, loading, streaming]);

  const turnCount = revisions.filter(
    (r) => r.user_instruction && !r.user_instruction.startsWith("[Reverted"),
  ).length;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      {/* Toggle bar */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-gray-50 transition"
      >
        <div className="flex items-center gap-2">
          <span
            className={`text-gray-500 text-xs transition-transform duration-200 ${
              isOpen ? "rotate-90" : ""
            }`}
          >
            &#9656;
          </span>
          <span className="font-medium text-gray-700">Conversation</span>
          <span className="text-xs text-gray-400">
            {revisions.length} revision{revisions.length === 1 ? "" : "s"} &middot; {turnCount} turn
            {turnCount === 1 ? "" : "s"}
          </span>
        </div>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
          Rev {currentRevision}
        </span>
      </button>

      {/* Collapsible message list */}
      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${
          isOpen ? "max-h-[350px]" : "max-h-0"
        }`}
      >
        <div
          ref={scrollRef}
          className="overflow-y-auto px-4 py-3 space-y-3 border-t border-gray-100"
          style={{ maxHeight: "340px" }}
        >
          {revisions.length === 0 && !loading && (
            <p className="text-xs text-gray-400 text-center py-4">
              No revisions yet.
            </p>
          )}

          {revisions.map((rev) => {
            const isCurrent = rev.revision_number === currentRevision;
            const isSelected =
              selectedRevision !== null && rev.revision_number === selectedRevision;
            const hasUserMessage = rev.user_instruction && rev.user_instruction.trim() !== "";
            const isReverted = rev.user_instruction?.startsWith("[Reverted");
            const changeCount = rev.changes_summary ? countChanges(rev.changes_summary) : 0;

            return (
              <div key={rev.revision_number} className="space-y-1.5">
                {/* User message */}
                {hasUserMessage && (
                  <div className="flex justify-end">
                    <div
                      className={`max-w-[85%] rounded-2xl rounded-tr-sm px-3 py-1.5 text-sm ${
                        isReverted
                          ? "bg-amber-100 text-amber-900 border border-amber-200"
                          : "bg-primary text-white"
                      }`}
                    >
                      <p className="whitespace-pre-wrap leading-relaxed text-xs">
                        {rev.user_instruction}
                      </p>
                    </div>
                  </div>
                )}

                {/* Agent reply */}
                <div className="flex justify-start">
                  <button
                    type="button"
                    onClick={() => onSelectRevision(rev.revision_number)}
                    className={`w-full max-w-[92%] text-left rounded-2xl rounded-tl-sm px-3 py-1.5 text-xs border transition ${
                      isSelected
                        ? "bg-primary/5 border-primary"
                        : isCurrent
                          ? "bg-white border-gray-300 hover:border-primary/40"
                          : "bg-gray-50 border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
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
                    <p className="text-xs text-gray-700 leading-relaxed line-clamp-2">
                      {rev.agent_reply}
                    </p>

                    {changeCount > 0 && (
                      <span className="text-[10px] text-gray-400 mt-1 inline-block">
                        {changeCount} change{changeCount === 1 ? "" : "s"}
                      </span>
                    )}

                    {!isCurrent && !isReverted && (
                      <div className="mt-1 flex justify-end">
                        <span
                          role="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRevert(rev.revision_number);
                          }}
                          className="text-[10px] font-semibold text-primary hover:underline cursor-pointer"
                        >
                          Revert &amp; branch &rarr;
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
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"
                    style={{ animationDelay: "0.15s" }}
                  />
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"
                    style={{ animationDelay: "0.3s" }}
                  />
                  <span className="ml-2 text-xs text-gray-500">
                    {streaming ? "Streaming..." : "Revising..."}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
