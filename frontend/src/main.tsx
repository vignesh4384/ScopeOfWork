import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "./index.css";
import App from "./App";
import { WizardProvider } from "./context/WizardContext";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <WizardProvider>
        <BrowserRouter basename="/sow-app">
          <App />
        </BrowserRouter>
      </WizardProvider>
    </QueryClientProvider>
  </StrictMode>
);
