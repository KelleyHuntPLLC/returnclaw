import { StatsGrid } from "@/components/dashboard/stats-grid";
import { RecentReturns } from "@/components/dashboard/recent-returns";
import { VoiceOrb } from "@/components/voice/voice-orb";
import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Welcome back, Aisha. Here&apos;s your return activity.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/voice"
            className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-voice-500/10 border border-voice-500/20 text-voice-400 text-sm hover:bg-voice-500/20 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
            </svg>
            Voice Mode
          </Link>
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-400 transition-colors shadow-lg shadow-brand-500/20">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Return
          </button>
        </div>
      </div>

      {/* Stats */}
      <StatsGrid />

      {/* Quick voice access */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentReturns />
        </div>
        <div className="glass-card rounded-xl p-6 flex flex-col items-center justify-center text-center">
          <h3 className="text-lg font-semibold text-zinc-100 mb-2">Quick Voice Return</h3>
          <p className="text-sm text-zinc-500 mb-6">Tap the orb and describe your return</p>
          <Link href="/voice">
            <VoiceOrb state="idle" size="md" />
          </Link>
          <p className="text-xs text-zinc-600 mt-4">
            Try: &quot;Return my AirPods from Amazon&quot;
          </p>
        </div>
      </div>
    </div>
  );
}
