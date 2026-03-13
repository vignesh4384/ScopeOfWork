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
}
