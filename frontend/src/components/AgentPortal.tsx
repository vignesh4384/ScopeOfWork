import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ExternalLink,
  FileText,
  LayoutPanelLeft,
  LogOut,
  ShieldCheck,
  Workflow,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface AgentPortalProps {
  tenderingPath?: string;
}

/**
 * Landing surface shown right after login so users can pick between
 * the existing Tendering flow and the separate Scope of Work Agent.
 */
export default function AgentPortal({ tenderingPath = '/sourcing' }: AgentPortalProps) {
  const navigate = useNavigate();
  const { username, logout } = useAuth();
  const [logoutBusy, setLogoutBusy] = useState(false);

  // Configure the Scope of Work target through env so we don't hardcode URLs.
  const sowUrl = useMemo(
    () => (import.meta.env.VITE_SOW_AGENT_URL as string | undefined)?.trim() || '',
    [],
  );
  const sowConfigured = sowUrl.length > 0;

  const handleTendering = () => {
    navigate(tenderingPath);
  };

  const handleScopeOfWork = () => {
    if (!sowConfigured) return;
    // Keep same tab so auth hand-off/SSO (if configured) can apply.
    window.location.href = sowUrl;
  };

  const handleLogout = async () => {
    setLogoutBusy(true);
    await logout().catch(() => {});
    setLogoutBusy(false);
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50">
      <header className="border-b border-purple-100/60 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-600 to-violet-600 flex items-center justify-center shadow-lg shadow-purple-200/60">
              <Workflow className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-purple-500 font-semibold">Autonomous Sourcing</p>
              <p className="text-base font-semibold text-slate-900">Choose your workspace</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {username && (
              <div className="text-sm text-slate-600">
                Signed in as <span className="font-semibold text-slate-900">{username}</span>
              </div>
            )}
            <button
              onClick={handleLogout}
              disabled={logoutBusy}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-50 disabled:opacity-60 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-14 space-y-10">
        <section className="bg-white shadow-xl shadow-purple-100/70 border border-purple-100 rounded-3xl p-8 md:p-10 relative overflow-hidden">
          <div className="absolute -right-16 -top-16 h-48 w-48 bg-purple-50 rounded-full blur-3xl" />
          <div className="absolute -left-10 bottom-0 h-40 w-40 bg-fuchsia-50 rounded-full blur-3xl" />

          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="space-y-2">
              <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                <ShieldCheck className="w-4 h-4" /> Azure authenticated
              </p>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900 leading-tight">
                Where do you want to work today?
              </h1>
              <p className="text-slate-600 max-w-2xl">
                Pick between the new Scope of Work Agent (hosted separately) or stay with the existing Tendering Agent.
                Your current Azure login stays active for both.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {sowConfigured ? (
                <span className="text-xs px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                  Scope of Work URL configured
                </span>
              ) : (
                <span className="text-xs px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                  Set VITE_SOW_AGENT_URL to enable redirect
                </span>
              )}
            </div>
          </div>
        </section>

        <section className="grid md:grid-cols-2 gap-6">
          <div className="bg-white border border-purple-100 rounded-2xl p-7 shadow-lg shadow-purple-100/60 flex flex-col">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-purple-200/70">
                <LayoutPanelLeft className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs uppercase font-semibold text-purple-500">New</p>
                <h2 className="text-xl font-semibold text-slate-900">Scope of Work Agent</h2>
              </div>
            </div>
            <p className="text-slate-600 mt-3 flex-1">
              Generate and manage scopes of work using the dedicated agent experience. This opens the deployed
              Scope of Work application (separate site) while keeping your session.
            </p>
            <div className="mt-6 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-purple-700 font-semibold">
                <FileText className="w-4 h-4" />
                Uses existing Scope of Work Agent
              </div>
              <button
                onClick={handleScopeOfWork}
                disabled={!sowConfigured}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-violet-600 text-white font-semibold hover:shadow-lg hover:shadow-purple-300/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Open Scope of Work
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
            {!sowConfigured && (
              <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Configure the target URL via VITE_SOW_AGENT_URL in frontend/.env so the button knows where to send users.
              </p>
            )}
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-7 shadow-lg shadow-slate-100 flex flex-col">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 text-white flex items-center justify-center shadow-lg shadow-slate-300/60">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs uppercase font-semibold text-slate-500">Existing</p>
                <h2 className="text-xl font-semibold text-slate-900">Tendering Agent</h2>
              </div>
            </div>
            <p className="text-slate-600 mt-3 flex-1">
              Continue to the current sourcing form, Ariba event management, and dashboards without any changes.
            </p>
            <div className="mt-6 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-slate-700 font-semibold">
                <Workflow className="w-4 h-4" />
                Keeps existing flow
              </div>
              <button
                onClick={handleTendering}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-slate-900 font-semibold hover:bg-slate-50 transition-all cursor-pointer"
              >
                Go to Tendering
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
