import { Info } from "lucide-react";

import type { MethodId } from "@/lib/types";

interface Props {
  method: MethodId;
}

export function LookupGlmExplainer({ method }: Props) {
  if (method !== "lookup" && method !== "glm") return null;
  return (
    <div className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
      <Info className="mt-[1px] h-3.5 w-3.5 shrink-0" />
      <span>
        <span className="font-medium text-foreground">
          Why GLM looks faster than Lookup here.
        </span>{" "}
        In this demo, GLM runs in-process while Lookup queries Redis over TCP
        (~47 µs network floor). The paper's latency advantage of Lookup over
        GLM holds when both methods are served behind the same network layer
        — a simplification we don't replicate here. The radar's static axes
        (Modeling, Input Space, Stack, Consistency, Observability) reflect the
        paper faithfully.
      </span>
    </div>
  );
}
