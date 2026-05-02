import { BookOpen, Info } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ScriptedInfoDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Why is the model fixed to MLP for the Scripted method?"
          className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Why is the model fixed to MLP?
          </DialogTitle>
          <DialogDescription>
            The Scripted method always wraps the PyTorch MLP, regardless of
            which model is selected.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p className="rounded-md bg-muted/50 p-3 leading-relaxed">
            Scripted wraps the PyTorch MLP (the most "exotic" model in this
            demo) and applies three business rules on top of its prediction:
            cold-start blending with global popularity, a diversity penalty
            for cross-region pairs, and a floor/ceiling clip to [0.01, 0.99].
            Every request to{" "}
            <code className="rounded bg-background/60 px-1 font-mono text-xs">
              method=scripted
            </code>{" "}
            runs that exact pipeline; the{" "}
            <code className="rounded bg-background/60 px-1 font-mono text-xs">
              model
            </code>{" "}
            parameter is accepted by the API but ignored (the response carries{" "}
            <code className="rounded bg-background/60 px-1 font-mono text-xs">
              metadata.note
            </code>{" "}
            saying so).
          </p>

          <div className="space-y-2 text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">From the paper:</span>{" "}
              "We use this approach to deploy models built with{" "}
              <em>unsupported libraries</em> and models requiring some logic on
              top of one or several predictions." (Bernardi 2019, §3.4)
            </p>
            <p>
              In this demo the "unsupported library" is PyTorch, picked because
              its serialization format and runtime are the most distinct from
              the rest. Applying the same rules on top of LogReg, RF or XGBoost
              would still work mechanically, but it would erase the purpose of
              having Scripted as its own method — it would just be "Native +
              extra Python lines".
            </p>
            <p>
              The other three combinations (LogReg + Scripted, RF + Scripted,
              XGB + Scripted) stay green in the compatibility matrix because
              the request still succeeds; they all evaluate to the same
              MLP-backed pipeline.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
