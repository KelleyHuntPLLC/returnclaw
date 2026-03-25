"use client";

import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "voice";
  size?: "sm" | "md" | "lg" | "icon";
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
          // Variants
          variant === "primary" &&
            "bg-brand-500 text-white hover:bg-brand-400 active:bg-brand-600 shadow-lg shadow-brand-500/20 hover:shadow-brand-500/30",
          variant === "secondary" &&
            "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600",
          variant === "ghost" &&
            "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50",
          variant === "danger" &&
            "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20",
          variant === "voice" &&
            "bg-voice-500 text-white hover:bg-voice-400 active:bg-voice-600 shadow-lg shadow-voice-500/20",
          // Sizes
          size === "sm" && "h-8 px-3 text-sm rounded-lg gap-1.5",
          size === "md" && "h-10 px-5 text-sm rounded-xl gap-2",
          size === "lg" && "h-12 px-8 text-base rounded-xl gap-2.5",
          size === "icon" && "h-10 w-10 rounded-xl",
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
export { Button };
export type { ButtonProps };
