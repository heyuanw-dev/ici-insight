export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      presentation_file_uploads: {
        Row: {
          completed_at: string | null;
          created_at: string;
          expected_file_id: string | null;
          expires_at: string;
          failed_at: string | null;
          id: string;
          kind: string;
          mime_type: string;
          object_path: string;
          original_filename: string;
          presentation_id: string;
          size_bytes: number;
          uploaded_by: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          expected_file_id?: string | null;
          expires_at?: string;
          failed_at?: string | null;
          id?: string;
          kind: string;
          mime_type: string;
          object_path: string;
          original_filename: string;
          presentation_id: string;
          size_bytes: number;
          uploaded_by: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          expected_file_id?: string | null;
          expires_at?: string;
          failed_at?: string | null;
          id?: string;
          kind?: string;
          mime_type?: string;
          object_path?: string;
          original_filename?: string;
          presentation_id?: string;
          size_bytes?: number;
          uploaded_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "presentation_file_uploads_presentation_id_fkey";
            columns: ["presentation_id"];
            isOneToOne: false;
            referencedRelation: "archive_presentations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "presentation_file_uploads_presentation_id_fkey";
            columns: ["presentation_id"];
            isOneToOne: false;
            referencedRelation: "presentation_overview";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "presentation_file_uploads_presentation_id_fkey";
            columns: ["presentation_id"];
            isOneToOne: false;
            referencedRelation: "presentations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "presentation_file_uploads_presentation_id_fkey";
            columns: ["presentation_id"];
            isOneToOne: false;
            referencedRelation: "schedule_slots";
            referencedColumns: ["presentation_id"];
          },
          {
            foreignKeyName: "presentation_file_uploads_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      presentation_files: {
        Row: {
          bucket: string;
          created_at: string;
          id: string;
          kind: string;
          mime_type: string;
          object_path: string;
          original_filename: string;
          presentation_id: string;
          size_bytes: number;
          uploaded_by: string;
        };
        Insert: {
          bucket: string;
          created_at?: string;
          id?: string;
          kind: string;
          mime_type: string;
          object_path: string;
          original_filename: string;
          presentation_id: string;
          size_bytes: number;
          uploaded_by: string;
        };
        Update: {
          bucket?: string;
          created_at?: string;
          id?: string;
          kind?: string;
          mime_type?: string;
          object_path?: string;
          original_filename?: string;
          presentation_id?: string;
          size_bytes?: number;
          uploaded_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "presentation_files_presentation_id_fkey";
            columns: ["presentation_id"];
            isOneToOne: false;
            referencedRelation: "archive_presentations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "presentation_files_presentation_id_fkey";
            columns: ["presentation_id"];
            isOneToOne: false;
            referencedRelation: "presentation_overview";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "presentation_files_presentation_id_fkey";
            columns: ["presentation_id"];
            isOneToOne: false;
            referencedRelation: "presentations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "presentation_files_presentation_id_fkey";
            columns: ["presentation_id"];
            isOneToOne: false;
            referencedRelation: "schedule_slots";
            referencedColumns: ["presentation_id"];
          },
          {
            foreignKeyName: "presentation_files_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      presentation_slots: {
        Row: {
          created_at: string;
          id: string;
          is_open: boolean;
          presentation_date: string;
          slot_number: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_open?: boolean;
          presentation_date: string;
          slot_number?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_open?: boolean;
          presentation_date?: string;
          slot_number?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      presentations: {
        Row: {
          cancelled_at: string | null;
          category_id: string | null;
          created_at: string;
          deleted_at: string | null;
          description: string | null;
          id: string;
          presenter_user_id: string;
          reference_url: string | null;
          revision: number;
          slot_id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          cancelled_at?: string | null;
          category_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          presenter_user_id: string;
          reference_url?: string | null;
          revision?: number;
          slot_id: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          cancelled_at?: string | null;
          category_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          presenter_user_id?: string;
          reference_url?: string | null;
          revision?: number;
          slot_id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "presentations_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "presentations_presenter_user_id_fkey";
            columns: ["presenter_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "presentations_slot_id_fkey";
            columns: ["slot_id"];
            isOneToOne: false;
            referencedRelation: "presentation_slots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "presentations_slot_id_fkey";
            columns: ["slot_id"];
            isOneToOne: false;
            referencedRelation: "schedule_slots";
            referencedColumns: ["slot_id"];
          },
        ];
      };
      users: {
        Row: {
          auth_user_id: string | null;
          created_at: string;
          email: string;
          id: string;
          is_active: boolean;
          name: string;
          password_setup_required: boolean;
          role: string;
          updated_at: string;
        };
        Insert: {
          auth_user_id?: string | null;
          created_at?: string;
          email: string;
          id?: string;
          is_active?: boolean;
          name: string;
          password_setup_required?: boolean;
          role?: string;
          updated_at?: string;
        };
        Update: {
          auth_user_id?: string | null;
          created_at?: string;
          email?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          password_setup_required?: boolean;
          role?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      archive_presentations: {
        Row: {
          category_id: string | null;
          category_name: string | null;
          created_at: string | null;
          description: string | null;
          id: string | null;
          pdf_file_id: string | null;
          powerpoint_file_id: string | null;
          presentation_date: string | null;
          presenter_name: string | null;
          presenter_user_id: string | null;
          reference_url: string | null;
          slot_id: string | null;
          slot_number: number | null;
          status: string | null;
          title: string | null;
          updated_at: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "presentations_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "presentations_presenter_user_id_fkey";
            columns: ["presenter_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "presentations_slot_id_fkey";
            columns: ["slot_id"];
            isOneToOne: false;
            referencedRelation: "presentation_slots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "presentations_slot_id_fkey";
            columns: ["slot_id"];
            isOneToOne: false;
            referencedRelation: "schedule_slots";
            referencedColumns: ["slot_id"];
          },
        ];
      };
      presentation_overview: {
        Row: {
          category_id: string | null;
          category_name: string | null;
          created_at: string | null;
          description: string | null;
          id: string | null;
          pdf_file_id: string | null;
          powerpoint_file_id: string | null;
          presentation_date: string | null;
          presenter_name: string | null;
          presenter_user_id: string | null;
          reference_url: string | null;
          slot_id: string | null;
          slot_number: number | null;
          status: string | null;
          title: string | null;
          updated_at: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "presentations_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "presentations_presenter_user_id_fkey";
            columns: ["presenter_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "presentations_slot_id_fkey";
            columns: ["slot_id"];
            isOneToOne: false;
            referencedRelation: "presentation_slots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "presentations_slot_id_fkey";
            columns: ["slot_id"];
            isOneToOne: false;
            referencedRelation: "schedule_slots";
            referencedColumns: ["slot_id"];
          },
        ];
      };
      schedule_slots: {
        Row: {
          category_id: string | null;
          category_name: string | null;
          description: string | null;
          is_open: boolean | null;
          presentation_date: string | null;
          presentation_id: string | null;
          presenter_name: string | null;
          presenter_user_id: string | null;
          reference_url: string | null;
          slot_id: string | null;
          slot_number: number | null;
          title: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "presentations_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "presentations_presenter_user_id_fkey";
            columns: ["presenter_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      archive_filter_options: {
        Args: Record<PropertyKey, never>;
        Returns: {
          filter_type: string;
          label: string;
          value: string;
        }[];
      };
      cancel_presentation: {
        Args: { p_confirm?: boolean; p_id: string; p_revision: number };
        Returns: string;
      };
      complete_file_upload: {
        Args: { p_auth_user_id: string; p_upload_id: string };
        Returns: string;
      };
      prepare_file_upload: {
        Args: {
          p_expected_file_id?: string;
          p_filename: string;
          p_kind: string;
          p_mime_type: string;
          p_presentation_id: string;
          p_size_bytes: number;
        };
        Returns: {
          completed_at: string | null;
          created_at: string;
          expected_file_id: string | null;
          expires_at: string;
          failed_at: string | null;
          id: string;
          kind: string;
          mime_type: string;
          object_path: string;
          original_filename: string;
          presentation_id: string;
          size_bytes: number;
          uploaded_by: string;
        };
        SetofOptions: {
          from: "*";
          to: "presentation_file_uploads";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      presentation_permissions: {
        Args: { presentation_id: string };
        Returns: {
          can_edit_metadata: boolean;
          can_manage_files: boolean;
        }[];
      };
      presentation_status: {
        Args: {
          as_of?: string;
          cancelled_at: string;
          presentation_date: string;
        };
        Returns: string;
      };
      register_presentation: {
        Args: {
          p_category_id?: string;
          p_description?: string;
          p_reference_url?: string;
          p_slot_id: string;
          p_title: string;
        };
        Returns: string;
      };
      search_archive: {
        Args: {
          p_category_id?: string;
          p_date_from?: string;
          p_date_to?: string;
          p_presenter_id?: string;
          p_query?: string;
          p_year?: number;
        };
        Returns: {
          category_id: string | null;
          category_name: string | null;
          created_at: string | null;
          description: string | null;
          id: string | null;
          pdf_file_id: string | null;
          powerpoint_file_id: string | null;
          presentation_date: string | null;
          presenter_name: string | null;
          presenter_user_id: string | null;
          reference_url: string | null;
          slot_id: string | null;
          slot_number: number | null;
          status: string | null;
          title: string | null;
          updated_at: string | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "archive_presentations";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      update_presentation: {
        Args: {
          p_category_id?: string;
          p_description?: string;
          p_id: string;
          p_reference_url?: string;
          p_revision: number;
          p_slot_id: string;
          p_title: string;
        };
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
