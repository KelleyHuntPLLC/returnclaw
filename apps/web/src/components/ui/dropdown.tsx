"use client";

import { cn } from "@/lib/utils";
import { HTMLAttributes, forwardRef, useState, useRef, useEffect } from "react";

interface DropdownProps extends HTMLAttributes<HTMLDivElement> {
  trigger: React.ReactNode;
  align?: "left" | "right";
}

const Dropdown = forwardRef<HTMLDivElement, DropdownProps>(
  ({ trigger, align = "right", children, className, ...props }, ref) => {
    const [open, setOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
      <div ref={dropdownRef} className="relative inline-block" {...props}>
        <div onClick={() => setOpen(!open)} className="cursor-pointer">
          {trigger}
        </div>
        {open && (
          <div
            ref={ref}
            className={cn(
              "absolute top-full mt-2 min-w-[200px] bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl z-50 py-1 animate-fade-in",
              align === "right" && "right-0",
              align === "left" && "left-0",
              className
            )}
          >
            {children}
          </div>
        )}
      </div>
    );
  }
);

Dropdown.displayName = "Dropdown";

interface DropdownItemProps extends HTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  danger?: boolean;
}

const DropdownItem = forwardRef<HTMLButtonElement, DropdownItemProps>(
  ({ className, icon, danger, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors text-left",
        danger
          ? "text-red-400 hover:bg-red-500/10"
          : "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100",
        className
      )}
      {...props}
    >
      {icon && <span className="w-4 h-4 flex-shrink-0">{icon}</span>}
      {children}
    </button>
  )
);

DropdownItem.displayName = "DropdownItem";

const DropdownSeparator = () => (
  <div className="my-1 border-t border-zinc-800" />
);

export { Dropdown, DropdownItem, DropdownSeparator };
