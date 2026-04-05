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
} from "../types";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

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
