import React, { createContext, useContext, useState } from "react";
import type { RequestType, ItemDraft, CommercialData } from "../types";

type WizardState = {
  initialDescription: string;
  type?: RequestType;
  parameters: Record<string, unknown>;
  commercial?: CommercialData;
  items: ItemDraft[];
};

type WizardContextType = {
  state: WizardState;
  setInitialDescription: (desc: string) => void;
  setType: (type: RequestType) => void;
  setParameters: (params: Record<string, unknown>) => void;
  setCommercial: (data: CommercialData) => void;
  addItem: (commercial: CommercialData) => void;
  deleteItem: (index: number) => void;
  reset: () => void;
};

const WizardContext = createContext<WizardContextType | undefined>(undefined);

export const WizardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<WizardState>({
    initialDescription: "",
    parameters: {},
    items: [],
  });

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
      };
      return {
        initialDescription: "",
        type: undefined,
        parameters: {},
        commercial: undefined,
        items: [...prev.items, draft],
      };
    });

  const deleteItem = (index: number) =>
    setState((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));

  const reset = () =>
    setState({
      initialDescription: "",
      parameters: {},
      type: undefined,
      commercial: undefined,
      items: [],
    });

  return (
    <WizardContext.Provider
      value={{ state, setInitialDescription, setType, setParameters, setCommercial, addItem, deleteItem, reset }}
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
