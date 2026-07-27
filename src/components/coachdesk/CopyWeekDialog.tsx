import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type BlockRow = {
  id: string;
  name: string | null;
  position: number;
  weeks: number;
};

export function CopyWeekDialog({
  planId,
  currentBlockId,
  currentWeek,
  onClose,
  onCopied,
}: {
  planId: string;
  currentBlockId: string;
  currentWeek: number;
  onClose: () => void;
  onCopied: () => void;
}) {
  const qc = useQueryClient();

  const { data: blocks = [] } = useQuery({
    queryKey: ["plan-blocks-full", planId],
    queryFn: async () => {
      const { data } = await supabase
        .from("training_blocks")
        .select("id, name, position, weeks")
        .eq("plan_id", planId)
        .order("position");
      return (data ?? []) as BlockRow[];
    },
  });

  const blockIds = useMemo(() => blocks.map((b) => b.id), [blocks]);

  // Session counts per (block, week), so the picker can show "Week 2 — 4 sessions"
  // instead of a blind list of numbers, and flag genuinely empty weeks.
  const { data: sessionCounts = {} } = useQuery({
    queryKey: ["plan-week-session-counts", planId, blockIds.length],
    enabled: blockIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("sessions")
        .select("block_id, week_number")
        .in("block_id", blockIds);
      const map: Record<string, number> = {};
      for (const row of (data ?? []) as {
        block_id: string;
        week_number: number;
      }[]) {
        const key = `${row.block_id}:${row.week_number}`;
        map[key] = (map[key] ?? 0) + 1;
      }
      return map;
    },
  });

  const [sourceBlockId, setSourceBlockId] = useState(currentBlockId);
  const [sourceWeek, setSourceWeek] = useState<string>("");
  const [targetBlockId, setTargetBlockId] = useState(currentBlockId);
  const [targetWeek, setTargetWeek] = useState<string>(String(currentWeek));
  const [copying, setCopying] = useState(false);

  const blockById = useMemo(
    () => new Map(blocks.map((b) => [b.id, b])),
    [blocks],
  );

  function blockLabel(b: BlockRow) {
    return `Block ${b.position}${b.name ? ` — ${b.name}` : ""}`;
  }

  function weeksFor(blockId: string): number[] {
    const b = blockById.get(blockId);
    if (!b) return [];
    return Array.from({ length: b.weeks }, (_, i) => i + 1);
  }

  function sessionCountFor(blockId: string, week: number) {
    return sessionCounts[`${blockId}:${week}`] ?? 0;
  }

  const isNoop =
    sourceBlockId === targetBlockId &&
    sourceWeek !== "" &&
    Number(sourceWeek) === Number(targetWeek);

  const sourceHasSessions =
    sourceWeek !== "" && sessionCountFor(sourceBlockId, Number(sourceWeek)) > 0;

  const targetSessionCount =
    targetWeek !== "" ? sessionCountFor(targetBlockId, Number(targetWeek)) : 0;

  async function handleCopy() {
    if (!sourceWeek) return toast.error("Pick a week to copy from");
    if (!targetWeek) return toast.error("Pick a week to copy to");
    if (isNoop) return toast.error("Source and destination are the same week");
    setCopying(true);
    const { error } = await supabase.rpc("copy_week", {
      _source_block_id: sourceBlockId,
      _source_week: Number(sourceWeek),
      _target_block_id: targetBlockId,
      _target_week: Number(targetWeek),
    });
    setCopying(false);
    if (error) return toast.error(error.message);
    const srcLabel = `${blockLabel(blockById.get(sourceBlockId)!)}, Week ${sourceWeek}`;
    const dstLabel = `${blockLabel(blockById.get(targetBlockId)!)}, Week ${targetWeek}`;
    toast.success(`Copied ${srcLabel} → ${dstLabel}`);
    qc.invalidateQueries({ queryKey: ["block-sessions"] });
    qc.invalidateQueries({ queryKey: ["block-session-ex-counts"] });
    qc.invalidateQueries({ queryKey: ["plan-week-session-counts"] });
    onCopied();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Copy Week</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded border bg-muted/40 p-3">
            <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              Copy from
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Block</Label>
                <Select
                  value={sourceBlockId}
                  onValueChange={(v) => {
                    setSourceBlockId(v);
                    setSourceWeek("");
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {blocks.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {blockLabel(b)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Week</Label>
                <Select value={sourceWeek} onValueChange={setSourceWeek}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {weeksFor(sourceBlockId).map((w) => {
                      const count = sessionCountFor(sourceBlockId, w);
                      return (
                        <SelectItem key={w} value={String(w)}>
                          Week {w}
                          {count > 0
                            ? ` — ${count} session${count === 1 ? "" : "s"}`
                            : " — empty"}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {sourceWeek !== "" && !sourceHasSessions && (
              <p className="mt-2 text-xs text-amber-600">
                This week has no sessions — the destination will be cleared but
                nothing will be added.
              </p>
            )}
          </div>

          <div className="flex justify-center text-muted-foreground">
            <ArrowDown className="h-4 w-4" />
          </div>

          <div className="rounded border bg-muted/40 p-3">
            <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              Copy to
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Block</Label>
                <Select
                  value={targetBlockId}
                  onValueChange={(v) => {
                    setTargetBlockId(v);
                    setTargetWeek("");
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {blocks.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {blockLabel(b)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Week</Label>
                <Select value={targetWeek} onValueChange={setTargetWeek}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {weeksFor(targetBlockId).map((w) => {
                      const count = sessionCountFor(targetBlockId, w);
                      return (
                        <SelectItem key={w} value={String(w)}>
                          Week {w}
                          {count > 0
                            ? ` — ${count} session${count === 1 ? "" : "s"}`
                            : " — empty"}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {targetSessionCount > 0 && (
              <p className="mt-2 text-xs text-destructive">
                This will replace the {targetSessionCount} existing session
                {targetSessionCount === 1 ? "" : "s"} in this week.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleCopy}
            disabled={copying || !sourceWeek || !targetWeek || isNoop}
          >
            {copying ? "Copying…" : "Copy Week"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
