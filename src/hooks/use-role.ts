import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "coach" | "athlete" | "admin";

export type RoleInfo = {
  roles: AppRole[];
  isAdmin: boolean;
  isCoach: boolean;
  isAthlete: boolean;
  // Primary role for routing: admin > athlete > coach.
  primary: AppRole;
  // True when the current user is linked to a clients row (can use athlete UI
  // even if their auth role is admin/coach).
  hasClientProfile: boolean;
  clientId: string | null;
};

function deriveInfo(roles: AppRole[], clientId: string | null): RoleInfo {
  const isAdmin = roles.includes("admin");
  const isAthlete = roles.includes("athlete");
  const isCoach = roles.includes("coach") || isAdmin; // admins use the coach UI
  const primary: AppRole = isAdmin ? "admin" : isAthlete ? "athlete" : "coach";
  return {
    roles,
    isAdmin,
    isCoach,
    isAthlete,
    primary,
    hasClientProfile: !!clientId,
    clientId,
  };
}

export function useRole() {
  return useQuery({
    queryKey: ["my-role"],
    queryFn: async (): Promise<RoleInfo | null> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const [{ data: roleRows }, { data: clientRow }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", u.user.id),
        supabase
          .from("clients")
          .select("id")
          .eq("user_id", u.user.id)
          .maybeSingle(),
      ]);
      const roles = (roleRows ?? []).map((r) => r.role) as AppRole[];
      return deriveInfo(
        roles.length ? roles : ["coach"],
        clientRow?.id ?? null,
      );
    },
    staleTime: 5 * 60_000,
  });
}

export async function fetchMyRole(): Promise<RoleInfo | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const [{ data: roleRows }, { data: clientRow }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", u.user.id),
    supabase
      .from("clients")
      .select("id")
      .eq("user_id", u.user.id)
      .maybeSingle(),
  ]);
  const roles = (roleRows ?? []).map((r) => r.role) as AppRole[];
  return deriveInfo(roles.length ? roles : ["coach"], clientRow?.id ?? null);
}
