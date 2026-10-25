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
  parsePaceToSeconds,
  swimZonePaceSec,
} from "@/lib/coachdesk/zones";
import {
  appendIntervals,
  replaceIntervals,
  useLatestThreshold,
} from "./IntervalBuilder";

const ZONES: ZoneNumber[] = [1, 2, 3, 4, 5];

export function TemplateForm({
  sessionExerciseId,
  templateType,
  discipline,
  clientId = null,
  defaults,
  hasExistingIntervals,
  templateGeneratedAt,
  onGenerated,
}: {
  sessionExerciseId: string;
  templateType: "rsa" | "pyramid";
  discipline?: string;
  clientId?: string | null;
  defaults: Record<string, unknown> | null;
  hasExistingIntervals: boolean;
  templateGeneratedAt: string | null;
  onGenerated: () => void;
}) {
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
  const [restMode, setRestMode] = useState<"seconds" | "ratio">("seconds");
  const [restRatio, setRestRatio] = useState("1");
  const [restPace, setRestPace] = useState("");
  const [busy, setBusy] = useState(false);

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
        rest_seconds: Number(p.rest_seconds) || 30,
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
    const p = params as unknown as PyramidParams;
    const paceSec = restMode === "ratio" ? parsePaceToSeconds(restPace) : null;
    const res = generatePyramid({
      start_m: Number(p.start_m) || 200,
      peak_m: Number(p.peak_m) || 800,
      step_m: Number(p.step_m) || 200,
      rest_seconds: Number(p.rest_seconds) || 60,
      double_peak: doublePeak,
      rest_ratio: paceSec != null ? Number(restRatio) || 1 : undefined,
      pace_sec_per_unit: paceSec ?? undefined,
      pace_unit_m: discipline === "Swimming" ? 100 : 1000,
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
    if (
      restMode === "ratio" &&
      templateType === "pyramid" &&
      parsePaceToSeconds(restPace) == null
    ) {
      toast.error('Enter a valid pace like "4:30" for ratio-based rest');
      return;
    }
    setBusy(true);
    try {
      const { rows } = buildRows();
      if (mode === "append") await appendIntervals(sessionExerciseId, rows);
      else await replaceIntervals(sessionExerciseId, rows);
      await supabase
        .from("session_exercises")
        .update({ template_generated_at: new Date().toISOString() } as never)
        .eq("id", sessionExerciseId);
      qc.invalidateQueries({
        queryKey: ["prescription-intervals", sessionExerciseId],
      });
      qc.invalidateQueries({ queryKey: ["session-exs"] });
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
          <Field label="Rest (s)">
            <Input
              className="h-7"
              type="number"
              value={String(params.rest_seconds ?? "")}
              onChange={(e) => set("rest_seconds", e.target.value)}
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
          <div className="col-span-2 flex gap-1 rounded-md border border-border p-1 text-[11px]">
            {(["seconds", "ratio"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setRestMode(m)}
                className={`flex-1 rounded px-2 py-1 ${restMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {m === "seconds" ? "Fixed rest" : "Rest ratio"}
              </button>
            ))}
          </div>
          {restMode === "seconds" ? (
            <Field label="Rest (s)">
              <Input
                className="h-7"
                type="number"
                value={String(params.rest_seconds ?? "")}
                onChange={(e) => set("rest_seconds", e.target.value)}
              />
            </Field>
          ) : (
            <>
              <Field
                label={`Pace (${discipline === "Swimming" ? "/100m" : "/km"})`}
              >
                <Input
                  className="h-7"
                  placeholder="4:30"
                  value={restPace}
                  onChange={(e) => setRestPace(e.target.value)}
                />
              </Field>
              <Field label="Rest ratio (× work time)">
                <Input
                  className="h-7"
                  type="number"
                  step="0.1"
                  value={restRatio}
                  onChange={(e) => setRestRatio(e.target.value)}
                />
              </Field>
            </>
          )}
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
