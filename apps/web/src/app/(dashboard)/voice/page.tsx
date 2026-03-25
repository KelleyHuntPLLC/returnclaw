"use client";

import { useState } from "react";
import { VoiceOrb } from "@/components/voice/voice-orb";
import { VoiceTranscript } from "@/components/voice/voice-transcript";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type OrbState = "idle" | "listening" | "processing" | "speaking";

const suggestedCommands = [
  "Return my AirPods from Amazon",
  "What's the return policy for Walmart?",
  "Schedule a pickup for my Nike return",
  "Where can I drop off my FedEx return?",
  "What's the status of my return?",
  "List my recent orders",
];

const sampleMessages = [
  {
    id: "1",
    role: "user" as const,
    content: "Return my AirPods from Amazon",
    timestamp: "2:30 PM",
  },
  {
    id: "2",
    role: "assistant" as const,
    content:
      "I found your Apple AirPods Pro (2nd Gen) ordered on March 15 from Amazon for $249.00. The return window is open until April 17. Amazon offers free returns for this item. Would you like me to generate a return label and schedule a UPS pickup?",
    timestamp: "2:30 PM",
  },
  {
    id: "3",
    role: "user" as const,
    content: "Yes, schedule a pickup for tomorrow",
    timestamp: "2:31 PM",
  },
  {
    id: "4",
    role: "assistant" as const,
    content:
      "Done! I've generated your UPS return label and scheduled a pickup for tomorrow between 12:00 PM – 5:00 PM at your address on file. Tracking number: 1Z999AA10123456784. You'll get your $249.00 refund within 3-5 business days after Amazon receives the package.",
    timestamp: "2:31 PM",
  },
];

export default function VoicePage() {
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [messages, setMessages] = useState(sampleMessages);

  const handleOrbClick = () => {
    if (orbState === "idle") {
      setOrbState("listening");
      // Simulate state transitions
      setTimeout(() => setOrbState("processing"), 3000);
      setTimeout(() => setOrbState("speaking"), 4500);
      setTimeout(() => setOrbState("idle"), 7000);
    } else {
      setOrbState("idle");
    }
  };

  const stateLabels: Record<OrbState, string> = {
    idle: "Tap to speak",
    listening: "Listening...",
    processing: "Processing...",
    speaking: "ReturnClaw is speaking",
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-zinc-100">Voice Interface</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Talk to ReturnClaw — start a return, check a policy, or track your refund.
        </p>
      </div>

      {/* Voice orb */}
      <div className="flex flex-col items-center mb-8">
        <VoiceOrb state={orbState} size="lg" onClick={handleOrbClick} />
        <div className="mt-4 flex items-center gap-2">
          <Badge variant={orbState === "idle" ? "default" : orbState === "listening" ? "success" : orbState === "processing" ? "warning" : "voice"}>
            {stateLabels[orbState]}
          </Badge>
        </div>
      </div>

      {/* Suggested commands */}
      {messages.length === 0 && (
        <div className="mb-8">
          <p className="text-xs text-zinc-600 text-center mb-3">Try saying...</p>
          <div className="flex flex-wrap justify-center gap-2">
            {suggestedCommands.map((cmd) => (
              <button
                key={cmd}
                className="px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-all"
              >
                &quot;{cmd}&quot;
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Transcript */}
      <Card variant="glass" className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-zinc-400">Conversation</h3>
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        <VoiceTranscript
          messages={messages}
          isListening={orbState === "listening"}
        />
      </Card>

      {/* Text input fallback */}
      <div className="relative">
        <input
          type="text"
          placeholder="Or type a command..."
          className="w-full h-12 rounded-xl bg-zinc-900 border border-zinc-800 pl-4 pr-12 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition-all"
        />
        <button className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-brand-500 text-white hover:bg-brand-400 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
          </svg>
        </button>
      </div>

      {/* Suggested commands below input */}
      {messages.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-zinc-600 mb-2">Suggested:</p>
          <div className="flex flex-wrap gap-2">
            {suggestedCommands.slice(0, 3).map((cmd) => (
              <button
                key={cmd}
                className="px-3 py-1.5 rounded-full bg-zinc-900/50 border border-zinc-800/50 text-xs text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 transition-all"
              >
                {cmd}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
