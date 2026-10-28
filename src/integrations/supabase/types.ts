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
      appointment_mail_moves: {
        Row: {
          created_at: string
          immutable_message_id: string | null
          last_error: string | null
          lease_until: string | null
          moved_at: string | null
          source_message_id: string
          user_id: string | null
          work_order_id: string
        }
        Insert: {
          created_at?: string
          immutable_message_id?: string | null
          last_error?: string | null
          lease_until?: string | null
          moved_at?: string | null
          source_message_id: string
          user_id?: string | null
          work_order_id: string
        }
        Update: {
          created_at?: string
          immutable_message_id?: string | null
          last_error?: string | null
          lease_until?: string | null
          moved_at?: string | null
          source_message_id?: string
          user_id?: string | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_mail_moves_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: true
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_requests: {
        Row: {
          confirmed_at: string | null
          created_at: string
          crew_email: string
          crew_slots: Json
          crew_token: string
          customer_email: string
          customer_slots: Json
          customer_token: string
          expires_at: string
          id: string
          instruction: string
          mail_error: string | null
          mail_lock_until: string | null
          mail_pending: string | null
          mail_sent_at: string | null
          proposed_date: string | null
          status: string
          technician_id: string
          time_from: string | null
          time_until: string | null
          version: number
          work_order_id: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          crew_email: string
          crew_slots?: Json
          crew_token?: string
          customer_email: string
          customer_slots?: Json
          customer_token?: string
          expires_at?: string
          id?: string
          instruction: string
          mail_error?: string | null
          mail_lock_until?: string | null
          mail_pending?: string | null
          mail_sent_at?: string | null
          proposed_date?: string | null
          status?: string
          technician_id: string
          time_from?: string | null
          time_until?: string | null
          version?: number
          work_order_id: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          crew_email?: string
          crew_slots?: Json
          crew_token?: string
          customer_email?: string
          customer_slots?: Json
          customer_token?: string
          expires_at?: string
          id?: string
          instruction?: string
          mail_error?: string | null
          mail_lock_until?: string | null
          mail_pending?: string | null
          mail_sent_at?: string | null
          proposed_date?: string | null
          status?: string
          technician_id?: string
          time_from?: string | null
          time_until?: string | null
          version?: number
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_requests_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_requests_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: true
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          active: boolean
          activity_id: string | null
          created_at: string
          customer_id: string | null
          customer_name: string
          description: string | null
          end_date: string | null
          id: string
          invoice_amount: number | null
          invoice_every: number
          invoice_unit: string
          name: string
          next_date: string
          next_invoice_date: string | null
          number: string | null
          repeat_every: number
          repeat_unit: string
          scheduling_ready: boolean
          source_data: Json | null
          technician_id: string | null
        }
        Insert: {
          active?: boolean
          activity_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name: string
          description?: string | null
          end_date?: string | null
          id?: string
          invoice_amount?: number | null
          invoice_every?: number
          invoice_unit?: string
          name: string
          next_date: string
          next_invoice_date?: string | null
          number?: string | null
          repeat_every?: number
          repeat_unit?: string
          scheduling_ready?: boolean
          source_data?: Json | null
          technician_id?: string | null
        }
        Update: {
          active?: boolean
          activity_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          description?: string | null
          end_date?: string | null
          id?: string
          invoice_amount?: number | null
          invoice_every?: number
          invoice_unit?: string
          name?: string
          next_date?: string
          next_invoice_date?: string | null
          number?: string | null
          repeat_every?: number
          repeat_unit?: string
          scheduling_ready?: boolean
          source_data?: Json | null
          technician_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_projects: {
        Row: {
          city: string | null
          created_at: string
          customer_id: string
          description: string | null
          house_number: string | null
          id: string
          import_key: string
          name: string
          number: string | null
          postal_code: string | null
          reference: string | null
          status: string | null
          street: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          customer_id: string
          description?: string | null
          house_number?: string | null
          id?: string
          import_key: string
          name: string
          number?: string | null
          postal_code?: string | null
          reference?: string | null
          status?: string | null
          street?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          customer_id?: string
          description?: string | null
          house_number?: string | null
          id?: string
          import_key?: string
          name?: string
          number?: string | null
          postal_code?: string | null
          reference?: string | null
          status?: string | null
          street?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_projects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          billing_email: string | null
          city: string | null
          created_at: string
          customer_number: string | null
          customer_numbers: string[]
          default_vat_rate: number | null
          email: string | null
          house_number: string | null
          id: string
          identity_key: string | null
          match_key: string | null
          name: string
          phone: string | null
          postal_code: string | null
          project_name: string | null
          street: string | null
          vat_number: string | null
        }
        Insert: {
          billing_email?: string | null
          city?: string | null
          created_at?: string
          customer_number?: string | null
          customer_numbers?: string[]
          default_vat_rate?: number | null
          email?: string | null
          house_number?: string | null
          id?: string
          identity_key?: string | null
          match_key?: string | null
          name: string
          phone?: string | null
          postal_code?: string | null
          project_name?: string | null
          street?: string | null
          vat_number?: string | null
        }
        Update: {
          billing_email?: string | null
          city?: string | null
          created_at?: string
          customer_number?: string | null
          customer_numbers?: string[]
          default_vat_rate?: number | null
          email?: string | null
          house_number?: string | null
          id?: string
          identity_key?: string | null
          match_key?: string | null
          name?: string
          phone?: string | null
          postal_code?: string | null
          project_name?: string | null
          street?: string | null
          vat_number?: string | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          created_at: string
          credit_for: string | null
          customer: Json
          delivery_lock_until: string | null
          due_date: string
          id: string
          issue_date: string
          kind: string
          lines: Json
          net: number
          number: string
          okioki_sent_at: string | null
          paid_amount: number
          paid_at: string | null
          pdf_sent_at: string | null
          send_error: string | null
          sent_at: string | null
          sent_to: string | null
          sent_via: string | null
          status: string
          total: number
          vat: number
          vat_rate: number
          work_order_id: string
        }
        Insert: {
          created_at?: string
          credit_for?: string | null
          customer: Json
          delivery_lock_until?: string | null
          due_date: string
          id?: string
          issue_date?: string
          kind?: string
          lines: Json
          net: number
          number: string
          okioki_sent_at?: string | null
          paid_amount?: number
          paid_at?: string | null
          pdf_sent_at?: string | null
          send_error?: string | null
          sent_at?: string | null
          sent_to?: string | null
          sent_via?: string | null
          status?: string
          total: number
          vat: number
          vat_rate: number
          work_order_id: string
        }
        Update: {
          created_at?: string
          credit_for?: string | null
          customer?: Json
          delivery_lock_until?: string | null
          due_date?: string
          id?: string
          issue_date?: string
          kind?: string
          lines?: Json
          net?: number
          number?: string
          okioki_sent_at?: string | null
          paid_amount?: number
          paid_at?: string | null
          pdf_sent_at?: string | null
          send_error?: string | null
          sent_at?: string | null
          sent_to?: string | null
          sent_via?: string | null
          status?: string
          total?: number
          vat?: number
          vat_rate?: number
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
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
      ponto_reconciliations: {
        Row: {
          amount: number
          created_at: string
          invoice_id: string | null
          paid_at: string
          payment_ref: string | null
          purchase_invoice_id: string | null
          transaction_key: string
        }
        Insert: {
          amount: number
          created_at?: string
          invoice_id?: string | null
          paid_at: string
          payment_ref?: string | null
          purchase_invoice_id?: string | null
          transaction_key: string
        }
        Update: {
          amount?: number
          created_at?: string
          invoice_id?: string | null
          paid_at?: string
          payment_ref?: string | null
          purchase_invoice_id?: string | null
          transaction_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "ponto_reconciliations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ponto_reconciliations_purchase_invoice_id_fkey"
            columns: ["purchase_invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          admin_only: boolean
          alias: string | null
          created_at: string
          description: string
          id: string
          name: string
          price: number
          unit: string
        }
        Insert: {
          admin_only?: boolean
          alias?: string | null
          created_at?: string
          description?: string
          id?: string
          name: string
          price?: number
          unit?: string
        }
        Update: {
          admin_only?: boolean
          alias?: string | null
          created_at?: string
          description?: string
          id?: string
          name?: string
          price?: number
          unit?: string
        }
        Relationships: []
      }
      purchase_invoices: {
        Row: {
          bank_payment_ref: string | null
          bank_transaction_key: string | null
          created_at: string
          due_date: string | null
          email_message_id: string | null
          id: string
          invoice_date: string | null
          invoice_number: string | null
          kind: string
          lines: Json
          net: number
          paid_at: string | null
          payment_file_at: string | null
          payment_method: string
          payment_ref: string | null
          pdf_path: string | null
          simpla_bill_id: number | null
          source: string
          status: string
          supplier_iban: string | null
          supplier_id: string | null
          supplier_name: string
          supplier_vat: string | null
          supplier_vat_rule: string
          total: number
          upload_hash: string | null
          vat: number
          vat_deductible_percent: number
        }
        Insert: {
          bank_payment_ref?: string | null
          bank_transaction_key?: string | null
          created_at?: string
          due_date?: string | null
          email_message_id?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          kind?: string
          lines?: Json
          net?: number
          paid_at?: string | null
          payment_file_at?: string | null
          payment_method?: string
          payment_ref?: string | null
          pdf_path?: string | null
          simpla_bill_id?: number | null
          source?: string
          status?: string
          supplier_iban?: string | null
          supplier_id?: string | null
          supplier_name?: string
          supplier_vat?: string | null
          supplier_vat_rule?: string
          total?: number
          upload_hash?: string | null
          vat?: number
          vat_deductible_percent?: number
        }
        Update: {
          bank_payment_ref?: string | null
          bank_transaction_key?: string | null
          created_at?: string
          due_date?: string | null
          email_message_id?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          kind?: string
          lines?: Json
          net?: number
          paid_at?: string | null
          payment_file_at?: string | null
          payment_method?: string
          payment_ref?: string | null
          pdf_path?: string | null
          simpla_bill_id?: number | null
          source?: string
          status?: string
          supplier_iban?: string | null
          supplier_id?: string | null
          supplier_name?: string
          supplier_vat?: string | null
          supplier_vat_rule?: string
          total?: number
          upload_hash?: string | null
          vat?: number
          vat_deductible_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          created_at: string
          customer: Json
          id: string
          intro: string | null
          lines: Json
          net: number
          number: string
          sent_at: string | null
          signature: string | null
          signed_at: string | null
          signed_name: string | null
          source_work_order_id: string | null
          status: string
          token: string
          total: number
          vat: number
          vat_rate: number
          work_order_id: string | null
        }
        Insert: {
          created_at?: string
          customer: Json
          id?: string
          intro?: string | null
          lines: Json
          net: number
          number: string
          sent_at?: string | null
          signature?: string | null
          signed_at?: string | null
          signed_name?: string | null
          source_work_order_id?: string | null
          status?: string
          token?: string
          total: number
          vat: number
          vat_rate?: number
          work_order_id?: string | null
        }
        Update: {
          created_at?: string
          customer?: Json
          id?: string
          intro?: string | null
          lines?: Json
          net?: number
          number?: string
          sent_at?: string | null
          signature?: string | null
          signed_at?: string | null
          signed_name?: string | null
          source_work_order_id?: string | null
          status?: string
          token?: string
          total?: number
          vat?: number
          vat_rate?: number
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_source_work_order_id_fkey"
            columns: ["source_work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          accountant_email: string
          base_address: string
          company_bic: string | null
          company_iban: string | null
          company_name: string
          company_vat: string
          id: number
          invoice_prefix: string
          km_rate: number
          next_invoice_number: number
          next_quote_number: number
          payment_days: number
          ponto_client_ciphertext: string | null
          ponto_last_sync: string | null
          terms_text: string | null
        }
        Insert: {
          accountant_email?: string
          base_address?: string
          company_bic?: string | null
          company_iban?: string | null
          company_name?: string
          company_vat?: string
          id?: number
          invoice_prefix?: string
          km_rate?: number
          next_invoice_number?: number
          next_quote_number?: number
          payment_days?: number
          ponto_client_ciphertext?: string | null
          ponto_last_sync?: string | null
          terms_text?: string | null
        }
        Update: {
          accountant_email?: string
          base_address?: string
          company_bic?: string | null
          company_iban?: string | null
          company_name?: string
          company_vat?: string
          id?: number
          invoice_prefix?: string
          km_rate?: number
          next_invoice_number?: number
          next_quote_number?: number
          payment_days?: number
          ponto_client_ciphertext?: string | null
          ponto_last_sync?: string | null
          terms_text?: string | null
        }
        Relationships: []
      }
      simpla_sync: {
        Row: {
          attempted_at: string | null
          created_at: string
          error: string | null
          remote_id: string | null
          status: string
          work_order_id: string
        }
        Insert: {
          attempted_at?: string | null
          created_at?: string
          error?: string | null
          remote_id?: string | null
          status?: string
          work_order_id: string
        }
        Update: {
          attempted_at?: string | null
          created_at?: string
          error?: string | null
          remote_id?: string | null
          status?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "simpla_sync_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: true
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          created_at: string
          iban: string | null
          id: string
          match_key: string
          name: string
          payment_method: string
          vat_deductible_percent: number
          vat_number: string | null
          vat_rule: string
        }
        Insert: {
          created_at?: string
          iban?: string | null
          id?: string
          match_key: string
          name: string
          payment_method?: string
          vat_deductible_percent?: number
          vat_number?: string | null
          vat_rule?: string
        }
        Update: {
          created_at?: string
          iban?: string | null
          id?: string
          match_key?: string
          name?: string
          payment_method?: string
          vat_deductible_percent?: number
          vat_number?: string | null
          vat_rule?: string
        }
        Relationships: []
      }
      technicians: {
        Row: {
          can_payment: boolean
          color: string | null
          created_at: string
          email: string | null
          external_planning: boolean
          id: string
          large_text: boolean
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
          external_planning?: boolean
          id?: string
          large_text?: boolean
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
          external_planning?: boolean
          id?: string
          large_text?: boolean
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
          billing_email: string | null
          city: string | null
          contract_id: string | null
          created_at: string
          customer_id: string | null
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
          project_id: string | null
          project_name: string | null
          quote_pending: boolean
          received_at: string | null
          scheduled_date: string | null
          scheduled_from: string | null
          scheduled_until: string | null
          signature: string | null
          signed_at: string | null
          signed_name: string | null
          site_city: string | null
          site_contact_name: string | null
          site_contact_phone: string | null
          site_house_number: string | null
          site_postal_code: string | null
          site_street: string | null
          sort_order: number
          source_mailbox_user_id: string | null
          source_message_id: string | null
          source_subject: string | null
          status: string
          street: string | null
          technician_id: string | null
          urgent: boolean
          use_site_address: boolean
          vat_number: string | null
          vat_rate: number
          warranty: boolean
          work_notes: string | null
        }
        Insert: {
          activity_id?: string | null
          address?: string | null
          billing_email?: string | null
          city?: string | null
          contract_id?: string | null
          created_at?: string
          customer_id?: string | null
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
          project_id?: string | null
          project_name?: string | null
          quote_pending?: boolean
          received_at?: string | null
          scheduled_date?: string | null
          scheduled_from?: string | null
          scheduled_until?: string | null
          signature?: string | null
          signed_at?: string | null
          signed_name?: string | null
          site_city?: string | null
          site_contact_name?: string | null
          site_contact_phone?: string | null
          site_house_number?: string | null
          site_postal_code?: string | null
          site_street?: string | null
          sort_order?: number
          source_mailbox_user_id?: string | null
          source_message_id?: string | null
          source_subject?: string | null
          status?: string
          street?: string | null
          technician_id?: string | null
          urgent?: boolean
          use_site_address?: boolean
          vat_number?: string | null
          vat_rate?: number
          warranty?: boolean
          work_notes?: string | null
        }
        Update: {
          activity_id?: string | null
          address?: string | null
          billing_email?: string | null
          city?: string | null
          contract_id?: string | null
          created_at?: string
          customer_id?: string | null
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
          project_id?: string | null
          project_name?: string | null
          quote_pending?: boolean
          received_at?: string | null
          scheduled_date?: string | null
          scheduled_from?: string | null
          scheduled_until?: string | null
          signature?: string | null
          signed_at?: string | null
          signed_name?: string | null
          site_city?: string | null
          site_contact_name?: string | null
          site_contact_phone?: string | null
          site_house_number?: string | null
          site_postal_code?: string | null
          site_street?: string | null
          sort_order?: number
          source_mailbox_user_id?: string | null
          source_message_id?: string | null
          source_subject?: string | null
          status?: string
          street?: string | null
          technician_id?: string | null
          urgent?: boolean
          use_site_address?: boolean
          vat_number?: string | null
          vat_rate?: number
          warranty?: boolean
          work_notes?: string | null
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
            foreignKeyName: "work_orders_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "customer_projects"
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
      customer_identity: {
        Args: { c: string; h: string; n: string; p: string; s: string }
        Returns: string
      }
      forward_external_appointment: {
        Args: { p_id: string; p_instruction: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      my_crew_sees_signed: { Args: never; Returns: boolean }
      my_technician_id: { Args: never; Returns: string }
      next_invoice_number: { Args: never; Returns: string }
      next_quote_number: { Args: never; Returns: string }
      reconcile_purchase_payment: {
        Args: {
          p_amount: number
          p_date: string
          p_id: string
          p_key: string
          p_ref: string
        }
        Returns: boolean
      }
      reconcile_sales_payment: {
        Args: {
          p_amount: number
          p_date: string
          p_id: string
          p_key: string
          p_ref: string
        }
        Returns: boolean
      }
      respond_appointment: {
        Args: {
          p_accept?: boolean
          p_date?: string
          p_from?: string
          p_token: string
          p_until?: string
        }
        Returns: string
      }
      respond_appointment_options: {
        Args: {
          p_action: string
          p_choice?: number
          p_slots?: Json
          p_token: string
        }
        Returns: string
      }
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
