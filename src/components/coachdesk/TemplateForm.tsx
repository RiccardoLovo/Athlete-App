import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  generatePyramid,
  generateRsa,
  type PyramidParams,
  type RsaParams,
} from "@/lib/coachdesk/interval-templates";
import {
  type ZoneNumber,
  bikeZoneWattsMid,
  formatSecondsToPace,
  swimZonePaceSec,
} from "@/lib/coachdesk/zones";
import {
  appendIntervals,
  intervalsKey,
  replaceIntervals,
  useLatestThreshold,
  type IntervalScope,
} from "./IntervalBuilder";
import { RestField } from "@/components/coachdesk/RestField";
import { DEFAULT_REST, restSpecOf, type RestValue } from "@/lib/coachdesk/rest";

const ZONES: ZoneNumber[] = [1, 2, 3, 4, 5];

export function TemplateForm({
  sessionExerciseId,
  workoutBlockId,
  templateType,
  discipline,
  clientId = null,
  defaults,
  hasExistingIntervals,
  templateGeneratedAt,
  hideHeader = false,
  onGenerated,
}: {
  sessionExerciseId: string;
  workoutBlockId?: string;
  templateType: "rsa" | "pyramid";
  discipline?: string;
  clientId?: string | null;
  defaults: Record<string, unknown> | null;
  hasExistingIntervals: boolean;
  templateGeneratedAt: string | null;
  /** Inside the structured block builder the block already says what it is,
   *  so the "RSA template"/"Pyramid template" caption is just noise. */
  hideHeader?: boolean;
  onGenerated: () => void;
}) {
  const scope: IntervalScope = { sessionExerciseId, workoutBlockId };
  const qc = useQueryClient();
  const { data: ftpWatts } = useLatestThreshold(
    discipline === "Cycling" ? clientId : null,
    "ftp_watts",
  );
  const { data: cssSec } = useLatestThreshold(
    discipline === "Swimming" ? clientId : null,
    "css_pace_sec_per_100m",
  );
  const [params, setParams] = useState<Record<string, number | string>>(
    () =>
      ({
        ...(defaults ?? {}),
      }) as Record<string, number | string>,
  );
  const [doublePeak, setDoublePeak] = useState(false);
  // Rest is expressed the same way everywhere: whole seconds, or a ratio.
  const [rest, setRest] = useState<RestValue>(DEFAULT_REST);
  const [busy, setBusy] = useState(false);

  const restSpec = restSpecOf(rest);

  function buildRows(): {
    rows: ReturnType<typeof generateRsa>;
    warning?: string;
  } {
    if (templateType === "rsa") {
      const p = params as unknown as RsaParams;
      const zoneStr = (p.intensity as string) || "Z5";
      const zoneNum = Number(zoneStr.replace("Z", "")) as ZoneNumber;
      const rows = generateRsa({
        sprint_count: Number(p.sprint_count) || 6,
        sprint_distance_m: Number(p.sprint_distance_m) || 30,
        rest: restSpec,
        intensity: zoneStr,
      });
      // Auto-fill pace (swim) or watts (bike) from the athlete's own
      // threshold test for this zone, when one's on file.
      for (const row of rows) {
        if (discipline === "Swimming" && cssSec != null) {
          row.pace_per_km = formatSecondsToPace(
            swimZonePaceSec(cssSec, zoneNum),
          );
        } else if (discipline === "Cycling" && ftpWatts != null) {
          row.watts = bikeZoneWattsMid(ftpWatts, zoneNum);
        }
      }
      return { rows };
    }
    const p = params as unknown as Record<string, unknown>;
    const res = generatePyramid({
      start_m: Number(p.start_m) || 200,
      peak_m: Number(p.peak_m) || 800,
      step_m: Number(p.step_m) || 200,
      rest: restSpec,
      double_peak: doublePeak,
    });
    if (res.warning) toast.warning(res.warning);
    return { rows: res.rows, warning: res.warning };
  }

  async function generate(mode: "replace" | "append") {
    if (
      mode === "replace" &&
      hasExistingIntervals &&
      !confirm("Replace current intervals with newly generated ones?")
    )
      return;
    setBusy(true);
    try {
      const { rows } = buildRows();
      if (mode === "append") await appendIntervals(scope, rows);
      else await replaceIntervals(scope, rows);
      if (!workoutBlockId) {
        // Only meaningful for the original per-exercise template model —
        // a structured workout's blocks don't have their own "generated at".
        await supabase
          .from("session_exercises")
          .update({ template_generated_at: new Date().toISOString() } as never)
          .eq("id", sessionExerciseId);
      }
      qc.invalidateQueries({ queryKey: intervalsKey(scope) });
      qc.invalidateQueries({ queryKey: ["session-exs"] });
      qc.invalidateQueries({ queryKey: ["workout-blocks", sessionExerciseId] });
      onGenerated();
      toast.success(
        mode === "append" ? "Intervals added" : "Intervals generated",
      );
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
      {!hideHeader && (
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
      )}
      {templateType === "rsa" ? (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Sprints">
            <Input
              className="h-7"
              type="number"
              value={String(params.sprint_count ?? "")}
              onChange={(e) => set("sprint_count", e.target.value)}
            />
          </Field>
          <Field label="Distance (m)">
            <Input
              className="h-7"
              type="number"
              value={String(params.sprint_distance_m ?? "")}
              onChange={(e) => set("sprint_distance_m", e.target.value)}
            />
          </Field>
          <Field label="Rest">
            <RestField
              value={rest}
              onChange={setRest}
              valueWidth="flex-1"
              modeWidth="w-[84px]"
            />
          </Field>
          <Field label="Zone">
            <Select
              value={String(params.intensity ?? "Z5")}
              onValueChange={(v) => setParams((p) => ({ ...p, intensity: v }))}
            >
              <SelectTrigger className="h-7">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ZONES.map((z) => {
                  const watts =
                    discipline === "Cycling" && ftpWatts != null
                      ? ` (${bikeZoneWattsMid(ftpWatts, z)}W)`
                      : "";
                  const pace =
                    discipline === "Swimming" && cssSec != null
                      ? ` (${formatSecondsToPace(swimZonePaceSec(cssSec, z))})`
                      : "";
                  return (
                    <SelectItem key={z} value={`Z${z}`}>
                      Z{z}
                      {watts || pace}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Start at (m)">
            <Input
              className="h-7"
              type="number"
              value={String(params.start_m ?? "")}
              onChange={(e) => set("start_m", e.target.value)}
            />
          </Field>
          <Field label="Peak at (m)">
            <Input
              className="h-7"
              type="number"
              value={String(params.peak_m ?? "")}
              onChange={(e) => set("peak_m", e.target.value)}
            />
          </Field>
          <Field label="Step (m)">
            <Input
              className="h-7"
              type="number"
              value={String(params.step_m ?? "")}
              onChange={(e) => set("step_m", e.target.value)}
            />
          </Field>
          <div className="col-span-2 flex items-center gap-1 text-[11px]">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={doublePeak}
                onChange={(e) => setDoublePeak(e.target.checked)}
              />
              Double peak
            </label>
          </div>
          <Field label="Rest">
            <RestField
              value={rest}
              onChange={setRest}
              valueWidth="flex-1"
              modeWidth="w-[84px]"
            />
          </Field>
        </div>
      )}
      <div className="flex gap-1">
        <Button
          size="sm"
          onClick={() => generate("replace")}
          disabled={busy}
          className="flex-1"
        >
          {busy
            ? "Generating…"
            : hasExistingIntervals
              ? "Re-generate (replace)"
              : "Generate intervals"}
        </Button>
        {hasExistingIntervals && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => generate("append")}
            disabled={busy}
            className="flex-1"
            title="Add these as a second block after the existing intervals"
          >
            Add as new block
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px]">{label}</Label>
      {children}
    </div>
  );
}
