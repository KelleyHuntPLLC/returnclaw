import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";
import { HowItWorks } from "@/components/landing/how-it-works";
import { CTA } from "@/components/landing/cta";
import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 inset-x-0 z-50 h-16 flex items-center justify-between px-6 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
            </svg>
          </div>
          <span className="font-semibold text-zinc-100 text-lg">ReturnClaw</span>
        </div>

        <div className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors">Features</a>
          <a href="#how-it-works" className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors">How it Works</a>
          <a href="https://github.com/returnclaw/returnclaw" className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors">GitHub</a>
          <a href="/docs" className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors">Docs</a>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors">
            Log in
          </Link>
          <Link
            href="/signup"
            className="h-9 px-4 text-sm font-medium bg-brand-500 text-white rounded-lg hover:bg-brand-400 transition-colors flex items-center"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Sections */}
      <Hero />
      <div id="features">
        <Features />
      </div>
      <div id="how-it-works">
        <HowItWorks />
      </div>
      <CTA />

      {/* Footer */}
      <footer className="border-t border-zinc-800/50 px-6 py-12">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 rounded-md bg-brand-500 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                  </svg>
                </div>
                <span className="font-semibold text-sm text-zinc-200">ReturnClaw</span>
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">
                The voice-first AI agent for consumer returns automation.
              </p>
            </div>

            <div>
              <h4 className="text-sm font-medium text-zinc-300 mb-3">Product</h4>
              <ul className="space-y-2">
                <li><a href="#features" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Features</a></li>
                <li><a href="#" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Pricing</a></li>
                <li><a href="#" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">API</a></li>
                <li><a href="#" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Changelog</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-medium text-zinc-300 mb-3">Company</h4>
              <ul className="space-y-2">
                <li><a href="#" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">About</a></li>
                <li><a href="#" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Blog</a></li>
                <li><a href="#" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Careers</a></li>
                <li><a href="https://kelleyhunt.law" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Kelley Hunt PLLC</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-medium text-zinc-300 mb-3">Legal</h4>
              <ul className="space-y-2">
                <li><a href="#" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Privacy</a></li>
                <li><a href="#" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Terms</a></li>
                <li><a href="#" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">License</a></li>
                <li><a href="#" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Security</a></li>
              </ul>
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-8 border-t border-zinc-800/50">
            <p className="text-xs text-zinc-600">
              &copy; 2026 Aisha Hunt / Kelley Hunt PLLC. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <a href="https://github.com/returnclaw" className="text-zinc-500 hover:text-zinc-300 transition-colors">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
              </a>
              <a href="https://twitter.com/returnclaw" className="text-zinc-500 hover:text-zinc-300 transition-colors">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a href="https://discord.gg/returnclaw" className="text-zinc-500 hover:text-zinc-300 transition-colors">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286z" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
