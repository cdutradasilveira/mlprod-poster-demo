import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { LookupStatus } from "@/lib/types";

export function LookupStatusBanner() {
  const [status, setStatus] = useState<LookupStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .lookupStatus()
      .then((s) => {
        if (alive) setStatus(s);
      })
      .catch((e: ApiError) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
        <span className="font-medium">Backend unreachable.</span> Could not verify
        lookup status: {error}
      </div>
    );
  }

  if (!status || status.populated) return null;

  return (
    <div className="border-b border-warning/30 bg-warning/15 px-4 py-2 text-sm text-warning-foreground dark:text-warning">
      <div className="container mx-auto flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          <span className="font-medium">Lookup table not populated.</span>{" "}
          Run{" "}
          <code className="rounded bg-background/40 px-1 py-0.5 font-mono text-xs">
            python scripts/populate_lookup.py
          </code>{" "}
          to enable lookup serving. Currently {status.key_count.toLocaleString()}{" "}
          keys; per-model:{" "}
          {Object.entries(status.per_model)
            .map(([m, ok]) => `${m}=${ok ? "✓" : "✗"}`)
            .join(", ")}
          .
        </span>
      </div>
    </div>
  );
}
