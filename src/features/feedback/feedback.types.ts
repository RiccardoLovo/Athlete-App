export type WorkoutLog = {
  id: string;
  session_id: string;
  client_id: string;
  borg_scale: number;
  overall_notes: string;
  submitted_at: string;
  status: string;
  clients: { name: string };
  sessions: {
    day_of_week: number;
    week_number: number;
    name: string | null;
    discipline: string | null;
    duration_minutes: number | null;
    distance_meters: number | null;
    intensity: string | null;
  };
};

export type PlanSession = {
  id: string;
  name: string | null;
  day_of_week: number;
  week_number: number;
  block_id: string;
  block_name: string;
  block_position: number;
  planned_date: string; // yyyy-mm-dd
  ex_count: number;
  types: string[];
  is_client_added: boolean;
  discipline: string | null;
  intensity: string | null;
  duration_minutes: number | null;
  distance_meters: number | null;
  log?: {
    id: string;
    borg_scale: number;
    overall_notes: string;
    submitted_at: string;
    performed_at: string | null;
    status: string;
  };
};
