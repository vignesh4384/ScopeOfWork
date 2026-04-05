export type RequestType = "material" | "service";

export interface ClassificationResponse {
  type: RequestType;
  rationale: string;
}

export interface ParameterField {
  name: string;
  input_type: "text" | "number" | "select" | "date";
  description?: string;
  example?: string;
  required?: boolean;
  options?: string[];
}

export interface MaterialDetailsResponse {
  mandatory_parameters: ParameterField[];
  optional_parameters: ParameterField[];
  manufacturers: string[];
  price_range?: string;
  image_urls: string[];
  references?: string[];
  rationale?: string;
}

export interface ServiceQuestionsResponse {
  questions: ParameterField[];
  rationale?: string;
}

export interface PurchaseRequestCreate {
  type: RequestType;
  initial_description: string;
  parameters: Record<string, unknown>;
  estimate_price?: number;
  quantity?: number;
  currency?: string;
  need_by_date: string;
  budget_type: "CAPEX" | "OPEX";
  wbs?: string | null;
  cost_center?: string | null;
  gl_account: string;
}

export interface SAPPayload {
  payload: Record<string, unknown>;
}

export interface CommercialData {
  need_by_date: string;
  budget_type: "CAPEX" | "OPEX";
  wbs?: string | null;
  cost_center?: string | null;
  gl_account: string;
  estimate_price: number;
  quantity: number;
  currency: string;
}

export interface ItemDraft {
  type: RequestType;
  initial_description: string;
  parameters: Record<string, unknown>;
  commercial: CommercialData;
  scopeId?: number;
  scopeOutputs?: ScopeOutputs;
}

// ---------------------------------------------------------------------------
// Service Scope Flow types
// ---------------------------------------------------------------------------

export type OilGasSector = "upstream" | "midstream" | "downstream";

export interface ScopeGenerateResponse {
  scope_id: number;
  raw_scope_text: string;
}

export interface ScopeUploadResponse {
  scope_id: number;
  raw_scope_text: string;
  filename: string;
}

export interface ScopeRefineResponse {
  refined_scope_text: string;
  changes_summary: string;
}

export interface GoldPlatingFlaggedItem {
  item: string;
  reason: string;
  recommendation: string;
  severity: "high" | "medium" | "low";
}

export interface GoldPlatingResponse {
  passed: boolean;
  sector: string;
  flagged_items: GoldPlatingFlaggedItem[];
}

export interface SimilarityMatch {
  reference_id: number;
  title: string;
  score: number;
  matching_sections: string[];
}

export interface SimilarityResponse {
  matches: SimilarityMatch[];
}

export interface BoQLineItem {
  item: string;
  quantity: number;
  unit: string;
  estimated_cost: number;
}

export interface ScopeOutputs {
  detailed_scope: string;
  executive_summary: string;
  bill_of_quantities: BoQLineItem[];
}

export interface ServiceScopeRead {
  id: number;
  purchase_request_id?: number;
  status: string;
  source_type: string;
  initial_description: string;
  raw_scope_text: string;
  refined_scope_text?: string;
  oil_gas_sector?: string;
  gold_plating_report?: Record<string, unknown>;
  gold_plating_passed?: boolean;
  similarity_results?: Record<string, unknown>;
  detailed_scope?: string;
  executive_summary?: string;
  bill_of_quantities?: Record<string, unknown>;
}
