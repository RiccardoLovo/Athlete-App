import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribe to realtime changes on plan/block/session/exercise tables and
 * invalidate React Query caches so multiple coaches editing the same plan
 * see each other's updates without manually refreshing.
 */
export function usePlanRealtime(planId?: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!planId) return;
    const channel = supabase
      .channel(`plan-sync-${planId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "training_plans" },
        () => {
          qc.invalidateQueries({ queryKey: ["plan", planId] });
          qc.invalidateQueries({ queryKey: ["plans"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "training_blocks" },
        () => {
          qc.invalidateQueries({ queryKey: ["plan-blocks", planId] });
          qc.invalidateQueries({ queryKey: ["block-ctx"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions" },
        () => {
          qc.invalidateQueries({ queryKey: ["block-sessions"] });
          qc.invalidateQueries({ queryKey: ["sessions"] });
          qc.invalidateQueries({ queryKey: ["session-ctx"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "session_exercises" },
        (payload) => {
          // Scope invalidation to the specific session that changed AND only
          // refetch the currently expanded list. Saving a single field on an
          // exercise must not refetch every list/count in the block — that's
          // what was causing the "page refresh" feel during edits.
          const sid =
            (payload.new as { session_id?: string } | null)?.session_id ??
            (payload.old as { session_id?: string } | null)?.session_id;
          if (sid && payload.eventType !== "UPDATE") {
            qc.invalidateQueries({
              queryKey: ["session-exs", sid],
              refetchType: "active",
            });
          }
          // Block-level count map is updated optimistically by the mutating
          // client; don't refetch it from realtime to avoid storms.
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "prescription_intervals" },
        (payload) => {
          const seId =
            (payload.new as { session_exercise_id?: string } | null)
              ?.session_exercise_id ??
            (payload.old as { session_exercise_id?: string } | null)
              ?.session_exercise_id;
          if (seId) {
            qc.invalidateQueries({
              queryKey: ["prescription-intervals", seId],
              refetchType: "active",
            });
          }
        },
      )
      .subscribe();

    // Also refetch when the tab regains focus, as a safety net if realtime drops.
    function onFocus() {
      qc.invalidateQueries({ queryKey: ["plan", planId] });
      qc.invalidateQueries({ queryKey: ["plan-blocks", planId] });
      qc.invalidateQueries({ queryKey: ["block-sessions"] });
      qc.invalidateQueries({
        queryKey: ["session-exs"],
        refetchType: "active",
      });
      qc.invalidateQueries({
        queryKey: ["block-session-ex-counts"],
        refetchType: "active",
      });
      qc.invalidateQueries({ queryKey: ["session-ctx"] });
    }
    window.addEventListener("focus", onFocus);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("focus", onFocus);
    };
  }, [planId, qc]);
}
