export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      client_exercise_1rm: {
        Row: {
          client_id: string;
          coach_id: string;
          created_at: string;
          exercise_id: string;
          id: string;
          tested_date: string;
          value_kg: number;
        };
        Insert: {
          client_id: string;
          coach_id: string;
          created_at?: string;
          exercise_id: string;
          id?: string;
          tested_date?: string;
          value_kg: number;
        };
        Update: {
          client_id?: string;
          coach_id?: string;
          created_at?: string;
          exercise_id?: string;
          id?: string;
          tested_date?: string;
          value_kg?: number;
        };
        Relationships: [
          {
            foreignKeyName: "client_exercise_1rm_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "client_exercise_1rm_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          },
        ];
      };
      client_invites: {
        Row: {
          client_id: string;
          coach_id: string;
          created_at: string;
          id: string;
          token: string;
          used_at: string | null;
          used_by: string | null;
        };
        Insert: {
          client_id: string;
          coach_id: string;
          created_at?: string;
          id?: string;
          token?: string;
          used_at?: string | null;
          used_by?: string | null;
        };
        Update: {
          client_id?: string;
          coach_id?: string;
          created_at?: string;
          id?: string;
          token?: string;
          used_at?: string | null;
          used_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "client_invites_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "client_invites_coach_id_fkey";
            columns: ["coach_id"];
            isOneToOne: false;
            referencedRelation: "coaches";
            referencedColumns: ["id"];
          },
        ];
      };
      clients: {
        Row: {
          coach_id: string;
          created_at: string;
          email: string;
          goal: string;
          id: string;
          name: string;
          notes: string;
          sport: string;
          start_date: string;
          status: string;
          user_id: string | null;
        };
        Insert: {
          coach_id: string;
          created_at?: string;
          email?: string;
          goal?: string;
          id?: string;
          name: string;
          notes?: string;
          sport?: string;
          start_date?: string;
          status?: string;
          user_id?: string | null;
        };
        Update: {
          coach_id?: string;
          created_at?: string;
          email?: string;
          goal?: string;
          id?: string;
          name?: string;
          notes?: string;
          sport?: string;
          start_date?: string;
          status?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "clients_coach_id_fkey";
            columns: ["coach_id"];
            isOneToOne: false;
            referencedRelation: "coaches";
            referencedColumns: ["id"];
          },
        ];
      };
      coaches: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          id: string;
          name: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      exercise_logs: {
        Row: {
          created_at: string;
          id: string;
          notes: string;
          reps_done: string;
          session_exercise_id: string;
          sets_json: Json | null;
          weight_done: string;
          workout_log_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          notes?: string;
          reps_done?: string;
          session_exercise_id: string;
          sets_json?: Json | null;
          weight_done?: string;
          workout_log_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          notes?: string;
          reps_done?: string;
          session_exercise_id?: string;
          sets_json?: Json | null;
          weight_done?: string;
          workout_log_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exercise_logs_session_exercise_id_fkey";
            columns: ["session_exercise_id"];
            isOneToOne: false;
            referencedRelation: "session_exercises";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exercise_logs_workout_log_id_fkey";
            columns: ["workout_log_id"];
            isOneToOne: false;
            referencedRelation: "workout_logs";
            referencedColumns: ["id"];
          },
        ];
      };
      exercises: {
        Row: {
          body_region: string | null;
          category: string;
          created_at: string;
          created_by: string | null;
          description_en: string | null;
          description_it: string | null;
          discipline: string;
          id: string;
          is_global: boolean;
          muscle_group: string | null;
          name_en: string;
          name_it: string;
          sport_tag: string | null;
          stroke_default: string | null;
          structure_type: string;
          template_defaults: Json | null;
          template_type: string | null;
          updated_at: string;
          video_url: string | null;
        };
        Insert: {
          body_region?: string | null;
          category: string;
          created_at?: string;
          created_by?: string | null;
          description_en?: string | null;
          description_it?: string | null;
          discipline: string;
          id?: string;
          is_global?: boolean;
          muscle_group?: string | null;
          name_en: string;
          name_it: string;
          sport_tag?: string | null;
          stroke_default?: string | null;
          structure_type?: string;
          template_defaults?: Json | null;
          template_type?: string | null;
          updated_at?: string;
          video_url?: string | null;
        };
        Update: {
          body_region?: string | null;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          description_en?: string | null;
          description_it?: string | null;
          discipline?: string;
          id?: string;
          is_global?: boolean;
          muscle_group?: string | null;
          name_en?: string;
          name_it?: string;
          sport_tag?: string | null;
          stroke_default?: string | null;
          structure_type?: string;
          template_defaults?: Json | null;
          template_type?: string | null;
          updated_at?: string;
          video_url?: string | null;
        };
        Relationships: [];
      };
      prescription_intervals: {
        Row: {
          cadence: number | null;
          created_at: string;
          hr_zone: number | null;
          id: string;
          intensity: string | null;
          label: string | null;
          order_index: number;
          pace_per_km: string | null;
          rest_seconds: number | null;
          rest_type: string | null;
          session_exercise_id: string;
          stroke: string | null;
          target_unit: string;
          target_value: number | null;
          updated_at: string;
          watts: number | null;
        };
        Insert: {
          cadence?: number | null;
          created_at?: string;
          hr_zone?: number | null;
          id?: string;
          intensity?: string | null;
          label?: string | null;
          order_index: number;
          pace_per_km?: string | null;
          rest_seconds?: number | null;
          rest_type?: string | null;
          session_exercise_id: string;
          stroke?: string | null;
          target_unit?: string;
          target_value?: number | null;
          updated_at?: string;
          watts?: number | null;
        };
        Update: {
          cadence?: number | null;
          created_at?: string;
          hr_zone?: number | null;
          id?: string;
          intensity?: string | null;
          label?: string | null;
          order_index?: number;
          pace_per_km?: string | null;
          rest_seconds?: number | null;
          rest_type?: string | null;
          session_exercise_id?: string;
          stroke?: string | null;
          target_unit?: string;
          target_value?: number | null;
          updated_at?: string;
          watts?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "prescription_intervals_session_exercise_id_fkey";
            columns: ["session_exercise_id"];
            isOneToOne: false;
            referencedRelation: "session_exercises";
            referencedColumns: ["id"];
          },
        ];
      };
      session_exercises: {
        Row: {
          created_at: string;
          distance_km: number | null;
          duration_min: number | null;
          exercise_id: string;
          group_id: string;
          group_type: string;
          hr_zone: number | null;
          id: string;
          load_mode: string | null;
          load_value: number | null;
          notes: string;
          order_index: number;
          pace: string | null;
          prescription: Json;
          reps: string;
          rest_sec: number | null;
          rpe: number | null;
          session_id: string;
          sets: number | null;
          target_mode: string | null;
          template_generated_at: string | null;
          tempo: string | null;
        };
        Insert: {
          created_at?: string;
          distance_km?: number | null;
          duration_min?: number | null;
          exercise_id: string;
          group_id?: string;
          group_type?: string;
          hr_zone?: number | null;
          id?: string;
          load_mode?: string | null;
          load_value?: number | null;
          notes?: string;
          order_index?: number;
          pace?: string | null;
          prescription?: Json;
          reps?: string;
          rest_sec?: number | null;
          rpe?: number | null;
          session_id: string;
          sets?: number | null;
          target_mode?: string | null;
          template_generated_at?: string | null;
          tempo?: string | null;
        };
        Update: {
          created_at?: string;
          distance_km?: number | null;
          duration_min?: number | null;
          exercise_id?: string;
          group_id?: string;
          group_type?: string;
          hr_zone?: number | null;
          id?: string;
          load_mode?: string | null;
          load_value?: number | null;
          notes?: string;
          order_index?: number;
          pace?: string | null;
          prescription?: Json;
          reps?: string;
          rest_sec?: number | null;
          rpe?: number | null;
          session_id?: string;
          sets?: number | null;
          target_mode?: string | null;
          template_generated_at?: string | null;
          tempo?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "session_exercises_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "session_exercises_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      sessions: {
        Row: {
          block_id: string;
          body_region: string | null;
          created_at: string;
          day_of_week: number;
          id: string;
          is_optional: boolean;
          name: string | null;
          notes: string;
          status: string;
          training_category_tags: string[];
          updated_at: string;
          week_number: number;
        };
        Insert: {
          block_id: string;
          body_region?: string | null;
          created_at?: string;
          day_of_week: number;
          id?: string;
          is_optional?: boolean;
          name?: string | null;
          notes?: string;
          status?: string;
          training_category_tags?: string[];
          updated_at?: string;
          week_number: number;
        };
        Update: {
          block_id?: string;
          body_region?: string | null;
          created_at?: string;
          day_of_week?: number;
          id?: string;
          is_optional?: boolean;
          name?: string | null;
          notes?: string;
          status?: string;
          training_category_tags?: string[];
          updated_at?: string;
          week_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sessions_block_id_fkey";
            columns: ["block_id"];
            isOneToOne: false;
            referencedRelation: "training_blocks";
            referencedColumns: ["id"];
          },
        ];
      };
      training_blocks: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          plan_id: string;
          position: number;
          updated_at: string;
          weeks: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          plan_id: string;
          position: number;
          updated_at?: string;
          weeks: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          plan_id?: string;
          position?: number;
          updated_at?: string;
          weeks?: number;
        };
        Relationships: [
          {
            foreignKeyName: "training_blocks_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "training_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      training_plans: {
        Row: {
          athlete_id: string;
          coach_id: string;
          created_at: string;
          id: string;
          name: string;
          start_date: string;
          status: Database["public"]["Enums"]["plan_status"];
          updated_at: string;
        };
        Insert: {
          athlete_id: string;
          coach_id: string;
          created_at?: string;
          id?: string;
          name: string;
          start_date: string;
          status?: Database["public"]["Enums"]["plan_status"];
          updated_at?: string;
        };
        Update: {
          athlete_id?: string;
          coach_id?: string;
          created_at?: string;
          id?: string;
          name?: string;
          start_date?: string;
          status?: Database["public"]["Enums"]["plan_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "training_plans_athlete_id_fkey";
            columns: ["athlete_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      workout_logs: {
        Row: {
          borg_scale: number;
          client_id: string;
          coach_id: string;
          id: string;
          overall_notes: string;
          performed_at: string | null;
          session_id: string;
          status: string;
          submitted_at: string;
        };
        Insert: {
          borg_scale?: number;
          client_id: string;
          coach_id: string;
          id?: string;
          overall_notes?: string;
          performed_at?: string | null;
          session_id: string;
          status?: string;
          submitted_at?: string;
        };
        Update: {
          borg_scale?: number;
          client_id?: string;
          coach_id?: string;
          id?: string;
          overall_notes?: string;
          performed_at?: string | null;
          session_id?: string;
          status?: string;
          submitted_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workout_logs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workout_logs_coach_id_fkey";
            columns: ["coach_id"];
            isOneToOne: false;
            referencedRelation: "coaches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workout_logs_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      can_manage_session_exercise: {
        Args: { _se_id: string };
        Returns: boolean;
      };
      can_view_session_exercise: { Args: { _se_id: string }; Returns: boolean };
      copy_week: {
        Args: {
          _source_block_id: string;
          _source_week: number;
          _target_block_id: string;
          _target_week: number;
        };
        Returns: undefined;
      };
      get_invite_info: {
        Args: { _token: string };
        Returns: {
          client_name: string;
          coach_name: string;
          used: boolean;
          valid: boolean;
        }[];
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      plan_end_date: { Args: { _plan_id: string }; Returns: string };
    };
    Enums: {
      app_role: "coach" | "athlete" | "admin";
      plan_status: "draft" | "active" | "completed";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["coach", "athlete", "admin"],
      plan_status: ["draft", "active", "completed"],
    },
  },
} as const;
