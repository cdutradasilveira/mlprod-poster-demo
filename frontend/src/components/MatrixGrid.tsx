import { Fragment, useState } from "react";
import { Check, X } from "lucide-react";

import { METHOD_COLORS, MODEL_DISPLAY, fmtMs } from "@/lib/theme";
import type {
  CompatibilityResponse,
  MethodId,
  ModelId,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface SnapshotShape {
  total_requests: number;
  hits: number;
  misses: number;
  errors: number;
  p50_ms: number | null;
  p95_ms: number | null;
  p99_ms: number | null;
  n_latencies: number;
}

interface Props {
  compat: CompatibilityResponse;
  snapshots: Record<string, SnapshotShape>;
}

export function MatrixGrid({ compat, snapshots }: Props) {
  const [hovered, setHovered] = useState<{
    model: ModelId;
    method: MethodId;
  } | null>(null);

  const methods = compat.methods;
  const models = compat.models;

  const cell = (model: ModelId, method: MethodId, mi: number, hi: number) => {
    const cell = compat.matrix[mi]?.[hi];
    if (!cell) return null;
    const snapshot = snapshots[`${model}:${method}`];
    return (
      <button
        key={method}
        type="button"
        onMouseEnter={() => setHovered({ model, method })}
        onMouseLeave={() => setHovered(null)}
        onFocus={() => setHovered({ model, method })}
        onBlur={() => setHovered(null)}
        className={cn(
          "group relative flex aspect-square w-full flex-col items-center justify-center rounded-md border-2 transition-all",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          cell.compatible
            ? "border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/60 hover:bg-emerald-500/15"
            : "border-red-500/30 bg-red-500/5 hover:border-red-500/60 hover:bg-red-500/15",
        )}
      >
        {cell.compatible ? (
          <Check className="h-5 w-5 text-emerald-500" />
        ) : (
          <X className="h-5 w-5 text-red-500" />
        )}
        {cell.compatible && snapshot && snapshot.p95_ms !== null && (
          <div className="mt-1 font-mono text-[10px] tabular-nums text-muted-foreground">
            p95 {fmtMs(snapshot.p95_ms)}
          </div>
        )}
        {cell.compatible && (!snapshot || snapshot.p95_ms === null) && (
          <div className="mt-1 text-[10px] italic text-muted-foreground/60">
            no traffic
          </div>
        )}
      </button>
    );
  };

  return (
    <div className="space-y-3">
      {/* Grid */}
      <div className="grid grid-cols-[auto_repeat(4,1fr)] gap-2">
        <div />
        {methods.map((method) => (
          <div
            key={method}
            className="text-center text-xs font-semibold capitalize text-muted-foreground"
            style={{ color: METHOD_COLORS[method] }}
          >
            {method}
          </div>
        ))}
        {models.map((model, mi) => (
          <Fragment key={model}>
            <div className="flex items-center justify-end pr-2 text-right text-xs font-semibold text-muted-foreground">
              {MODEL_DISPLAY[model]}
            </div>
            {methods.map((method, hi) => cell(model, method, mi, hi))}
          </Fragment>
        ))}
      </div>

      {/* Hover details */}
      <div className="min-h-[68px] rounded-md border bg-muted/20 p-3 text-xs">
        {hovered ? (
          <HoverDetails
            compat={compat}
            snapshots={snapshots}
            model={hovered.model}
            method={hovered.method}
          />
        ) : (
          <span className="text-muted-foreground">
            Hover any cell. Green cells show live p95 latency if there has been
            traffic; red cells show the paper-anchored reason for the
            incompatibility.
          </span>
        )}
      </div>
    </div>
  );
}

function HoverDetails({
  compat,
  snapshots,
  model,
  method,
}: {
  compat: CompatibilityResponse;
  snapshots: Record<string, SnapshotShape>;
  model: ModelId;
  method: MethodId;
}) {
  const mi = compat.models.indexOf(model);
  const hi = compat.methods.indexOf(method);
  const cell = compat.matrix[mi]?.[hi];
  const snap = snapshots[`${model}:${method}`];
  if (!cell) return null;

  if (!cell.compatible) {
    return (
      <div className="space-y-1">
        <div className="font-semibold">
          {MODEL_DISPLAY[model]} × {method.toUpperCase()} — incompatible
        </div>
        <div className="text-muted-foreground">{cell.reason}</div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="font-semibold">
        {MODEL_DISPLAY[model]} × {method.toUpperCase()}
      </div>
      {snap && snap.p95_ms !== null ? (
        <div className="flex flex-wrap gap-x-4 font-mono text-[11px] text-muted-foreground">
          <span>total {snap.total_requests}</span>
          <span>hits {snap.hits}</span>
          <span>misses {snap.misses}</span>
          <span>errors {snap.errors}</span>
          <span>p50 {fmtMs(snap.p50_ms)}</span>
          <span>p95 {fmtMs(snap.p95_ms)}</span>
          <span>p99 {fmtMs(snap.p99_ms)}</span>
        </div>
      ) : (
        <div className="text-muted-foreground italic">
          No traffic yet for this combo. Run a prediction or stress test from
          the Serving tab.
        </div>
      )}
    </div>
  );
}
