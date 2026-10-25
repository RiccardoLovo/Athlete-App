import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
import { toast } from "sonner";
import type { Discipline } from "@/lib/coachdesk/prescription";
import {
  IntervalBuilder,
  intervalsQuery,
  useLatestThreshold,
} from "./IntervalBuilder";
import { TemplateForm } from "./TemplateForm";
import {
  type ZoneNumber,
  bikePctToWatts,
  bikeZoneDefaultPct,
  formatSecondsToPace,
  swimPctToPaceSec,
  swimZoneDefaultPct,
} from "@/lib/coachdesk/zones";

type BlockType =
  | "warmup"
  | "cooldown"
  | "steady"
  | "drill"
  | "intervals"
  | "pyramid";

type Block = {
  id: string;
  session_exercise_id: string;
  order_index: number;
  block_type: BlockType;
  label: string | null;
  target_mode: "distance" | "time" | null;
  target_unit: "km" | "m" | "min" | "sec" | null;
  intensity_mode: "zone" | "pace";
  rest_mode: "seconds" | "ratio";
  rest_seconds: number | null;
  rest_ratio: number | null;
  distance_km: number | null;
  duration_min: number | null;
  pace: string | null;
  zone: number | null;
  pct_threshold: number | null;
  interval_count: number | null;
  double_peak: boolean | null;
  notes: string | null;
};

const BLOCK_LABELS: Record<BlockType, string> = {
  warmup: "Warm-up",
  cooldown: "Cool-down",
  steady: "Steady",
  drill: "Drill",
  intervals: "Intervals",
  pyramid: "Pyramid",
};

const TAGS = ["Intervals", "Tempo", "Easy", "Long"];
const ZONES: ZoneNumber[] = [1, 2, 3, 4, 5];

function blocksKey(seId: string) {
  return ["workout-blocks", seId] as const;
}

export function WorkoutBlockBuilder({
  sessionExerciseId,
  discipline,
  notes,
  tags,
  clientId,
  onChanged,
}: {
  sessionExerciseId: string;
  discipline: Discipline;
  notes: string;
  tags: string[];
  clientId: string | null;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [localNotes, setLocalNotes] = useState(notes);
  const [localTags, setLocalTags] = useState<string[]>(tags);

  const { data: blocks = [] } = useQuery({
    queryKey: blocksKey(sessionExerciseId),
    // The app sets staleTime 30s + refetchOnMount:false globally to avoid
    // refresh flashes. That combination means an invalidation interrupted
    // by a re-render can leave this list stale with no refetch queued, so
    // a just-added block wouldn't appear for ages. Keep this list always
    // fresh; every mutation below also updates the cache optimistically so
    // the UI never waits on a round trip.
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_blocks")
        .select("*")
        .eq("session_exercise_id", sessionExerciseId)
        .order("order_index");
      if (error) throw error;
      return (data ?? []) as Block[];
    },
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: blocksKey(sessionExerciseId) });
  }

  async function addBlock(type: BlockType) {
    const nextOrder = blocks.length
      ? Math.max(...blocks.map((b) => b.order_index)) + 1
      : 0;
    const { data, error } = await supabase
      .from("workout_blocks")
      .insert({
        session_exercise_id: sessionExerciseId,
        order_index: nextOrder,
        block_type: type,
        target_mode:
          type === "intervals" || type === "pyramid" ? null : "distance",
        target_unit:
          type === "intervals" || type === "pyramid"
            ? null
            : discipline === "Swimming"
              ? "m"
              : "km",
        interval_count: type === "intervals" ? 6 : null,
      } as never)
      .select("*")
      .single();
    if (error || !data) return toast.error(error?.message ?? "Add failed");
    qc.setQueryData<Block[]>(blocksKey(sessionExerciseId), (prev) => [
      ...(prev ?? []),
      data as Block,
    ]);
    onChanged();
  }

  async function deleteBlock(id: string) {
    if (!confirm("Delete this block?")) return;
    qc.setQueryData<Block[]>(blocksKey(sessionExerciseId), (prev) =>
      (prev ?? []).filter((b) => b.id !== id),
    );
    const { error } = await supabase
      .from("workout_blocks")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      invalidate();
      return;
    }
    onChanged();
  }

  async function swapBlocks(a: Block, b: Block) {
    qc.setQueryData<Block[]>(blocksKey(sessionExerciseId), (prev) =>
      (prev ?? [])
        .map((row) =>
          row.id === a.id
            ? { ...row, order_index: b.order_index }
            : row.id === b.id
              ? { ...row, order_index: a.order_index }
              : row,
        )
        .sort((x, y) => x.order_index - y.order_index),
    );
    // Park one row on a temporary index first so the two never collide.
    const tmp = -1 * (Date.now() % 100000);
    await supabase
      .from("workout_blocks")
      .update({ order_index: tmp } as never)
      .eq("id", a.id);
    await supabase
      .from("workout_blocks")
      .update({ order_index: a.order_index } as never)
      .eq("id", b.id);
    await supabase
      .from("workout_blocks")
      .update({ order_index: b.order_index } as never)
      .eq("id", a.id);
  }

  async function saveNotes() {
    if (localNotes === notes) return;
    const { error } = await supabase
      .from("session_exercises")
      .update({ notes: localNotes } as never)
      .eq("id", sessionExerciseId);
    if (error) toast.error(error.message);
    onChanged();
  }

  async function toggleTag(tag: string) {
    const next = localTags.includes(tag)
      ? localTags.filter((t) => t !== tag)
      : [...localTags, tag];
    setLocalTags(next);
    const { error } = await supabase
      .from("session_exercises")
      .update({ tags: next } as never)
      .eq("id", sessionExerciseId);
    if (error) {
      setLocalTags(localTags);
      return toast.error(error.message);
    }
    onChanged();
  }

  const addableTypes: BlockType[] = [
    "warmup",
    "cooldown",
    "steady",
    ...(discipline === "Swimming" ? (["drill"] as BlockType[]) : []),
    "intervals",
    "pyramid",
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        <Label className="mr-1 text-[10px]">Tags</Label>
        {TAGS.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => toggleTag(tag)}
            className={`rounded-full border px-2 py-0.5 text-[10px] ${
              localTags.includes(tag)
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground"
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {blocks.map((block, idx) => (
          <BlockEditor
            key={block.id}
            block={block}
            discipline={discipline}
            clientId={clientId}
            canUp={idx > 0}
            canDown={idx < blocks.length - 1}
            onSwapUp={() => swapBlocks(block, blocks[idx - 1])}
            onSwapDown={() => swapBlocks(block, blocks[idx + 1])}
            onDelete={() => deleteBlock(block.id)}
            onChanged={invalidate}
          />
        ))}
        {!blocks.length && (
          <p className="rounded border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            No blocks yet — add one below.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {addableTypes.map((type) => (
          <Button
            key={type}
            size="sm"
            variant="outline"
            onClick={() => addBlock(type)}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> {BLOCK_LABELS[type]}
          </Button>
        ))}
      </div>

      <TotalsFooter blocks={blocks} />

      <div>
        <Label className="text-xs font-semibold">Coach notes</Label>
        <Textarea
          className="mt-1"
          rows={2}
          placeholder="Anything the athlete should know about this workout…"
          value={localNotes}
          onChange={(e) => setLocalNotes(e.target.value)}
          onBlur={saveNotes}
        />
      </div>
    </div>
  );
}

function BlockEditor({
  block,
  discipline,
  clientId,
  canUp,
  canDown,
  onSwapUp,
  onSwapDown,
  onDelete,
  onChanged,
}: {
  block: Block;
  discipline: Discipline;
  clientId: string | null;
  canUp: boolean;
  canDown: boolean;
  onSwapUp: () => void;
  onSwapDown: () => void;
  onDelete: () => void;
  onChanged: () => void;
}) {
  const isGenerated =
    block.block_type === "intervals" || block.block_type === "pyramid";
  // Only intervals/pyramid collapse — they hold a whole round table, so
  // they can't fit on one line. Everything else edits inline in its row.
  const [open, setOpen] = useState(false);

  const controls = (
    <>
      <button
        onClick={onSwapUp}
        disabled={!canUp}
        title="Move up"
        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onSwapDown}
        disabled={!canDown}
        title="Move down"
        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
      >
        <ArrowDown className="h-3.5 w-3.5" />
      </button>
      <button onClick={onDelete} title="Delete block" className="p-0.5">
        <Trash2 className="h-3.5 w-3.5 text-destructive" />
      </button>
    </>
  );

  if (!isGenerated) {
    return (
      <div className="rounded border border-border bg-card px-2 py-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="shrink-0 rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
            {BLOCK_LABELS[block.block_type]}
          </span>
          <SimpleBlockBody
            block={block}
            discipline={discipline}
            clientId={clientId}
            onChanged={onChanged}
          />
          <span className="flex-1" />
          {controls}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded border border-border bg-card">
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          {open ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          <span className="shrink-0 rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
            {BLOCK_LABELS[block.block_type]}
          </span>
          <span className="truncate text-[11px] text-muted-foreground">
            {open ? "" : "open to build rounds"}
          </span>
        </button>
        {controls}
      </div>

      {open && (
        <div className="border-t border-border px-2 py-2">
          <GeneratedBlockBody
            block={block}
            discipline={discipline}
            clientId={clientId}
            onChanged={onChanged}
          />
        </div>
      )}
    </div>
  );
}

function GeneratedBlockBody({
  block,
  discipline,
  clientId,
  onChanged,
}: {
  block: Block;
  discipline: Discipline;
  clientId: string | null;
  onChanged: () => void;
}) {
  const { data: rounds = [] } = useQuery(
    intervalsQuery({
      sessionExerciseId: block.session_exercise_id,
      workoutBlockId: block.id,
    }),
  );
  return (
    <div className="space-y-2">
      <TemplateForm
        sessionExerciseId={block.session_exercise_id}
        workoutBlockId={block.id}
        templateType={block.block_type === "intervals" ? "rsa" : "pyramid"}
        discipline={discipline}
        clientId={clientId}
        defaults={null}
        hasExistingIntervals={rounds.length > 0}
        templateGeneratedAt={null}
        hideHeader
        onGenerated={onChanged}
      />
      <IntervalBuilder
        sessionExerciseId={block.session_exercise_id}
        workoutBlockId={block.id}
        discipline={discipline}
        clientId={clientId}
        intensityMode={block.intensity_mode}
      />
    </div>
  );
}

function SimpleBlockBody({
  block,
  discipline,
  clientId,
  onChanged,
}: {
  block: Block;
  discipline: Discipline;
  clientId: string | null;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [local, setLocal] = useState(block);
  const usesThreshold = discipline === "Swimming" || discipline === "Cycling";
  const { data: ftpWatts } = useLatestThreshold(
    discipline === "Cycling" ? clientId : null,
    "ftp_watts",
  );
  const { data: cssSec } = useLatestThreshold(
    discipline === "Swimming" ? clientId : null,
    "css_pace_sec_per_100m",
  );
  const threshold = discipline === "Cycling" ? ftpWatts : cssSec;

  async function save(patch: Partial<Block>) {
    const next = { ...local, ...patch };
    setLocal(next);
    // Keep the cached row in step so the collapsed one-line summary above
    // reflects the edit straight away rather than after a refetch.
    qc.setQueryData<Block[]>(blocksKey(block.session_exercise_id), (prev) =>
      (prev ?? []).map((b) => (b.id === block.id ? { ...b, ...patch } : b)),
    );
    const { error } = await supabase
      .from("workout_blocks")
      .update(patch as never)
      .eq("id", block.id);
    if (error) toast.error(error.message);
    onChanged();
  }

  function pickZone(zone: ZoneNumber) {
    if (threshold == null) {
      save({ zone });
      return;
    }
    const pct =
      discipline === "Cycling"
        ? bikeZoneDefaultPct(zone)
        : swimZoneDefaultPct(threshold, zone);
    save({ zone, pct_threshold: pct });
  }

  const resolvedValue =
    threshold != null && local.pct_threshold != null
      ? discipline === "Cycling"
        ? `${bikePctToWatts(threshold, local.pct_threshold)}W`
        : `${formatSecondsToPace(swimPctToPaceSec(threshold, local.pct_threshold))}/100m`
      : null;

  // Distance vs Time is chosen first; the unit list then follows from it
  // (km/m for distance, min/sec for time) and the number is converted so
  // switching unit never loses what was typed.
  const isTime = local.target_mode === "time";
  const unit: "km" | "m" | "min" | "sec" =
    (local.target_unit as "km" | "m" | "min" | "sec" | null) ??
    (isTime ? "min" : discipline === "Swimming" ? "m" : "km");
  const unitOptions = isTime
    ? (["min", "sec"] as const)
    : (["km", "m"] as const);

  // Everything is stored canonically (km / minutes); these convert to and
  // from whatever unit the coach is currently working in.
  const toDisplay = (): number | "" => {
    if (isTime) {
      if (local.duration_min == null) return "";
      return unit === "sec"
        ? Math.round(local.duration_min * 60)
        : local.duration_min;
    }
    if (local.distance_km == null) return "";
    return unit === "m"
      ? Math.round(local.distance_km * 1000)
      : local.distance_km;
  };
  const shownValue = toDisplay();

  function patchForValue(n: number | null): Partial<Block> {
    if (isTime)
      return {
        duration_min: n == null ? null : unit === "sec" ? n / 60 : n,
      };
    return {
      distance_km: n == null ? null : unit === "m" ? n / 1000 : n,
    };
  }

  function saveMode(mode: "distance" | "time") {
    if (mode === (isTime ? "time" : "distance")) return;
    save({
      target_mode: mode,
      target_unit:
        mode === "time" ? "min" : discipline === "Swimming" ? "m" : "km",
      distance_km: null,
      duration_min: null,
    });
  }

  function saveUnit(nextUnit: string) {
    const current = shownValue;
    const u = nextUnit as "km" | "m" | "min" | "sec";
    if (typeof current !== "number") return save({ target_unit: u });
    // Re-express the same physical value in the newly chosen unit.
    const canonical =
      u === "sec"
        ? { duration_min: current / 60 }
        : u === "min"
          ? { duration_min: current }
          : u === "m"
            ? { distance_km: current / 1000 }
            : { distance_km: current };
    save({ target_unit: u, ...canonical });
  }

  const secondary = local.intensity_mode === "zone" ? "pace" : "zone";

  return (
    <>
      {block.block_type === "drill" && (
        <Input
          className="h-7 w-32 text-xs"
          placeholder="Drill name"
          title="Drill name"
          value={local.label ?? ""}
          onChange={(e) => setLocal((p) => ({ ...p, label: e.target.value }))}
          onBlur={() => save({ label: local.label })}
        />
      )}

      <Select
        value={isTime ? "time" : "distance"}
        onValueChange={(v) => saveMode(v as "distance" | "time")}
      >
        <SelectTrigger className="h-7 w-[92px] text-xs" title="Target type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="distance">Distance</SelectItem>
          <SelectItem value="time">Time</SelectItem>
        </SelectContent>
      </Select>

      <Input
        className="h-7 w-20 text-xs"
        type="number"
        step="0.1"
        placeholder={isTime ? "Time" : "Distance"}
        title={isTime ? "Time" : "Distance"}
        value={shownValue}
        onChange={(e) =>
          setLocal((p) => ({
            ...p,
            ...patchForValue(
              e.target.value === "" ? null : Number(e.target.value),
            ),
          }))
        }
        onBlur={(e) =>
          save(
            patchForValue(
              e.target.value === "" ? null : Number(e.target.value),
            ),
          )
        }
      />

      <Select value={unit} onValueChange={saveUnit}>
        <SelectTrigger className="h-7 w-[68px] text-xs" title="Unit">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {unitOptions.map((u) => (
            <SelectItem key={u} value={u}>
              {u}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="ml-1 text-[10px] text-muted-foreground">Follow</span>
      <Select
        value={local.intensity_mode}
        onValueChange={(v) => save({ intensity_mode: v as "zone" | "pace" })}
      >
        <SelectTrigger
          className="h-7 w-[76px] text-xs"
          title="Which target the athlete must follow; the other is indicative"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="zone">Zone</SelectItem>
          <SelectItem value="pace">Pace</SelectItem>
        </SelectContent>
      </Select>

      <div className={secondary === "zone" ? "opacity-50" : ""}>
        <Select
          value={local.zone == null ? "_" : String(local.zone)}
          onValueChange={(v) =>
            v === "_" ? save({ zone: null }) : pickZone(Number(v) as ZoneNumber)
          }
        >
          <SelectTrigger
            className="h-7 w-[68px] text-xs"
            title={secondary === "zone" ? "Indicative only" : "Zone to follow"}
          >
            <SelectValue placeholder="Zone" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_">—</SelectItem>
            {ZONES.map((z) => (
              <SelectItem key={z} value={String(z)}>
                Z{z}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {usesThreshold && (
        <Input
          className={`h-7 w-16 text-xs ${secondary === "zone" ? "opacity-50" : ""}`}
          type="number"
          placeholder={discipline === "Cycling" ? "%FTP" : "%CSS"}
          title={`Exact % of ${discipline === "Cycling" ? "FTP" : "CSS"}`}
          value={local.pct_threshold ?? ""}
          onChange={(e) =>
            setLocal((p) => ({
              ...p,
              pct_threshold:
                e.target.value === "" ? null : Number(e.target.value),
            }))
          }
          onBlur={() => save({ pct_threshold: local.pct_threshold })}
        />
      )}

      <Input
        className={`h-7 w-20 text-xs ${secondary === "pace" ? "opacity-50" : ""}`}
        placeholder={secondary === "pace" ? "~pace" : "Pace"}
        title={secondary === "pace" ? "Indicative only" : "Pace to follow"}
        value={local.pace ?? ""}
        onChange={(e) => setLocal((p) => ({ ...p, pace: e.target.value }))}
        onBlur={() => save({ pace: local.pace })}
      />

      {resolvedValue && (
        <span className="text-[10px] text-muted-foreground">
          = {resolvedValue}
        </span>
      )}
    </>
  );
}

function TotalsFooter({ blocks }: { blocks: Block[] }) {
  const simpleBlocks = blocks.filter(
    (b) => b.block_type !== "intervals" && b.block_type !== "pyramid",
  );
  const totalKm = simpleBlocks
    .filter((b) => b.target_mode === "distance")
    .reduce((s, b) => s + (b.distance_km ?? 0), 0);
  const totalMin = simpleBlocks
    .filter((b) => b.target_mode === "time")
    .reduce((s, b) => s + (b.duration_min ?? 0), 0);

  const generatedBlocks = blocks.filter(
    (b) => b.block_type === "intervals" || b.block_type === "pyramid",
  );
  const { data: generatedTotals } = useQuery({
    queryKey: [
      "workout-block-round-totals",
      generatedBlocks.map((b) => b.id).join(","),
    ],
    enabled: generatedBlocks.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("prescription_intervals")
        .select("target_value, target_unit, workout_block_id")
        .in(
          "workout_block_id",
          generatedBlocks.map((b) => b.id),
        );
      let km = 0;
      let min = 0;
      for (const r of (data ?? []) as {
        target_value: number | null;
        target_unit: string;
      }[]) {
        if (r.target_value == null) continue;
        if (r.target_unit === "meters") km += r.target_value / 1000;
        else if (r.target_unit === "seconds") min += r.target_value / 60;
        else if (r.target_unit === "minutes") min += r.target_value;
      }
      return { km, min };
    },
  });

  const km = totalKm + (generatedTotals?.km ?? 0);
  const min = totalMin + (generatedTotals?.min ?? 0);

  if (km <= 0 && min <= 0) return null;

  return (
    <div className="rounded border border-border bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
      Total:{" "}
      {km > 0 && (
        <span className="font-medium text-foreground">
          {Math.round(km * 100) / 100}km
        </span>
      )}
      {km > 0 && min > 0 && " · "}
      {min > 0 && (
        <span className="font-medium text-foreground">
          {Math.round(min)} min
        </span>
      )}
    </div>
  );
}
