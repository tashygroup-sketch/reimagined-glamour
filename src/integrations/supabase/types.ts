export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string;
          image_url: string | null;
          name: string;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          image_url?: string | null;
          name: string;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          image_url?: string | null;
          name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      menu_items: {
        Row: {
          category: string;
          created_at: string;
          description: string | null;
          extra_image_ratios: number[];
          extra_images: string[];
          id: string;
          image_ratio: number | null;
          image_url: string | null;
          is_available: boolean;
          min_qty: number;
          sale_price: number | null;
          name: string;
          price: number;
          sort_order: number;
          stock: number | null;
          updated_at: string;
          variables: Json;
        };
        Insert: {
          category?: string;
          created_at?: string;
          description?: string | null;
          extra_image_ratios?: number[];
          extra_images?: string[];
          id?: string;
          image_ratio?: number | null;
          image_url?: string | null;
          is_available?: boolean;
          min_qty?: number;
          sale_price?: number | null;
          name: string;
          price?: number;
          sort_order?: number;
          stock?: number | null;
          updated_at?: string;
          variables?: Json;
        };
        Update: {
          category?: string;
          created_at?: string;
          description?: string | null;
          extra_image_ratios?: number[];
          extra_images?: string[];
          id?: string;
          image_ratio?: number | null;
          image_url?: string | null;
          is_available?: boolean;
          min_qty?: number;
          sale_price?: number | null;
          name?: string;
          price?: number;
          sort_order?: number;
          stock?: number | null;
          updated_at?: string;
          variables?: Json;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          address: string | null;
          created_at: string;
          customer_name: string;
          delivery_date: string | null;
          id: string;
          items: Json;
          location_url: string | null;
          notes: string | null;
          phone: string;
          status: string;
          total: number;
        };
        Insert: {
          address?: string | null;
          created_at?: string;
          customer_name: string;
          delivery_date?: string | null;
          id?: string;
          items?: Json;
          location_url?: string | null;
          notes?: string | null;
          phone: string;
          status?: string;
          total?: number;
        };
        Update: {
          address?: string | null;
          created_at?: string;
          customer_name?: string;
          delivery_date?: string | null;
          id?: string;
          items?: Json;
          location_url?: string | null;
          notes?: string | null;
          phone?: string;
          status?: string;
          total?: number;
        };
        Relationships: [];
      };
      product_discounts: {
        Row: {
          code: string;
          discount_price: number;
          ends_at: string | null;
          product_id: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          discount_price: number;
          ends_at?: string | null;
          product_id: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          discount_price?: number;
          ends_at?: string | null;
          product_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      product_variables: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          option_values: string[];
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          option_values?: string[];
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          option_values?: string[];
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      promotions: {
        Row: {
          created_at: string;
          id: string;
          image_url: string;
          ratio: number | null;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          image_url: string;
          ratio?: number | null;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          image_url?: string;
          ratio?: number | null;
          sort_order?: number;
        };
        Relationships: [];
      };
      site_settings: {
        Row: {
          hero_image_url: string | null;
          hero_subtitle: string | null;
          hero_title: string | null;
          id: number;
          story_label: string;
          story_text: string;
          story_title: string;
          updated_at: string;
        };
        Insert: {
          hero_image_url?: string | null;
          hero_subtitle?: string | null;
          hero_title?: string | null;
          id?: number;
          story_label?: string;
          story_text?: string;
          story_title?: string;
          updated_at?: string;
        };
        Update: {
          hero_image_url?: string | null;
          hero_subtitle?: string | null;
          hero_title?: string | null;
          id?: number;
          story_label?: string;
          story_text?: string;
          story_title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      reserve_stock: { Args: { p_items: Json }; Returns: undefined };
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

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

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
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
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
