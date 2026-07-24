import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type Exercise = { id: string; name_en: string; discipline: string };
type Rm = { id: string; exercise_id: string; value_kg: number; tested_date: string; created_at: string };

export function OneRmDialog({
  clientId, clientName, onClose,
}: { clientId: string; clientName: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pickerExId, setPickerExId] = useState<string>("");
  const [pickerValue, setPickerValue] = useState("");
  const [pickerDate, setPickerDate] = useState(new Date().toISOString().slice(0, 10));

  const { data: exercises = [] } = useQuery({
    queryKey: ["exercises-1rm"],
    queryFn: async () => {
      const { data } = await supabase
        .from("exercises")
        .select("id, name_en, discipline")
        .eq("discipline", "Strength")
        .order("name_en");
      return (data ?? []) as Exercise[];
    },
  });

  const { data: rms = [] } = useQuery({
    queryKey: ["one-rms", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("client_exercise_1rm")
        .select("id, exercise_id, value_kg, tested_date, created_at")
        .eq("client_id", clientId)
        .order("tested_date", { ascending: false });
      return (data ?? []) as Rm[];
    },
  });

  // Group by exercise; latest first.
  const byExercise = useMemo(() => {
    const m = new Map<string, Rm[]>();
    for (const r of rms) {
      if (!m.has(r.exercise_id)) m.set(r.exercise_id, []);
      m.get(r.exercise_id)!.push(r);
    }
    return m;
  }, [rms]);

  const exById = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const tracked = useMemo(() => {
    const ids = Array.from(byExercise.keys());
    return ids
      .map((id) => ({ ex: exById.get(id), entries: byExercise.get(id)! }))
      .filter((r) => r.ex)
      .sort((a, b) => a.ex!.name_en.localeCompare(b.ex!.name_en));
  }, [byExercise, exById]);

  async function addEntry() {
    if (!pickerExId) return toast.error("Pick an exercise");
    const value = parseFloat(pickerValue);
    if (!value || value <= 0) return toast.error("Enter a valid weight in kg");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("client_exercise_1rm").insert({
      coach_id: u.user.id, client_id: clientId, exercise_id: pickerExId,
      value_kg: value, tested_date: pickerDate,
    });
    if (error) return toast.error(error.message);
    toast.success("1RM saved");
    setPickerExId(""); setPickerValue("");
    qc.invalidateQueries({ queryKey: ["one-rms", clientId] });
  }

  async function deleteEntry(id: string) {
    if (!confirm("Delete this 1RM entry?")) return;
    const { error } = await supabase.from("client_exercise_1rm").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["one-rms", clientId] });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>1RM Dashboard — {clientName}</DialogTitle>
        </DialogHeader>

        <div className="rounded border bg-muted/40 p-3">
          <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Add 1RM</div>
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-6 space-y-1">
              <Label className="text-xs">Exercise</Label>
              <Select value={pickerExId} onValueChange={setPickerExId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select gym exercise…" /></SelectTrigger>
                <SelectContent>
                  {exercises.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name_en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-3 space-y-1">
              <Label className="text-xs">Value (kg)</Label>
              <Input className="h-9" inputMode="decimal" value={pickerValue} onChange={(e) => setPickerValue(e.target.value)} placeholder="120" />
            </div>
            <div className="col-span-3 space-y-1">
              <Label className="text-xs">Tested date</Label>
              <Input className="h-9" type="date" value={pickerDate} onChange={(e) => setPickerDate(e.target.value)} />
            </div>
          </div>
          <div className="mt-2 flex justify-end">
            <Button size="sm" onClick={addEntry}><Plus className="mr-1 h-4 w-4" /> Save</Button>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Current 1RMs</div>
          {tracked.length === 0 && (
            <p className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
              No 1RM values recorded yet. Add one above to enable % 1RM prescriptions.
            </p>
          )}
          {tracked.map(({ ex, entries }) => {
            const latest = entries[0];
            const isOpen = expanded === ex!.id;
            return (
              <div key={ex!.id} className="rounded border bg-card">
                <div className="flex items-center gap-2 p-3">
                  <div className="flex-1">
                    <div className="font-medium">{ex!.name_en}</div>
                    <div className="text-xs text-muted-foreground">
                      Latest: <b>{latest.value_kg}kg</b> · {latest.tested_date}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setExpanded(isOpen ? null : ex!.id)}>
                    <History className="mr-1 h-3.5 w-3.5" /> {entries.length} entr{entries.length === 1 ? "y" : "ies"}
                  </Button>
                </div>
                {isOpen && (
                  <div className="border-t bg-muted/30 px-3 py-2">
                    <table className="w-full text-xs">
                      <thead className="text-muted-foreground">
                        <tr><th className="py-1 text-left">Tested</th><th className="py-1 text-left">Value</th><th className="py-1"></th></tr>
                      </thead>
                      <tbody>
                        {entries.map((r) => (
                          <tr key={r.id} className="border-t border-border/50">
                            <td className="py-1">{r.tested_date}</td>
                            <td className="py-1 font-medium">{r.value_kg} kg</td>
                            <td className="py-1 text-right">
                              <button onClick={() => deleteEntry(r.id)}>
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter><Button variant="outline" onClick={onClose}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}