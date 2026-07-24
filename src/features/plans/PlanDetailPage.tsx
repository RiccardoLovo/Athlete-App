import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { usePlanRealtime } from "@/hooks/use-plan-realtime";
import {
  blockStart,
  blockEnd,
  planEnd,
  parseISODate,
  formatRange,
  isBetween,
  toISODate,
} from "@/lib/coachdesk/periodization";

type Block = { id: string; name: string; position: number; weeks: number };

const BLOCK_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-teal-500",
];

export function PlanDetailPage() {
  const { planId } = useParams({ from: "/_authenticated/plans/$planId/" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  usePlanRealtime(planId);

  const { data: plan } = useQuery({
    queryKey: ["plan", planId],
    queryFn: async () => {
      const { data } = await supabase
        .from("training_plans")
        .select("id, name, start_date, status, athlete_id, clients(id, name)")
        .eq("id", planId)
        .single();
      return data as any;
    },
  });

  const { data: blocks = [] } = useQuery({
    queryKey: ["plan-blocks", planId],
    queryFn: async () => {
      const { data } = await supabase
        .from("training_blocks")
        .select("id, name, position, weeks")
        .eq("plan_id", planId)
        .order("position");
      return (data ?? []) as Block[];
    },
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["plan-blocks", planId] });
    qc.invalidateQueries({ queryKey: ["plans", plan?.athlete_id] });
  }

  async function addBlock() {
    const nextPos = blocks.length
      ? Math.max(...blocks.map((b) => b.position)) + 1
      : 1;
    const { error } = await supabase.from("training_blocks").insert({
      plan_id: planId,
      name: `Block ${nextPos}`,
      position: nextPos,
      weeks: 4,
    });
    if (error) return toast.error(error.message);
    invalidate();
  }

  async function updateBlock(id: string, patch: Partial<Block>) {
    const { error } = await supabase
      .from("training_blocks")
      .update(patch)
      .eq("id", id);
    if (error) toast.error(error.message);
    invalidate();
  }

  async function deleteBlock(id: string) {
    if (!confirm("Delete this block and all its sessions?")) return;
    const { error } = await supabase
      .from("training_blocks")
      .delete()
      .eq("id", id);
    if (error) toast.error(error.message);
    invalidate();
  }

  async function moveBlock(b: Block, dir: -1 | 1) {
    const sorted = [...blocks].sort((a, b) => a.position - b.position);
    const idx = sorted.findIndex((x) => x.id === b.id);
    const swap = sorted[idx + dir];
    if (!swap) return;
    // Two-step swap to avoid unique-constraint clash.
    await supabase
      .from("training_blocks")
      .update({ position: -Math.abs(b.position) })
      .eq("id", b.id);
    await supabase
      .from("training_blocks")
      .update({ position: b.position })
      .eq("id", swap.id);
    await supabase
      .from("training_blocks")
      .update({ position: swap.position })
      .eq("id", b.id);
    invalidate();
  }

  async function updatePlanStart(newStart: string) {
    if (!newStart || newStart === plan.start_date) return;
    const { error } = await supabase
      .from("training_plans")
      .update({ start_date: newStart })
      .eq("id", planId);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["plan", planId] });
    invalidate();
  }

  // Editing a block's end date adjusts its `weeks` (rounded to whole weeks, min 1).
  async function updateBlockEnd(b: Block, newEndISO: string) {
    if (!newEndISO) return;
    const bs = blockStart(plan.start_date, blocks, b.position);
    const newEnd = parseISODate(newEndISO);
    const days = Math.round((newEnd.getTime() - bs.getTime()) / 86_400_000) + 1;
    const weeks = Math.max(1, Math.round(days / 7));
    if (weeks === b.weeks) {
      toast.info(
        "End date snapped to current week count (blocks are whole-week sized).",
      );
      return;
    }
    await updateBlock(b.id, { weeks });
  }

  // Editing the start date of a non-first block shifts the previous block's weeks so this block starts on the chosen date.
  async function updateBlockStart(b: Block, newStartISO: string) {
    if (!newStartISO) return;
    const sorted = [...blocks].sort((a, b) => a.position - b.position);
    const idx = sorted.findIndex((x) => x.id === b.id);
    if (idx === 0) return updatePlanStart(newStartISO);
    const prev = sorted[idx - 1];
    const prevStart = blockStart(plan.start_date, blocks, prev.position);
    const newStart = parseISODate(newStartISO);
    const days = Math.round(
      (newStart.getTime() - prevStart.getTime()) / 86_400_000,
    );
    const prevWeeks = Math.max(1, Math.round(days / 7));
    if (prevWeeks === prev.weeks) {
      toast.info("Start date snapped to current week boundaries.");
      return;
    }
    await updateBlock(prev.id, { weeks: prevWeeks });
  }

  if (!plan) return <div className="p-6 text-muted-foreground">Loading…</div>;

  const start = parseISODate(plan.start_date);
  const end = planEnd(plan.start_date, blocks);
  const totalWeeks = blocks.reduce((s, b) => s + b.weeks, 0);
  const today = new Date();
  const todayInPlan = isBetween(today, start, end);
  const totalDays = Math.max(1, totalWeeks * 7);
  const todayPct = todayInPlan
    ? ((today.getTime() - start.getTime()) / 86_400_000 / totalDays) * 100
    : null;

  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-auto">
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <nav className="text-xs text-muted-foreground">
          <Link
            to="/clients/$clientId"
            params={{ clientId: plan.athlete_id }}
            className="hover:text-foreground"
          >
            {plan.clients?.name}
          </Link>
          <span> / </span>
          <span>{plan.name}</span>
        </nav>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              navigate({
                to: "/clients/$clientId",
                params: { clientId: plan.athlete_id },
              })
            }
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{plan.name}</h1>
              <Badge variant="outline" className="capitalize">
                {plan.status}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground">
              {formatRange(start, end)} · {totalWeeks} week
              {totalWeeks === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        {/* Timeline */}
        {blocks.length > 0 && (
          <Card className="p-4">
            <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              Timeline
            </div>
            <div className="relative h-8 overflow-hidden rounded-md border bg-muted/40">
              <div className="flex h-full">
                {blocks.map((b, i) => (
                  <div
                    key={b.id}
                    className={`${BLOCK_COLORS[i % BLOCK_COLORS.length]} flex items-center justify-center text-[10px] font-semibold text-white`}
                    style={{ width: `${(b.weeks / totalWeeks) * 100}%` }}
                    title={b.name}
                  >
                    {b.name}
                  </div>
                ))}
              </div>
              {todayPct != null && (
                <div
                  className="pointer-events-none absolute top-0 h-full w-0.5 bg-red-600"
                  style={{ left: `${Math.min(100, Math.max(0, todayPct))}%` }}
                  title="Today"
                />
              )}
            </div>
          </Card>
        )}

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Blocks</h2>
            <Button onClick={addBlock}>
              <Plus className="mr-1 h-4 w-4" /> Add Block
            </Button>
          </div>
          {blocks.length === 0 ? (
            <Card className="py-10 text-center text-sm text-muted-foreground">
              No blocks yet — add one to start scheduling weeks.
            </Card>
          ) : (
            <div className="space-y-2">
              {blocks.map((b, i) => {
                const bs = blockStart(plan.start_date, blocks, b.position);
                const be = blockEnd(plan.start_date, blocks, b.position);
                return (
                  <Card key={b.id} className="p-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <div
                        className={`h-8 w-2 rounded ${BLOCK_COLORS[i % BLOCK_COLORS.length]}`}
                      />
                      <Input
                        defaultValue={b.name}
                        onBlur={(e) => {
                          if (e.target.value !== b.name)
                            updateBlock(b.id, { name: e.target.value });
                        }}
                        className="h-8 max-w-[260px] font-semibold"
                      />
                      <div className="flex items-center gap-1 text-xs">
                        <span className="text-muted-foreground">Weeks</span>
                        <Input
                          type="number"
                          min={1}
                          max={52}
                          defaultValue={b.weeks}
                          onBlur={(e) => {
                            const w = parseInt(e.target.value, 10);
                            if (Number.isFinite(w) && w > 0 && w !== b.weeks)
                              updateBlock(b.id, { weeks: w });
                          }}
                          className="h-8 w-16"
                        />
                      </div>
                      <div className="flex items-center gap-1 text-xs">
                        <span className="text-muted-foreground">Start</span>
                        <Input
                          key={`s-${b.id}-${toISODate(bs)}`}
                          type="date"
                          defaultValue={toISODate(bs)}
                          onBlur={(e) => updateBlockStart(b, e.target.value)}
                          className="h-8 w-[140px]"
                        />
                      </div>
                      <div className="flex items-center gap-1 text-xs">
                        <span className="text-muted-foreground">End</span>
                        <Input
                          key={`e-${b.id}-${toISODate(be)}`}
                          type="date"
                          defaultValue={toISODate(be)}
                          onBlur={(e) => updateBlockEnd(b, e.target.value)}
                          className="h-8 w-[140px]"
                        />
                      </div>
                      <div className="ml-auto flex items-center gap-1">
                        <Link
                          to="/plans/$planId/blocks/$blockId"
                          params={{ planId, blockId: b.id }}
                        >
                          <Button size="sm" variant="outline">
                            Open
                          </Button>
                        </Link>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={i === 0}
                          onClick={() => moveBlock(b, -1)}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={i === blocks.length - 1}
                          onClick={() => moveBlock(b, 1)}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteBlock(b.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
