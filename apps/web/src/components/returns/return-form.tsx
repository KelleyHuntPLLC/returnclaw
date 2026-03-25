"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";

interface ReturnFormProps {
  open: boolean;
  onClose: () => void;
}

const reasons = [
  "Wrong item received",
  "Item damaged",
  "Item doesn't match description",
  "Changed my mind",
  "Better price found elsewhere",
  "Item arrived too late",
  "Other",
];

export function ReturnForm({ open, onClose }: ReturnFormProps) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Start a New Return</DialogTitle>
        <DialogDescription>
          Describe what you want to return and we&apos;ll handle the rest.
        </DialogDescription>
      </DialogHeader>

      <DialogContent>
        <form className="space-y-4">
          <Input
            label="What are you returning?"
            placeholder='e.g., "AirPods Pro from Amazon"'
          />

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-300">
              Reason for return
            </label>
            <select className="w-full h-10 rounded-xl bg-zinc-900 border border-zinc-800 px-4 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition-all appearance-none">
              <option value="">Select a reason...</option>
              {reasons.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-300">
              Additional details (optional)
            </label>
            <textarea
              className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition-all resize-none"
              rows={3}
              placeholder="Anything else we should know..."
            />
          </div>
        </form>
      </DialogContent>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
          </svg>
          Start Return
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
