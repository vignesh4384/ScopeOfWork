import type { ChatRevisionSummary } from "../types";

interface RevisionStripProps {
  revisions: ChatRevisionSummary[];
  currentRevision: number;
  selectedRevision: number | null;
  onSelectRevision: (revisionNumber: number) => void;
  onRevert: (revisionNumber: number) => void;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function RevisionStrip({
  revisions,
  currentRevision,
  selectedRevision,
  onSelectRevision,
  onRevert,
}: RevisionStripProps) {
  if (revisions.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
        Revisions
      </h4>
      <div className="flex overflow-x-auto gap-3 pb-2 snap-x snap-mandatory scrollbar-thin">
        {revisions.map((rev) => {
          const isCurrent = rev.revision_number === currentRevision;
          const isSelected =
            selectedRevision !== null && rev.revision_number === selectedRevision;
          const isReverted = rev.user_instruction?.startsWith("[Reverted");

          return (
            <button
              key={rev.revision_number}
              type="button"
              onClick={() => onSelectRevision(rev.revision_number)}
              className={`snap-start flex-shrink-0 w-[260px] text-left rounded-xl border p-3 transition cursor-pointer ${
                isSelected
                  ? "bg-primary/5 border-primary shadow-sm"
                  : isCurrent
                    ? "bg-white border-primary/30 shadow-sm"
                    : "bg-white border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className={`inline-flex items-center justify-center h-5 min-w-[20px] rounded-full px-1.5 text-[10px] font-bold ${
                    isCurrent
                      ? "bg-primary text-white"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {rev.revision_number}
                </span>
                {isCurrent && (
                  <span className="text-[10px] font-semibold text-primary uppercase">
                    Current
                  </span>
                )}
                <span className="text-[10px] text-gray-400 ml-auto">
                  {formatTime(rev.created_at)}
                </span>
              </div>

              <p className="text-xs text-gray-700 leading-relaxed line-clamp-2 mb-2">
                {rev.agent_reply}
              </p>

              {rev.user_instruction && !rev.user_instruction.startsWith("[") && (
                <p className="text-[10px] text-gray-400 truncate">
                  &ldquo;{rev.user_instruction}&rdquo;
                </p>
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
                    Revert &amp; branch &rarr;
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
