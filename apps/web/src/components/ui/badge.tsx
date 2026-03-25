import { cn } from "@/lib/utils";
import { HTMLAttributes, forwardRef } from "react";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "danger" | "info" | "voice";
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors",
          variant === "default" &&
            "bg-zinc-800 text-zinc-300 border-zinc-700",
          variant === "success" &&
            "bg-brand-500/10 text-brand-400 border-brand-500/20",
          variant === "warning" &&
            "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
          variant === "danger" &&
            "bg-red-500/10 text-red-400 border-red-500/20",
          variant === "info" &&
            "bg-blue-500/10 text-blue-400 border-blue-500/20",
          variant === "voice" &&
            "bg-voice-500/10 text-voice-400 border-voice-500/20",
          className
        )}
        {...props}
      />
    );
  }
);

Badge.displayName = "Badge";
export { Badge };
export type { BadgeProps };
