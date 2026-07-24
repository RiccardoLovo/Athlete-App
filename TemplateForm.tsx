import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  generatePyramid,
  generateRsa,
  type PyramidParams,
  type RsaParams,
} from "@/lib/coachdesk/interval-templates";
import { replaceIntervals } from "./IntervalBuilder";

export function TemplateForm({
  sessionExerciseId,
  templateType,
  defaults,
  hasExistingIntervals,
  templateGeneratedAt,
  onGenerated,
}: {
  sessionExerciseId: string;
  templateType: "rsa" | "pyramid";
  defaults: Record<string, unknown> | null;
  hasExistingIntervals: boolean;
  templateGeneratedAt: string | null;
  onGenerated: () => void;
}) {
  const qc = useQueryClient();
  const [params, setParams] = useState<Record<string, number | string>>(() => ({
    ...(defaults ?? {}),
  }) as Record<string, number | string>);
  const [busy, setBusy] = useState(false);

  async function generate() {
    if (
      hasExistingIntervals &&
      !confirm("Replace current intervals with newly generated ones?")
    ) return;
    setBusy(true);
    try {
      let rows;
      if (templateType === "rsa") {
        const p = params as unknown as RsaParams;
        rows = generateRsa({
          sprint_count: Number(p.sprint_count) || 6,
          sprint_distance_m: Number(p.sprint_distance_m) || 30,
          rest_seconds: Number(p.rest_seconds) || 30,
          intensity: (p.intensity as string) || "max",
        });
      } else {
        const p = params as unknown as PyramidParams;
        const res = generatePyramid({
          start_m: Number(p.start_m) || 200,
          peak_m: Number(p.peak_m) || 800,
          step_m: Number(p.step_m) || 200,
          rest_seconds: Number(p.rest_seconds) || 60,
        });
        if (res.warning) toast.warning(res.warning);
        rows = res.rows;
      }
      await replaceIntervals(sessionExerciseId, rows);
      await supabase
        .from("session_exercises")
        .update({ template_generated_at: new Date().toISOString() } as never)
        .eq("id", sessionExerciseId);
      qc.invalidateQueries({ queryKey: ["prescription-intervals", sessionExerciseId] });
      qc.invalidateQueries({ queryKey: ["session-exs"] });
      onGenerated();
      toast.success("Intervals generated");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Generate failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  const set = (k: string, v: string) =>
    setParams((prev) => ({ ...prev, [k]: v === "" ? "" : Number(v) }));

  return (
    <div className="space-y-2 rounded-md border border-dashed border-border p-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase text-muted-foreground">
          {templateType === "rsa" ? "RSA template" : "Pyramid template"}
        </span>
        {templateGeneratedAt && (
          <span className="text-[10px] text-muted-foreground">
            Generated {new Date(templateGeneratedAt).toLocaleString()}
          </span>
        )}
      </div>
      {templateType === "rsa" ? (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Sprints">
            <Input className="h-7" type="number" value={String(params.sprint_count ?? "")} onChange={(e) => set("sprint_count", e.target.value)} />
          </Field>
          <Field label="Distance (m)">
            <Input className="h-7" type="number" value={String(params.sprint_distance_m ?? "")} onChange={(e) => set("sprint_distance_m", e.target.value)} />
          </Field>
          <Field label="Rest (s)">
            <Input className="h-7" type="number" value={String(params.rest_seconds ?? "")} onChange={(e) => set("rest_seconds", e.target.value)} />
          </Field>
          <Field label="Intensity">
            <Select value={String(params.intensity ?? "max")} onValueChange={(v) => setParams((p) => ({ ...p, intensity: v }))}>
              <SelectTrigger className="h-7"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["easy", "moderate", "hard", "max"].map((i) => (
                  <SelectItem key={i} value={i}>{i}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Start at (m)">
            <Input className="h-7" type="number" value={String(params.start_m ?? "")} onChange={(e) => set("start_m", e.target.value)} />
          </Field>
          <Field label="Peak at (m)">
            <Input className="h-7" type="number" value={String(params.peak_m ?? "")} onChange={(e) => set("peak_m", e.target.value)} />
          </Field>
          <Field label="Step (m)">
            <Input className="h-7" type="number" value={String(params.step_m ?? "")} onChange={(e) => set("step_m", e.target.value)} />
          </Field>
          <Field label="Rest (s)">
            <Input className="h-7" type="number" value={String(params.rest_seconds ?? "")} onChange={(e) => set("rest_seconds", e.target.value)} />
          </Field>
        </div>
      )}
      <Button size="sm" onClick={generate} disabled={busy} className="w-full">
        {busy ? "Generating…" : hasExistingIntervals ? "Re-generate intervals" : "Generate intervals"}
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px]">{label}</Label>
      {children}
    </div>
  );
}