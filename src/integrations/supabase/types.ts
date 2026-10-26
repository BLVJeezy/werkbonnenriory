export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          created_at: string
          hourly_rate: number
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          hourly_rate?: number
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          hourly_rate?: number
          id?: string
          name?: string
        }
        Relationships: []
      }
      app_user_connections: {
        Row: {
          connection_key_ciphertext: string
          connector_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_key_ciphertext: string
          connector_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_key_ciphertext?: string
          connector_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      materials: {
        Row: {
          created_at: string
          id: string
          name: string
          product_id: string | null
          quantity: number
          unit: string
          unit_price: number
          work_order_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          product_id?: string | null
          quantity?: number
          unit?: string
          unit_price?: number
          work_order_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          product_id?: string | null
          quantity?: number
          unit?: string
          unit_price?: number
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "materials_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          id: string
          name: string
          price: number
          unit: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          price?: number
          unit?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          price?: number
          unit?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          base_address: string
          id: number
          km_rate: number
        }
        Insert: {
          base_address?: string
          id?: number
          km_rate?: number
        }
        Update: {
          base_address?: string
          id?: number
          km_rate?: number
        }
        Relationships: []
      }
      technicians: {
        Row: {
          can_payment: boolean
          color: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          show_contact: boolean
          show_prices: boolean
          show_signed: boolean
          user_id: string | null
        }
        Insert: {
          can_payment?: boolean
          color?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          show_contact?: boolean
          show_prices?: boolean
          show_signed?: boolean
          user_id?: string | null
        }
        Update: {
          can_payment?: boolean
          color?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          show_contact?: boolean
          show_prices?: boolean
          show_signed?: boolean
          user_id?: string | null
        }
        Relationships: []
      }
      time_entries: {
        Row: {
          ended_at: string | null
          id: string
          started_at: string
          work_order_id: string
        }
        Insert: {
          ended_at?: string | null
          id?: string
          started_at?: string
          work_order_id: string
        }
        Update: {
          ended_at?: string | null
          id?: string
          started_at?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      work_order_photos: {
        Row: {
          created_at: string
          id: string
          path: string
          work_order_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          path: string
          work_order_id: string
        }
        Update: {
          created_at?: string
          id?: string
          path?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_photos_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      work_orders: {
        Row: {
          activity_id: string | null
          address: string | null
          city: string | null
          created_at: string
          customer_name: string
          description: string | null
          distance_km: number | null
          email: string | null
          house_number: string | null
          id: string
          number: number
          paid_amount: number | null
          paid_at: string | null
          paid_method: string | null
          phone: string | null
          postal_code: string | null
          received_at: string | null
          scheduled_date: string | null
          signature: string | null
          signed_at: string | null
          signed_name: string | null
          sort_order: number
          source_message_id: string | null
          source_subject: string | null
          status: string
          street: string | null
          technician_id: string | null
          vat_rate: number
          warranty: boolean
        }
        Insert: {
          activity_id?: string | null
          address?: string | null
          city?: string | null
          created_at?: string
          customer_name?: string
          description?: string | null
          distance_km?: number | null
          email?: string | null
          house_number?: string | null
          id?: string
          number?: number
          paid_amount?: number | null
          paid_at?: string | null
          paid_method?: string | null
          phone?: string | null
          postal_code?: string | null
          received_at?: string | null
          scheduled_date?: string | null
          signature?: string | null
          signed_at?: string | null
          signed_name?: string | null
          sort_order?: number
          source_message_id?: string | null
          source_subject?: string | null
          status?: string
          street?: string | null
          technician_id?: string | null
          vat_rate?: number
          warranty?: boolean
        }
        Update: {
          activity_id?: string | null
          address?: string | null
          city?: string | null
          created_at?: string
          customer_name?: string
          description?: string | null
          distance_km?: number | null
          email?: string | null
          house_number?: string | null
          id?: string
          number?: number
          paid_amount?: number | null
          paid_at?: string | null
          paid_method?: string | null
          phone?: string | null
          postal_code?: string | null
          received_at?: string | null
          scheduled_date?: string | null
          signature?: string | null
          signed_at?: string | null
          signed_name?: string | null
          sort_order?: number
          source_message_id?: string | null
          source_subject?: string | null
          status?: string
          street?: string | null
          technician_id?: string | null
          vat_rate?: number
          warranty?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      my_crew_sees_signed: { Args: never; Returns: boolean }
      my_technician_id: { Args: never; Returns: string }
    }
    Enums: {
      app_role: "admin" | "technician"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "technician"],
    },
  },
} as const
