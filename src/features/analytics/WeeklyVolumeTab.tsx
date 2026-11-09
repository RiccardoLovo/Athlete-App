import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";

type VolumeRow = {
  plan_name: string;
  block_name: string;
  block_position: number;
  week_number: number;
  week_start: string;
  discipline: string;
  planned_km: number;
  planned_km_estimated: number;
  planned_minutes: number;
  actual_km: number;
  actual_minutes: number;
  sessions_total: number;
  sessions_unmeasured: number;
};

type ZoneRow = {
  block_position: number;
  week_number: number;
  zone: number | null;
  km: number;
  km_estimated: number;
  minutes: number;
};

const DISCIPLINES = ["Running", "Cycling", "Swimming"] as const;
const DISCIPLINE_ICON: Record<string, string> = {
  Running: "🏃",
  Cycling: "🚴",
  Swimming: "🏊",
};

function fmtKm(direct: number, estimated: number) {
  const total = Number(direct) + Number(estimated);
  if (total === 0) return null;
  const base = `${Math.round(total * 10) / 10} km`;
  return Number(estimated) > 0
    ? `${base} (${Math.round(Number(estimated) * 10) / 10} est.)`
    : base;
}

function fmtMin(m: number) {
  const mins = Math.round(Number(m));
  if (!mins) return null;
  if (mins < 60) return `${mins}min`;
  return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}`;
}

export function WeeklyVolumeTab({ clientId }: { clientId: string }) {
  const [openDiscipline, setOpenDiscipline] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["weekly-volume", clientId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("weekly_volume", {
        _client_id: clientId,
      });
      if (error) throw error;
      return (data ?? []) as unknown as VolumeRow[];
    },
  });

  const { data: zoneRows = [] } = useQuery({
    queryKey: ["weekly-volume-zone", clientId, openDiscipline],
    enabled: !!openDiscipline,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("weekly_volume_by_zone", {
        _client_id: clientId,
        _discipline: openDiscipline!,
      });
      if (error) throw error;
      return (data ?? []) as unknown as ZoneRow[];
    },
  });

  // One row per week, disciplines across it.
  const weeks = useMemo(() => {
    const byWeek = new Map<
      string,
      {
        label: string;
        start: string;
        block: string;
        week: number;
        pos: number;
        byDisc: Record<string, VolumeRow>;
      }
    >();
    for (const r of rows) {
      const key = `${r.block_position}-${r.week_number}`;
      if (!byWeek.has(key)) {
        byWeek.set(key, {
          label: `${r.block_name} · wk ${r.week_number}`,
          start: r.week_start,
          block: r.block_name,
          week: r.week_number,
          pos: r.block_position,
          byDisc: {},
        });
      }
      byWeek.get(key)!.byDisc[r.discipline] = r;
    }
    return [...byWeek.values()].sort(
      (a, b) => a.pos - b.pos || a.week - b.week,
    );
  }, [rows]);

  const zonesByWeek = useMemo(() => {
    const m = new Map<string, ZoneRow[]>();
    for (const z of zoneRows) {
      const k = `${z.block_position}-${z.week_number}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(z);
    }
    return m;
  }, [zoneRows]);

  const uncapturedTotal = rows.reduce((n, r) => n + r.sessions_unmeasured, 0);
  const sessionsTotal = rows.reduce((n, r) => n + r.sessions_total, 0);

  if (isLoading)
    return <p className="py-12 text-center text-muted-foreground">Loading…</p>;

  if (!weeks.length)
    return (
      <Card className="p-12 text-center text-muted-foreground">
        No endurance sessions planned for this athlete yet.
      </Card>
    );

  return (
    <div className="space-y-3">
      {uncapturedTotal > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <p className="font-medium">
            {uncapturedTotal} of {sessionsTotal} endurance sessions were written
            before structured blocks
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Their volume only exists in the session notes, so it isn&apos;t
            counted here and these weeks will read low. Anything built with
            blocks and intervals from now on counts automatically, so this
            shrinks on its own — it is a backlog, not a setting.
          </p>
        </Card>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="p-2 font-medium">Week</th>
              {DISCIPLINES.map((d) => (
                <th key={d} className="p-2 font-medium">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenDiscipline(openDiscipline === d ? null : d)
                    }
                    className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted"
                    title={`Break ${d} down by zone`}
                  >
                    {openDiscipline === d ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    {DISCIPLINE_ICON[d]} {d}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => {
              const key = `${w.pos}-${w.week}`;
              const zones = zonesByWeek.get(key) ?? [];
              return (
                <tr key={key} className="border-b last:border-0 align-top">
                  <td className="p-2">
                    <div className="font-medium">{w.label}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(w.start).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                      })}
                    </div>
                  </td>
                  {DISCIPLINES.map((d) => {
                    const r = w.byDisc[d];
                    const plannedKm =
                      r && fmtKm(r.planned_km, r.planned_km_estimated);
                    const plannedMin = r && fmtMin(r.planned_minutes);
                    return (
                      <td key={d} className="p-2">
                        {!r ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="space-y-0.5">
                            <div className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
                              <span className="font-medium">
                                {plannedKm ?? plannedMin ?? "—"}
                              </span>
                              {plannedKm && plannedMin && (
                                <span className="text-muted-foreground">
                                  {plannedMin}
                                </span>
                              )}
                            </div>
                            {r.sessions_unmeasured > 0 && (
                              <div className="text-[11px] text-amber-600">
                                {r.sessions_unmeasured} not captured
                              </div>
                            )}
                            {openDiscipline === d && zones.length > 0 && (
                              <ul className="mt-1 space-y-0.5 border-t pt-1">
                                {zones.map((z, i) => (
                                  <li
                                    key={i}
                                    className="flex gap-2 text-[11px] text-muted-foreground"
                                  >
                                    <span className="w-7 font-medium text-foreground">
                                      {z.zone ? `Z${z.zone}` : "—"}
                                    </span>
                                    <span>
                                      {fmtKm(z.km, z.km_estimated) ??
                                        fmtMin(z.minutes) ??
                                        "—"}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            {openDiscipline === d && zones.length === 0 && (
                              <div className="mt-1 border-t pt-1 text-[11px] text-muted-foreground">
                                no zones set
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <p className="text-[11px] text-muted-foreground">
        Planned volume, from what the plan states. &ldquo;est.&rdquo; is
        distance implied by a pace you prescribed on a time-based piece —
        nothing is estimated from an assumed speed, so where no pace is set the
        time is shown and the distance left out. Logged volume is not shown:
        athletes record one total per session with no zone split, so it cannot
        be compared against the zone breakdown below.
      </p>
    </div>
  );
}
