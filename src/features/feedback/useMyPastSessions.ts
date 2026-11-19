import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  addDays,
  parseISODate,
  toISODate,
  scheduledBlocks,
} from "@/lib/coachdesk/periodization";
import type { PlanSession } from "./feedback.types";
import { isMissed } from "@/lib/coachdesk/adherence";

// Shared by MyFeedback (the full list) and the Navbar badge (just a count) —
// same query key, so React Query serves both from one fetch/cache instead
// of hitting Supabase twice.
export function useMyClientForFeedback(enabled = true) {
  return useQuery({
    queryKey: ["my-client-for-feedback"],
    enabled,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase
        .from("clients")
        .select("id, name, coach_id, adherence_from")
        .eq("user_id", u.user.id)
        .maybeSingle();
      return data as {
        id: string;
        name: string;
        coach_id: string;
        adherence_from: string | null;
      } | null;
    },
  });
}

export function useMyPastSessions(clientId: string | undefined) {
  return useQuery({
    queryKey: ["my-past-sessions", clientId],
    enabled: !!clientId,
    queryFn: async (): Promise<PlanSession[]> => {
      const { data: plans } = await supabase
        .from("training_plans")
        .select(
          "id, start_date, status, training_blocks(id, name, position, weeks, archived)",
        )
        .eq("athlete_id", clientId!);
      const rows: PlanSession[] = [];
      for (const plan of (plans ?? []) as any[]) {
        const blocks = (plan.training_blocks ?? []) as {
          id: string;
          name: string;
          position: number;
          weeks: number;
          archived?: boolean | null;
        }[];
        if (!blocks.length) continue;
        const blockIds = blocks.map((b) => b.id);
        const { data: sess } = await supabase
          .from("sessions")
          .select(
            "id, name, day_of_week, week_number, block_id, status, is_optional, is_client_added, discipline, intensity, duration_minutes, distance_meters",
          )
          .in("block_id", blockIds)
          .eq("status", "active");
        const sList = (sess ?? []) as any[];
        if (!sList.length) continue;
        const sIds = sList.map((s) => s.id);
        const [{ data: exs }, { data: logs }] = await Promise.all([
          supabase
            .from("session_exercises")
            .select("session_id, exercises(discipline, category)")
            .in("session_id", sIds),
          supabase
            .from("workout_logs")
            .select(
              "id, session_id, borg_scale, overall_notes, submitted_at, performed_at, status",
            )
            .eq("client_id", clientId!)
            .in("session_id", sIds),
        ]);
        const counts = new Map<string, number>();
        const typesMap = new Map<string, Set<string>>();
        for (const e of (exs ?? []) as any[]) {
          counts.set(e.session_id, (counts.get(e.session_id) ?? 0) + 1);
          const disc = e.exercises?.discipline as string | undefined;
          const cat = e.exercises?.category as string | undefined;
          const t = disc && disc !== "General" ? disc : cat;
          if (t) {
            if (!typesMap.has(e.session_id))
              typesMap.set(e.session_id, new Set());
            typesMap.get(e.session_id)!.add(t);
          }
        }
        const logMap = new Map<string, any>();
        for (const l of (logs ?? []) as any[]) logMap.set(l.session_id, l);

        // Block offsets in days from plan.start_date
        const offsets = new Map<string, number>();
        let cum = 0;
        // Archived blocks occupy no calendar time, so they neither get an
        // offset nor push the blocks after them along. A session inside
        // one has no planned date and is skipped below.
        for (const b of scheduledBlocks(blocks)) {
          offsets.set(b.id, cum);
          cum += b.weeks * 7;
        }

        for (const s of sList) {
          const c = counts.get(s.id) ?? 0;
          if (c === 0 && !s.is_client_added) continue;
          const blk = blocks.find((b) => b.id === s.block_id);
          if (!blk) continue;
          // An archived block has no offset because it has no dates. The
          // `?? 0` fallback below would otherwise hand its sessions the
          // plan's own start date and file months of parked work under
          // week one.
          const blockOffset = offsets.get(s.block_id);
          if (blockOffset === undefined) continue;
          const off =
            blockOffset + (s.week_number - 1) * 7 + (s.day_of_week - 1);
          const planned = toISODate(
            addDays(parseISODate(plan.start_date), off),
          );
          let types = Array.from(typesMap.get(s.id) ?? []);
          // Drop "Mobility" unless the session is exclusively mobility
          if (types.length > 1) {
            types = types.filter((t) => t.toLowerCase() !== "mobility");
          }
          rows.push({
            id: s.id,
            name: s.name,
            day_of_week: s.day_of_week,
            week_number: s.week_number,
            block_id: s.block_id,
            block_name: blk.name,
            block_position: blk.position,
            planned_date: planned,
            ex_count: c,
            types,
            is_optional: !!s.is_optional,
            is_client_added: s.is_client_added,
            discipline: s.discipline,
            intensity: s.intensity,
            duration_minutes: s.duration_minutes,
            distance_meters: s.distance_meters,
            log: logMap.get(s.id),
          });
        }
      }
      return rows;
    },
  });
}

// Sessions due (planned today or earlier) with no workout_log yet.
/**
 * The number on the athlete's Feedback tab.
 *
 * This was the third place in the app counting the same idea and the only
 * one still doing it by hand: `planned_date <= today && !log`. That
 * counts an optional session the athlete chose to skip, counts a session
 * they started and saved but never finished as done, and — the reason it
 * showed 94 — ignores the adherence line entirely, so a restructured plan
 * went on billing the athlete for months nobody intended to train.
 *
 * It now asks isMissed, like the coach's badge and the athlete's rings.
 */
export function useMyUnloggedCount(enabled = true) {
  const { data: client } = useMyClientForFeedback(enabled);
  const { data: sessions = [] } = useMyPastSessions(client?.id);
  const todayISO = toISODate(new Date());
  const finished = new Set(
    sessions.filter((s) => s.log && s.log.status !== "draft").map((s) => s.id),
  );
  return sessions.filter((s) =>
    isMissed(
      {
        id: s.id,
        planned_date: s.planned_date,
        is_optional: s.is_optional,
      },
      { finished, todayISO, adherenceFrom: client?.adherence_from },
    ),
  ).length;
}
