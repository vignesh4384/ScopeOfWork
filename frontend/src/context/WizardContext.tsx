import React, { createContext, useContext, useState } from "react";
import type {
  RequestType,
  ItemDraft,
  CommercialData,
  MaterialMatchItem,
  OilGasSector,
  GoldPlatingResponse,
  SimilarityMatch,
  ScopeOutputs,
} from "../types";

type WizardState = {
  initialDescription: string;
  type?: RequestType;
  parameters: Record<string, unknown>;
  commercial?: CommercialData;
  items: ItemDraft[];
  // Material match
  selectedMaterial?: MaterialMatchItem;
  // Service scope flow
  scopeId?: number;
  scopeSource?: "new" | "uploaded";
  scopeText?: string;
  refinedScopeText?: string;
  sector?: OilGasSector;
  goldPlatingReport?: GoldPlatingResponse;
  similarityResults?: SimilarityMatch[];
  scopeOutputs?: ScopeOutputs;
  chatSessionId?: string;
};

type WizardContextType = {
  state: WizardState;
  setInitialDescription: (desc: string) => void;
  setType: (type: RequestType) => void;
  setParameters: (params: Record<string, unknown>) => void;
  setCommercial: (data: CommercialData) => void;
  addItem: (commercial: CommercialData) => void;
  deleteItem: (index: number) => void;
  setSelectedMaterial: (material: MaterialMatchItem | undefined) => void;
  reset: () => void;
  // Service scope setters
  setScopeId: (id: number) => void;
  setScopeSource: (source: "new" | "uploaded") => void;
  setScopeText: (text: string) => void;
  setRefinedScopeText: (text: string) => void;
  setSector: (sector: OilGasSector) => void;
  setGoldPlatingReport: (report: GoldPlatingResponse) => void;
  setSimilarityResults: (results: SimilarityMatch[]) => void;
  setScopeOutputs: (outputs: ScopeOutputs) => void;
  setChatSessionId: (id: string | undefined) => void;
};

const WizardContext = createContext<WizardContextType | undefined>(undefined);

const initialState: WizardState = {
  initialDescription: "",
  parameters: {},
  items: [],
};

export const WizardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<WizardState>(initialState);

  const setInitialDescription = (initialDescription: string) =>
    setState((prev) => ({ ...prev, initialDescription }));

  const setType = (type: RequestType) => setState((prev) => ({ ...prev, type }));

  const setParameters = (parameters: Record<string, unknown>) =>
    setState((prev) => ({ ...prev, parameters }));

  const setCommercial = (commercial: CommercialData) => setState((prev) => ({ ...prev, commercial }));

  const addItem = (commercial: CommercialData) =>
    setState((prev) => {
      if (!prev.type) return prev;
      const draft: ItemDraft = {
        type: prev.type,
        initial_description: prev.initialDescription,
        parameters: prev.parameters,
        commercial,
        material_number: prev.selectedMaterial?.material,
        scopeId: prev.scopeId,
        scopeOutputs: prev.scopeOutputs,
      };
      return {
        ...initialState,
        items: [...prev.items, draft],
      };
    });

  const deleteItem = (index: number) =>
    setState((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));

  const setSelectedMaterial = (selectedMaterial: MaterialMatchItem | undefined) =>
    setState((prev) => ({ ...prev, selectedMaterial }));

  const reset = () => setState(initialState);

  // Service scope setters
  const setScopeId = (scopeId: number) => setState((prev) => ({ ...prev, scopeId }));
  const setScopeSource = (scopeSource: "new" | "uploaded") => setState((prev) => ({ ...prev, scopeSource }));
  const setScopeText = (scopeText: string) => setState((prev) => ({ ...prev, scopeText }));
  const setRefinedScopeText = (refinedScopeText: string) => setState((prev) => ({ ...prev, refinedScopeText }));
  const setSector = (sector: OilGasSector) => setState((prev) => ({ ...prev, sector }));
  const setGoldPlatingReport = (goldPlatingReport: GoldPlatingResponse) =>
    setState((prev) => ({ ...prev, goldPlatingReport }));
  const setSimilarityResults = (similarityResults: SimilarityMatch[]) =>
    setState((prev) => ({ ...prev, similarityResults }));
  const setScopeOutputs = (scopeOutputs: ScopeOutputs) => setState((prev) => ({ ...prev, scopeOutputs }));
  const setChatSessionId = (chatSessionId: string | undefined) =>
    setState((prev) => ({ ...prev, chatSessionId }));

  return (
    <WizardContext.Provider
      value={{
        state,
        setInitialDescription,
        setType,
        setParameters,
        setCommercial,
        addItem,
        deleteItem,
        setSelectedMaterial,
        reset,
        setScopeId,
        setScopeSource,
        setScopeText,
        setRefinedScopeText,
        setSector,
        setGoldPlatingReport,
        setSimilarityResults,
        setScopeOutputs,
        setChatSessionId,
      }}
    >
      {children}
    </WizardContext.Provider>
  );
};

export const useWizard = (): WizardContextType => {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error("useWizard must be used within WizardProvider");
  return ctx;
};
