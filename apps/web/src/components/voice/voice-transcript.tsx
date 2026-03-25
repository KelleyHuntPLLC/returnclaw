"use client";

import { cn } from "@/lib/utils";

interface TranscriptMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface VoiceTranscriptProps {
  messages: TranscriptMessage[];
  isListening?: boolean;
  className?: string;
}

export function VoiceTranscript({
  messages,
  isListening = false,
  className,
}: VoiceTranscriptProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 max-h-[400px] overflow-y-auto px-1",
        className
      )}
    >
      {messages.length === 0 && !isListening && (
        <div className="text-center py-8">
          <p className="text-zinc-500 text-sm">
            Tap the orb and say something like...
          </p>
          <p className="text-zinc-300 text-sm mt-2 italic">
            &quot;Return my AirPods from Amazon&quot;
          </p>
        </div>
      )}

      {messages.map((message) => (
        <div
          key={message.id}
          className={cn(
            "flex gap-3 animate-slide-up",
            message.role === "user" ? "justify-end" : "justify-start"
          )}
        >
          {message.role === "assistant" && (
            <div className="w-7 h-7 rounded-full bg-brand-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-3.5 h-3.5 text-brand-400" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
              </svg>
            </div>
          )}
          <div
            className={cn(
              "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
              message.role === "user"
                ? "bg-brand-500/20 text-brand-100 border border-brand-500/20"
                : "bg-zinc-800/50 text-zinc-200 border border-zinc-700/50"
            )}
          >
            <p>{message.content}</p>
            <p className="text-[10px] text-zinc-500 mt-1">
              {message.timestamp}
            </p>
          </div>
          {message.role === "user" && (
            <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-[10px] font-medium text-zinc-400">AH</span>
            </div>
          )}
        </div>
      ))}

      {isListening && (
        <div className="flex gap-3 items-center animate-fade-in">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <span className="text-xs text-zinc-500">Listening...</span>
        </div>
      )}
    </div>
  );
}
