import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
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

  const { data: blocks = [] } = useQuery({
    queryKey: blocksKey(sessionExerciseId),
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
    const { error } = await supabase.from("workout_blocks").insert({
      session_exercise_id: sessionExerciseId,
      order_index: nextOrder,
      block_type: type,
      target_mode:
        type === "intervals" || type === "pyramid" ? null : "distance",
      interval_count: type === "intervals" ? 6 : null,
    } as never);
    if (error) return toast.error(error.message);
    invalidate();
    onChanged();
  }

  async function deleteBlock(id: string) {
    if (!confirm("Delete this block?")) return;
    const { error } = await supabase
      .from("workout_blocks")
      .delete()
      .eq("id", id);
    if (error) return toast.error(error.message);
    invalidate();
    onChanged();
  }

  async function swapBlocks(a: Block, b: Block) {
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
    invalidate();
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
    const next = tags.includes(tag)
      ? tags.filter((t) => t !== tag)
      : [...tags, tag];
    const { error } = await supabase
      .from("session_exercises")
      .update({ tags: next } as never)
      .eq("id", sessionExerciseId);
    if (error) return toast.error(error.message);
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
      <div>
        <Label className="text-[10px]">Tags</Label>
        <div className="mt-1 flex flex-wrap gap-1">
          {TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={`rounded-full border px-2 py-0.5 text-[10px] ${
                tags.includes(tag)
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
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

  return (
    <div className="rounded-md border border-border bg-card p-2">
      <div className="flex items-center gap-1.5">
        <span className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
          {BLOCK_LABELS[block.block_type]}
        </span>
        <span className="flex-1" />
        <button
          onClick={onSwapUp}
          disabled={!canUp}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onSwapDown}
          disabled={!canDown}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        <button onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </button>
      </div>

      <div className="mt-2">
        {isGenerated ? (
          <GeneratedBlockBody
            block={block}
            discipline={discipline}
            clientId={clientId}
            onChanged={onChanged}
          />
        ) : (
          <SimpleBlockBody
            block={block}
            discipline={discipline}
            clientId={clientId}
            onChanged={onChanged}
          />
        )}
      </div>
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
        onGenerated={onChanged}
      />
      <IntervalBuilder
        sessionExerciseId={block.session_exercise_id}
        workoutBlockId={block.id}
        discipline={discipline}
        clientId={clientId}
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

  return (
    <div className="space-y-2">
      {block.block_type === "drill" && (
        <div>
          <Label className="text-[10px]">Drill name</Label>
          <Input
            className="h-8 text-xs"
            placeholder="e.g. Catch-up, Single-arm, Fist drill…"
            value={local.label ?? ""}
            onChange={(e) => setLocal((p) => ({ ...p, label: e.target.value }))}
            onBlur={() => save({ label: local.label })}
          />
        </div>
      )}

      <div>
        <Label className="text-[10px]">Primary target</Label>
        <div className="flex gap-1">
          {(["distance", "time"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => save({ target_mode: m })}
              className={`flex-1 rounded border px-2 py-1 text-[10px] ${local.target_mode === m ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
            >
              {m === "distance" ? "Distance" : "Time"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1">
        <div>
          <Label
            className={`text-[10px] ${local.target_mode === "distance" ? "font-semibold text-foreground" : "text-muted-foreground"}`}
          >
            Distance (km)
            {local.target_mode === "distance" ? "" : " — secondary"}
          </Label>
          <Input
            className="h-8 text-xs"
            type="number"
            step="0.1"
            value={local.distance_km ?? ""}
            onChange={(e) =>
              setLocal((p) => ({
                ...p,
                distance_km:
                  e.target.value === "" ? null : Number(e.target.value),
              }))
            }
            onBlur={() => save({ distance_km: local.distance_km })}
          />
        </div>
        <div>
          <Label
            className={`text-[10px] ${local.target_mode === "time" ? "font-semibold text-foreground" : "text-muted-foreground"}`}
          >
            Duration (min){local.target_mode === "time" ? "" : " — secondary"}
          </Label>
          <Input
            className="h-8 text-xs"
            type="number"
            step="0.5"
            value={local.duration_min ?? ""}
            onChange={(e) =>
              setLocal((p) => ({
                ...p,
                duration_min:
                  e.target.value === "" ? null : Number(e.target.value),
              }))
            }
            onBlur={() => save({ duration_min: local.duration_min })}
          />
        </div>
      </div>

      <div>
        <Label className="text-[10px]">Pace</Label>
        <Input
          className="h-8 text-xs"
          placeholder="4:30"
          value={local.pace ?? ""}
          onChange={(e) => setLocal((p) => ({ ...p, pace: e.target.value }))}
          onBlur={() => save({ pace: local.pace })}
        />
      </div>

      {usesThreshold && (
        <div className="grid grid-cols-2 gap-1">
          <div>
            <Label className="text-[10px]">
              Zone {threshold == null && "(no threshold on file)"}
            </Label>
            <Select
              value={local.zone == null ? "_" : String(local.zone)}
              onValueChange={(v) =>
                v === "_"
                  ? save({ zone: null })
                  : pickZone(Number(v) as ZoneNumber)
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="—" />
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
          <div>
            <Label className="text-[10px]">
              Exact % {discipline === "Cycling" ? "FTP" : "CSS"}
            </Label>
            <Input
              className="h-8 text-xs"
              type="number"
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
          </div>
        </div>
      )}
      {resolvedValue && (
        <p className="text-[10px] text-muted-foreground">= {resolvedValue}</p>
      )}
    </div>
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
