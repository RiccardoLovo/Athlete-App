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
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      client_attachments: {
        Row: {
          client_id: string;
          coach_id: string;
          created_at: string;
          file_name: string;
          file_size: number;
          id: string;
          mime_type: string;
          storage_path: string;
          uploaded_by: string;
          workout_log_id: string | null;
        };
        Insert: {
          client_id: string;
          coach_id: string;
          created_at?: string;
          file_name: string;
          file_size: number;
          id?: string;
          mime_type: string;
          storage_path: string;
          uploaded_by: string;
          workout_log_id?: string | null;
        };
        Update: {
          client_id?: string;
          coach_id?: string;
          created_at?: string;
          file_name?: string;
          file_size?: number;
          id?: string;
          mime_type?: string;
          storage_path?: string;
          uploaded_by?: string;
          workout_log_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "client_attachments_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "client_attachments_workout_log_id_fkey";
            columns: ["workout_log_id"];
            isOneToOne: false;
            referencedRelation: "workout_logs";
            referencedColumns: ["id"];
          },
        ];
      };
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
      client_threshold_tests: {
        Row: {
          client_id: string;
          coach_id: string;
          created_at: string;
          id: string;
          metric: string;
          tested_date: string;
          value: number;
        };
        Insert: {
          client_id: string;
          coach_id: string;
          created_at?: string;
          id?: string;
          metric: string;
          tested_date?: string;
          value: number;
        };
        Update: {
          client_id?: string;
          coach_id?: string;
          created_at?: string;
          id?: string;
          metric?: string;
          tested_date?: string;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: "client_threshold_tests_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      client_weight_logs: {
        Row: {
          client_id: string;
          coach_id: string;
          created_at: string;
          id: string;
          logged_at: string;
          value_kg: number;
        };
        Insert: {
          client_id: string;
          coach_id: string;
          created_at?: string;
          id?: string;
          logged_at?: string;
          value_kg: number;
        };
        Update: {
          client_id?: string;
          coach_id?: string;
          created_at?: string;
          id?: string;
          logged_at?: string;
          value_kg?: number;
        };
        Relationships: [
          {
            foreignKeyName: "client_weight_logs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      clients: {
        Row: {
          avatar_path: string | null;
          coach_id: string;
          created_at: string;
          email: string;
          goal: string;
          height_cm: number | null;
          id: string;
          name: string;
          notes: string;
          sport: string;
          start_date: string;
          status: string;
          user_id: string | null;
        };
        Insert: {
          avatar_path?: string | null;
          coach_id: string;
          created_at?: string;
          email?: string;
          goal?: string;
          height_cm?: number | null;
          id?: string;
          name: string;
          notes?: string;
          sport?: string;
          start_date?: string;
          status?: string;
          user_id?: string | null;
        };
        Update: {
          avatar_path?: string | null;
          coach_id?: string;
          created_at?: string;
          email?: string;
          goal?: string;
          height_cm?: number | null;
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
      exercise_annotation_flags: {
        Row: {
          created_at: string;
          exercise_id: string;
          field: string;
          id: string;
          kind: string;
          note: string;
        };
        Insert: {
          created_at?: string;
          exercise_id: string;
          field: string;
          id?: string;
          kind: string;
          note: string;
        };
        Update: {
          created_at?: string;
          exercise_id?: string;
          field?: string;
          id?: string;
          kind?: string;
          note?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exercise_annotation_flags_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          },
        ];
      };
      exercise_annotations: {
        Row: {
          admissible_intents: string[];
          agonists: string[];
          block: string;
          created_at: string;
          cues: string[];
          dose_window: string;
          equip_tier: string;
          equipment: string[];
          exercise_id: string;
          family: string;
          ground_contact: string | null;
          joint_actions: string[];
          length_bias: string | null;
          modifiers: string[];
          movement_pattern: string;
          per_side: boolean;
          plane: string;
          position_note: string;
          resistance_note: string | null;
          skill_level: string;
          space_required: string | null;
          ssc: string;
          stabilizers: string[];
          stance: string;
          stress_achilles: string;
          stress_axial: string;
          stress_elbow: string;
          stress_flexion: string;
          stress_impact: string;
          stress_knee: string;
          stress_landing: string;
          stress_shoulder: string;
          synergists: string[];
          updated_at: string;
          velocity: string | null;
          video_source: string | null;
          video_verified_at: string | null;
        };
        Insert: {
          admissible_intents?: string[];
          agonists?: string[];
          block: string;
          created_at?: string;
          cues?: string[];
          dose_window: string;
          equip_tier: string;
          equipment?: string[];
          exercise_id: string;
          family: string;
          ground_contact?: string | null;
          joint_actions?: string[];
          length_bias?: string | null;
          modifiers?: string[];
          movement_pattern: string;
          per_side?: boolean;
          plane: string;
          position_note: string;
          resistance_note?: string | null;
          skill_level: string;
          space_required?: string | null;
          ssc: string;
          stabilizers?: string[];
          stance: string;
          stress_achilles: string;
          stress_axial: string;
          stress_elbow: string;
          stress_flexion: string;
          stress_impact: string;
          stress_knee: string;
          stress_landing: string;
          stress_shoulder: string;
          synergists?: string[];
          updated_at?: string;
          velocity?: string | null;
          video_source?: string | null;
          video_verified_at?: string | null;
        };
        Update: {
          admissible_intents?: string[];
          agonists?: string[];
          block?: string;
          created_at?: string;
          cues?: string[];
          dose_window?: string;
          equip_tier?: string;
          equipment?: string[];
          exercise_id?: string;
          family?: string;
          ground_contact?: string | null;
          joint_actions?: string[];
          length_bias?: string | null;
          modifiers?: string[];
          movement_pattern?: string;
          per_side?: boolean;
          plane?: string;
          position_note?: string;
          resistance_note?: string | null;
          skill_level?: string;
          space_required?: string | null;
          ssc?: string;
          stabilizers?: string[];
          stance?: string;
          stress_achilles?: string;
          stress_axial?: string;
          stress_elbow?: string;
          stress_flexion?: string;
          stress_impact?: string;
          stress_knee?: string;
          stress_landing?: string;
          stress_shoulder?: string;
          synergists?: string[];
          updated_at?: string;
          velocity?: string | null;
          video_source?: string | null;
          video_verified_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "exercise_annotations_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: true;
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          },
        ];
      };
      exercise_logs: {
        Row: {
          created_at: string;
          distance_km: number | null;
          duration_min: number | null;
          id: string;
          notes: string;
          pace: string | null;
          reps_done: string;
          session_exercise_id: string;
          sets_json: Json | null;
          swap_note: string | null;
          swap_reason: string | null;
          swapped_to_exercise_id: string | null;
          weight_done: string;
          workout_log_id: string;
        };
        Insert: {
          created_at?: string;
          distance_km?: number | null;
          duration_min?: number | null;
          id?: string;
          notes?: string;
          pace?: string | null;
          reps_done?: string;
          session_exercise_id: string;
          sets_json?: Json | null;
          swap_note?: string | null;
          swap_reason?: string | null;
          swapped_to_exercise_id?: string | null;
          weight_done?: string;
          workout_log_id: string;
        };
        Update: {
          created_at?: string;
          distance_km?: number | null;
          duration_min?: number | null;
          id?: string;
          notes?: string;
          pace?: string | null;
          reps_done?: string;
          session_exercise_id?: string;
          sets_json?: Json | null;
          swap_note?: string | null;
          swap_reason?: string | null;
          swapped_to_exercise_id?: string | null;
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
            foreignKeyName: "exercise_logs_swapped_to_exercise_id_fkey";
            columns: ["swapped_to_exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercises";
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
      exercise_swaps: {
        Row: {
          changed_text: string;
          created_at: string;
          dose_text: string;
          from_exercise_id: string;
          id: string;
          reason: string;
          same_text: string;
          to_exercise_id: string;
        };
        Insert: {
          changed_text: string;
          created_at?: string;
          dose_text: string;
          from_exercise_id: string;
          id?: string;
          reason: string;
          same_text: string;
          to_exercise_id: string;
        };
        Update: {
          changed_text?: string;
          created_at?: string;
          dose_text?: string;
          from_exercise_id?: string;
          id?: string;
          reason?: string;
          same_text?: string;
          to_exercise_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exercise_swaps_from_exercise_id_fkey";
            columns: ["from_exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exercise_swaps_to_exercise_id_fkey";
            columns: ["to_exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          },
        ];
      };
      exercises: {
        Row: {
          added_by_athlete: boolean;
          bank_id: string | null;
          body_region: string | null;
          category: string;
          created_at: string;
          created_by: string | null;
          description_en: string | null;
          description_it: string | null;
          discipline: string;
          id: string;
          is_global: boolean;
          is_structured_container: boolean;
          muscle_group: string | null;
          name_en: string;
          name_it: string;
          reviewed_by_coach: boolean;
          sport_tag: string | null;
          stroke_default: string | null;
          structure_type: string;
          template_defaults: Json | null;
          template_type: string | null;
          updated_at: string;
          video_url: string | null;
        };
        Insert: {
          added_by_athlete?: boolean;
          bank_id?: string | null;
          body_region?: string | null;
          category: string;
          created_at?: string;
          created_by?: string | null;
          description_en?: string | null;
          description_it?: string | null;
          discipline: string;
          id?: string;
          is_global?: boolean;
          is_structured_container?: boolean;
          muscle_group?: string | null;
          name_en: string;
          name_it: string;
          reviewed_by_coach?: boolean;
          sport_tag?: string | null;
          stroke_default?: string | null;
          structure_type?: string;
          template_defaults?: Json | null;
          template_type?: string | null;
          updated_at?: string;
          video_url?: string | null;
        };
        Update: {
          added_by_athlete?: boolean;
          bank_id?: string | null;
          body_region?: string | null;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          description_en?: string | null;
          description_it?: string | null;
          discipline?: string;
          id?: string;
          is_global?: boolean;
          is_structured_container?: boolean;
          muscle_group?: string | null;
          name_en?: string;
          name_it?: string;
          reviewed_by_coach?: boolean;
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
          rest_mode: string;
          rest_ratio: number | null;
          rest_seconds: number | null;
          rest_type: string | null;
          session_exercise_id: string;
          stroke: string | null;
          target_unit: string;
          target_value: number | null;
          updated_at: string;
          watts: number | null;
          workout_block_id: string | null;
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
          rest_mode?: string;
          rest_ratio?: number | null;
          rest_seconds?: number | null;
          rest_type?: string | null;
          session_exercise_id: string;
          stroke?: string | null;
          target_unit?: string;
          target_value?: number | null;
          updated_at?: string;
          watts?: number | null;
          workout_block_id?: string | null;
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
          rest_mode?: string;
          rest_ratio?: number | null;
          rest_seconds?: number | null;
          rest_type?: string | null;
          session_exercise_id?: string;
          stroke?: string | null;
          target_unit?: string;
          target_value?: number | null;
          updated_at?: string;
          watts?: number | null;
          workout_block_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "prescription_intervals_session_exercise_id_fkey";
            columns: ["session_exercise_id"];
            isOneToOne: false;
            referencedRelation: "session_exercises";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prescription_intervals_workout_block_id_fkey";
            columns: ["workout_block_id"];
            isOneToOne: false;
            referencedRelation: "workout_blocks";
            referencedColumns: ["id"];
          },
        ];
      };
      session_exercises: {
        Row: {
          added_by_client: boolean;
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
          tags: string[];
          target_mode: string | null;
          template_generated_at: string | null;
          tempo: string | null;
        };
        Insert: {
          added_by_client?: boolean;
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
          tags?: string[];
          target_mode?: string | null;
          template_generated_at?: string | null;
          tempo?: string | null;
        };
        Update: {
          added_by_client?: boolean;
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
          tags?: string[];
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
          discipline: string | null;
          distance_meters: number | null;
          duration_minutes: number | null;
          id: string;
          intensity: string | null;
          is_client_added: boolean;
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
          discipline?: string | null;
          distance_meters?: number | null;
          duration_minutes?: number | null;
          id?: string;
          intensity?: string | null;
          is_client_added?: boolean;
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
          discipline?: string | null;
          distance_meters?: number | null;
          duration_minutes?: number | null;
          id?: string;
          intensity?: string | null;
          is_client_added?: boolean;
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
      workout_blocks: {
        Row: {
          block_type: string;
          created_at: string;
          distance_km: number | null;
          double_peak: boolean | null;
          duration_min: number | null;
          id: string;
          intensity_mode: string;
          interval_count: number | null;
          label: string | null;
          notes: string | null;
          order_index: number;
          pace: string | null;
          pct_threshold: number | null;
          rest_mode: string;
          rest_ratio: number | null;
          rest_seconds: number | null;
          session_exercise_id: string;
          target_mode: string | null;
          target_unit: string | null;
          zone: number | null;
        };
        Insert: {
          block_type: string;
          created_at?: string;
          distance_km?: number | null;
          double_peak?: boolean | null;
          duration_min?: number | null;
          id?: string;
          intensity_mode?: string;
          interval_count?: number | null;
          label?: string | null;
          notes?: string | null;
          order_index: number;
          pace?: string | null;
          pct_threshold?: number | null;
          rest_mode?: string;
          rest_ratio?: number | null;
          rest_seconds?: number | null;
          session_exercise_id: string;
          target_mode?: string | null;
          target_unit?: string | null;
          zone?: number | null;
        };
        Update: {
          block_type?: string;
          created_at?: string;
          distance_km?: number | null;
          double_peak?: boolean | null;
          duration_min?: number | null;
          id?: string;
          intensity_mode?: string;
          interval_count?: number | null;
          label?: string | null;
          notes?: string | null;
          order_index?: number;
          pace?: string | null;
          pct_threshold?: number | null;
          rest_mode?: string;
          rest_ratio?: number | null;
          rest_seconds?: number | null;
          session_exercise_id?: string;
          target_mode?: string | null;
          target_unit?: string | null;
          zone?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "workout_blocks_session_exercise_id_fkey";
            columns: ["session_exercise_id"];
            isOneToOne: false;
            referencedRelation: "session_exercises";
            referencedColumns: ["id"];
          },
        ];
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
      v_planned_volume: {
        Row: {
          block_id: string | null;
          discipline: string | null;
          km_direct: number | null;
          km_estimated: number | null;
          minutes: number | null;
          session_exercise_id: string | null;
          week_number: number | null;
          zone: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      athlete_owns_session_exercise: {
        Args: { _se_id: string };
        Returns: boolean;
      };
      can_manage_session_exercise: {
        Args: { _se_id: string };
        Returns: boolean;
      };
      can_view_session_exercise: { Args: { _se_id: string }; Returns: boolean };
      coach_owns_session_exercise: {
        Args: { _se_id: string };
        Returns: boolean;
      };
      copy_week: {
        Args: {
          _source_block_id: string;
          _source_week: number;
          _target_block_id: string;
          _target_week: number;
        };
        Returns: undefined;
      };
      dearmor: { Args: { "": string }; Returns: string };
      gen_random_uuid: { Args: never; Returns: string };
      gen_salt: { Args: { "": string }; Returns: string };
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
      parse_pace_seconds: { Args: { _pace: string }; Returns: number };
      pgp_armor_headers: {
        Args: { "": string };
        Returns: Record<string, unknown>[];
      };
      plan_end_date: { Args: { _plan_id: string }; Returns: string };
      stress_rank: { Args: { _level: string }; Returns: number };
      suggest_exercise_swaps: {
        Args: { _exercise_id: string; _reason: string };
        Returns: {
          changed_text: string;
          dose_text: string;
          equip_tier: string;
          exercise_id: string;
          name: string;
          same_text: string;
          skill_level: string;
          tier: string;
          video_url: string;
        }[];
      };
      weekly_volume: {
        Args: { _client_id: string };
        Returns: {
          actual_km: number;
          actual_minutes: number;
          block_id: string;
          block_name: string;
          block_position: number;
          discipline: string;
          plan_id: string;
          plan_name: string;
          planned_km: number;
          planned_km_estimated: number;
          planned_minutes: number;
          sessions_total: number;
          sessions_unmeasured: number;
          week_number: number;
          week_start: string;
        }[];
      };
      weekly_volume_by_zone: {
        Args: { _client_id: string; _discipline: string };
        Returns: {
          block_id: string;
          block_position: number;
          km: number;
          km_estimated: number;
          minutes: number;
          week_number: number;
          zone: number;
        }[];
      };
      zone_of: {
        Args: { _hr_zone: number; _intensity: string };
        Returns: number;
      };
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
