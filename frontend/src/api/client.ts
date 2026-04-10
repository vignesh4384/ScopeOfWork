import type {
  ClassificationResponse,
  MaterialDetailsResponse,
  ServiceQuestionsResponse,
  PurchaseRequestCreate,
  SAPPayload,
  ScopeGenerateResponse,
  ScopeUploadResponse,
  ScopeRefineResponse,
  GoldPlatingResponse,
  SimilarityResponse,
  ScopeOutputs,
  OilGasSector,
  ChatStartResponse,
  ChatMessageResponse,
  ChatHistoryResponse,
  ChatRevisionDetail,
  SessionListItem,
} from "../types";

const API_BASE = import.meta.env.VITE_API_URL || "/sow-app";

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || `Request failed: ${res.status}`);
  }
  return res.json();
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Existing endpoints (unchanged)
// ---------------------------------------------------------------------------

export function classify(description: string) {
  return postJson<ClassificationResponse>("/api/classify", { description });
}

export function fetchMaterialDetails(description: string) {
  return postJson<MaterialDetailsResponse>("/api/material-details", { description });
}

export function fetchServiceQuestions(description: string) {
  return postJson<ServiceQuestionsResponse>("/api/service-questions", { description });
}

export function createPurchaseRequest(payload: PurchaseRequestCreate) {
  return postJson<SAPPayload>("/api/purchase-requests", payload);
}

// ---------------------------------------------------------------------------
// Service Scope Flow endpoints
// ---------------------------------------------------------------------------

export function generateScope(description: string, sector?: OilGasSector) {
  return postJson<ScopeGenerateResponse>("/api/service/scope/generate", {
    description,
    sector,
  });
}

export async function uploadScope(
  file: File,
  description?: string,
  sector?: OilGasSector,
): Promise<ScopeUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const params = new URLSearchParams();
  if (description) params.set("description", description);
  if (sector) params.set("sector", sector);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const res = await fetch(`${API_BASE}/api/service/scope/upload${qs}`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || `Upload failed: ${res.status}`);
  }
  return res.json();
}

export function refineScope(
  scopeId: number,
  feedback?: string,
  editedText?: string,
) {
  return postJson<ScopeRefineResponse>(
    `/api/service/scope/${scopeId}/refine`,
    { feedback, edited_text: editedText },
  );
}

export function checkGoldPlating(scopeId: number, sector: OilGasSector) {
  return postJson<GoldPlatingResponse>(
    `/api/service/scope/${scopeId}/gold-plating-check`,
    { sector },
  );
}

export function checkSimilarity(scopeId: number) {
  return postJson<SimilarityResponse>(
    `/api/service/scope/${scopeId}/similarity-check`,
    {},
  );
}

export function constructOutputs(scopeId: number) {
  return postJson<ScopeOutputs>(
    `/api/service/scope/${scopeId}/construct`,
    {},
  );
}

export function fetchScope(scopeId: number) {
  return getJson<Record<string, unknown>>(`/api/service/scope/${scopeId}`);
}

// ---------------------------------------------------------------------------
// Chat refinement endpoints
// ---------------------------------------------------------------------------

export function startChat(scopeId: number) {
  return postJson<ChatStartResponse>(
    `/api/service/scope/${scopeId}/chat/start`,
    {},
  );
}

export function sendChatMessage(
  scopeId: number,
  sessionId: string,
  message: string,
  editedScope?: string,
) {
  return postJson<ChatMessageResponse>(
    `/api/service/scope/${scopeId}/chat/message`,
    { session_id: sessionId, message, edited_scope: editedScope },
  );
}

export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; scope_document: string; agent_reply: string; changes_summary: string }
  | { type: "saved"; revision_number: number }
  | { type: "error"; detail: string };

export async function* sendChatMessageStream(
  scopeId: number,
  sessionId: string,
  message: string,
  editedScope?: string,
): AsyncGenerator<StreamEvent> {
  const res = await fetch(
    `${API_BASE}/api/service/scope/${scopeId}/chat/stream`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        message,
        edited_scope: editedScope,
      }),
    },
  );
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || `Stream request failed: ${res.status}`);
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Parse SSE lines
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(line.slice(6)) as StreamEvent;
        yield event;
      } catch {
        // skip malformed lines
      }
    }
  }
  // Flush remaining buffer
  if (buffer.startsWith("data: ")) {
    try {
      yield JSON.parse(buffer.slice(6)) as StreamEvent;
    } catch {
      // ignore
    }
  }
}

export function getChatHistory(scopeId: number, sessionId: string) {
  return getJson<ChatHistoryResponse>(
    `/api/service/scope/${scopeId}/chat/history?session_id=${encodeURIComponent(sessionId)}`,
  );
}

export function getRevisionDetail(
  scopeId: number,
  sessionId: string,
  revisionNumber: number,
) {
  return getJson<ChatRevisionDetail>(
    `/api/service/scope/${scopeId}/chat/revision/${revisionNumber}?session_id=${encodeURIComponent(sessionId)}`,
  );
}

export function revertToRevision(
  scopeId: number,
  sessionId: string,
  revisionNumber: number,
) {
  return postJson<ChatMessageResponse>(
    `/api/service/scope/${scopeId}/chat/revert/${revisionNumber}?session_id=${encodeURIComponent(sessionId)}`,
    {},
  );
}

export function finaliseChat(scopeId: number, sessionId: string) {
  return postJson<{ session_id: string; status: string }>(
    `/api/service/scope/${scopeId}/chat/finalise?session_id=${encodeURIComponent(sessionId)}`,
    {},
  );
}

export function getSessions() {
  return getJson<SessionListItem[]>("/api/service/sessions");
}
