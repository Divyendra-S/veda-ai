import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * The one button shape the design uses for primary actions: a full pill that
 * goes flat grey when it has nothing to do. Disabled state is styled rather
 * than dimmed, because the export shows a specific pair of greys.
 */
export function Button({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-full px-6",
        "text-[16px] font-medium transition-all",
        "bg-ink text-white hover:bg-ink-soft active:scale-[0.99]",
        "disabled:pointer-events-none disabled:bg-line disabled:text-faint",
        className,
      )}
    />
  );
}
