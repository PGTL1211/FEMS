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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      departments: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      fabrication_materials: {
        Row: {
          created_at: string
          fabrication_id: string
          id: string
          material_id: string
          required_qty_per_product: number
          total_quantity: number
        }
        Insert: {
          created_at?: string
          fabrication_id: string
          id?: string
          material_id: string
          required_qty_per_product: number
          total_quantity: number
        }
        Update: {
          created_at?: string
          fabrication_id?: string
          id?: string
          material_id?: string
          required_qty_per_product?: number
          total_quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "fabrication_materials_fabrication_id_fkey"
            columns: ["fabrication_id"]
            isOneToOne: false
            referencedRelation: "fabrications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrication_materials_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "inventory_view"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "fabrication_materials_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
        ]
      }
      fabrications: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string | null
          fab_date: string
          id: string
          product_id: string
          product_quantity: number
          remarks: string | null
          supervisor_name: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          fab_date: string
          id?: string
          product_id: string
          product_quantity: number
          remarks?: string | null
          supervisor_name?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          fab_date?: string
          id?: string
          product_id?: string
          product_quantity?: number
          remarks?: string | null
          supervisor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fabrications_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          id: string
          minimum_stock: number
          name: string
          uom: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          id?: string
          minimum_stock?: number
          name: string
          uom: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          minimum_stock?: number
          name?: string
          uom?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      purchase_invoices: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          invoice_date: string
          invoice_number: string
          invoice_url: string | null
          po_id: string
          received_quantity: number
          remarks: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_date: string
          invoice_number: string
          invoice_url?: string | null
          po_id: string
          received_quantity: number
          remarks?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          invoice_url?: string | null
          po_id?: string
          received_quantity?: number
          remarks?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoices_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "po_summary_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          material_id: string
          po_date: string
          po_number: string
          po_quantity: number
          remarks: string | null
          supplier_name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          material_id: string
          po_date: string
          po_number: string
          po_quantity: number
          remarks?: string | null
          supplier_name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          material_id?: string
          po_date?: string
          po_number?: string
          po_quantity?: number
          remarks?: string | null
          supplier_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "inventory_view"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "purchase_orders_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
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
    }
    Views: {
      inventory_view: {
        Row: {
          code: string | null
          current_stock: number | null
          material_id: string | null
          minimum_stock: number | null
          name: string | null
          status: string | null
          total_consumed: number | null
          total_purchased: number | null
          uom: string | null
        }
        Relationships: []
      }
      po_summary_view: {
        Row: {
          created_at: string | null
          id: string | null
          material_id: string | null
          material_name: string | null
          pending_quantity: number | null
          po_date: string | null
          po_number: string | null
          po_quantity: number | null
          received_quantity: number | null
          supplier_name: string | null
          uom: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "inventory_view"
            referencedColumns: ["material_id"]
          },
          {
            foreignKeyName: "purchase_orders_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
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
      app_role: "it_admin" | "hod" | "operator"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["it_admin", "hod", "operator"],
    },
  },
} as const
