import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, Archive, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  blockStart,
  blockEnd,
  formatShort,
  planEnd,
  parseISODate,
  scheduledBlocks,
} from "@/lib/coachdesk/periodization";

type Block = {
  id: string;
  name: string;
  position: number;
  weeks: number;
  archived: boolean;
};

type Plan = {
  id: string;
  name: string;
  start_date: string;
  status: string;
  training_blocks: Block[] | null;
};

/**
 * Every plan the athlete has ever been given, and the blocks inside them.
 *
 * My Training answers "what am I doing", and deliberately only ever shows
 * the active plan — which meant that the moment a plan was completed the
 * athlete lost sight of it entirely. Months of their own training became
 * unreachable from their own account: not deleted, just with no door.
 *
 * Read-only on purpose. The plan is the coach's document; this is the
 * athlete's way of looking at it, and at what they did against it.
 */
export function MyPlans() {
  const navigate = useNavigate();
  const [open, setOpen] = useState<string | null>(null);

  const { data: client } = useQuery({
    queryKey: ["my-client-plans"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase
        .from("clients")
        .select("id, name")
        .eq("user_id", u.user.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["my-plans", client?.id],
    enabled: !!client?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("training_plans")
        .select(
          "id, name, start_date, status, training_blocks(id, name, position, weeks, archived)",
        )
        .eq("athlete_id", client!.id)
        .order("start_date", { ascending: false });
      return (data ?? []) as unknown as Plan[];
    },
  });

  if (isLoading) return null;

  // The one being trained leads, whatever its start date says.
  const sorted = [...plans].sort(
    (a, b) =>
      Number(b.status === "active") - Number(a.status === "active") ||
      b.start_date.localeCompare(a.start_date),
  );

  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-auto">
      <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-bold">My plans</h1>
          <p className="text-sm text-muted-foreground">
            Everything your coach has written for you, including the blocks you
            have already finished.
          </p>
        </div>

        {sorted.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">
            No plans yet.
          </Card>
        )}

        {sorted.map((plan) => {
          const all = plan.training_blocks ?? [];
          const scheduled = scheduledBlocks(all);
          const parked = all.filter((b) => b.archived);
          const isOpen = open === plan.id;
          const end = scheduled.length ? planEnd(plan.start_date, all) : null;

          return (
            <Card key={plan.id} className="overflow-hidden">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : plan.id)}
                className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/40"
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{plan.name}</span>
                    {/* Only "active" is worth a solid badge: it is the one
                        that answers "what am I doing". */}
                    <Badge
                      variant={plan.status === "active" ? "default" : "outline"}
                      className="capitalize"
                    >
                      {plan.status}
                    </Badge>
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                    {formatShort(parseISODate(plan.start_date))}
                    {end && ` – ${formatShort(end)}`}
                    {" · "}
                    {scheduled.length}{" "}
                    {scheduled.length === 1 ? "block" : "blocks"}
                    {parked.length > 0 && ` · ${parked.length} archived`}
                  </div>
                </div>
              </button>

              {isOpen && (
                <div className="space-y-1 border-t border-border p-3">
                  {all.length === 0 && (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      This plan has no blocks yet.
                    </p>
                  )}
                  {[...all]
                    .sort((a, b) => a.position - b.position)
                    .map((b) => {
                      // An archived block holds no slot in the chain, so
                      // asking for its dates would return whichever block
                      // now occupies that position.
                      const bs = b.archived
                        ? null
                        : blockStart(plan.start_date, all, b.position);
                      const be = b.archived
                        ? null
                        : blockEnd(plan.start_date, all, b.position);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          disabled={b.archived}
                          onClick={() =>
                            navigate({
                              to: "/dashboard",
                              search: { plan: plan.id, block: b.id },
                            })
                          }
                          className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left ${
                            b.archived
                              ? "cursor-default border-dashed border-border opacity-60"
                              : "border-border hover:border-foreground/30 hover:bg-muted/40"
                          }`}
                        >
                          {b.archived ? (
                            <Archive className="h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">
                              {b.name}
                            </div>
                            <div className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                              {b.archived
                                ? "Archived · kept for reference, not scheduled"
                                : `${b.weeks}w · ${formatShort(bs!)} – ${formatShort(be!)}`}
                            </div>
                          </div>
                          {!b.archived && (
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                        </button>
                      );
                    })}
                </div>
              )}
            </Card>
          );
        })}

        <p className="text-[11px] text-muted-foreground">
          Tap a block to open that week in My Training. Archived blocks were
          written but never scheduled — your coach kept them rather than
          deleting them, and they have no dates.{" "}
          <Link to="/dashboard" className="underline">
            Back to this week
          </Link>
        </p>
      </div>
    </div>
  );
}

/** Exported for the dashboard, which has to resolve a block to a week. */
export function blockWeekOffset(blocks: Block[], blockId: string): number {
  let offset = 0;
  for (const b of scheduledBlocks(blocks)) {
    if (b.id === blockId) return offset;
    offset += b.weeks;
  }
  return 0;
}
