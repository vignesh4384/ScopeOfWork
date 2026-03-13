import type {
  ClassificationResponse,
  MaterialDetailsResponse,
  ServiceQuestionsResponse,
  PurchaseRequestCreate,
  SAPPayload,
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
