import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type WeightLog = { id: string; value_kg: number; logged_at: string };

/**
 * Height and weight. Weight is a series rather than a field, because it
 * moves and the trend is the interesting part — the same reason the
 * thresholds are dated tests rather than properties.
 */
export function BodyStats({
  clientId,
  coachId,
  heightCm,
}: {
  clientId: string;
  /** Rows are filed under the athlete's coach, whoever is typing. */
  coachId: string;
  heightCm: number | null;
}) {
  const qc = useQueryClient();
  const [weight, setWeight] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const { data: logs = [] } = useQuery({
    queryKey: ["my-weight-logs", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("client_weight_logs")
        .select("id, value_kg, logged_at")
        .eq("client_id", clientId)
        .order("logged_at", { ascending: false })
        .limit(20);
      return (data ?? []) as WeightLog[];
    },
  });

  async function saveHeight(raw: string) {
    const v = raw.trim() === "" ? null : Number(raw);
    if (v != null && (!Number.isFinite(v) || v <= 0))
      return toast.error("Enter a valid height");
    const { error } = await supabase
      .from("clients")
      .update({ height_cm: v })
      .eq("id", clientId);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["my-client-stats"] });
  }

  async function addWeight() {
    const v = Number(weight);
    if (!Number.isFinite(v) || v <= 0) return toast.error("Enter a weight");
    const { error } = await supabase.from("client_weight_logs").insert({
      client_id: clientId,
      coach_id: coachId,
      value_kg: v,
      // Stored as a timestamp; the picker gives a day, so take noon to
      // keep it on the chosen date in every timezone.
      logged_at: new Date(`${date}T12:00:00`).toISOString(),
    });
    if (error) return toast.error(error.message);
    setWeight("");
    qc.invalidateQueries({ queryKey: ["my-weight-logs", clientId] });
  }

  async function removeWeight(id: string) {
    const { error } = await supabase
      .from("client_weight_logs")
      .delete()
      .eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["my-weight-logs", clientId] });
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Height (cm)</Label>
          <Input
            className="h-9"
            inputMode="numeric"
            defaultValue={heightCm ?? ""}
            placeholder="180"
            onBlur={(e) => saveHeight(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Latest weight</Label>
          <div className="pt-2 text-lg font-medium tabular-nums">
            {logs[0] ? (
              <>
                {logs[0].value_kg}
                <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                  KG
                </span>
              </>
            ) : (
              <span className="text-sm font-normal text-muted-foreground">
                Not recorded
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-5 space-y-1">
          <Label className="text-xs">Add weight (kg)</Label>
          <Input
            className="h-9"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="75"
          />
        </div>
        <div className="col-span-5 space-y-1">
          <Label className="text-xs">On</Label>
          <Input
            className="h-9"
            type="date"
            value={date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="col-span-2 flex items-end">
          <Button size="sm" className="w-full" onClick={addWeight}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {logs.length > 1 && (
        <div className="border-t border-border/50 pt-2">
          <table className="w-full text-xs">
            <tbody>
              {logs.slice(0, 8).map((l) => (
                <tr key={l.id} className="border-t border-border/50">
                  <td className="py-1 text-muted-foreground">
                    {l.logged_at.slice(0, 10)}
                  </td>
                  <td className="py-1 font-medium tabular-nums">
                    {l.value_kg} kg
                  </td>
                  <td className="py-1 text-right">
                    <button onClick={() => removeWeight(l.id)}>
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
}
