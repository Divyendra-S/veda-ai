"use client";

import { useId, useRef, useState, type DragEvent } from "react";
import { Upload, X } from "lucide-react";
import { PdfGlyph } from "@/components/upload/pdf-glyph";
import { cn } from "@/lib/cn";
import type { FileSelection } from "@/lib/upload/selection";
import { describeSelection } from "@/lib/upload/selection";

export const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp";

export function DropCard({
  title,
  value,
  error,
  disabled,
  onSelect,
  onClear,
}: {
  title: string;
  value: FileSelection | null;
  error?: string | null;
  disabled?: boolean;
  onSelect: (files: File[]) => void;
  onClear: () => void;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onSelect(files);
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "relative flex h-[184px] flex-1 items-center justify-center rounded-[20px]",
        "border-2 border-dashed bg-surface p-5 transition-colors",
        dragging ? "border-brand bg-brand-wash/40" : "border-line",
        error && "border-fail",
      )}
    >
      <input
        ref={input}
        id={inputId}
        type="file"
        accept={ACCEPT}
        multiple
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) onSelect(files);
          // Reset so re-picking the same file still fires a change event.
          event.target.value = "";
        }}
      />

      {value ? (
        <div className="relative w-full max-w-[320px]">
          <div className="flex items-center gap-3 rounded-2xl bg-well px-4 py-3.5">
            <PdfGlyph className="h-10 w-[34px]" />
            <span className="min-w-0 flex-1 text-center">
              <span className="block truncate text-[16px] font-bold text-ink">
                {value.label}
              </span>
              <span className="block text-[13px] text-faint">
                {describeSelection(value)}
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            aria-label={`Remove ${title}`}
            className="absolute -top-3 -right-3 grid size-8 place-items-center rounded-full bg-[#555] text-white shadow-card transition-colors hover:bg-ink disabled:pointer-events-none"
          >
            <X className="size-4" strokeWidth={2.5} />
          </button>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className={cn(
            "absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-4",
            disabled && "pointer-events-none",
          )}
        >
          <span className="grid size-12 place-items-center rounded-xl bg-subtle">
            <Upload className="size-5 text-ink" strokeWidth={2} />
          </span>
          <span className="text-center">
            <span className="block text-[17px] font-bold text-ink">
              Upload <span className="text-brand">{title}</span>
            </span>
            <span className="mt-1 block text-[13px] text-faint">Max 10MB</span>
          </span>
        </label>
      )}

      {error ? (
        <p
          role="alert"
          className="absolute inset-x-4 bottom-3 text-center text-[13px] text-fail"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
