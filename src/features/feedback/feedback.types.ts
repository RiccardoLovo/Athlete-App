export type WorkoutLog = {
  id: string;
  session_id: string;
  client_id: string;
  borg_scale: number;
  overall_notes: string;
  submitted_at: string;
  status: string;
  clients: { name: string };
  sessions: { day_of_week: number; week_number: number; name: string | null };
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
  log?: {
    id: string;
    borg_scale: number;
    overall_notes: string;
    submitted_at: string;
    performed_at: string | null;
    status: string;
  };
};
