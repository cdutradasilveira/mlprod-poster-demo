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
          Lookup and GLM both run in-process here.
        </span>{" "}
        Lookup reads from a process-local numpy array; GLM is a numpy inner
        product. Booking's real RS would serve both behind a network layer
        (Cassandra for Lookup, an in-house weight server for GLM); we
        collapsed both to in-process to keep the stack to a single container.
        The paper places both methods at the origin of the trade-off plane
        and differentiates them by <em>flavor</em>: Lookup serves any model
        but cannot handle continuous inputs; GLM handles continuous inputs
        but only linear models (Bernardi 2019, §4).
      </span>
    </div>
  );
}
