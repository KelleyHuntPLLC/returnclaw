"use client";

import { cn } from "@/lib/utils";

type OrbState = "idle" | "listening" | "processing" | "speaking";

interface VoiceOrbProps {
  state?: OrbState;
  size?: "sm" | "md" | "lg" | "hero";
  onClick?: () => void;
  className?: string;
}

export function VoiceOrb({
  state = "idle",
  size = "md",
  onClick,
  className,
}: VoiceOrbProps) {
  const sizeClasses = {
    sm: "w-16 h-16",
    md: "w-24 h-24",
    lg: "w-36 h-36",
    hero: "w-48 h-48 md:w-64 md:h-64",
  };

  const ringSizeClasses = {
    sm: "w-16 h-16",
    md: "w-24 h-24",
    lg: "w-36 h-36",
    hero: "w-48 h-48 md:w-64 md:h-64",
  };

  return (
    <div
      className={cn(
        "relative flex items-center justify-center cursor-pointer select-none",
        sizeClasses[size],
        className
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={
        state === "idle"
          ? "Activate voice assistant"
          : state === "listening"
          ? "Listening..."
          : state === "processing"
          ? "Processing..."
          : "Assistant is speaking"
      }
    >
      {/* Expanding rings (always present, speed varies by state) */}
      <div
        className={cn(
          "absolute inset-0 rounded-full border-2 border-brand-500/30",
          ringSizeClasses[size],
          state === "idle" && "animate-[orb-expand_4s_ease-out_infinite]",
          state === "listening" && "animate-[orb-expand_1.5s_ease-out_infinite]",
          state === "processing" && "animate-[orb-expand_2s_ease-out_infinite]",
          state === "speaking" && "animate-[orb-expand_2.5s_ease-out_infinite]"
        )}
      />
      <div
        className={cn(
          "absolute inset-0 rounded-full border-2 border-brand-500/20",
          ringSizeClasses[size],
          state === "idle" && "animate-[orb-expand_4s_ease-out_1.3s_infinite]",
          state === "listening" && "animate-[orb-expand_1.5s_ease-out_0.5s_infinite]",
          state === "processing" && "animate-[orb-expand_2s_ease-out_0.7s_infinite]",
          state === "speaking" && "animate-[orb-expand_2.5s_ease-out_0.8s_infinite]"
        )}
      />
      <div
        className={cn(
          "absolute inset-0 rounded-full border border-brand-500/10",
          ringSizeClasses[size],
          state === "idle" && "animate-[orb-expand_4s_ease-out_2.6s_infinite]",
          state === "listening" && "animate-[orb-expand_1.5s_ease-out_1s_infinite]",
          state === "processing" && "animate-[orb-expand_2s_ease-out_1.4s_infinite]",
          state === "speaking" && "animate-[orb-expand_2.5s_ease-out_1.6s_infinite]"
        )}
      />

      {/* Core orb */}
      <div
        className={cn(
          "relative z-10 rounded-full flex items-center justify-center transition-all duration-500",
          size === "sm" && "w-12 h-12",
          size === "md" && "w-20 h-20",
          size === "lg" && "w-28 h-28",
          size === "hero" && "w-40 h-40 md:w-52 md:h-52",
          // Background gradient
          state === "idle" &&
            "bg-gradient-to-br from-brand-500/80 to-brand-700/80 shadow-[0_0_40px_rgba(16,185,129,0.3)]",
          state === "listening" &&
            "bg-gradient-to-br from-brand-400 to-brand-600 shadow-[0_0_60px_rgba(16,185,129,0.5)] animate-[orb-listening_1s_ease-in-out_infinite]",
          state === "processing" &&
            "bg-gradient-to-br from-voice-500/80 to-voice-700/80 shadow-[0_0_50px_rgba(139,92,246,0.4)] animate-spin-slow",
          state === "speaking" &&
            "bg-gradient-to-br from-brand-400 to-voice-500 shadow-[0_0_60px_rgba(16,185,129,0.4)]"
        )}
      >
        {/* Inner glow */}
        <div
          className={cn(
            "absolute inset-2 rounded-full opacity-50",
            state === "idle" && "bg-gradient-to-t from-transparent to-white/10",
            state === "listening" && "bg-gradient-to-t from-transparent to-white/20",
            state === "processing" && "bg-gradient-to-t from-transparent to-white/15",
            state === "speaking" && "bg-gradient-to-t from-transparent to-white/20"
          )}
        />

        {/* Waveform bars (visible when speaking) */}
        {state === "speaking" && (
          <div className="flex items-center gap-[3px] relative z-10">
            {[...Array(7)].map((_, i) => (
              <div
                key={i}
                className="orb-wave-bar bg-white/90 rounded-full"
                style={{
                  width: size === "hero" ? "4px" : size === "lg" ? "3px" : "2px",
                  height: size === "hero" ? "24px" : size === "lg" ? "18px" : "12px",
                }}
              />
            ))}
          </div>
        )}

        {/* Microphone icon (idle and listening) */}
        {(state === "idle" || state === "listening") && (
          <svg
            className={cn(
              "relative z-10 text-white/90",
              size === "sm" && "w-5 h-5",
              size === "md" && "w-8 h-8",
              size === "lg" && "w-10 h-10",
              size === "hero" && "w-14 h-14 md:w-16 md:h-16"
            )}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"
            />
          </svg>
        )}

        {/* Processing spinner */}
        {state === "processing" && (
          <svg
            className={cn(
              "relative z-10 text-white/80 animate-spin",
              size === "sm" && "w-5 h-5",
              size === "md" && "w-8 h-8",
              size === "lg" && "w-10 h-10",
              size === "hero" && "w-14 h-14"
            )}
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
      </div>
    </div>
  );
}
