import { Button } from "@/components/ui/button";
import Link from "next/link";

export function CTA() {
  return (
    <section className="relative px-6 py-24 overflow-hidden">
      <div className="relative max-w-4xl mx-auto text-center">
        {/* Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-brand-500/10 rounded-full blur-[100px]" />

        <div className="relative z-10">
          {/* Quote block */}
          <div className="mb-12 p-8 rounded-2xl bg-zinc-900/50 backdrop-blur-xl border border-zinc-800/50 max-w-2xl mx-auto">
            <p className="text-zinc-300 text-lg italic leading-relaxed">
              &quot;ReturnClaw, return my AirPods from Amazon.&quot;
            </p>
            <div className="mt-4 h-px bg-zinc-800" />
            <p className="mt-4 text-brand-400 text-sm">
              Label generated. Pickup scheduled for tomorrow. You&apos;ll get $249 back in 3–5 days.
            </p>
          </div>

          <h2 className="text-3xl md:text-5xl font-bold text-zinc-100 mb-6">
            Ready to never deal with
            <br />
            <span className="bg-gradient-to-r from-brand-400 to-brand-300 bg-clip-text text-transparent">
              returns again?
            </span>
          </h2>

          <p className="text-zinc-400 text-lg mb-10 max-w-xl mx-auto">
            Join thousands of shoppers who let ReturnClaw handle the hard part. Free for personal use.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup">
              <Button size="lg" variant="primary">
                Start Returning Smarter
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </Button>
            </Link>
            <Link href="https://github.com/returnclaw/returnclaw">
              <Button size="lg" variant="ghost">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                View on GitHub
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
