"use client";

import { useState, useRef, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Deterministic color per tag text — consistent across re-renders.
const CHIP_COLORS = [
  "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  "bg-cyan-500/15 text-cyan-400 border-cyan-500/25",
  "bg-violet-500/15 text-violet-400 border-violet-500/25",
  "bg-amber-500/15 text-amber-400 border-amber-500/25",
  "bg-pink-500/15 text-pink-400 border-pink-500/25",
  "bg-blue-500/15 text-blue-400 border-blue-500/25",
];

function chipColor(tag: string): string {
  let h = 0;
  for (const ch of tag) h = ch.charCodeAt(0) + ((h << 5) - h);
  return CHIP_COLORS[Math.abs(h) % CHIP_COLORS.length];
}

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  maxTags?: number;
  className?: string;
}

export function TagInput({
  tags,
  onChange,
  placeholder = "Añadir etiqueta...",
  maxTags = 10,
  className,
}: TagInputProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function commit(raw: string) {
    const tag = raw.trim().toLowerCase().replace(/,/g, "");
    if (!tag || tags.includes(tag) || tags.length >= maxTags) return;
    onChange([...tags, tag]);
    setValue("");
  }

  function remove(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(value);
    } else if (e.key === "Backspace" && !value && tags.length > 0) {
      remove(tags[tags.length - 1]);
    }
  }

  return (
    <div
      role="group"
      onClick={() => inputRef.current?.focus()}
      className={cn(
        "flex flex-wrap gap-1.5 min-h-[40px] px-3 py-2 rounded-lg border border-border",
        "bg-muted/30 cursor-text transition-colors",
        "focus-within:border-[#10b981]/50 focus-within:bg-muted/50",
        className
      )}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full",
            "text-[11px] font-medium border",
            chipColor(tag)
          )}
        >
          {tag}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              remove(tag);
            }}
            className="hover:opacity-70 transition-opacity"
            aria-label={`Eliminar etiqueta ${tag}`}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => commit(value)}
        placeholder={tags.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[120px] bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
        aria-label="Nueva etiqueta"
      />
    </div>
  );
}

// Re-export color helper so the table can use the same palette.
export { chipColor };
