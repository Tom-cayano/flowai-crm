"use client";

import { useState } from "react";
import { FileText, Music, Play, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Message } from "@/types";

interface MediaMessageProps {
  message: Message;
  isAgent: boolean;
}

export function MediaMessage({ message, isAgent }: MediaMessageProps) {
  const { type, mediaUrl, mediaMimeType, thumbnailUrl, content } = message;

  if (type === "image") {
    return (
      <ImageMedia
        src={mediaUrl}
        thumbnail={thumbnailUrl}
        caption={content}
        isAgent={isAgent}
      />
    );
  }

  if (type === "audio") {
    return <AudioMedia src={mediaUrl} isAgent={isAgent} />;
  }

  if (type === "document") {
    return (
      <DocumentMedia
        src={mediaUrl}
        name={content}
        mimeType={mediaMimeType}
        isAgent={isAgent}
      />
    );
  }

  // Fallback for video or unknown media
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-xl border text-xs",
        isAgent
          ? "bg-primary/10 border-primary/20 text-primary"
          : "bg-muted border-border text-muted-foreground"
      )}
    >
      <FileText className="h-4 w-4 shrink-0" />
      <span className="truncate max-w-[160px]">{content || "Archivo adjunto"}</span>
      {mediaUrl && (
        <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="ml-auto shrink-0">
          <Download className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

// ─── Image ───────────────────────────────────────────────────────────────────

function ImageMedia({
  src,
  thumbnail,
  caption,
  isAgent,
}: {
  src?: string;
  thumbnail?: string;
  caption?: string;
  isAgent: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const displaySrc = src ?? thumbnail;

  if (!displaySrc) {
    return (
      <PlaceholderMedia label="Imagen" isAgent={isAgent} />
    );
  }

  return (
    <div className="space-y-1">
      <div className="relative overflow-hidden rounded-xl max-w-[220px]">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted rounded-xl">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        <a href={src ?? displaySrc} target="_blank" rel="noopener noreferrer">
          <img
            src={displaySrc}
            alt="Imagen"
            className={cn(
              "max-w-[220px] max-h-[240px] object-cover rounded-xl transition-opacity",
              loaded ? "opacity-100" : "opacity-0"
            )}
            onLoad={() => setLoaded(true)}
          />
        </a>
      </div>
      {caption && (
        <p className="text-xs leading-relaxed mt-1">{caption}</p>
      )}
    </div>
  );
}

// ─── Audio ───────────────────────────────────────────────────────────────────

function AudioMedia({
  src,
  isAgent,
}: {
  src?: string;
  isAgent: boolean;
}) {
  if (!src) return <PlaceholderMedia label="Audio" isAgent={isAgent} icon={Music} />;

  return (
    <div className="flex items-center gap-2 min-w-[180px]">
      <Play className="h-4 w-4 shrink-0 opacity-60" />
      <audio
        controls
        src={src}
        className="h-7 flex-1 min-w-0"
        style={{ colorScheme: isAgent ? "dark" : "normal" }}
      />
    </div>
  );
}

// ─── Document ────────────────────────────────────────────────────────────────

function DocumentMedia({
  src,
  name,
  mimeType,
  isAgent,
}: {
  src?: string;
  name?: string;
  mimeType?: string | null;
  isAgent: boolean;
}) {
  const label = name || "Documento";
  const ext = mimeType?.split("/")[1]?.toUpperCase() ?? "DOC";

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-xl border max-w-[240px]",
        isAgent
          ? "bg-white/10 border-white/20 text-white"
          : "bg-muted border-border text-foreground"
      )}
    >
      <div
        className={cn(
          "h-9 w-9 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold",
          isAgent ? "bg-white/20 text-white" : "bg-primary/10 text-primary"
        )}
      >
        {ext.slice(0, 3)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{label}</p>
        <p className={cn("text-[10px]", isAgent ? "text-white/60" : "text-muted-foreground")}>
          {mimeType ?? "Archivo"}
        </p>
      </div>
      {src && (
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "shrink-0 hover:opacity-70 transition-opacity",
            isAgent ? "text-white/80" : "text-muted-foreground"
          )}
        >
          <Download className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}

// ─── Placeholder (media still processing) ────────────────────────────────────

function PlaceholderMedia({
  label,
  isAgent,
  icon: Icon = FileText,
}: {
  label: string;
  isAgent: boolean;
  icon?: React.ElementType;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-xl border text-xs",
        isAgent
          ? "bg-white/10 border-white/20 text-white/70"
          : "bg-muted border-border text-muted-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
      <Loader2 className="h-3 w-3 animate-spin ml-1 opacity-60" />
    </div>
  );
}
