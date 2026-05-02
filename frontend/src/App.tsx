import { useState } from "react";
import { LayoutGrid, RotateCcw } from "lucide-react";

import { ComparisonTab } from "@/components/ComparisonTab";
import { LookupStatusBanner } from "@/components/LookupStatusBanner";
import { MatrixTab } from "@/components/MatrixTab";
import { QualityTab } from "@/components/QualityTab";
import { ServingTab } from "@/components/ServingTab";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";

const TABS = [
  { id: "serving", label: "Serving" },
  { id: "quality", label: "Quality" },
  { id: "comparison", label: "Comparison" },
  { id: "matrix", label: "Matrix" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("serving");
  const [resetting, setResetting] = useState(false);
  const [resetGen, setResetGen] = useState(0);

  async function handleReset() {
    setResetting(true);
    try {
      await api.resetMetrics();
    } catch (e) {
      console.error("Failed to reset metrics", e);
    } finally {
      setResetting(false);
      setResetGen((g) => g + 1);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <LookupStatusBanner />

      <header className="border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
        <div className="container mx-auto flex h-14 items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-primary" />
            <div className="leading-tight">
              <div className="text-sm font-semibold">
                ML Productionization Demo
              </div>
              <div className="text-[11px] text-muted-foreground">
                Booking.com — Bernardi (2019)
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={resetting}
              title="Clear in-memory serving metrics (latency histograms, counters)"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Reset metrics</span>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto flex-1 px-4 py-6">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as TabId)}
          className="w-full"
        >
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="serving">
            <ServingTab resetGen={resetGen} />
          </TabsContent>
          <TabsContent value="quality">
            <QualityTab />
          </TabsContent>
          <TabsContent value="comparison">
            <ComparisonTab />
          </TabsContent>
          <TabsContent value="matrix">
            <MatrixTab />
          </TabsContent>
        </Tabs>
      </main>

      <footer className="border-t py-3 text-center text-xs text-muted-foreground">
        Skeleton ready — Tabs will be filled in Phases 5-7.
      </footer>
    </div>
  );
}
