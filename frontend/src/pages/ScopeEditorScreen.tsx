import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWizard } from "../context/WizardContext";
import {
  finaliseChat,
  getChatHistory,
  getRevisionDetail,
  revertToRevision,
  sendChatMessage,
  sendChatMessageStream,
  startChat,
} from "../api/client";
import type { ChatRevisionSummary } from "../types";
import ScopeRenderer from "../components/ScopeRenderer";
import ConversationHistory from "../components/ConversationHistory";
import ChatInput from "../components/ChatInput";

export default function ScopeEditorScreen() {
  const { state, setRefinedScopeText, setChatSessionId } = useWizard();
  const navigate = useNavigate();

  const [revisions, setRevisions] = useState<ChatRevisionSummary[]>([]);
  const [currentScope, setCurrentScope] = useState<string>(
    state.refinedScopeText || state.scopeText || "",
  );
  const [currentRevision, setCurrentRevision] = useState<number>(1);
  const [selectedRevision, setSelectedRevision] = useState<number | null>(null);
  const [latestChangesSummary, setLatestChangesSummary] = useState<string>("");
  const [editMode, setEditMode] = useState(false);
  const [editableScope, setEditableScope] = useState<string>(currentScope);
  const [loading, setLoading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState<string>("");

  const startedRef = useRef(false);

  // On mount: start a new chat session, OR restore an existing one
  useEffect(() => {
    if (!state.scopeId || startedRef.current) return;
    startedRef.current = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        if (state.chatSessionId) {
          // Restore existing session
          const history = await getChatHistory(state.scopeId!, state.chatSessionId);
          setRevisions(history.revisions);
          if (history.revisions.length > 0) {
            const latest = history.revisions[history.revisions.length - 1];
            setCurrentRevision(latest.revision_number);
            // Fetch latest scope document
            const detail = await getRevisionDetail(
              state.scopeId!,
              state.chatSessionId,
              latest.revision_number,
            );
            setCurrentScope(detail.scope_document);
            setEditableScope(detail.scope_document);
            setRefinedScopeText(detail.scope_document);
            setLatestChangesSummary(latest.changes_summary || "");
          }
        } else {
          // Create a new session
          const start = await startChat(state.scopeId!);
          setChatSessionId(start.session_id);
          setCurrentRevision(start.revision_number);
          setCurrentScope(start.scope_document);
          setEditableScope(start.scope_document);
          setRefinedScopeText(start.scope_document);
          // Hydrate the revisions list with the seed revision
          const history = await getChatHistory(state.scopeId!, start.session_id);
          setRevisions(history.revisions);
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to start chat session");
      } finally {
        setLoading(false);
      }
    })();
  }, [state.scopeId, state.chatSessionId, setChatSessionId, setRefinedScopeText]);

  const handleSend = async (message: string) => {
    if (!state.scopeId || !state.chatSessionId) return;
    setChatLoading(true);
    setStreaming(true);
    setStreamText("");
    setError("");
    const editedOverride =
      editMode && editableScope !== currentScope ? editableScope : undefined;

    try {
      let finalScope = "";
      let finalChanges = "";
      let finalRevNum = 0;

      for await (const event of sendChatMessageStream(
        state.scopeId,
        state.chatSessionId,
        message,
        editedOverride,
      )) {
        if (event.type === "delta") {
          setStreamText((prev) => prev + event.text);
        } else if (event.type === "done") {
          finalScope = event.scope_document;
          finalChanges = event.changes_summary;
          setStreaming(false);
        } else if (event.type === "saved") {
          finalRevNum = event.revision_number;
        } else if (event.type === "error") {
          throw new Error(event.detail);
        }
      }

      if (finalScope) {
        setCurrentScope(finalScope);
        setEditableScope(finalScope);
        setRefinedScopeText(finalScope);
        setLatestChangesSummary(finalChanges);
        if (finalRevNum) setCurrentRevision(finalRevNum);
        setSelectedRevision(null);
        setEditMode(false);
        setStreamText("");
        const history = await getChatHistory(state.scopeId, state.chatSessionId);
        setRevisions(history.revisions);
      }
    } catch (e: unknown) {
      // Fallback to non-streaming endpoint
      setStreaming(false);
      setStreamText("");
      try {
        const res = await sendChatMessage(
          state.scopeId!,
          state.chatSessionId!,
          message,
          editedOverride,
        );
        setCurrentScope(res.scope_document);
        setEditableScope(res.scope_document);
        setRefinedScopeText(res.scope_document);
        setCurrentRevision(res.revision_number);
        setSelectedRevision(null);
        setLatestChangesSummary(res.changes_summary);
        setEditMode(false);
        const history = await getChatHistory(state.scopeId!, state.chatSessionId!);
        setRevisions(history.revisions);
      } catch (fallbackErr: unknown) {
        setError(fallbackErr instanceof Error ? fallbackErr.message : "Failed to send message");
      }
    } finally {
      setChatLoading(false);
      setStreaming(false);
    }
  };

  const handleSelectRevision = async (revisionNumber: number) => {
    if (!state.scopeId || !state.chatSessionId) return;
    if (revisionNumber === currentRevision) {
      setSelectedRevision(null);
      // Reset to current scope
      const latestRev = revisions.find((r) => r.revision_number === currentRevision);
      if (latestRev) {
        try {
          const detail = await getRevisionDetail(
            state.scopeId,
            state.chatSessionId,
            currentRevision,
          );
          setCurrentScope(detail.scope_document);
          setEditableScope(detail.scope_document);
        } catch {
          /* ignore */
        }
      }
      return;
    }
    try {
      const detail = await getRevisionDetail(
        state.scopeId,
        state.chatSessionId,
        revisionNumber,
      );
      setSelectedRevision(revisionNumber);
      setCurrentScope(detail.scope_document);
      setEditableScope(detail.scope_document);
      setEditMode(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load revision");
    }
  };

  const handleRevert = async (revisionNumber: number) => {
    if (!state.scopeId || !state.chatSessionId) return;
    setChatLoading(true);
    setError("");
    try {
      const res = await revertToRevision(
        state.scopeId,
        state.chatSessionId,
        revisionNumber,
      );
      setCurrentScope(res.scope_document);
      setEditableScope(res.scope_document);
      setRefinedScopeText(res.scope_document);
      setCurrentRevision(res.revision_number);
      setSelectedRevision(null);
      setLatestChangesSummary(res.changes_summary);
      const history = await getChatHistory(state.scopeId, state.chatSessionId);
      setRevisions(history.revisions);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to revert");
    } finally {
      setChatLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!state.scopeId || !state.chatSessionId) return;
    try {
      // If user has unsaved manual edits, send them as a final edit-only update
      const finalScope = editMode && editableScope !== currentScope ? editableScope : currentScope;
      setRefinedScopeText(finalScope);
      await finaliseChat(state.scopeId, state.chatSessionId);
      navigate("/gold-plating");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to finalise");
    }
  };

  const isViewingHistorical = selectedRevision !== null && selectedRevision !== currentRevision;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">Step 3 · Scope Editor</p>
          <h2 className="text-xl font-semibold text-gray-900">Refine your scope through chat</h2>
          <p className="text-sm text-gray-500 mt-1">
            Tell the agent what to add, change, or remove. Each message creates a new revision you can revisit.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-12 gap-4" style={{ minHeight: "70vh" }}>
        {/* LEFT — Conversation history */}
        <div className="col-span-12 lg:col-span-3">
          <ConversationHistory
            revisions={revisions}
            selectedRevision={selectedRevision}
            currentRevision={currentRevision}
            onSelectRevision={handleSelectRevision}
            onRevert={handleRevert}
            loading={chatLoading}
          />
        </div>

        {/* CENTER — Scope viewer/editor */}
        <div className="col-span-12 lg:col-span-6 flex flex-col rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-800">Scope Document</h3>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                Revision {selectedRevision ?? currentRevision}
              </span>
              {isViewingHistorical && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  Read-only — historical view
                </span>
              )}
            </div>
            <button
              onClick={() => setEditMode(!editMode)}
              disabled={isViewingHistorical}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
            >
              {editMode ? "Preview" : "Edit"}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {loading ? (
              <p className="text-sm text-gray-500">Loading scope…</p>
            ) : streaming && streamText ? (
              <div className="relative">
                <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed text-gray-700">
                  {streamText}
                  <span className="inline-block w-2 h-4 bg-primary/70 animate-pulse ml-0.5" />
                </pre>
              </div>
            ) : editMode ? (
              <textarea
                value={editableScope}
                onChange={(e) => setEditableScope(e.target.value)}
                className="w-full h-full min-h-[500px] rounded-xl border border-gray-300 p-3 text-sm font-mono leading-relaxed focus:ring-2 focus:ring-primary/30 focus:border-primary resize-y"
              />
            ) : (
              <ScopeRenderer text={currentScope} />
            )}
          </div>
        </div>

        {/* RIGHT — Chat input */}
        <div className="col-span-12 lg:col-span-3">
          <ChatInput
            onSend={handleSend}
            loading={chatLoading}
            streaming={streaming}
            disabled={isViewingHistorical || !state.chatSessionId}
            latestChangesSummary={latestChangesSummary}
            metadata={{
              source: state.scopeSource === "uploaded" ? "Uploaded file" : "AI generated",
              scopeId: state.scopeId,
              revisionCount: revisions.length,
              sector: state.sector,
            }}
          />
        </div>
      </div>

      <div className="flex justify-between gap-3 pt-2">
        <button
          onClick={() => navigate("/scope-source")}
          className="rounded-xl border border-gray-300 px-6 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
        >
          Back
        </button>
        <button
          onClick={handleAccept}
          disabled={!currentScope.trim() || isViewingHistorical}
          className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 transition disabled:opacity-50"
        >
          Accept &amp; Check Gold Plating
        </button>
      </div>
    </div>
  );
}
