import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

import { MatrixGrid } from "@/components/MatrixGrid";
import { MethodSidebarCard } from "@/components/MethodSidebarCard";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import type { CompatibilityResponse, MethodId } from "@/lib/types";

const METHOD_BLOCKS: {
  method: MethodId;
  title: string;
  paragraph: string;
  quote: string;
  paperRef: string;
}[] = [
  {
    method: "lookup",
    title: "Lookup Tables",
    paragraph:
      "Precompute predictions for every possible input offline, store them in a key-value store, and serve at request time with a single GET. Maximum modeling flexibility — it doesn't matter how the model was trained.",
    quote:
      "A very simple way to deploy a model in production is to precompute all the predictions for all the possible inputs and store them in a key-value store. At prediction time all we need to do is lookup the prediction using the input as the key.",
    paperRef: "Bernardi (2019), §3.1",
  },
  {
    method: "glm",
    title: "Generalized Linear Models",
    paragraph:
      "Represent the model as a weight vector W and a bias. At prediction time, compute the inner product of inputs with weights, add bias, and apply the inverted link function. The serving runtime needs no ML library.",
    quote:
      "Prediction(X) = σ(<W, φ(X)>). With user/item embeddings, GLMs cover matrix factorization, cosine k-NN, and many other recommender flavors.",
    paperRef: "Bernardi (2019), §3.2",
  },
  {
    method: "native",
    title: "Native Libraries",
    paragraph:
      "Serialize the trained model with its training library, load it in the serving environment, call the library's predict API. High consistency between training and serving; requires the same stack online.",
    quote:
      "If a model is trained using sklearn, we can save it in pickle format, upload to a production server, where it would be loaded using the sklearn and pickle APIs, making it ready to serve predictions.",
    paperRef: "Bernardi (2019), §3.3",
  },
  {
    method: "scripted",
    title: "Scripted Models",
    paragraph:
      "Arbitrary Python with a predefined predict() interface — load any model, apply business rules, combine predictions. Maximum flexibility, every line is a potential cost line.",
    quote:
      "We use this approach to deploy models built with unsupported libraries and models requiring some logic on top of one or several predictions.",
    paperRef: "Bernardi (2019), §3.4",
  },
];

interface Props {
  resetGen: number;
  isActive: boolean;
}

export function MatrixTab({ resetGen, isActive }: Props) {
  const [compat, setCompat] = useState<CompatibilityResponse | null>(null);
  const [snapshots, setSnapshots] = useState<
    Record<string, {
      total_requests: number;
      hits: number;
      misses: number;
      errors: number;
      p50_ms: number | null;
      p95_ms: number | null;
      p99_ms: number | null;
      n_latencies: number;
    }>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSnapshots = useCallback(() => {
    api
      .metrics()
      .then((m) => setSnapshots(m.snapshots))
      .catch(() => {
        // metrics failure is non-fatal — the matrix still renders
      });
  }, []);

  const fetchAll = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([api.compatibility(), api.metrics()])
      .then(([c, m]) => {
        setCompat(c);
        setSnapshots(m.snapshots);
      })
      .catch((e: ApiError) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Refetch snapshots when the user clicks "Reset metrics" in the header.
  // Backend has cleared its accumulator; pulling now will return an empty map
  // and the matrix will fall back to "no traffic" on every green cell.
  useEffect(() => {
    if (resetGen === 0) return;
    refreshSnapshots();
  }, [resetGen, refreshSnapshots]);

  // Refetch snapshots when this tab becomes active. Because every tab is
  // forceMount'ed, MatrixTab would otherwise display the snapshot taken at
  // first mount even after the user generated traffic from Serving or
  // Comparison. Refetching on activation keeps the matrix honest.
  useEffect(() => {
    if (isActive) refreshSnapshots();
  }, [isActive, refreshSnapshots]);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading compatibility matrix…
      </div>
    );
  }

  if (error || !compat) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Could not load matrix. Is the backend running?
          </CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={fetchAll} variant="outline">
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Compatibility matrix (4 × 4)
            </CardTitle>
            <CardDescription className="text-xs">
              Green cells are valid combinations; red cells carry the paper
              citation that explains why they don't work in this demo.
              Latencies refresh automatically when this tab is opened and when
              "Reset metrics" is clicked.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MatrixGrid compat={compat} snapshots={snapshots} />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3 lg:col-span-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          The four methods
        </div>
        {METHOD_BLOCKS.map((b) => (
          <MethodSidebarCard
            key={b.method}
            method={b.method}
            title={b.title}
            paragraph={b.paragraph}
            quote={b.quote}
            paperRef={b.paperRef}
          />
        ))}
        <p className="px-1 pt-2 text-xs leading-relaxed text-muted-foreground">
          The matrix is part of the pedagogical content of the demo. Different
          problems pick different cells in this matrix; RS at Booking is the
          system that makes any cell available.
        </p>
      </div>
    </div>
  );
}
