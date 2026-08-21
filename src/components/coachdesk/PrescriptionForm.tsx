import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  type Discipline,
  type Prescription,
  emptyPrescription,
  rowToPrescription,
  summarizePrescription,
} from "@/lib/coachdesk/prescription";
import { t } from "@/lib/coachdesk/i18n";
import { useQuery } from "@tanstack/react-query";
import { IntervalBuilder, intervalsQuery } from "./IntervalBuilder";
import { TemplateForm } from "./TemplateForm";

const STROKES = ["Freestyle", "Backstroke", "Breaststroke", "Butterfly", "IM"];
const EQUIPMENT = ["None", "Pull Buoy", "Paddles", "Fins", "Kickboard"];
const SIDES = ["Both", "Left", "Right"];

export function PrescriptionForm({
  rowId,
  discipline,
  initial,
  oneRmKg,
  strokeDefault,
  onChanged,
  structureType = "simple",
  templateType = null,
  templateDefaults = null,
  templateGeneratedAt = null,
}: {
  rowId: string;
  discipline: Discipline;
  initial: Prescription;
  oneRmKg: number | null;
  strokeDefault: string | null;
  onChanged?: () => void;
  structureType?: "simple" | "intervals" | "template";
  templateType?: "rsa" | "pyramid" | null;
  templateDefaults?: Record<string, unknown> | null;
  templateGeneratedAt?: string | null;
}) {
  const [form, setForm] = useState<Prescription>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const timer = useRef<number | null>(null);
  const qc = useQueryClient();
  const formRef = useRef(form);
  const isDirty = useRef(false);
  const savingRef = useRef(false);
  const rowIdRef = useRef(rowId);
  const savedTimer = useRef<number | null>(null);

  formRef.current = form;

  // When switching swim default, pre-fill stroke if not set
  useEffect(() => {
    if (
      discipline === "Swimming" &&
      strokeDefault &&
      !form.prescription.stroke
    ) {
      patch({ prescription: { ...form.prescription, stroke: strokeDefault } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discipline, strokeDefault]);

  // Only resync from `initial` when the underlying row changes (e.g. user
  // opens a different exercise). Re-syncing on every parent render races
  // with in-flight saves and wipes values the user just typed (notably
  // free-text fields like reps).
  useEffect(() => {
    if (rowIdRef.current !== rowId) {
      rowIdRef.current = rowId;
      isDirty.current = false;
      setForm(initial);
    }
  }, [rowId, initial]);

  const flush = useCallback(async () => {
    if (!isDirty.current) return;
    if (savingRef.current) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;

    savingRef.current = true;
    setStatus("saving");
    // Snapshot dirty state; clear it now so concurrent edits stay dirty.
    isDirty.current = false;
    const next = formRef.current;
    const payload = {
      sets: next.sets,
      reps: next.reps,
      target_mode: next.target_mode,
      rpe: next.rpe,
      load_mode: next.load_mode,
      load_value: next.load_value,
      rest_sec: next.rest_sec,
      distance_km: next.distance_km,
      duration_min: next.duration_min,
      pace: next.pace,
      hr_zone: next.hr_zone,
      tempo: next.tempo,
      notes: next.notes,
      prescription: next.prescription,
    };

    const { error } = await supabase
      .from("session_exercises")
      .update(payload as never)
      .eq("id", rowId);
    savingRef.current = false;
    if (error) {
      // Re-mark dirty so a retry (next edit / blur / unmount) tries again.
      isDirty.current = true;
      setStatus("error");
      toast.error(`Save failed: ${error.message}`);
      return;
    }
    qc.invalidateQueries({ queryKey: ["session-exs"] });
    onChanged?.();
    if (!isDirty.current) {
      setStatus("saved");
      if (savedTimer.current) window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(() => setStatus("idle"), 1500);
    }
    // If the user kept typing during the save, schedule another flush.
    if (isDirty.current) {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 120);
    }
  }, [onChanged, qc, rowId]);

  // Best-effort synchronous save when the page is being torn down (iOS
  // pagehide, route teardown). supabase-js doesn't set keepalive on its
  // fetch, so a regular flush can be cancelled mid-flight when the user
  // navigates away right after typing. sendBeacon survives the unload.
  const beaconSave = useCallback(() => {
    if (!isDirty.current) return;
    if (typeof navigator === "undefined" || !navigator.sendBeacon) return;
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
      | string
      | undefined;
    if (!url || !key) return;
    const next = formRef.current;
    const payload = {
      sets: next.sets,
      reps: next.reps,
      target_mode: next.target_mode,
      rpe: next.rpe,
      load_mode: next.load_mode,
      load_value: next.load_value,
      rest_sec: next.rest_sec,
      distance_km: next.distance_km,
      duration_min: next.duration_min,
      pace: next.pace,
      hr_zone: next.hr_zone,
      tempo: next.tempo,
      notes: next.notes,
      prescription: next.prescription,
    };
    // PostgREST accepts a JSON body via sendBeacon; we add the auth token
    // via a same-origin proxy URL would be nicer but isn't available.
    // Fall back to fetch keepalive (PATCH supported, sendBeacon is POST-only).
    try {
      void fetch(`${url}/rest/v1/session_exercises?id=eq.${rowIdRef.current}`, {
        method: "PATCH",
        keepalive: true,
        headers: {
          "content-type": "application/json",
          apikey: key,
          authorization: `Bearer ${key}`,
          prefer: "return=minimal",
        },
        body: JSON.stringify(payload),
      });
      isDirty.current = false;
    } catch {
      /* swallow — best effort */
    }
  }, []);

  useEffect(() => {
    function onPageHide() {
      beaconSave();
      void flush();
    }
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        beaconSave();
        void flush();
      }
    }
    function onBeforeUnload() {
      beaconSave();
      void flush();
    }
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (isDirty.current) {
        // Component is going away (route change, card collapse). Flush via
        // keepalive fetch so the PATCH survives the teardown, then also fire
        // the normal flush as a backup if we're still alive.
        beaconSave();
        void flush();
      }
      if (savedTimer.current) window.clearTimeout(savedTimer.current);
    };
  }, [flush, beaconSave]);

  function patch(p: Partial<Prescription>) {
    // Functional update so back-to-back patches (e.g. fast typing across
    // fields) don't drop earlier changes due to a stale `form` closure.
    setForm((prev) => {
      const next = { ...prev, ...p };
      formRef.current = next;
      return next;
    });
    isDirty.current = true;
    setStatus("saving");
    if (timer.current) window.clearTimeout(timer.current);
    // Short debounce → save very soon after the user stops typing, so reps /
    // tempo / load values don't get lost when the coach immediately taps a
    // different day or week.
    timer.current = window.setTimeout(flush, 120);
  }

  function patchJson(k: string, v: unknown) {
    const j = { ...formRef.current.prescription };
    if (v === null || v === "" || v === undefined) delete j[k];
    else j[k] = v;
    patch({ prescription: j });
  }

  // Intervals/template structure: replace the per-discipline form with the
  // interval builder. RPE & notes still autosave on session_exercises.
  const intervalsQ = useQuery({
    ...intervalsQuery(rowId),
    enabled: structureType !== "simple",
  });

  if (structureType !== "simple") {
    const hasRows = (intervalsQ.data?.length ?? 0) > 0;
    return (
      <IntervalsSection
        rowId={rowId}
        discipline={discipline}
        structureType={structureType}
        templateType={templateType}
        templateDefaults={templateDefaults}
        templateGeneratedAt={templateGeneratedAt}
        hasRows={hasRows}
        form={form}
        patch={patch}
        status={status}
        flush={flush}
        onChanged={onChanged}
      />
    );
  }

  const body = (() => {
    switch (discipline) {
      case "Strength":
        return (
          <StrengthForm
            form={form}
            patch={patch}
            patchJson={patchJson}
            oneRmKg={oneRmKg}
          />
        );
      case "Running":
        return <RunningForm form={form} patch={patch} patchJson={patchJson} />;
      case "Swimming":
        return <SwimmingForm form={form} patch={patch} patchJson={patchJson} />;
      case "Cycling":
        return <CyclingForm form={form} patch={patch} patchJson={patchJson} />;
      case "Football":
      case "Padel":
        return <SportForm form={form} patch={patch} />;
      case "Mobility":
        return <MobilityForm form={form} patch={patch} patchJson={patchJson} />;
    }
  })();

  return (
    <div onBlurCapture={() => void flush()} className="relative">
      {body}
      <SaveIndicator status={status} />
    </div>
  );
}

function SaveIndicator({
  status,
}: {
  status: "idle" | "saving" | "saved" | "error";
}) {
  if (status === "idle") return null;
  return (
    <div className="pointer-events-none mt-1 flex items-center justify-end gap-1 text-[10px]">
      {status === "saving" && (
        <span className="flex items-center gap-1 text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Saving…
        </span>
      )}
      {status === "saved" && (
        <span className="flex items-center gap-1 text-foreground">
          <Check className="h-3 w-3" /> Saved
        </span>
      )}
      {status === "error" && (
        <span className="text-destructive">Save failed — retrying</span>
      )}
    </div>
  );
}

type FormProps = {
  form: Prescription;
  patch: (p: Partial<Prescription>) => void;
  patchJson?: (k: string, v: unknown) => void;
  oneRmKg?: number | null;
};

function numOrNull(v: string): number | null {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function L({ children }: { children: React.ReactNode }) {
  return <Label className="text-[10px]">{children}</Label>;
}

function NumIn({
  value,
  onChange,
  placeholder,
  step,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  placeholder?: string;
  step?: string;
}) {
  return (
    <Input
      type="number"
      step={step}
      className="h-7"
      value={value == null ? "" : value}
      onChange={(e) => onChange(numOrNull(e.target.value))}
      placeholder={placeholder}
    />
  );
}

function TextIn({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
}) {
  return (
    <Input
      className="h-7"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

function Sel({
  value,
  onChange,
  options,
  allowEmpty,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  options: string[];
  allowEmpty?: boolean;
}) {
  return (
    <Select
      value={value ?? "__none__"}
      onValueChange={(v) => onChange(v === "__none__" ? null : v)}
    >
      <SelectTrigger className="h-7 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowEmpty && <SelectItem value="__none__">—</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function NotesRpe({
  form,
  patch,
}: {
  form: Prescription;
  patch: (p: Partial<Prescription>) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-1">
        <div>
          <L>{t("common.rpe")} (1-10)</L>
          <NumIn value={form.rpe} onChange={(n) => patch({ rpe: n })} />
        </div>
      </div>
      <div>
        <L>{t("common.notes")}</L>
        <Textarea
          rows={2}
          value={form.notes}
          onChange={(e) => patch({ notes: e.target.value })}
        />
      </div>
    </>
  );
}

function IntervalsSection({
  rowId,
  discipline,
  structureType,
  templateType,
  templateDefaults,
  templateGeneratedAt,
  hasRows,
  form,
  patch,
  status,
  flush,
  onChanged,
}: {
  rowId: string;
  discipline: Discipline;
  structureType: "simple" | "intervals" | "template";
  templateType: "rsa" | "pyramid" | null;
  templateDefaults: Record<string, unknown> | null;
  templateGeneratedAt: string | null;
  hasRows: boolean;
  form: Prescription;
  patch: (p: Partial<Prescription>) => void;
  status: "idle" | "saving" | "saved" | "error";
  flush: () => Promise<void>;
  onChanged?: () => void;
}) {
  const canTemplate = structureType === "template" && !!templateType;
  // Default mode: template if it has a template type and no manual rows yet,
  // else manual (so existing free-built intervals stay in manual view).
  const [mode, setMode] = useState<"template" | "manual">(
    canTemplate ? "template" : "manual",
  );
  return (
    <div onBlurCapture={() => void flush()} className="relative space-y-3">
      {canTemplate && (
        <div className="flex gap-1 rounded-md border border-border p-1 text-[11px]">
          <button
            type="button"
            onClick={() => setMode("template")}
            className={`flex-1 rounded px-2 py-1 ${mode === "template" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            Generate from template
          </button>
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={`flex-1 rounded px-2 py-1 ${mode === "manual" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            Build manually
          </button>
        </div>
      )}
      {canTemplate && mode === "template" && templateType && (
        <TemplateForm
          sessionExerciseId={rowId}
          templateType={templateType}
          defaults={templateDefaults}
          hasExistingIntervals={hasRows}
          templateGeneratedAt={templateGeneratedAt}
          onGenerated={() => onChanged?.()}
        />
      )}
      <IntervalBuilder sessionExerciseId={rowId} discipline={discipline} />
      <NotesRpe form={form} patch={patch} />
      <SaveIndicator status={status} />
    </div>
  );
}

function StrengthForm({ form, patch, patchJson, oneRmKg }: FormProps) {
  const isPct = form.load_mode === "%1RM";
  const isBw = form.load_mode === "bodyweight";
  const pct = form.load_value;
  const calcKg =
    isPct && oneRmKg && pct != null
      ? Math.round((pct / 100) * oneRmKg * 10) / 10
      : null;
  const rir = form.prescription.rir;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1">
        <div>
          <L>{t("common.sets")}</L>
          <NumIn value={form.sets} onChange={(n) => patch({ sets: n })} />
        </div>
        <div>
          <L>{t("common.reps")}</L>
          <TextIn
            value={form.reps}
            onChange={(s) => patch({ reps: s })}
            placeholder="8-10"
          />
        </div>
      </div>
      <div>
        <L>{t("strength.load_mode")}</L>
        <div className="flex gap-1">
          {(["kg", "%1RM", "bodyweight"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() =>
                patch({
                  load_mode: m,
                  load_value: m === "bodyweight" ? null : form.load_value,
                })
              }
              className={`flex-1 rounded border px-2 py-1 text-[10px] ${form.load_mode === m ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
            >
              {m === "bodyweight" ? t("strength.bodyweight") : m}
            </button>
          ))}
        </div>
      </div>
      {!isBw && (
        <div>
          <L>{isPct ? "% 1RM" : t("strength.load_value") + " (kg)"}</L>
          <NumIn
            value={form.load_value}
            onChange={(n) => patch({ load_value: n })}
            placeholder={isPct ? "75" : "80"}
            step="0.5"
          />
          {isPct &&
            pct != null &&
            (oneRmKg != null ? (
              <div className="mt-1 text-[10px] text-muted-foreground">
                {t("strength.pct_calc", {
                  pct: pct,
                  oneRm: oneRmKg,
                  abs: calcKg ?? "?",
                })}
              </div>
            ) : (
              <div className="mt-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                {t("strength.no_1rm")}
              </div>
            ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-1">
        <div>
          <L>{t("common.rest_sec")}</L>
          <NumIn
            value={form.rest_sec}
            onChange={(n) => patch({ rest_sec: n })}
          />
        </div>
        <div>
          <L>{t("common.tempo")}</L>
          <TextIn
            value={form.tempo}
            onChange={(s) => patch({ tempo: s })}
            placeholder={t("strength.tempo.placeholder")}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <div>
          <L>{t("common.rpe")} (1-10)</L>
          <NumIn value={form.rpe} onChange={(n) => patch({ rpe: n })} />
        </div>
        <div>
          <L>{t("common.rir")}</L>
          <NumIn
            value={typeof rir === "number" ? rir : null}
            onChange={(n) => patchJson?.("rir", n)}
          />
        </div>
      </div>
      <div>
        <L>{t("common.notes")}</L>
        <Textarea
          rows={2}
          value={form.notes}
          onChange={(e) => patch({ notes: e.target.value })}
        />
      </div>
    </div>
  );
}

function RunningForm({ form, patch }: FormProps) {
  const isDist = form.target_mode === "Distance";
  const isTime = form.target_mode === "Time";
  const intervalReps = form.prescription.interval_reps as number | undefined;
  return (
    <div className="space-y-2">
      <div>
        <L>{t("target.mode")}</L>
        <Sel
          value={form.target_mode}
          onChange={(v) => patch({ target_mode: v })}
          options={["Distance", "Time"]}
        />
      </div>
      {isDist && (
        <div>
          <L>{t("field.distance_km")}</L>
          <NumIn
            value={form.distance_km}
            onChange={(n) => patch({ distance_km: n })}
            step="0.1"
          />
        </div>
      )}
      {isTime && (
        <div>
          <L>{t("field.duration_min")}</L>
          <NumIn
            value={form.duration_min}
            onChange={(n) => patch({ duration_min: n })}
            step="0.5"
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-1">
        <div>
          <L>{t("field.pace_min_km")}</L>
          <TextIn
            value={form.pace}
            onChange={(s) => patch({ pace: s })}
            placeholder="4:30"
          />
        </div>
        <div>
          <L>{t("field.hr_zone")}</L>
          <Sel
            value={form.hr_zone == null ? null : String(form.hr_zone)}
            onChange={(v) => patch({ hr_zone: v ? Number(v) : null })}
            options={["1", "2", "3", "4", "5"]}
            allowEmpty
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <div>
          <L>{t("field.reps_intervals")}</L>
          <NumIn
            value={intervalReps ?? null}
            onChange={(n) => patchJson("interval_reps", n)}
          />
        </div>
        <div>
          <L>{t("common.rest_sec")}</L>
          <NumIn
            value={form.rest_sec}
            onChange={(n) => patch({ rest_sec: n })}
          />
        </div>
      </div>
      <NotesRpe form={form} patch={patch} />
    </div>
  );

  function patchJson(k: string, v: unknown) {
    const j = { ...form.prescription };
    if (v === null || v === "" || v === undefined) delete j[k];
    else j[k] = v;
    patch({ prescription: j });
  }
}

function SwimmingForm({ form, patch, patchJson }: FormProps) {
  const isDist = form.target_mode === "Distance";
  const isTime = form.target_mode === "Time";
  const isLaps = form.target_mode === "Laps";
  const stroke = (form.prescription.stroke as string) ?? null;
  const laps = form.prescription.laps as number | undefined;
  const equip = (form.prescription.equipment as string) ?? null;
  const intervalReps = form.prescription.interval_reps as number | undefined;
  return (
    <div className="space-y-2">
      <div>
        <L>{t("target.mode")}</L>
        <Sel
          value={form.target_mode}
          onChange={(v) => patch({ target_mode: v })}
          options={["Distance", "Time", "Laps"]}
        />
      </div>
      {isDist && (
        <div>
          <L>{t("field.distance_m")}</L>
          <NumIn
            value={
              form.distance_km == null
                ? null
                : Math.round(form.distance_km * 1000)
            }
            onChange={(n) =>
              patch({ distance_km: n == null ? null : n / 1000 })
            }
          />
        </div>
      )}
      {isLaps && (
        <div>
          <L>{t("field.laps")}</L>
          <NumIn
            value={laps ?? null}
            onChange={(n) => patchJson?.("laps", n)}
          />
        </div>
      )}
      {isTime && (
        <div>
          <L>{t("field.duration_min")}</L>
          <NumIn
            value={form.duration_min}
            onChange={(n) => patch({ duration_min: n })}
            step="0.5"
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-1">
        <div>
          <L>{t("field.stroke")}</L>
          <Sel
            value={stroke}
            onChange={(v) => patchJson?.("stroke", v)}
            options={STROKES}
            allowEmpty
          />
        </div>
        <div>
          <L>{t("field.pace_min_100m")}</L>
          <TextIn
            value={form.pace}
            onChange={(s) => patch({ pace: s })}
            placeholder="1:45"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <div>
          <L>{t("field.hr_zone")}</L>
          <Sel
            value={form.hr_zone == null ? null : String(form.hr_zone)}
            onChange={(v) => patch({ hr_zone: v ? Number(v) : null })}
            options={["1", "2", "3", "4", "5"]}
            allowEmpty
          />
        </div>
        <div>
          <L>{t("field.equipment")}</L>
          <Sel
            value={equip}
            onChange={(v) => patchJson?.("equipment", v)}
            options={EQUIPMENT}
            allowEmpty
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <div>
          <L>{t("field.reps_intervals")}</L>
          <NumIn
            value={intervalReps ?? null}
            onChange={(n) => patchJson?.("interval_reps", n)}
          />
        </div>
        <div>
          <L>{t("common.rest_sec")}</L>
          <NumIn
            value={form.rest_sec}
            onChange={(n) => patch({ rest_sec: n })}
          />
        </div>
      </div>
      <NotesRpe form={form} patch={patch} />
    </div>
  );
}

function CyclingForm({ form, patch, patchJson }: FormProps) {
  const isDist = form.target_mode === "Distance";
  const isTime = form.target_mode === "Time";
  const watts = form.prescription.watts as number | undefined;
  const cadence = form.prescription.cadence_rpm as number | undefined;
  const intervalReps = form.prescription.interval_reps as number | undefined;
  return (
    <div className="space-y-2">
      <div>
        <L>{t("target.mode")}</L>
        <Sel
          value={form.target_mode}
          onChange={(v) => patch({ target_mode: v })}
          options={["Distance", "Time"]}
        />
      </div>
      {isDist && (
        <div>
          <L>{t("field.distance_km")}</L>
          <NumIn
            value={form.distance_km}
            onChange={(n) => patch({ distance_km: n })}
            step="0.1"
          />
        </div>
      )}
      {isTime && (
        <div>
          <L>{t("field.duration_min")}</L>
          <NumIn
            value={form.duration_min}
            onChange={(n) => patch({ duration_min: n })}
            step="0.5"
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-1">
        <div>
          <L>{t("field.watts")}</L>
          <NumIn
            value={watts ?? null}
            onChange={(n) => patchJson?.("watts", n)}
          />
        </div>
        <div>
          <L>{t("field.cadence_rpm")}</L>
          <NumIn
            value={cadence ?? null}
            onChange={(n) => patchJson?.("cadence_rpm", n)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <div>
          <L>{t("field.hr_zone")}</L>
          <Sel
            value={form.hr_zone == null ? null : String(form.hr_zone)}
            onChange={(v) => patch({ hr_zone: v ? Number(v) : null })}
            options={["1", "2", "3", "4", "5"]}
            allowEmpty
          />
        </div>
        <div>
          <L>{t("field.reps_intervals")}</L>
          <NumIn
            value={intervalReps ?? null}
            onChange={(n) => patchJson?.("interval_reps", n)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <div>
          <L>{t("common.rest_sec")}</L>
          <NumIn
            value={form.rest_sec}
            onChange={(n) => patch({ rest_sec: n })}
          />
        </div>
        <div>
          <L>{t("common.rpe")} (1-10)</L>
          <NumIn value={form.rpe} onChange={(n) => patch({ rpe: n })} />
        </div>
      </div>
      <div>
        <L>{t("common.notes")}</L>
        <Textarea
          rows={2}
          value={form.notes}
          onChange={(e) => patch({ notes: e.target.value })}
        />
      </div>
    </div>
  );
}

function SportForm({ form, patch }: FormProps) {
  const isTime = form.target_mode === "Time";
  const isReps = form.target_mode === "Reps";
  return (
    <div className="space-y-2">
      <div>
        <L>{t("target.mode")}</L>
        <Sel
          value={form.target_mode}
          onChange={(v) => patch({ target_mode: v })}
          options={["Time", "Reps"]}
        />
      </div>
      {isTime && (
        <div>
          <L>{t("field.duration_min")}</L>
          <NumIn
            value={form.duration_min}
            onChange={(n) => patch({ duration_min: n })}
            step="0.5"
          />
        </div>
      )}
      {isReps && (
        <div>
          <L>{t("common.reps")}</L>
          <TextIn
            value={form.reps}
            onChange={(s) => patch({ reps: s })}
            placeholder="10"
          />
        </div>
      )}
      <div className="grid grid-cols-3 gap-1">
        <div>
          <L>{t("common.sets")}</L>
          <NumIn value={form.sets} onChange={(n) => patch({ sets: n })} />
        </div>
        <div>
          <L>{t("common.rest_sec")}</L>
          <NumIn
            value={form.rest_sec}
            onChange={(n) => patch({ rest_sec: n })}
          />
        </div>
        <div>
          <L>{t("common.rpe")} (1-10)</L>
          <NumIn value={form.rpe} onChange={(n) => patch({ rpe: n })} />
        </div>
      </div>
      <div>
        <L>{t("common.notes")}</L>
        <Textarea
          rows={2}
          value={form.notes}
          onChange={(e) => patch({ notes: e.target.value })}
        />
      </div>
    </div>
  );
}

function MobilityForm({ form, patch, patchJson }: FormProps) {
  const isHold = form.target_mode === "Hold";
  const isReps = form.target_mode === "Reps";
  const hold = form.prescription.hold_sec as number | undefined;
  const side = (form.prescription.side as string) ?? null;
  return (
    <div className="space-y-2">
      <div>
        <L>{t("target.mode")}</L>
        <Sel
          value={form.target_mode}
          onChange={(v) => patch({ target_mode: v })}
          options={["Hold", "Reps"]}
        />
      </div>
      {isHold && (
        <div>
          <L>{t("field.hold_sec")}</L>
          <NumIn
            value={hold ?? null}
            onChange={(n) => patchJson?.("hold_sec", n)}
          />
        </div>
      )}
      {isReps && (
        <div>
          <L>{t("common.reps")}</L>
          <TextIn
            value={form.reps}
            onChange={(s) => patch({ reps: s })}
            placeholder="10"
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-1">
        <div>
          <L>{t("common.sets")}</L>
          <NumIn value={form.sets} onChange={(n) => patch({ sets: n })} />
        </div>
        <div>
          <L>{t("common.side")}</L>
          <Sel
            value={side}
            onChange={(v) => patchJson?.("side", v)}
            options={SIDES}
            allowEmpty
          />
        </div>
      </div>
      <div>
        <L>{t("common.notes")}</L>
        <Textarea
          rows={2}
          value={form.notes}
          onChange={(e) => patch({ notes: e.target.value })}
        />
      </div>
    </div>
  );
}

export { rowToPrescription, summarizePrescription };
