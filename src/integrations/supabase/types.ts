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
      collection_jobs: {
        Row: {
          attempts: number
          claimed_by: string | null
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: number
          locked_at: string | null
          priority: number
          product_offer_id: string
          result: Json
          scheduled_at: string
          started_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          claimed_by?: string | null
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: number
          locked_at?: string | null
          priority?: number
          product_offer_id: string
          result?: Json
          scheduled_at?: string
          started_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          claimed_by?: string | null
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: number
          locked_at?: string | null
          priority?: number
          product_offer_id?: string
          result?: Json
          scheduled_at?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_jobs_product_offer_id_fkey"
            columns: ["product_offer_id"]
            isOneToOne: false
            referencedRelation: "product_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      collector_logs: {
        Row: {
          created_at: string
          event: string
          id: number
          level: string
          message: string | null
          metadata: Json
          product_offer_id: string | null
          source: string | null
        }
        Insert: {
          created_at?: string
          event: string
          id?: number
          level?: string
          message?: string | null
          metadata?: Json
          product_offer_id?: string | null
          source?: string | null
        }
        Update: {
          created_at?: string
          event?: string
          id?: number
          level?: string
          message?: string | null
          metadata?: Json
          product_offer_id?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collector_logs_product_offer_id_fkey"
            columns: ["product_offer_id"]
            isOneToOne: false
            referencedRelation: "product_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          description: string | null
          discount_type: string | null
          discount_value: number | null
          expires_at: string | null
          id: string
          last_verified_at: string | null
          minimum_purchase: number | null
          store_id: string | null
          verified: boolean
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          discount_type?: string | null
          discount_value?: number | null
          expires_at?: string | null
          id?: string
          last_verified_at?: string | null
          minimum_purchase?: number | null
          store_id?: string | null
          verified?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          discount_type?: string | null
          discount_value?: number | null
          expires_at?: string | null
          id?: string
          last_verified_at?: string | null
          minimum_purchase?: number | null
          store_id?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "coupons_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_scores: {
        Row: {
          avg_30d: number | null
          avg_40d: number | null
          avg_7d: number | null
          avg_90d: number | null
          calculated_at: string
          classification: string
          confidence: number
          id: number
          is_new_low: boolean
          is_new_low_90d: boolean
          low_40d: number | null
          low_90d: number | null
          median_40d: number | null
          percent_below_avg: number | null
          previous_change_percent: number | null
          previous_price: number | null
          product_offer_id: string
          reasons: Json
          sample_count: number
          score: number
        }
        Insert: {
          avg_30d?: number | null
          avg_40d?: number | null
          avg_7d?: number | null
          avg_90d?: number | null
          calculated_at?: string
          classification: string
          confidence?: number
          id?: number
          is_new_low?: boolean
          is_new_low_90d?: boolean
          low_40d?: number | null
          low_90d?: number | null
          median_40d?: number | null
          percent_below_avg?: number | null
          previous_change_percent?: number | null
          previous_price?: number | null
          product_offer_id: string
          reasons?: Json
          sample_count?: number
          score: number
        }
        Update: {
          avg_30d?: number | null
          avg_40d?: number | null
          avg_7d?: number | null
          avg_90d?: number | null
          calculated_at?: string
          classification?: string
          confidence?: number
          id?: number
          is_new_low?: boolean
          is_new_low_90d?: boolean
          low_40d?: number | null
          low_90d?: number | null
          median_40d?: number | null
          percent_below_avg?: number | null
          previous_change_percent?: number | null
          previous_price?: number | null
          product_offer_id?: string
          reasons?: Json
          sample_count?: number
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "offer_scores_product_offer_id_fkey"
            columns: ["product_offer_id"]
            isOneToOne: false
            referencedRelation: "product_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      price_history: {
        Row: {
          collected_at: string
          id: number
          in_stock: boolean
          price: number
          product_offer_id: string
          shipping_price: number
        }
        Insert: {
          collected_at?: string
          id?: number
          in_stock?: boolean
          price: number
          product_offer_id: string
          shipping_price?: number
        }
        Update: {
          collected_at?: string
          id?: number
          in_stock?: boolean
          price?: number
          product_offer_id?: string
          shipping_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_history_product_offer_id_fkey"
            columns: ["product_offer_id"]
            isOneToOne: false
            referencedRelation: "product_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_offers: {
        Row: {
          active: boolean
          affiliate_url: string | null
          collection_interval_minutes: number
          collector_config: Json
          collector_enabled: boolean
          collector_kind: string
          coupon_id: string | null
          current_price: number | null
          id: string
          in_stock: boolean
          installments: string | null
          last_checked_at: string | null
          last_collection_error: string | null
          last_collection_status: string | null
          next_check_at: string | null
          original_price: number | null
          product_id: string
          shipping_price: number
          store_id: string
          url: string
        }
        Insert: {
          active?: boolean
          affiliate_url?: string | null
          collection_interval_minutes?: number
          collector_config?: Json
          collector_enabled?: boolean
          collector_kind?: string
          coupon_id?: string | null
          current_price?: number | null
          id?: string
          in_stock?: boolean
          installments?: string | null
          last_checked_at?: string | null
          last_collection_error?: string | null
          last_collection_status?: string | null
          next_check_at?: string | null
          original_price?: number | null
          product_id: string
          shipping_price?: number
          store_id: string
          url: string
        }
        Update: {
          active?: boolean
          affiliate_url?: string | null
          collection_interval_minutes?: number
          collector_config?: Json
          collector_enabled?: boolean
          collector_kind?: string
          coupon_id?: string | null
          current_price?: number | null
          id?: string
          in_stock?: boolean
          installments?: string | null
          last_checked_at?: string | null
          last_collection_error?: string | null
          last_collection_status?: string | null
          next_check_at?: string | null
          original_price?: number | null
          product_id?: string
          shipping_price?: number
          store_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_offers_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_offers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_offers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          brand: string | null
          category: string | null
          created_at: string
          ean: string | null
          id: string
          image_url: string | null
          model: string | null
          name: string
          popularity_score: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          brand?: string | null
          category?: string | null
          created_at?: string
          ean?: string | null
          id?: string
          image_url?: string | null
          model?: string | null
          name: string
          popularity_score?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          brand?: string | null
          category?: string | null
          created_at?: string
          ean?: string | null
          id?: string
          image_url?: string | null
          model?: string | null
          name?: string
          popularity_score?: number
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      stores: {
        Row: {
          active: boolean
          affiliate_template: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          slug: string
          trust_score: number
          updated_at: string
          website: string | null
        }
        Insert: {
          active?: boolean
          affiliate_template?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          trust_score?: number
          updated_at?: string
          website?: string | null
        }
        Update: {
          active?: boolean
          affiliate_template?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          trust_score?: number
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      telegram_channels: {
        Row: {
          active: boolean
          allowed_categories: string[]
          chat_id: string
          id: string
          min_score: number
          name: string
        }
        Insert: {
          active?: boolean
          allowed_categories?: string[]
          chat_id: string
          id?: string
          min_score?: number
          name: string
        }
        Update: {
          active?: boolean
          allowed_categories?: string[]
          chat_id?: string
          id?: string
          min_score?: number
          name?: string
        }
        Relationships: []
      }
      telegram_posts: {
        Row: {
          channel_id: string | null
          created_at: string
          error: string | null
          id: number
          payload: Json
          price: number | null
          product_offer_id: string | null
          score: number | null
          sent_at: string | null
          status: string
          telegram_message_id: string | null
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          error?: string | null
          id?: number
          payload?: Json
          price?: number | null
          product_offer_id?: string | null
          score?: number | null
          sent_at?: string | null
          status?: string
          telegram_message_id?: string | null
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          error?: string | null
          id?: number
          payload?: Json
          price?: number | null
          product_offer_id?: string | null
          score?: number | null
          sent_at?: string | null
          status?: string
          telegram_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_posts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "telegram_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_posts_product_offer_id_fkey"
            columns: ["product_offer_id"]
            isOneToOne: false
            referencedRelation: "product_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workers: {
        Row: {
          avg_duration_ms: number
          error_count: number
          id: string
          last_heartbeat: string | null
          metadata: Json
          name: string
          processed_count: number
          status: string
        }
        Insert: {
          avg_duration_ms?: number
          error_count?: number
          id?: string
          last_heartbeat?: string | null
          metadata?: Json
          name: string
          processed_count?: number
          status?: string
        }
        Update: {
          avg_duration_ms?: number
          error_count?: number
          id?: string
          last_heartbeat?: string | null
          metadata?: Json
          name?: string
          processed_count?: number
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      analyze_offer: { Args: { p_offer_id: string }; Returns: number }
      calculate_offer_score_internal: {
        Args: { p_offer_id: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin"
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
      app_role: ["admin"],
    },
  },
} as const