import { Link, Route, Routes, useLocation } from "react-router-dom";
import InitialScreen from "./pages/InitialScreen";
import DetailsScreen from "./pages/DetailsScreen";
import CommercialScreen from "./pages/CommercialScreen";
import ReviewScreen from "./pages/ReviewScreen";
import ScopeSourceScreen from "./pages/ScopeSourceScreen";
import ScopeEditorScreen from "./pages/ScopeEditorScreen";
import GoldPlatingScreen from "./pages/GoldPlatingScreen";
import SimilarityScreen from "./pages/SimilarityScreen";
import ScopeOutputScreen from "./pages/ScopeOutputScreen";
import { useWizard } from "./context/WizardContext";

type Step = { path: string; label: string; idx: number };

const materialSteps: Step[] = [
  { path: "/", label: "Describe", idx: 1 },
  { path: "/details", label: "Details", idx: 2 },
  { path: "/commercial", label: "Commercial", idx: 3 },
  { path: "/review", label: "Review", idx: 4 },
];

const serviceSteps: Step[] = [
  { path: "/", label: "Describe", idx: 1 },
  { path: "/scope-source", label: "Source", idx: 2 },
  { path: "/scope-editor", label: "Editor", idx: 3 },
  { path: "/gold-plating", label: "Gold Plating", idx: 4 },
  { path: "/similarity", label: "Similarity", idx: 5 },
  { path: "/scope-output", label: "Outputs", idx: 6 },
  { path: "/commercial", label: "Commercial", idx: 7 },
  { path: "/review", label: "Review", idx: 8 },
];

function Stepper() {
  const location = useLocation();
  const { state } = useWizard();
  const isService =
    state.type === "service" ||
    state.items.some((item) => item.type === "service");
  const steps = isService ? serviceSteps : materialSteps;

  return (
    <div className="flex gap-2 items-center justify-center mt-6 flex-wrap">
      {steps.map((step, i) => {
        const isActive = location.pathname === step.path;
        const isDone = steps.findIndex((s) => s.path === location.pathname) > i;
        return (
          <div key={step.path} className="flex items-center gap-1.5">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                isActive
                  ? "bg-white text-primary shadow-card"
                  : isDone
                    ? "bg-primary text-white"
                    : "bg-white/30 text-white"
              }`}
            >
              {step.idx}
            </div>
            <span className={`text-xs font-semibold ${isActive ? "text-white" : "text-white/80"}`}>
              {step.label}
            </span>
            {i < steps.length - 1 && <div className="w-6 h-px bg-white/40" />}
          </div>
        );
      })}
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const isEditorPage = location.pathname === "/scope-editor";

  return (
    <div className="min-h-screen bg-surface">
      <header className="relative overflow-hidden rounded-b-3xl gradient-hero pb-12 shadow-xl">
        <div className="absolute inset-0">
          <div className="absolute -left-16 top-12 h-64 w-64 rounded-full bg-white/12 blur-3xl" />
          <div className="absolute right-12 top-8 h-80 w-80 rounded-full bg-accent/22 blur-3xl" />
          <div className="absolute left-1/2 bottom-0 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
        </div>
        <div className="relative z-10 mx-auto flex max-w-6xl flex-col gap-3 px-6 pt-8 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center font-bold">
                PR
              </div>
              <div>
                <p className="text-sm text-white/80">Autonomous Procurement</p>
                <h1 className="text-2xl font-semibold">Scope of Work Agent</h1>
              </div>
            </div>
            <Link
              to="/"
              className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/25 transition"
            >
              Start over
            </Link>
          </div>
          <p className="max-w-3xl text-white/80">
            Draft purchase requests faster with guided agent flows. Describe what you need, refine the details, and
            capture the commercial data to prepare an SAP-ready payload.
          </p>
          <Stepper />
        </div>
      </header>

      <main className="-mt-10 pb-16">
        <div className={`mx-auto px-4 ${isEditorPage ? "max-w-7xl" : "max-w-5xl"}`}>
          <div className="glass rounded-3xl p-6 md:p-8">
            <Routes>
              <Route path="/" element={<InitialScreen />} />
              <Route path="/details" element={<DetailsScreen />} />
              <Route path="/scope-source" element={<ScopeSourceScreen />} />
              <Route path="/scope-editor" element={<ScopeEditorScreen />} />
              <Route path="/gold-plating" element={<GoldPlatingScreen />} />
              <Route path="/similarity" element={<SimilarityScreen />} />
              <Route path="/scope-output" element={<ScopeOutputScreen />} />
              <Route path="/commercial" element={<CommercialScreen />} />
              <Route path="/review" element={<ReviewScreen />} />
            </Routes>
          </div>
        </div>
      </main>
    </div>
  );
}
