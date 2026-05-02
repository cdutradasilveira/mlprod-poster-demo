import { BookOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Props {
  reason: string;
}

export function WhyDialog({ reason }: Props) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="link" size="sm" className="h-auto p-0 text-xs">
          Why?
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Incompatible combination
          </DialogTitle>
          <DialogDescription>
            The compatibility matrix is part of the pedagogical content.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p className="rounded-md bg-muted/50 p-3 leading-relaxed">{reason}</p>

          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">From the paper:</span>{" "}
              "Generalized Linear Models represent the model as a weight vector W
              and a bias. At prediction time, we compute the inner product of
              inputs with weights, add bias, and apply a scalar inverted link
              function." (Bernardi 2019, §3.2)
            </p>
            <p>
              Tree ensembles and neural networks are not linear in their
              parameters, so they cannot be served via GLM in this demo. They
              still work via Lookup, Native, or Scripted.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
