"use client";

import { VoiceOrb } from "@/components/voice/voice-orb";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6 py-24 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(16,185,129,0.08)_0%,_transparent_70%)]" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-brand-500/5 rounded-full blur-[120px]" />

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: "64px 64px",
        }}
      />

      <div className="relative z-10 max-w-4xl mx-auto text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-sm font-medium mb-8 animate-fade-in">
          <span className="w-2 h-2 bg-brand-400 rounded-full animate-pulse" />
          Now in Public Beta
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-zinc-100 tracking-tight leading-[1.1] mb-6 animate-slide-up">
          Return anything.
          <br />
          <span className="bg-gradient-to-r from-brand-400 to-brand-300 bg-clip-text text-transparent">
            One voice command.
          </span>
        </h1>

        {/* Subhead */}
        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-12 leading-relaxed animate-slide-up" style={{ animationDelay: "0.1s" }}>
          ReturnClaw is the voice-first AI agent that handles your online returns across every retailer. No more forms. No more hold music. Just say the word.
        </p>

        {/* Voice Orb */}
        <div className="mb-12 animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <VoiceOrb state="idle" size="hero" />
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: "0.3s" }}>
          <Link href="/signup">
            <Button size="lg" variant="primary">
              Get Started Free
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </Button>
          </Link>
          <Button size="lg" variant="secondary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
            </svg>
            Watch Demo
          </Button>
        </div>

        {/* Social proof */}
        <div className="mt-16 animate-fade-in" style={{ animationDelay: "0.5s" }}>
          <p className="text-zinc-600 text-sm mb-4">Trusted by thousands of shoppers</p>
          <div className="flex items-center justify-center gap-8 opacity-40">
            {["Amazon", "Walmart", "Target", "Best Buy", "Apple"].map((name) => (
              <span key={name} className="text-zinc-500 text-sm font-medium">
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
