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

type Metric = "ftp_watts" | "css_pace_sec_per_100m";
type Test = {
  id: string;
  metric: Metric;
  value: number;
  tested_date: string;
  created_at: string;
};

const METRIC_LABEL: Record<Metric, string> = {
  ftp_watts: "Bike FTP",
  css_pace_sec_per_100m: "Swim CSS",
};

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
  const [ftpValue, setFtpValue] = useState("");
  const [ftpDate, setFtpDate] = useState(new Date().toISOString().slice(0, 10));
  const [cssPace, setCssPace] = useState("");
  const [cssDate, setCssDate] = useState(new Date().toISOString().slice(0, 10));

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
  }

  async function deleteEntry(id: string) {
    if (!confirm("Delete this entry?")) return;
    const { error } = await supabase
      .from("client_threshold_tests")
      .delete()
      .eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["threshold-tests", clientId] });
  }

  const ftpTests = byMetric.get("ftp_watts") ?? [];
  const cssTests = byMetric.get("css_pace_sec_per_100m") ?? [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-auto">
        <DialogHeader>
          <DialogTitle>Thresholds — {clientName}</DialogTitle>
        </DialogHeader>

        <div className="rounded border bg-muted/40 p-3">
          <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            Bike FTP
          </div>
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-5 space-y-1">
              <Label className="text-xs">FTP (watts)</Label>
              <Input
                className="h-9"
                inputMode="numeric"
                value={ftpValue}
                onChange={(e) => setFtpValue(e.target.value)}
                placeholder="220"
              />
            </div>
            <div className="col-span-5 space-y-1">
              <Label className="text-xs">Tested date</Label>
              <Input
                className="h-9"
                type="date"
                value={ftpDate}
                onChange={(e) => setFtpDate(e.target.value)}
              />
            </div>
            <div className="col-span-2 flex items-end">
              <Button
                size="sm"
                className="w-full"
                onClick={async () => {
                  await addEntry("ftp_watts", Number(ftpValue), ftpDate);
                  setFtpValue("");
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {ftpTests.length > 0 && (
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Latest: <b className="text-foreground">{ftpTests[0].value}W</b>{" "}
                · {ftpTests[0].tested_date}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setExpanded(expanded === "ftp_watts" ? null : "ftp_watts")
                }
              >
                <History className="mr-1 h-3.5 w-3.5" /> {ftpTests.length} entr
                {ftpTests.length === 1 ? "y" : "ies"}
              </Button>
            </div>
          )}
          {expanded === "ftp_watts" && (
            <HistoryTable tests={ftpTests} onDelete={deleteEntry} unit="W" />
          )}
        </div>

        <div className="rounded border bg-muted/40 p-3">
          <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            Swim CSS (Critical Swim Speed)
          </div>
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-5 space-y-1">
              <Label className="text-xs">Pace (min:sec / 100m)</Label>
              <Input
                className="h-9"
                value={cssPace}
                onChange={(e) => setCssPace(e.target.value)}
                placeholder="1:32"
              />
            </div>
            <div className="col-span-5 space-y-1">
              <Label className="text-xs">Tested date</Label>
              <Input
                className="h-9"
                type="date"
                value={cssDate}
                onChange={(e) => setCssDate(e.target.value)}
              />
            </div>
            <div className="col-span-2 flex items-end">
              <Button
                size="sm"
                className="w-full"
                onClick={async () => {
                  const sec = parsePaceToSeconds(cssPace);
                  if (sec == null)
                    return toast.error('Enter a pace like "1:32"');
                  await addEntry("css_pace_sec_per_100m", sec, cssDate);
                  setCssPace("");
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {cssTests.length > 0 && (
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Latest:{" "}
                <b className="text-foreground">
                  {formatSecondsToPace(cssTests[0].value)}/100m
                </b>{" "}
                · {cssTests[0].tested_date}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setExpanded(
                    expanded === "css_pace_sec_per_100m"
                      ? null
                      : "css_pace_sec_per_100m",
                  )
                }
              >
                <History className="mr-1 h-3.5 w-3.5" /> {cssTests.length} entr
                {cssTests.length === 1 ? "y" : "ies"}
              </Button>
            </div>
          )}
          {expanded === "css_pace_sec_per_100m" && (
            <HistoryTable
              tests={cssTests}
              onDelete={deleteEntry}
              formatValue={(v) => `${formatSecondsToPace(v)}/100m`}
            />
          )}
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

function HistoryTable({
  tests,
  onDelete,
  unit,
  formatValue,
}: {
  tests: Test[];
  onDelete: (id: string) => void;
  unit?: string;
  formatValue?: (v: number) => string;
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
              <td className="py-1 font-medium">
                {formatValue ? formatValue(t.value) : `${t.value}${unit ?? ""}`}
              </td>
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
