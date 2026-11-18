import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatSecondsToPace, parsePaceToSeconds } from "@/lib/coachdesk/zones";

export type Metric =
  | "ftp_watts"
  | "css_pace_sec_per_100m"
  | "run_threshold_pace_sec_per_km"
  | "bike_speed_kmh";

type Test = {
  id: string;
  metric: Metric;
  value: number;
  tested_date: string;
  created_at: string;
};

/**
 * The four numbers a session's targets are derived from. Each is a dated
 * measurement rather than a property of the athlete, because a threshold
 * from eight months ago produces confidently wrong paces.
 *
 * Paces are stored in seconds so they can be arithmetic; everything the
 * coach types or reads is "m:ss".
 */
const METRICS: {
  id: Metric;
  title: string;
  help: string;
  inputLabel: string;
  placeholder: string;
  pace: boolean;
  format: (v: number) => string;
}[] = [
  {
    id: "run_threshold_pace_sec_per_km",
    title: "Run threshold pace",
    help: "The fastest average pace holdable for about an hour. Choosing a zone on a run block fills the pace in from this.",
    inputLabel: "Pace (min:sec / km)",
    placeholder: "4:31",
    pace: true,
    format: (v) => `${formatSecondsToPace(v)}/km`,
  },
  {
    id: "css_pace_sec_per_100m",
    title: "Swim CSS",
    help: "Critical swim speed — the pace holdable for about 30 minutes.",
    inputLabel: "Pace (min:sec / 100m)",
    placeholder: "1:32",
    pace: true,
    format: (v) => `${formatSecondsToPace(v)}/100m`,
  },
  {
    id: "ftp_watts",
    title: "Bike FTP",
    help: "Functional threshold power — the highest average power sustainable for about an hour.",
    inputLabel: "FTP (watts)",
    placeholder: "220",
    pace: false,
    format: (v) => `${v}W`,
  },
  {
    id: "bike_speed_kmh",
    title: "Typical ride speed",
    help: "Only used to estimate how far a ride prescribed in time will go. Wind and gradient move this far more than they move a run pace, so anything derived from it is shown as an estimate.",
    inputLabel: "Speed (km/h)",
    placeholder: "25",
    pace: false,
    format: (v) => `${v} km/h`,
  },
];

export function ThresholdDialog({
  clientId,
  clientName,
  onClose,
}: {
  clientId: string;
  clientName: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Metric | null>(null);

  const { data: tests = [] } = useQuery({
    queryKey: ["threshold-tests", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("client_threshold_tests")
        .select("id, metric, value, tested_date, created_at")
        .eq("client_id", clientId)
        .order("tested_date", { ascending: false });
      return (data ?? []) as Test[];
    },
  });

  const byMetric = useMemo(() => {
    const m = new Map<Metric, Test[]>();
    for (const t of tests) {
      if (!m.has(t.metric)) m.set(t.metric, []);
      m.get(t.metric)!.push(t);
    }
    return m;
  }, [tests]);

  async function addEntry(metric: Metric, value: number, testedDate: string) {
    if (!value || value <= 0) return toast.error("Enter a valid value");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("client_threshold_tests").insert({
      coach_id: u.user.id,
      client_id: clientId,
      metric,
      value,
      tested_date: testedDate,
    });
    if (error) return toast.error(error.message);
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["threshold-tests", clientId] });
    qc.invalidateQueries({ queryKey: ["latest-threshold", clientId, metric] });
  }

  async function deleteEntry(id: string, metric: Metric) {
    if (!confirm("Delete this entry?")) return;
    const { error } = await supabase
      .from("client_threshold_tests")
      .delete()
      .eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["threshold-tests", clientId] });
    qc.invalidateQueries({ queryKey: ["latest-threshold", clientId, metric] });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-auto">
        <DialogHeader>
          <DialogTitle>Thresholds — {clientName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {METRICS.map((m) => (
            <MetricSection
              key={m.id}
              meta={m}
              tests={byMetric.get(m.id) ?? []}
              expanded={expanded === m.id}
              onToggle={() => setExpanded(expanded === m.id ? null : m.id)}
              onAdd={async (value, date) => {
                await addEntry(m.id, value, date);
              }}
              onDelete={(id) => deleteEntry(id, m.id)}
            />
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MetricSection({
  meta,
  tests,
  expanded,
  onToggle,
  onAdd,
  onDelete,
}: {
  meta: (typeof METRICS)[number];
  tests: Test[];
  expanded: boolean;
  onToggle: () => void;
  onAdd: (value: number, testedDate: string) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const [raw, setRaw] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  async function submit() {
    const value = meta.pace ? parsePaceToSeconds(raw) : Number(raw);
    if (value == null || !Number.isFinite(value) || value <= 0)
      return toast.error(
        meta.pace
          ? `Enter a pace like "${meta.placeholder}"`
          : "Enter a valid number",
      );
    await onAdd(value, date);
    setRaw("");
  }

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.09em] text-muted-foreground">
        {meta.title}
      </div>
      <p className="mb-2 mt-0.5 text-xs text-muted-foreground">{meta.help}</p>

      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-5 space-y-1">
          <Label className="text-xs">{meta.inputLabel}</Label>
          <Input
            className="h-9"
            inputMode={meta.pace ? "text" : "numeric"}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={meta.placeholder}
          />
        </div>
        <div className="col-span-5 space-y-1">
          <Label className="text-xs">Tested date</Label>
          <Input
            className="h-9"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="col-span-2 flex items-end">
          <Button size="sm" className="w-full" onClick={submit}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {tests.length > 0 && (
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Latest:{" "}
            <b className="text-foreground">{meta.format(tests[0].value)}</b> ·{" "}
            {tests[0].tested_date}
          </span>
          <Button variant="ghost" size="sm" onClick={onToggle}>
            <History className="mr-1 h-3.5 w-3.5" /> {tests.length} entr
            {tests.length === 1 ? "y" : "ies"}
          </Button>
        </div>
      )}
      {expanded && (
        <HistoryTable
          tests={tests}
          onDelete={onDelete}
          formatValue={meta.format}
        />
      )}
    </div>
  );
}

function HistoryTable({
  tests,
  onDelete,
  formatValue,
}: {
  tests: Test[];
  onDelete: (id: string) => void;
  formatValue: (v: number) => string;
}) {
  return (
    <div className="mt-2 border-t border-border/50 pt-2">
      <table className="w-full text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-1 text-left">Tested</th>
            <th className="py-1 text-left">Value</th>
            <th className="py-1"></th>
          </tr>
        </thead>
        <tbody>
          {tests.map((t) => (
            <tr key={t.id} className="border-t border-border/50">
              <td className="py-1">{t.tested_date}</td>
              <td className="py-1 font-medium">{formatValue(t.value)}</td>
              <td className="py-1 text-right">
                <button onClick={() => onDelete(t.id)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
