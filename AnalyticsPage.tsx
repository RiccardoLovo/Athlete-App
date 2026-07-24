import { useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceArea, Legend,
} from "recharts";
import { ArrowLeft, Download, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const CATEGORIES = ["Resistance", "Cardio", "Mobility", "Plyometric", "Activation"] as const;

type Range = "4w" | "8w" | "12w" | "all";
const RANGE_DAYS: Record<Range, number | null> = { "4w": 28, "8w": 56, "12w": 84, all: null };

type Row = {
  date: string;            // ISO date (yyyy-mm-dd)
  exerciseId: string;
  exerciseName: string;
  category: string;        // category enum from exercise
  discipline: string;
  weightKg: number;        // actual if logged else prescribed
  sets: number;
  reps: number;
  workoutLogId: string;
  borg: number;
};

function parseNum(s: string | null | undefined): number {
  if (!s) return 0;
  const m = String(s).match(/[\d.]+/);
  return m ? parseFloat(m[0]) : 0;
}

function toCsv(rows: Record<string, any>[]): string {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const esc = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
}

function downloadCsv(name: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function linearRegression(points: { x: number; y: number }[]) {
  const n = points.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of points) { sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y; }
  const denom = n * sxx - sx * sx;
  if (!denom) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

export function AnalyticsPage() {
  const { clientId } = useParams({ from: "/_authenticated/analytics/$clientId" });
  const [range, setRange] = useState<Range>("8w");
  const [tab, setTab] = useState("overview");

  const { data: client } = useQuery({
    queryKey: ["client", clientId],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name").eq("id", clientId).single();
      return data;
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["analytics-rows", clientId],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("workout_logs")
        .select(`
          id, submitted_at, borg_scale,
          exercise_logs(
            weight_done, reps_done,
            session_exercises(
              sets, reps, load_value, load_mode, exercise_id,
              exercises(id, name_en, category, discipline)
            )
          )
        `)
        .eq("client_id", clientId)
        .order("submitted_at", { ascending: true });
      if (error) throw error;
      const out: Row[] = [];
      for (const w of (data ?? []) as any[]) {
        const date = String(w.submitted_at).slice(0, 10);
        for (const el of w.exercise_logs ?? []) {
          const se = el.session_exercises;
          if (!se?.exercises) continue;
          const actual = parseNum(el.weight_done);
          const prescribed = se.load_mode === "kg" && typeof se.load_value === "number" ? se.load_value : 0;
          const weight = actual > 0 ? actual : prescribed;
          if (weight <= 0) continue;
          const reps = parseNum(el.reps_done) || parseNum(se.reps);
          const sets = parseNum(se.sets) || 1;
          out.push({
            date,
            exerciseId: se.exercises.id,
            exerciseName: se.exercises.name_en,
            category: se.exercises.category ?? "",
            discipline: se.exercises.discipline ?? "",
            weightKg: weight,
            sets, reps,
            workoutLogId: w.id,
            borg: w.borg_scale ?? 0,
          });
        }
      }
      return out;
    },
  });

  const cutoff = useMemo(() => {
    const days = RANGE_DAYS[range];
    if (!days) return null;
    const d = new Date(); d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }, [range]);

  const filtered = useMemo(
    () => (cutoff ? rows.filter((r) => r.date >= cutoff) : rows),
    [rows, cutoff],
  );

  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-auto">
      <div className="mx-auto max-w-[1200px] p-6">
        <div className="mb-4 flex items-center gap-3">
          <Link to="/clients"><Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" />Clients</Button></Link>
          <h1 className="text-2xl font-bold">Progress — {client?.name ?? "…"}</h1>
          <div className="ml-auto">
            <Select value={range} onValueChange={(v) => setRange(v as Range)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="4w">Last 4 weeks</SelectItem>
                <SelectItem value="8w">Last 8 weeks</SelectItem>
                <SelectItem value="12w">Last 12 weeks</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <p className="py-12 text-center text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">
            No completed workout data yet. Once the athlete logs feedback for sessions, progress will appear here.
          </Card>
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="weight">Weight Progression</TabsTrigger>
              <TabsTrigger value="borg">Borg / RPE</TabsTrigger>
              <TabsTrigger value="volume">Training Volume</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4">
              <OverviewTab rows={filtered} />
            </TabsContent>
            <TabsContent value="weight" className="mt-4">
              <WeightTab rows={filtered} />
            </TabsContent>
            <TabsContent value="borg" className="mt-4">
              <BorgTab rows={filtered} />
            </TabsContent>
            <TabsContent value="volume" className="mt-4">
              <VolumeTab rows={filtered} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

/* ─── Overview ─────────────────────────────────────────────────────────────── */
function OverviewTab({ rows }: { rows: Row[] }) {
  const stats = useMemo(() => {
    const workouts = new Set(rows.map((r) => r.workoutLogId));
    const borgVals = Array.from(workouts).map((id) => rows.find((r) => r.workoutLogId === id)!.borg).filter((b) => b > 0);
    const avgBorg = borgVals.length ? borgVals.reduce((a, b) => a + b, 0) / borgVals.length : 0;

    // most improved exercise
    const byEx = new Map<string, Row[]>();
    for (const r of rows) {
      if (!byEx.has(r.exerciseId)) byEx.set(r.exerciseId, []);
      byEx.get(r.exerciseId)!.push(r);
    }
    let best: { name: string; pct: number } | null = null;
    for (const [, list] of byEx) {
      if (list.length < 2) continue;
      const first = list[0].weightKg;
      const last = list[list.length - 1].weightKg;
      if (first <= 0) continue;
      const pct = ((last - first) / first) * 100;
      if (!best || pct > best.pct) best = { name: list[0].exerciseName, pct };
    }

    // training frequency
    const dates = Array.from(new Set(rows.map((r) => r.date))).sort();
    let freq = 0;
    if (dates.length >= 2) {
      const span = (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / (1000 * 60 * 60 * 24);
      freq = span > 0 ? (dates.length / span) * 7 : dates.length;
    } else freq = dates.length;

    // sparkline data
    const dateMap = new Map<string, { volume: number; borgs: number[] }>();
    for (const r of rows) {
      const e = dateMap.get(r.date) ?? { volume: 0, borgs: [] };
      e.volume += r.sets * r.reps * r.weightKg;
      if (r.borg > 0) e.borgs.push(r.borg);
      dateMap.set(r.date, e);
    }
    const series = Array.from(dateMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([d, v]) => ({
      date: d,
      volume: Math.round(v.volume),
      borg: v.borgs.length ? v.borgs.reduce((a, b) => a + b, 0) / v.borgs.length : null,
    }));

    return { sessions: workouts.size, avgBorg, best, freq, series };
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Sessions completed" value={String(stats.sessions)} />
        <StatCard label="Avg Borg" value={stats.avgBorg ? stats.avgBorg.toFixed(1) : "—"} />
        <StatCard label="Most improved" value={stats.best ? `${stats.best.name}` : "—"} sub={stats.best ? `${stats.best.pct >= 0 ? "+" : ""}${stats.best.pct.toFixed(0)}%` : undefined} />
        <StatCard label="Sessions / week" value={stats.freq ? stats.freq.toFixed(1) : "—"} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Volume trend</div>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={stats.series}>
              <Line type="monotone" dataKey="volume" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              <XAxis dataKey="date" hide /><YAxis hide />
              <Tooltip />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-4">
          <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Borg trend</div>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={stats.series}>
              <Line type="monotone" dataKey="borg" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} connectNulls />
              <XAxis dataKey="date" hide /><YAxis domain={[0, 10]} hide />
              <Tooltip />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

/* ─── Weight Progression ────────────────────────────────────────────────────── */
function WeightTab({ rows }: { rows: Row[] }) {
  const [category, setCategory] = useState<string>("all");
  const [exerciseId, setExerciseId] = useState<string>("top5");

  const catFiltered = useMemo(
    () => category === "all" ? rows : rows.filter((r) => r.category === category),
    [rows, category],
  );

  const exerciseOptions = useMemo(() => {
    const m = new Map<string, { id: string; name: string; count: number }>();
    for (const r of catFiltered) {
      const e = m.get(r.exerciseId) ?? { id: r.exerciseId, name: r.exerciseName, count: 0 };
      e.count++; m.set(r.exerciseId, e);
    }
    return Array.from(m.values()).sort((a, b) => b.count - a.count);
  }, [catFiltered]);

  const selectedIds = useMemo(() => {
    if (exerciseId === "top5") return exerciseOptions.slice(0, 5).map((e) => e.id);
    return [exerciseId];
  }, [exerciseId, exerciseOptions]);

  const { chartData, palette } = useMemo(() => {
    const palette = ["hsl(var(--primary))", "hsl(var(--chart-2, 220 70% 50%))", "hsl(var(--chart-3, 25 90% 55%))", "hsl(var(--chart-4, 280 65% 60%))", "hsl(var(--chart-5, 340 75% 55%))"];
    const dataByDate = new Map<string, any>();
    for (const r of catFiltered) {
      if (!selectedIds.includes(r.exerciseId)) continue;
      const row = dataByDate.get(r.date) ?? { date: r.date };
      row[r.exerciseId] = r.weightKg;
      row[`${r.exerciseId}__meta`] = `${r.sets}×${r.reps}`;
      dataByDate.set(r.date, row);
    }
    const chartData = Array.from(dataByDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    for (const id of selectedIds) {
      const pts = chartData
        .map((d, i) => ({ x: i, y: d[id] }))
        .filter((p) => typeof p.y === "number");
      const reg = linearRegression(pts);
      if (reg) chartData.forEach((d, i) => { d[`${id}__trend`] = reg.slope * i + reg.intercept; });
    }
    return { chartData, palette };
  }, [catFiltered, selectedIds]);

  const exNameById = useMemo(() => {
    const m = new Map<string, string>();
    catFiltered.forEach((r) => m.set(r.exerciseId, r.exerciseName));
    return m;
  }, [catFiltered]);

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={exerciseId} onValueChange={setExerciseId}>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="top5">Top 5 most-used exercises</SelectItem>
            {exerciseOptions.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => {
          const csv = toCsv(catFiltered.filter((r) => selectedIds.includes(r.exerciseId)).map((r) => ({
            date: r.date, exercise: r.exerciseName, weight_kg: r.weightKg, sets: r.sets, reps: r.reps,
          })));
          downloadCsv(`weight-progression.csv`, csv);
        }}>
          <Download className="mr-1 h-4 w-4" /> CSV
        </Button>
      </div>
      {chartData.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">No data for this selection.</p>
      ) : (
        <ResponsiveContainer width="100%" height={380}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} label={{ value: "kg", angle: -90, position: "insideLeft", fill: "hsl(var(--muted-foreground))" }} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", color: "hsl(var(--popover-foreground))" }}
              formatter={(value: any, key: any, item: any) => {
                const id = String(key).replace("__trend", "");
                const name = exNameById.get(id) ?? id;
                if (String(key).endsWith("__trend")) return [`${Number(value).toFixed(1)} kg`, `${name} (trend)`];
                const meta = item?.payload?.[`${id}__meta`];
                return [`${value} kg${meta ? ` · ${meta}` : ""}`, name];
              }}
            />
            <Legend formatter={(v: string) => exNameById.get(v.replace("__trend", "")) ?? v} />
            {selectedIds.map((id, idx) => (
              <Line key={id} type="monotone" dataKey={id} name={id} stroke={palette[idx % palette.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
            ))}
            {selectedIds.map((id, idx) => (
              <Line key={`${id}-trend`} type="monotone" dataKey={`${id}__trend`} stroke={palette[idx % palette.length]} strokeDasharray="5 5" strokeWidth={1} dot={false} legendType="none" />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

/* ─── Borg / RPE ────────────────────────────────────────────────────────────── */
function BorgTab({ rows }: { rows: Row[] }) {
  const data = useMemo(() => {
    const m = new Map<string, { date: string; borg: number }>();
    for (const r of rows) {
      if (!r.borg) continue;
      m.set(r.workoutLogId, { date: r.date, borg: r.borg });
    }
    return Array.from(m.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [rows]);

  const warn = useMemo(() => {
    if (data.length < 3) return false;
    return data.slice(-3).every((d) => d.borg >= 8);
  }, [data]);

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        {warn && (
          <Badge className="bg-red-600 text-white">
            <AlertTriangle className="mr-1 h-3 w-3" /> High perceived exertion — consider adjusting load
          </Badge>
        )}
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => {
          downloadCsv("borg.csv", toCsv(data));
        }}>
          <Download className="mr-1 h-4 w-4" /> CSV
        </Button>
      </div>
      {data.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">No Borg data yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={380}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <YAxis domain={[0, 10]} ticks={[0, 2, 5, 8, 10]} stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <ReferenceArea y1={0} y2={2} fill="rgb(16 185 129)" fillOpacity={0.08} />
            <ReferenceArea y1={2} y2={5} fill="rgb(234 179 8)" fillOpacity={0.08} />
            <ReferenceArea y1={5} y2={8} fill="rgb(249 115 22)" fillOpacity={0.10} />
            <ReferenceArea y1={8} y2={10} fill="rgb(220 38 38)" fillOpacity={0.12} />
            <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", color: "hsl(var(--popover-foreground))" }} />
            <Line type="monotone" dataKey="borg" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

/* ─── Volume ────────────────────────────────────────────────────────────────── */
function VolumeTab({ rows }: { rows: Row[] }) {
  const [category, setCategory] = useState<string>("all");

  const filtered = useMemo(
    () => category === "all" ? rows : rows.filter((r) => r.category.includes(category)),
    [rows, category],
  );

  const data = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) {
      const v = r.sets * r.reps * r.weightKg;
      m.set(r.date, (m.get(r.date) ?? 0) + v);
    }
    const arr = Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, volume]) => ({
      date, volume: Math.round(volume),
    }));
    // rolling 4-session avg
    const out = arr.map((d, i) => {
      const slice = arr.slice(Math.max(0, i - 3), i + 1);
      const avg = slice.reduce((s, x) => s + x.volume, 0) / slice.length;
      return { ...d, avg: Math.round(avg) };
    });
    return out;
  }, [filtered]);

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => downloadCsv("volume.csv", toCsv(data))}>
          <Download className="mr-1 h-4 w-4" /> CSV
        </Button>
      </div>
      {data.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">No volume data yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={380}>
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} label={{ value: "kg", angle: -90, position: "insideLeft", fill: "hsl(var(--muted-foreground))" }} />
            <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", color: "hsl(var(--popover-foreground))" }} />
            <Legend />
            <Bar dataKey="volume" name="Volume per session" fill="hsl(var(--primary))" opacity={0.7} />
            <Line type="monotone" dataKey="avg" name="4-session avg" stroke="hsl(var(--foreground))" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
