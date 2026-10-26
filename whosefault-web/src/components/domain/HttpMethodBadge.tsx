import React from "react";
import type { EvidenceType, HttpMethod } from "@/types/domain";
import { cn } from "@/lib/utils";

const METHOD_STYLES: Record<HttpMethod, string> = {
  GET: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  POST: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  PUT: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  PATCH: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  DELETE: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  HEAD: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  OPTIONS: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
};

export const HttpMethodBadge: React.FC<{
  method: HttpMethod;
  size?: "sm" | "md";
  className?: string;
}> = ({ method, size = "md", className }) => {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded border font-mono font-semibold tracking-wider select-none shrink-0",
        size === "sm"
          ? "px-1.5 py-0.5 text-[10px] min-w-[46px]"
          : "px-2 py-0.5 text-[11px] min-w-[54px]",
        METHOD_STYLES[method] ?? METHOD_STYLES.HEAD,
        className,
      )}
    >
      {method}
    </span>
  );
};

export const HttpStatusBadge: React.FC<{
  statusCode: number;
  className?: string;
}> = ({ statusCode, className }) => {
  let colorClass = "bg-zinc-500/15 text-zinc-300 border-zinc-500/30";
  if (statusCode >= 200 && statusCode < 300) {
    colorClass = "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  } else if (statusCode >= 400 && statusCode < 500) {
    colorClass = "bg-amber-500/15 text-amber-400 border-amber-500/30";
  } else if (statusCode >= 500) {
    colorClass = "bg-rose-500/15 text-rose-400 border-rose-500/30";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[11px] font-semibold",
        colorClass,
        className,
      )}
    >
      HTTP {statusCode}
    </span>
  );
};

export const EvidenceTypeBadge: React.FC<{
  type: EvidenceType;
  className?: string;
}> = ({ type, className }) => {
  const labels: Record<EvidenceType, { label: string; style: string }> = {
    HTTP_REQUEST: {
      label: "HTTP_REQUEST",
      style: "bg-blue-500/10 text-blue-300 border-blue-500/25",
    },
    HTTP_RESPONSE: {
      label: "HTTP_RESPONSE",
      style: "bg-purple-500/10 text-purple-300 border-purple-500/25",
    },
    ERROR_LOG: {
      label: "ERROR_LOG",
      style: "bg-rose-500/10 text-rose-300 border-rose-500/25",
    },
    MANUAL_NOTE: {
      label: "MANUAL_NOTE",
      style: "bg-zinc-500/15 text-zinc-300 border-zinc-600/40",
    },
  };

  const item = labels[type];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-tight",
        item.style,
        className,
      )}
    >
      {item.label}
    </span>
  );
};
