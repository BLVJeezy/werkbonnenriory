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
          hourly_rate: number | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          hourly_rate?: number | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          hourly_rate?: number | null
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
      companies: {
        Row: {
          created_at: string
          enterprise_number: string | null
          id: string
          name: string
          simpla_bound: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          enterprise_number?: string | null
          id?: string
          name: string
          simpla_bound?: boolean
          user_id?: string
        }
        Update: {
          created_at?: string
          enterprise_number?: string | null
          id?: string
          name?: string
          simpla_bound?: boolean
          user_id?: string
        }
        Relationships: []
      }
      contract_billing_queue: {
        Row: {
          contract_id: string
          created_at: string
          error: string | null
          invoice_id: string | null
          lease_until: string | null
          status: string
          updated_at: string
          work_order_id: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          error?: string | null
          invoice_id?: string | null
          lease_until?: string | null
          status?: string
          updated_at?: string
          work_order_id: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          error?: string | null
          invoice_id?: string | null
          lease_until?: string | null
          status?: string
          updated_at?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_billing_queue_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_billing_queue_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_billing_queue_work_order_id_fkey"
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
          billing_enabled: boolean
          billing_enabled_at: string | null
          billing_lines: Json
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
          repeat_ordinal: number | null
          repeat_unit: string
          repeat_weekday: number | null
          scheduling_ready: boolean
          source_data: Json | null
          technician_id: string | null
        }
        Insert: {
          active?: boolean
          activity_id?: string | null
          billing_enabled?: boolean
          billing_enabled_at?: string | null
          billing_lines?: Json
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
          repeat_ordinal?: number | null
          repeat_unit?: string
          repeat_weekday?: number | null
          scheduling_ready?: boolean
          source_data?: Json | null
          technician_id?: string | null
        }
        Update: {
          active?: boolean
          activity_id?: string | null
          billing_enabled?: boolean
          billing_enabled_at?: string | null
          billing_lines?: Json
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
          repeat_ordinal?: number | null
          repeat_unit?: string
          repeat_weekday?: number | null
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
      crew_password_invitations: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          technician_id: string
          token_hash: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          technician_id: string
          token_hash: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          technician_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_password_invitations_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: true
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
          vrij_beroep: boolean
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
          vrij_beroep?: boolean
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
          vrij_beroep?: boolean
        }
        Relationships: []
      }
      document_deliveries: {
        Row: {
          created_at: string
          document_id: string
          document_type: string
          expires_at: string
          id: string
          label: string
          pdf_base64: string
          recipient: string
          sent_at: string | null
          status: string
          token_hash: string
        }
        Insert: {
          created_at?: string
          document_id: string
          document_type: string
          expires_at?: string
          id?: string
          label: string
          pdf_base64: string
          recipient: string
          sent_at?: string | null
          status?: string
          token_hash: string
        }
        Update: {
          created_at?: string
          document_id?: string
          document_type?: string
          expires_at?: string
          id?: string
          label?: string
          pdf_base64?: string
          recipient?: string
          sent_at?: string | null
          status?: string
          token_hash?: string
        }
        Relationships: []
      }
      document_open_events: {
        Row: {
          delivery_id: string
          id: string
          opened_at: string
        }
        Insert: {
          delivery_id: string
          id?: string
          opened_at?: string
        }
        Update: {
          delivery_id?: string
          id?: string
          opened_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_open_events_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "document_deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_accounts: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          name: string
          number: string
          source: string
          user_id: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          id?: string
          name: string
          number: string
          source?: string
          user_id?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          number?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_audit: {
        Row: {
          action: string
          company_id: string | null
          created_at: string
          detail: Json | null
          entity: string
          entity_id: string | null
          id: string
          user_id: string
        }
        Insert: {
          action: string
          company_id?: string | null
          created_at?: string
          detail?: Json | null
          entity: string
          entity_id?: string | null
          id?: string
          user_id?: string
        }
        Update: {
          action?: string
          company_id?: string | null
          created_at?: string
          detail?: Json | null
          entity?: string
          entity_id?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      fin_bank_tx: {
        Row: {
          amount: number
          bank_account: string | null
          company_id: string
          counterparty: string | null
          created_at: string
          dedupe_key: string
          description: string | null
          entry_id: string | null
          id: string
          matched_invoice_id: string | null
          tx_date: string
          user_id: string
        }
        Insert: {
          amount: number
          bank_account?: string | null
          company_id: string
          counterparty?: string | null
          created_at?: string
          dedupe_key: string
          description?: string | null
          entry_id?: string | null
          id?: string
          matched_invoice_id?: string | null
          tx_date: string
          user_id?: string
        }
        Update: {
          amount?: number
          bank_account?: string | null
          company_id?: string
          counterparty?: string | null
          created_at?: string
          dedupe_key?: string
          description?: string | null
          entry_id?: string | null
          id?: string
          matched_invoice_id?: string | null
          tx_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_bank_tx_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_bank_tx_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "fin_journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_bank_tx_matched_invoice_id_fkey"
            columns: ["matched_invoice_id"]
            isOneToOne: false
            referencedRelation: "fin_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_budgets: {
        Row: {
          amount: number
          category: string
          company_id: string
          id: string
          month: string
          user_id: string
        }
        Insert: {
          amount: number
          category: string
          company_id: string
          id?: string
          month: string
          user_id?: string
        }
        Update: {
          amount?: number
          category?: string
          company_id?: string
          id?: string
          month?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_budgets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_competitor_metrics: {
        Row: {
          competitor_id: string
          employees: number | null
          equity: number | null
          fiscal_year: number
          gross_margin: number | null
          id: string
          profit: number | null
          retrieved_at: string
          revenue: number | null
          scope: string
          source: string
          user_id: string
        }
        Insert: {
          competitor_id: string
          employees?: number | null
          equity?: number | null
          fiscal_year: number
          gross_margin?: number | null
          id?: string
          profit?: number | null
          retrieved_at: string
          revenue?: number | null
          scope?: string
          source: string
          user_id?: string
        }
        Update: {
          competitor_id?: string
          employees?: number | null
          equity?: number | null
          fiscal_year?: number
          gross_margin?: number | null
          id?: string
          profit?: number | null
          retrieved_at?: string
          revenue?: number | null
          scope?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_competitor_metrics_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "fin_competitors"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_competitors: {
        Row: {
          created_at: string
          enterprise_number: string | null
          id: string
          identity_confirmed: boolean
          is_own: boolean
          name: string
          note: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          enterprise_number?: string | null
          id?: string
          identity_confirmed?: boolean
          is_own?: boolean
          name: string
          note?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          enterprise_number?: string | null
          id?: string
          identity_confirmed?: boolean
          is_own?: boolean
          name?: string
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      fin_entries: {
        Row: {
          account: string | null
          amount: number
          category: string
          company_id: string
          created_at: string
          dedupe_key: string
          description: string | null
          id: string
          kind: string
          level: string
          month: string
          source: string
          source_ref: string | null
          user_id: string
        }
        Insert: {
          account?: string | null
          amount: number
          category?: string
          company_id: string
          created_at?: string
          dedupe_key: string
          description?: string | null
          id?: string
          kind: string
          level?: string
          month: string
          source?: string
          source_ref?: string | null
          user_id?: string
        }
        Update: {
          account?: string | null
          amount?: number
          category?: string
          company_id?: string
          created_at?: string
          dedupe_key?: string
          description?: string | null
          id?: string
          kind?: string
          level?: string
          month?: string
          source?: string
          source_ref?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_investments: {
        Row: {
          capitalizable_amount: number | null
          company_id: string
          created_at: string
          disposal_date: string | null
          id: string
          invoice_line_id: string | null
          is_land: boolean
          method: string
          name: string
          opening_accumulated: number
          opening_cutoff: string | null
          purchase_amount: number | null
          residual_value: number
          start_date: string | null
          useful_life_months: number | null
          user_id: string
        }
        Insert: {
          capitalizable_amount?: number | null
          company_id: string
          created_at?: string
          disposal_date?: string | null
          id?: string
          invoice_line_id?: string | null
          is_land?: boolean
          method?: string
          name: string
          opening_accumulated?: number
          opening_cutoff?: string | null
          purchase_amount?: number | null
          residual_value?: number
          start_date?: string | null
          useful_life_months?: number | null
          user_id?: string
        }
        Update: {
          capitalizable_amount?: number | null
          company_id?: string
          created_at?: string
          disposal_date?: string | null
          id?: string
          invoice_line_id?: string | null
          is_land?: boolean
          method?: string
          name?: string
          opening_accumulated?: number
          opening_cutoff?: string | null
          purchase_amount?: number | null
          residual_value?: number
          start_date?: string | null
          useful_life_months?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_investments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_investments_invoice_line_id_fkey"
            columns: ["invoice_line_id"]
            isOneToOne: false
            referencedRelation: "fin_invoice_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_invoice_lines: {
        Row: {
          account: string | null
          category: string | null
          company_id: string | null
          confidence: number | null
          description: string | null
          ex_vat: number
          id: string
          invoice_id: string
          is_investment: boolean
          suggestion_rule_id: string | null
          user_id: string
          vat: number
        }
        Insert: {
          account?: string | null
          category?: string | null
          company_id?: string | null
          confidence?: number | null
          description?: string | null
          ex_vat?: number
          id?: string
          invoice_id: string
          is_investment?: boolean
          suggestion_rule_id?: string | null
          user_id?: string
          vat?: number
        }
        Update: {
          account?: string | null
          category?: string | null
          company_id?: string | null
          confidence?: number | null
          description?: string | null
          ex_vat?: number
          id?: string
          invoice_id?: string
          is_investment?: boolean
          suggestion_rule_id?: string | null
          user_id?: string
          vat?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "fin_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_invoices: {
        Row: {
          bank_ref: string | null
          company_id: string
          counterparty: string | null
          created_at: string
          direction: string
          doc_type: string
          due_date: string | null
          id: string
          invoice_date: string | null
          number: string | null
          original_invoice_id: string | null
          paid_amount: number
          paid_at: string | null
          review_status: string
          source: string
          source_ref: string | null
          status: string
          user_id: string
        }
        Insert: {
          bank_ref?: string | null
          company_id: string
          counterparty?: string | null
          created_at?: string
          direction: string
          doc_type?: string
          due_date?: string | null
          id?: string
          invoice_date?: string | null
          number?: string | null
          original_invoice_id?: string | null
          paid_amount?: number
          paid_at?: string | null
          review_status?: string
          source?: string
          source_ref?: string | null
          status?: string
          user_id?: string
        }
        Update: {
          bank_ref?: string | null
          company_id?: string
          counterparty?: string | null
          created_at?: string
          direction?: string
          doc_type?: string
          due_date?: string | null
          id?: string
          invoice_date?: string | null
          number?: string | null
          original_invoice_id?: string | null
          paid_amount?: number
          paid_at?: string | null
          review_status?: string
          source?: string
          source_ref?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_invoices_original_invoice_id_fkey"
            columns: ["original_invoice_id"]
            isOneToOne: false
            referencedRelation: "fin_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_journal_entries: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          entry_date: string
          id: string
          journal: string
          reference: string | null
          source: string
          source_ref: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          entry_date: string
          id?: string
          journal: string
          reference?: string | null
          source: string
          source_ref?: string | null
          user_id?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          entry_date?: string
          id?: string
          journal?: string
          reference?: string | null
          source?: string
          source_ref?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_journal_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_journal_lines: {
        Row: {
          account: string
          company_id: string
          credit: number
          debit: number
          description: string | null
          entry_id: string
          id: string
          user_id: string
          vat_grid: string | null
        }
        Insert: {
          account: string
          company_id: string
          credit?: number
          debit?: number
          description?: string | null
          entry_id: string
          id?: string
          user_id?: string
          vat_grid?: string | null
        }
        Update: {
          account?: string
          company_id?: string
          credit?: number
          debit?: number
          description?: string | null
          entry_id?: string
          id?: string
          user_id?: string
          vat_grid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_journal_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "fin_journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_loan_schedule: {
        Row: {
          capital: number
          company_id: string
          created_at: string
          credit_account: string | null
          debit_account: string
          due_date: string
          id: string
          interest: number
          kind: string
          loan_key: string
          loan_name: string
          reference: string | null
          user_id: string
        }
        Insert: {
          capital?: number
          company_id: string
          created_at?: string
          credit_account?: string | null
          debit_account: string
          due_date: string
          id?: string
          interest?: number
          kind: string
          loan_key: string
          loan_name: string
          reference?: string | null
          user_id?: string
        }
        Update: {
          capital?: number
          company_id?: string
          created_at?: string
          credit_account?: string | null
          debit_account?: string
          due_date?: string
          id?: string
          interest?: number
          kind?: string
          loan_key?: string
          loan_name?: string
          reference?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_loan_schedule_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_loans: {
        Row: {
          annual_rate: number
          company_id: string
          created_at: string
          id: string
          months: number
          name: string
          principal: number
          start_date: string
          user_id: string
        }
        Insert: {
          annual_rate: number
          company_id: string
          created_at?: string
          id?: string
          months: number
          name: string
          principal: number
          start_date: string
          user_id?: string
        }
        Update: {
          annual_rate?: number
          company_id?: string
          created_at?: string
          id?: string
          months?: number
          name?: string
          principal?: number
          start_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_loans_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_months: {
        Row: {
          bank_complete: boolean
          company_id: string
          costs_complete: boolean
          id: string
          month: string
          note: string | null
          revenue_complete: boolean
          user_id: string
        }
        Insert: {
          bank_complete?: boolean
          company_id: string
          costs_complete?: boolean
          id?: string
          month: string
          note?: string | null
          revenue_complete?: boolean
          user_id?: string
        }
        Update: {
          bank_complete?: boolean
          company_id?: string
          costs_complete?: boolean
          id?: string
          month?: string
          note?: string | null
          revenue_complete?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_months_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_recurring: {
        Row: {
          active: boolean
          amount: number
          company_id: string
          created_at: string
          credit_account: string
          day_of_month: number
          debit_account: string
          description: string
          end_month: string | null
          id: string
          journal: string
          start_month: string
          user_id: string
        }
        Insert: {
          active?: boolean
          amount: number
          company_id: string
          created_at?: string
          credit_account: string
          day_of_month?: number
          debit_account: string
          description: string
          end_month?: string | null
          id?: string
          journal?: string
          start_month: string
          user_id?: string
        }
        Update: {
          active?: boolean
          amount?: number
          company_id?: string
          created_at?: string
          credit_account?: string
          day_of_month?: number
          debit_account?: string
          description?: string
          end_month?: string | null
          id?: string
          journal?: string
          start_month?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_recurring_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_rules: {
        Row: {
          account: string
          category: string
          company_id: string
          enabled: boolean
          hits: number
          id: string
          keyword: string
          scope: string
          supplier_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account: string
          category: string
          company_id: string
          enabled?: boolean
          hits?: number
          id?: string
          keyword?: string
          scope?: string
          supplier_key: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          account?: string
          category?: string
          company_id?: string
          enabled?: boolean
          hits?: number
          id?: string
          keyword?: string
          scope?: string
          supplier_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_supplier_imports: {
        Row: {
          bill_date: string | null
          bill_number: string | null
          id: string
          simpla_id: string
          supplier_name: string | null
          total_ex_vat: number
          total_inc_vat: number
          user_id: string
        }
        Insert: {
          bill_date?: string | null
          bill_number?: string | null
          id?: string
          simpla_id: string
          supplier_name?: string | null
          total_ex_vat?: number
          total_inc_vat?: number
          user_id?: string
        }
        Update: {
          bill_date?: string | null
          bill_number?: string | null
          id?: string
          simpla_id?: string
          supplier_name?: string | null
          total_ex_vat?: number
          total_inc_vat?: number
          user_id?: string
        }
        Relationships: []
      }
      fin_sync_status: {
        Row: {
          company_id: string
          id: string
          last_error: string | null
          last_error_at: string | null
          last_success_at: string | null
          source: string
          user_id: string
        }
        Insert: {
          company_id: string
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          last_success_at?: string | null
          source: string
          user_id?: string
        }
        Update: {
          company_id?: string
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          last_success_at?: string | null
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_sync_status_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_tasks: {
        Row: {
          body_text: string | null
          created_at: string
          due_date: string | null
          finance_company_id: string
          finance_event_key: string
          id: string
          priority: string
          status: string
          title: string
          user_id: string
        }
        Insert: {
          body_text?: string | null
          created_at?: string
          due_date?: string | null
          finance_company_id: string
          finance_event_key: string
          id?: string
          priority?: string
          status?: string
          title: string
          user_id?: string
        }
        Update: {
          body_text?: string | null
          created_at?: string
          due_date?: string | null
          finance_company_id?: string
          finance_event_key?: string
          id?: string
          priority?: string
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_tasks_finance_company_id_fkey"
            columns: ["finance_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_reminders: {
        Row: {
          created_at: string
          created_by: string
          document: Json
          error: string | null
          id: string
          invoice_id: string
          recipient: string
          sent_at: string | null
          stage: number
          status: string
        }
        Insert: {
          created_at?: string
          created_by: string
          document: Json
          error?: string | null
          id?: string
          invoice_id: string
          recipient: string
          sent_at?: string | null
          stage: number
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          document?: Json
          error?: string | null
          id?: string
          invoice_id?: string
          recipient?: string
          sent_at?: string | null
          stage?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          auto_send_started_at: string | null
          contract_id: string | null
          contract_reference: string | null
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
          note: string | null
          number: string
          okioki_sent_at: string | null
          paid_amount: number
          paid_at: string | null
          pdf_sent_at: string | null
          post_error: string | null
          post_reference: string | null
          post_requested_at: string | null
          post_sent_at: string | null
          send_error: string | null
          sent_at: string | null
          sent_to: string | null
          sent_via: string | null
          status: string
          total: number
          vat: number
          vat_rate: number
          work_order_id: string | null
        }
        Insert: {
          auto_send_started_at?: string | null
          contract_id?: string | null
          contract_reference?: string | null
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
          note?: string | null
          number: string
          okioki_sent_at?: string | null
          paid_amount?: number
          paid_at?: string | null
          pdf_sent_at?: string | null
          post_error?: string | null
          post_reference?: string | null
          post_requested_at?: string | null
          post_sent_at?: string | null
          send_error?: string | null
          sent_at?: string | null
          sent_to?: string | null
          sent_via?: string | null
          status?: string
          total: number
          vat: number
          vat_rate: number
          work_order_id?: string | null
        }
        Update: {
          auto_send_started_at?: string | null
          contract_id?: string | null
          contract_reference?: string | null
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
          note?: string | null
          number?: string
          okioki_sent_at?: string | null
          paid_amount?: number
          paid_at?: string | null
          pdf_sent_at?: string | null
          post_error?: string | null
          post_reference?: string | null
          post_requested_at?: string | null
          post_sent_at?: string | null
          send_error?: string | null
          sent_at?: string | null
          sent_to?: string | null
          sent_via?: string | null
          status?: string
          total?: number
          vat?: number
          vat_rate?: number
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
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
      newsletter_campaigns: {
        Row: {
          body: string
          created_at: string
          created_by: string
          id: string
          image_url: string | null
          name: string
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          id?: string
          image_url?: string | null
          name: string
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          image_url?: string | null
          name?: string
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      newsletter_consent_events: {
        Row: {
          actor_id: string | null
          created_at: string
          customer_id: string | null
          email: string
          evidence: string
          id: string
          status: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          customer_id?: string | null
          email: string
          evidence: string
          id?: string
          status: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          customer_id?: string | null
          email?: string
          evidence?: string
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_consent_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_consents: {
        Row: {
          consent_at: string | null
          customer_id: string
          email: string
          evidence: string
          status: string
          unsubscribe_hash: string
          updated_at: string
        }
        Insert: {
          consent_at?: string | null
          customer_id: string
          email: string
          evidence?: string
          status: string
          unsubscribe_hash: string
          updated_at?: string
        }
        Update: {
          consent_at?: string | null
          customer_id?: string
          email?: string
          evidence?: string
          status?: string
          unsubscribe_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_consents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
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
      ponto_transactions: {
        Row: {
          account_id: string
          amount: number
          counterpart_name: string | null
          execution_date: string | null
          remittance: string | null
          synced_at: string
          transaction_key: string
        }
        Insert: {
          account_id: string
          amount: number
          counterpart_name?: string | null
          execution_date?: string | null
          remittance?: string | null
          synced_at?: string
          transaction_key: string
        }
        Update: {
          account_id?: string
          amount?: number
          counterpart_name?: string | null
          execution_date?: string | null
          remittance?: string | null
          synced_at?: string
          transaction_key?: string
        }
        Relationships: []
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
          customer_id: string | null
          damage_cause: string | null
          damage_findings: string | null
          id: string
          intro: string | null
          kind: string
          lines: Json
          net: number
          number: string
          photo_paths: string[]
          sent_at: string | null
          signature: string | null
          signed_at: string | null
          signed_name: string | null
          source_work_order_id: string | null
          status: string
          technician_id: string | null
          token: string
          total: number
          vat: number
          vat_rate: number
          work_order_id: string | null
        }
        Insert: {
          created_at?: string
          customer: Json
          customer_id?: string | null
          damage_cause?: string | null
          damage_findings?: string | null
          id?: string
          intro?: string | null
          kind?: string
          lines: Json
          net: number
          number: string
          photo_paths?: string[]
          sent_at?: string | null
          signature?: string | null
          signed_at?: string | null
          signed_name?: string | null
          source_work_order_id?: string | null
          status?: string
          technician_id?: string | null
          token?: string
          total: number
          vat: number
          vat_rate?: number
          work_order_id?: string | null
        }
        Update: {
          created_at?: string
          customer?: Json
          customer_id?: string | null
          damage_cause?: string | null
          damage_findings?: string | null
          id?: string
          intro?: string | null
          kind?: string
          lines?: Json
          net?: number
          number?: string
          photo_paths?: string[]
          sent_at?: string | null
          signature?: string | null
          signed_at?: string | null
          signed_name?: string | null
          source_work_order_id?: string | null
          status?: string
          technician_id?: string | null
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
          {
            foreignKeyName: "quotes_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
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
          newsletter_ai_denial: Json | null
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
          newsletter_ai_denial?: Json | null
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
          newsletter_ai_denial?: Json | null
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
          ccv_terminal_id: string | null
          color: string | null
          created_at: string
          email: string | null
          external_planning: boolean
          id: string
          large_text: boolean
          manual_time_entry: boolean
          name: string
          phone: string | null
          show_contact: boolean
          show_prices: boolean
          show_signed: boolean
          user_id: string | null
        }
        Insert: {
          can_payment?: boolean
          ccv_terminal_id?: string | null
          color?: string | null
          created_at?: string
          email?: string | null
          external_planning?: boolean
          id?: string
          large_text?: boolean
          manual_time_entry?: boolean
          name: string
          phone?: string | null
          show_contact?: boolean
          show_prices?: boolean
          show_signed?: boolean
          user_id?: string | null
        }
        Update: {
          can_payment?: boolean
          ccv_terminal_id?: string | null
          color?: string | null
          created_at?: string
          email?: string | null
          external_planning?: boolean
          id?: string
          large_text?: boolean
          manual_time_entry?: boolean
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
          first_customer: boolean
          house_number: string | null
          id: string
          no_answer_at: string | null
          number: number | null
          paid_amount: number | null
          paid_at: string | null
          paid_method: string | null
          phone: string | null
          postal_code: string | null
          project_id: string | null
          project_name: string | null
          quote_approved: boolean
          quote_pending: boolean
          received_at: string | null
          scheduled_date: string | null
          scheduled_from: string | null
          scheduled_until: string | null
          signature: string | null
          signed_at: string | null
          signed_name: string | null
          signing_code: string | null
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
          first_customer?: boolean
          house_number?: string | null
          id?: string
          no_answer_at?: string | null
          number?: number | null
          paid_amount?: number | null
          paid_at?: string | null
          paid_method?: string | null
          phone?: string | null
          postal_code?: string | null
          project_id?: string | null
          project_name?: string | null
          quote_approved?: boolean
          quote_pending?: boolean
          received_at?: string | null
          scheduled_date?: string | null
          scheduled_from?: string | null
          scheduled_until?: string | null
          signature?: string | null
          signed_at?: string | null
          signed_name?: string | null
          signing_code?: string | null
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
          first_customer?: boolean
          house_number?: string | null
          id?: string
          no_answer_at?: string | null
          number?: number | null
          paid_amount?: number | null
          paid_at?: string | null
          paid_method?: string | null
          phone?: string | null
          postal_code?: string | null
          project_id?: string | null
          project_name?: string | null
          quote_approved?: boolean
          quote_pending?: boolean
          received_at?: string | null
          scheduled_date?: string | null
          scheduled_from?: string | null
          scheduled_until?: string | null
          signature?: string | null
          signed_at?: string | null
          signed_name?: string | null
          signing_code?: string | null
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
      claim_crew_password_invitation: {
        Args: { p_hash: string }
        Returns: string
      }
      convert_approved_quote: { Args: { p_id: string }; Returns: string }
      create_contract_completion_invoice: {
        Args: {
          p_customer: Json
          p_lines: Json
          p_net: number
          p_reference: string
          p_total: number
          p_vat: number
          p_vat_rate: number
          p_work_order: string
        }
        Returns: string
      }
      create_numbered_invoice: {
        Args: {
          p_contract_reference?: string
          p_credit_for?: string
          p_customer: Json
          p_due_date: string
          p_issue_date: string
          p_kind?: string
          p_lines: Json
          p_net: number
          p_paid_amount: number
          p_total: number
          p_vat: number
          p_vat_rate: number
          p_work_order_id: string
        }
        Returns: {
          auto_send_started_at: string | null
          contract_id: string | null
          contract_reference: string | null
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
          note: string | null
          number: string
          okioki_sent_at: string | null
          paid_amount: number
          paid_at: string | null
          pdf_sent_at: string | null
          post_error: string | null
          post_reference: string | null
          post_requested_at: string | null
          post_sent_at: string | null
          send_error: string | null
          sent_at: string | null
          sent_to: string | null
          sent_via: string | null
          status: string
          total: number
          vat: number
          vat_rate: number
          work_order_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      customer_identity: {
        Args: { c: string; h: string; n: string; p: string; s: string }
        Returns: string
      }
      ensure_approved_quote_task: { Args: { p_id: string }; Returns: string }
      fin_capitalize_invoice_line: {
        Args: {
          _asset_account: string
          _life: number
          _line: string
          _name: string
          _residual?: number
          _start: string
        }
        Returns: string
      }
      fin_post_entry: {
        Args: {
          _company: string
          _date: string
          _description: string
          _journal: string
          _lines: Json
          _reference: string
          _source: string
          _source_ref: string
        }
        Returns: string
      }
      fin_reconcile_bank: {
        Args: {
          _bank_account: string
          _counter_account: string
          _invoice: string
          _transaction: string
        }
        Returns: Json
      }
      fin_restore_archive: { Args: { _data: Json }; Returns: Json }
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
      invite_customer_appointment: {
        Args: { p_id: string; p_instruction: string; p_slots: Json }
        Returns: string
      }
      is_admin_or_marketing: { Args: never; Returns: boolean }
      link_bank_transaction: {
        Args: { p_invoice_id: string; p_transaction_key: string }
        Returns: number
      }
      login_email: { Args: { p_name: string }; Returns: string }
      my_crew_sees_signed: { Args: never; Returns: boolean }
      my_technician_id: { Args: never; Returns: string }
      next_invoice_number: { Args: never; Returns: string }
      next_quote_number: { Args: never; Returns: string }
      owns_company: { Args: { _company: string }; Returns: boolean }
      owns_competitor: { Args: { _c: string }; Returns: boolean }
      owns_fin_invoice: { Args: { _inv: string }; Returns: boolean }
      photo_overview: {
        Args: never
        Returns: {
          city: string
          created_at: string
          customer_name: string
          id: string
          number: number
          path: string
          scheduled_date: string
          task_description: string
          work_notes: string
          work_order_id: string
        }[]
      }
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
      record_newsletter_consent: {
        Args: {
          p_customer_id: string
          p_evidence: string
          p_hash: string
          p_status: string
        }
        Returns: undefined
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
      tech_reopen_work_order: { Args: { _id: string }; Returns: undefined }
      unsubscribe_newsletter: { Args: { p_hash: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "technician" | "marketing"
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
      app_role: ["admin", "technician", "marketing"],
    },
  },
} as const
