import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Play, RotateCw } from "lucide-react";

import { CompareLegend, CompareScatter } from "@/components/CompareScatter";
import { CompareResultsTable } from "@/components/CompareResultsTable";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import type { CompareResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

const PRESETS = [200, 500, 1000];

interface Props {
  resetGen: number;
}

export function ComparisonTab({ resetGen }: Props) {
  const [n, setN] = useState<number>(500);
  const [data, setData] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(() => {
    setLoading(true);
    setError(null);
    setData(null);  // hide previous run's scatter/table while the new one loads
    api
      .compare(n)
      .then(setData)
      .catch((e: ApiError) => setError(e.message))
      .finally(() => setLoading(false));
  }, [n]);

  // Reset metrics from the header clears local Comparison state too.
  useEffect(() => {
    if (resetGen === 0) return;
    setData(null);
    setError(null);
  }, [resetGen]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Full comparison</CardTitle>
          <CardDescription className="text-xs">
            Stress-tests every valid (model × method) combination. p50/p95/p99
            latencies are measured live; AUC is read from the precomputed
            offline metrics so it stays consistent with the Quality tab.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Requests per combo
          </span>
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setN(p)}
              disabled={loading}
              className={cn(
                "rounded-md border px-3 py-1 text-xs font-medium transition-colors",
                p === n
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-input text-muted-foreground hover:text-foreground",
                loading && "opacity-50",
              )}
            >
              {p}
            </button>
          ))}
          <Button onClick={run} disabled={loading} size="sm" className="ml-auto">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Run full comparison
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Comparison failed
            </CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={run} variant="outline">
              <RotateCw className="h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {!data && !error && !loading && (
        <Card>
          <CardContent className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            Click "Run full comparison" to populate the trade-off plane.
          </CardContent>
        </Card>
      )}

      {loading && (
        <Card>
          <CardContent className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Running stress tests across all valid combinations… this takes
            a few seconds.
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <CardTitle className="text-sm">
                    Latency vs AUC scatter
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {data.rows.length} valid combinations · {data.n_requests_per_combo}{" "}
                    reqs each · wall {data.wall_time_s.toFixed(2)}s
                  </CardDescription>
                </div>
                <CompareLegend />
              </div>
            </CardHeader>
            <CardContent>
              <CompareScatter rows={data.rows} />
              <p className="mt-4 max-w-3xl text-xs leading-relaxed text-muted-foreground">
                The Pareto frontier illustrates the trade-off described by
                Bernardi (2019): higher AUC requires more complex models,
                which in turn require heavier serving methods, increasing
                latency. Lookup serves anyone fastest, but only for
                precomputed inputs.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Comparison table</CardTitle>
              <CardDescription className="text-xs">
                Click any column header to sort. Default is p95 ascending.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CompareResultsTable rows={data.rows} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
