import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ZONE_LABELS, type ZoneNumber } from "@/lib/coachdesk/zones";
import { zoneText } from "@/lib/coachdesk/zoneColors";

export type OwnHrZone = {
  zone: number;
  min_bpm: number;
  max_bpm: number;
};

export function hrZonesKey(clientId: string | null | undefined) {
  return ["client-hr-zones", clientId ?? "none"] as const;
}

/**
 * The athlete's own heart-rate zones, as their watch reports them.
 * Preferred over anything derived from a threshold, so this is the first
 * thing consulted wherever a band is shown.
 */
export function useOwnHrZones(clientId: string | null | undefined) {
  return useQuery({
    queryKey: hrZonesKey(clientId),
    enabled: !!clientId,
    queryFn: async () => {
      const { data } = await supabase
        .from("client_hr_zones")
        .select("zone, min_bpm, max_bpm")
        .eq("client_id", clientId!)
        .is("discipline", null)
        .order("zone");
      return (data ?? []) as OwnHrZone[];
    },
  });
}

const ZONES: ZoneNumber[] = [1, 2, 3, 4, 5];

/**
 * Enter the five bands straight from a watch. Saved as given — no
 * rounding, no percentage model in between — because the whole point is
 * that the app and the device agree mid-session.
 */
export function HrZonesEditor({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const { data: saved = [] } = useOwnHrZones(clientId);
  const [rows, setRows] = useState<
    Record<number, { min: string; max: string }>
  >({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next: Record<number, { min: string; max: string }> = {};
    for (const z of ZONES) {
      const hit = saved.find((s) => s.zone === z);
      next[z] = {
        min: hit ? String(hit.min_bpm) : "",
        max: hit ? String(hit.max_bpm) : "",
      };
    }
    setRows(next);
  }, [saved]);

  async function save() {
    const filled = ZONES.map((z) => ({
      zone: z,
      min: Number(rows[z]?.min),
      max: Number(rows[z]?.max),
    })).filter(
      (r) => Number.isFinite(r.min) && Number.isFinite(r.max) && r.min > 0,
    );

    if (!filled.length) return toast.error("Enter at least one zone");
    const bad = filled.find((r) => r.max < r.min);
    if (bad) return toast.error(`Zone ${bad.zone}: upper is below lower`);

    // The row belongs to the athlete's coach whoever is typing it, now
    // that athletes enter their own zones.
    const { data: c } = await supabase
      .from("clients")
      .select("coach_id")
      .eq("id", clientId)
      .maybeSingle();
    if (!c) return toast.error("Could not find this athlete");

    setSaving(true);
    // Replace the set rather than merge: a watch gives all five at once,
    // and a half-updated set is worse than either version of it.
    const { error: delErr } = await supabase
      .from("client_hr_zones")
      .delete()
      .eq("client_id", clientId)
      .is("discipline", null);
    if (delErr) {
      setSaving(false);
      return toast.error(delErr.message);
    }
    const { error } = await supabase.from("client_hr_zones").insert(
      filled.map((r) => ({
        coach_id: c.coach_id,
        client_id: clientId,
        discipline: null,
        zone: r.zone,
        min_bpm: Math.round(r.min),
        max_bpm: Math.round(r.max),
        source: "entered in app",
      })),
    );
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Heart-rate zones saved");
    qc.invalidateQueries({ queryKey: hrZonesKey(clientId) });
  }

  async function clearAll() {
    if (!confirm("Remove these zones and fall back to LTHR?")) return;
    const { error } = await supabase
      .from("client_hr_zones")
      .delete()
      .eq("client_id", clientId)
      .is("discipline", null);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: hrZonesKey(clientId) });
  }

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.09em] text-muted-foreground">
        Own heart-rate zones
      </div>
      <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
        Straight from the athlete's watch, in beats. Used exactly as entered and
        in preference to anything worked out from LTHR, so the app and the
        device never disagree mid-session.
      </p>

      <div className="space-y-1.5">
        {ZONES.map((z) => (
          <div key={z} className="flex items-center gap-2">
            <span
              className={`w-24 shrink-0 font-mono text-[11px] ${zoneText(z)}`}
            >
              Z{z} {ZONE_LABELS[z]}
            </span>
            <Input
              className="h-9 w-20"
              inputMode="numeric"
              placeholder="min"
              value={rows[z]?.min ?? ""}
              onChange={(e) =>
                setRows((r) => ({
                  ...r,
                  [z]: { min: e.target.value, max: r[z]?.max ?? "" },
                }))
              }
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              className="h-9 w-20"
              inputMode="numeric"
              placeholder="max"
              value={rows[z]?.max ?? ""}
              onChange={(e) =>
                setRows((r) => ({
                  ...r,
                  [z]: { min: r[z]?.min ?? "", max: e.target.value },
                }))
              }
            />
            <span className="font-mono text-[10px] text-muted-foreground">
              bpm
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save zones"}
        </Button>
        {saved.length > 0 && (
          <Button size="sm" variant="ghost" onClick={clearAll}>
            Clear
          </Button>
        )}
        {saved.length > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {saved.length} of 5 set — these override LTHR
          </span>
        )}
      </div>
    </div>
  );
}
