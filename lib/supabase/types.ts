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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      admin_onesignal_players: {
        Row: {
          email: string
          id: string
          player_id: string | null
          updated_at: string | null
        }
        Insert: {
          email: string
          id?: string
          player_id?: string | null
          updated_at?: string | null
        }
        Update: {
          email?: string
          id?: string
          player_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      affiliate_applications: {
        Row: {
          admin_notes: string | null
          created_at: string
          desired_code: string | null
          email: string | null
          full_name: string | null
          how_they_plan_to_promote: string | null
          id: string
          instagram_handle: string | null
          paypal_email: string | null
          phone: string | null
          referral_code_id: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          terms_accepted: boolean
          terms_accepted_at: string | null
          terms_version: string | null
          tiktok_handle: string | null
          total_premium_at_apply: number
          total_referrals_at_apply: number
          user_id: string
          youtube_handle: string | null
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          desired_code?: string | null
          email?: string | null
          full_name?: string | null
          how_they_plan_to_promote?: string | null
          id?: string
          instagram_handle?: string | null
          paypal_email?: string | null
          phone?: string | null
          referral_code_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          terms_accepted?: boolean
          terms_accepted_at?: string | null
          terms_version?: string | null
          tiktok_handle?: string | null
          total_premium_at_apply?: number
          total_referrals_at_apply?: number
          user_id: string
          youtube_handle?: string | null
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          desired_code?: string | null
          email?: string | null
          full_name?: string | null
          how_they_plan_to_promote?: string | null
          id?: string
          instagram_handle?: string | null
          paypal_email?: string | null
          phone?: string | null
          referral_code_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          terms_accepted?: boolean
          terms_accepted_at?: string | null
          terms_version?: string | null
          tiktok_handle?: string | null
          total_premium_at_apply?: number
          total_referrals_at_apply?: number
          user_id?: string
          youtube_handle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_applications_referral_code_id_fkey"
            columns: ["referral_code_id"]
            isOneToOne: false
            referencedRelation: "referral_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_attributions: {
        Row: {
          affiliate_code: string
          affiliate_profile_id: string
          attributed_at: string
          customer_user_id: string
          id: string
          revenuecat_transaction_id: string | null
          status: string
        }
        Insert: {
          affiliate_code: string
          affiliate_profile_id: string
          attributed_at?: string
          customer_user_id: string
          id?: string
          revenuecat_transaction_id?: string | null
          status?: string
        }
        Update: {
          affiliate_code?: string
          affiliate_profile_id?: string
          attributed_at?: string
          customer_user_id?: string
          id?: string
          revenuecat_transaction_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_attributions_affiliate_profile_id_fkey"
            columns: ["affiliate_profile_id"]
            isOneToOne: false
            referencedRelation: "affiliate_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_codes: {
        Row: {
          activated_at: string | null
          affiliate_profile_id: string
          apple_error: Json | null
          apple_offer_id: string | null
          apple_raw_response: Json | null
          apple_resource_id: string | null
          code: string
          created_at: string
          id: string
          last_retry_at: string | null
          retry_count: number
          status: string
        }
        Insert: {
          activated_at?: string | null
          affiliate_profile_id: string
          apple_error?: Json | null
          apple_offer_id?: string | null
          apple_raw_response?: Json | null
          apple_resource_id?: string | null
          code: string
          created_at?: string
          id?: string
          last_retry_at?: string | null
          retry_count?: number
          status?: string
        }
        Update: {
          activated_at?: string | null
          affiliate_profile_id?: string
          apple_error?: Json | null
          apple_offer_id?: string | null
          apple_raw_response?: Json | null
          apple_resource_id?: string | null
          code?: string
          created_at?: string
          id?: string
          last_retry_at?: string | null
          retry_count?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_codes_affiliate_profile_id_fkey"
            columns: ["affiliate_profile_id"]
            isOneToOne: false
            referencedRelation: "affiliate_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_commissions: {
        Row: {
          admin_notes: string | null
          affiliate_profile_id: string
          attribution_source: string | null
          available_at: string | null
          commission_amount: number
          commission_rate: number
          created_at: string
          currency: string
          customer_user_id: string | null
          id: string
          offer_code_used: string | null
          paid_at: string | null
          payout_id: string | null
          plan_type: string | null
          product_id: string | null
          purchase_amount: number
          purchase_amount_usd: number
          purchased_at: string | null
          revenuecat_event_id: string | null
          revenuecat_transaction_id: string
          status: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          affiliate_profile_id: string
          attribution_source?: string | null
          available_at?: string | null
          commission_amount?: number
          commission_rate: number
          created_at?: string
          currency?: string
          customer_user_id?: string | null
          id?: string
          offer_code_used?: string | null
          paid_at?: string | null
          payout_id?: string | null
          plan_type?: string | null
          product_id?: string | null
          purchase_amount?: number
          purchase_amount_usd?: number
          purchased_at?: string | null
          revenuecat_event_id?: string | null
          revenuecat_transaction_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          affiliate_profile_id?: string
          attribution_source?: string | null
          available_at?: string | null
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          currency?: string
          customer_user_id?: string | null
          id?: string
          offer_code_used?: string | null
          paid_at?: string | null
          payout_id?: string | null
          plan_type?: string | null
          product_id?: string | null
          purchase_amount?: number
          purchase_amount_usd?: number
          purchased_at?: string | null
          revenuecat_event_id?: string | null
          revenuecat_transaction_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_commissions_affiliate_profile_id_fkey"
            columns: ["affiliate_profile_id"]
            isOneToOne: false
            referencedRelation: "affiliate_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_one_time_codes: {
        Row: {
          affiliate_profile_id: string | null
          code: string
          created_at: string | null
          id: string
          plan_type: string
          redeemed: boolean | null
          redeemed_at: string | null
        }
        Insert: {
          affiliate_profile_id?: string | null
          code: string
          created_at?: string | null
          id?: string
          plan_type: string
          redeemed?: boolean | null
          redeemed_at?: string | null
        }
        Update: {
          affiliate_profile_id?: string | null
          code?: string
          created_at?: string | null
          id?: string
          plan_type?: string
          redeemed?: boolean | null
          redeemed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_one_time_codes_affiliate_profile_id_fkey"
            columns: ["affiliate_profile_id"]
            isOneToOne: false
            referencedRelation: "affiliate_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_payout_items: {
        Row: {
          amount: number
          commission_id: string
          created_at: string
          id: string
          payout_id: string
        }
        Insert: {
          amount: number
          commission_id: string
          created_at?: string
          id?: string
          payout_id: string
        }
        Update: {
          amount?: number
          commission_id?: string
          created_at?: string
          id?: string
          payout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_payout_items_commission_id_fkey"
            columns: ["commission_id"]
            isOneToOne: true
            referencedRelation: "affiliate_commissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_payout_items_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "affiliate_payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_payouts: {
        Row: {
          admin_notes: string | null
          affiliate_profile_id: string
          created_at: string
          created_by: string | null
          id: string
          paid_at: string | null
          paypal_email: string
          paypal_note: string | null
          paypal_transaction_id: string | null
          status: string
          total_amount: number
        }
        Insert: {
          admin_notes?: string | null
          affiliate_profile_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          paid_at?: string | null
          paypal_email: string
          paypal_note?: string | null
          paypal_transaction_id?: string | null
          status?: string
          total_amount?: number
        }
        Update: {
          admin_notes?: string | null
          affiliate_profile_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          paid_at?: string | null
          paypal_email?: string
          paypal_note?: string | null
          paypal_transaction_id?: string | null
          status?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_payouts_affiliate_profile_id_fkey"
            columns: ["affiliate_profile_id"]
            isOneToOne: false
            referencedRelation: "affiliate_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_profiles: {
        Row: {
          affiliate_code: string
          apple_code_status: string
          apple_redemption_url_annual: string | null
          apple_redemption_url_monthly: string | null
          application_id: string | null
          commission_rate: number
          commission_rate_change_date: string | null
          commission_rate_future: number | null
          created_at: string
          hold_period_days: number
          id: string
          paypal_email: string | null
          plan_type: string
          status: string
          total_sales: number
          updated_at: string
          user_id: string
        }
        Insert: {
          affiliate_code: string
          apple_code_status?: string
          apple_redemption_url_annual?: string | null
          apple_redemption_url_monthly?: string | null
          application_id?: string | null
          commission_rate?: number
          commission_rate_change_date?: string | null
          commission_rate_future?: number | null
          created_at?: string
          hold_period_days?: number
          id?: string
          paypal_email?: string | null
          plan_type?: string
          status?: string
          total_sales?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          affiliate_code?: string
          apple_code_status?: string
          apple_redemption_url_annual?: string | null
          apple_redemption_url_monthly?: string | null
          application_id?: string | null
          commission_rate?: number
          commission_rate_change_date?: string | null
          commission_rate_future?: number | null
          created_at?: string
          hold_period_days?: number
          id?: string
          paypal_email?: string | null
          plan_type?: string
          status?: string
          total_sales?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_profiles_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "affiliate_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_settings: {
        Row: {
          default_commission_rate: number
          default_commission_rate_after_12mo: number
          default_hold_period_days: number
          id: string
          minimum_payout_amount: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          default_commission_rate?: number
          default_commission_rate_after_12mo?: number
          default_hold_period_days?: number
          id?: string
          minimum_payout_amount?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          default_commission_rate?: number
          default_commission_rate_after_12mo?: number
          default_hold_period_days?: number
          id?: string
          minimum_payout_amount?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          created_at: string
          event_name: string
          id: string
          properties: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: string
          properties?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: string
          properties?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      blocked_users: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      bug_reports: {
        Row: {
          app_version: string | null
          created_at: string | null
          description: string
          device: string | null
          id: string
          photo_url: string | null
          platform: string | null
          tab_source: string | null
          user_id: string | null
        }
        Insert: {
          app_version?: string | null
          created_at?: string | null
          description: string
          device?: string | null
          id?: string
          photo_url?: string | null
          platform?: string | null
          tab_source?: string | null
          user_id?: string | null
        }
        Update: {
          app_version?: string | null
          created_at?: string | null
          description?: string
          device?: string | null
          id?: string
          photo_url?: string | null
          platform?: string | null
          tab_source?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      check_in_photos: {
        Row: {
          check_in_id: string
          created_at: string
          id: string
          photo_url: string
          storage_path: string
          user_id: string
        }
        Insert: {
          check_in_id: string
          created_at?: string
          id?: string
          photo_url: string
          storage_path: string
          user_id: string
        }
        Update: {
          check_in_id?: string
          created_at?: string
          id?: string
          photo_url?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: []
      }
      check_ins: {
        Row: {
          created_at: string | null
          date: string
          id: string
          measurements: Json | null
          notes: string | null
          photo_url: string | null
          steps: number | null
          steps_goal: number | null
          updated_at: string | null
          user_id: string
          weight: number | null
          went_to_gym: boolean | null
        }
        Insert: {
          created_at?: string | null
          date?: string
          id?: string
          measurements?: Json | null
          notes?: string | null
          photo_url?: string | null
          steps?: number | null
          steps_goal?: number | null
          updated_at?: string | null
          user_id: string
          weight?: number | null
          went_to_gym?: boolean | null
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          measurements?: Json | null
          notes?: string | null
          photo_url?: string | null
          steps?: number | null
          steps_goal?: number | null
          updated_at?: string | null
          user_id?: string
          weight?: number | null
          went_to_gym?: boolean | null
        }
        Relationships: []
      }
      coach_action_log: {
        Row: {
          action_type: string
          authorized_by: string
          confirmation_token: string | null
          confirmed_at: string | null
          data_evidence: Json | null
          expected_effect: string | null
          id: string
          is_reversible: boolean
          new_value: Json | null
          permission_level: number
          previous_value: Json | null
          proposed_at: string
          reason: string | null
          status: string
          target_id: string | null
          target_table: string | null
          undone_at: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          authorized_by?: string
          confirmation_token?: string | null
          confirmed_at?: string | null
          data_evidence?: Json | null
          expected_effect?: string | null
          id?: string
          is_reversible?: boolean
          new_value?: Json | null
          permission_level?: number
          previous_value?: Json | null
          proposed_at?: string
          reason?: string | null
          status?: string
          target_id?: string | null
          target_table?: string | null
          undone_at?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          authorized_by?: string
          confirmation_token?: string | null
          confirmed_at?: string | null
          data_evidence?: Json | null
          expected_effect?: string | null
          id?: string
          is_reversible?: boolean
          new_value?: Json | null
          permission_level?: number
          previous_value?: Json | null
          proposed_at?: string
          reason?: string | null
          status?: string
          target_id?: string | null
          target_table?: string | null
          undone_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      coach_actions: {
        Row: {
          action_type: string
          created_at: string
          id: string
          new_value: Json | null
          status: string
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          id?: string
          new_value?: Json | null
          status?: string
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          id?: string
          new_value?: Json | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      coach_chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          session_id: string | null
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          session_id?: string | null
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "coach_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "coach_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_conv_sessions: {
        Row: {
          created_at: string | null
          id: string
          last_message_at: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          title?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      coach_conversation_summaries: {
        Row: {
          conversation_id: string | null
          created_at: string | null
          id: string
          importance: number | null
          message_count: number | null
          summary_json: Json
          user_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          importance?: number | null
          message_count?: number | null
          summary_json: Json
          user_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          importance?: number | null
          message_count?: number | null
          summary_json?: Json
          user_id?: string
        }
        Relationships: []
      }
      coach_conversations: {
        Row: {
          action_summary: string | null
          action_type: string | null
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          action_summary?: string | null
          action_type?: string | null
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          action_summary?: string | null
          action_type?: string | null
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      coach_daily_insights: {
        Row: {
          condition_type: string | null
          created_at: string | null
          cta_message: string | null
          id: string
          insight_text: string
          insight_type: string
          is_read: boolean | null
          notification_sent: boolean | null
          user_id: string
        }
        Insert: {
          condition_type?: string | null
          created_at?: string | null
          cta_message?: string | null
          id?: string
          insight_text: string
          insight_type?: string
          is_read?: boolean | null
          notification_sent?: boolean | null
          user_id: string
        }
        Update: {
          condition_type?: string | null
          created_at?: string | null
          cta_message?: string | null
          id?: string
          insight_text?: string
          insight_type?: string
          is_read?: boolean | null
          notification_sent?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      coach_experiments: {
        Row: {
          adherence_pct: number | null
          ended_at: string | null
          id: string
          new_value: number | null
          previous_value: number | null
          reason: string | null
          result: string | null
          review_at: string
          started_at: string
          status: string
          user_id: string
          variable: string
        }
        Insert: {
          adherence_pct?: number | null
          ended_at?: string | null
          id?: string
          new_value?: number | null
          previous_value?: number | null
          reason?: string | null
          result?: string | null
          review_at: string
          started_at?: string
          status?: string
          user_id: string
          variable: string
        }
        Update: {
          adherence_pct?: number | null
          ended_at?: string | null
          id?: string
          new_value?: number | null
          previous_value?: number | null
          reason?: string | null
          result?: string | null
          review_at?: string
          started_at?: string
          status?: string
          user_id?: string
          variable?: string
        }
        Relationships: []
      }
      coach_followups: {
        Row: {
          completed_at: string | null
          context: string | null
          created_at: string | null
          due_date: string | null
          id: string
          priority: number | null
          reason: string | null
          status: string | null
          title: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          context?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          priority?: number | null
          reason?: string | null
          status?: string | null
          title: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          context?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          priority?: number | null
          reason?: string | null
          status?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      coach_insights: {
        Row: {
          created_at: string
          estimated_impact: string | null
          evidence: string | null
          expires_at: string | null
          explanation: string
          id: string
          recommended_action: string | null
          status: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          estimated_impact?: string | null
          evidence?: string | null
          expires_at?: string | null
          explanation: string
          id?: string
          recommended_action?: string | null
          status?: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          estimated_impact?: string | null
          evidence?: string | null
          expires_at?: string | null
          explanation?: string
          id?: string
          recommended_action?: string | null
          status?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      coach_memory: {
        Row: {
          category: string
          confidence: number
          created_at: string
          id: string
          importance: number | null
          is_blocked: boolean
          is_confirmed: boolean
          key: string
          last_confirmed: string | null
          last_referenced_at: string | null
          last_used: string | null
          source: string
          times_observed: number | null
          times_referenced: number
          updated_at: string
          user_id: string
          value: string
        }
        Insert: {
          category: string
          confidence?: number
          created_at?: string
          id?: string
          importance?: number | null
          is_blocked?: boolean
          is_confirmed?: boolean
          key: string
          last_confirmed?: string | null
          last_referenced_at?: string | null
          last_used?: string | null
          source?: string
          times_observed?: number | null
          times_referenced?: number
          updated_at?: string
          user_id: string
          value: string
        }
        Update: {
          category?: string
          confidence?: number
          created_at?: string
          id?: string
          importance?: number | null
          is_blocked?: boolean
          is_confirmed?: boolean
          key?: string
          last_confirmed?: string | null
          last_referenced_at?: string | null
          last_used?: string | null
          source?: string
          times_observed?: number | null
          times_referenced?: number
          updated_at?: string
          user_id?: string
          value?: string
        }
        Relationships: []
      }
      coach_memory_settings: {
        Row: {
          auto_infer: boolean
          blocked_categories: string[]
          memory_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_infer?: boolean
          blocked_categories?: string[]
          memory_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_infer?: boolean
          blocked_categories?: string[]
          memory_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      coach_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "coach_conv_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_permissions: {
        Row: {
          can_add_food: boolean
          can_create_meal_plans: boolean
          can_create_meals: boolean
          can_schedule_reminders: boolean
          can_update_goals: boolean
          can_update_preferences: boolean
          created_at: string
          id: string
          max_calorie_adjustment: number
          permission_level: number
          updated_at: string
          user_id: string
        }
        Insert: {
          can_add_food?: boolean
          can_create_meal_plans?: boolean
          can_create_meals?: boolean
          can_schedule_reminders?: boolean
          can_update_goals?: boolean
          can_update_preferences?: boolean
          created_at?: string
          id?: string
          max_calorie_adjustment?: number
          permission_level?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          can_add_food?: boolean
          can_create_meal_plans?: boolean
          can_create_meals?: boolean
          can_schedule_reminders?: boolean
          can_update_goals?: boolean
          can_update_preferences?: boolean
          created_at?: string
          id?: string
          max_calorie_adjustment?: number
          permission_level?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      coach_recommendations: {
        Row: {
          acted_on: boolean
          acted_on_at: string | null
          confidence_level: number
          created_at: string
          data_completeness_pct: number
          data_snapshot: Json
          evaluate_after: string
          evaluation_period_days: number
          evidence_strength: string
          id: string
          outcome: string | null
          outcome_notes: string | null
          potential_downside: string | null
          recommendation_text: string
          recommendation_type: string
          requires_confirmation: boolean
          safety_flags: string[]
          user_id: string
          user_status: string
        }
        Insert: {
          acted_on?: boolean
          acted_on_at?: string | null
          confidence_level: number
          created_at?: string
          data_completeness_pct: number
          data_snapshot: Json
          evaluate_after: string
          evaluation_period_days?: number
          evidence_strength: string
          id?: string
          outcome?: string | null
          outcome_notes?: string | null
          potential_downside?: string | null
          recommendation_text: string
          recommendation_type: string
          requires_confirmation?: boolean
          safety_flags?: string[]
          user_id: string
          user_status: string
        }
        Update: {
          acted_on?: boolean
          acted_on_at?: string | null
          confidence_level?: number
          created_at?: string
          data_completeness_pct?: number
          data_snapshot?: Json
          evaluate_after?: string
          evaluation_period_days?: number
          evidence_strength?: string
          id?: string
          outcome?: string | null
          outcome_notes?: string | null
          potential_downside?: string | null
          recommendation_text?: string
          recommendation_type?: string
          requires_confirmation?: boolean
          safety_flags?: string[]
          user_id?: string
          user_status?: string
        }
        Relationships: []
      }
      coach_sessions: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          title: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          title?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      coach_state: {
        Row: {
          active_strategy: string | null
          confidence: string
          experiment_id: string | null
          id: string
          last_adjustment_at: string | null
          next_review_at: string | null
          primary_barrier: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active_strategy?: string | null
          confidence?: string
          experiment_id?: string | null
          id?: string
          last_adjustment_at?: string | null
          next_review_at?: string | null
          primary_barrier?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active_strategy?: string | null
          confidence?: string
          experiment_id?: string | null
          id?: string
          last_adjustment_at?: string | null
          next_review_at?: string | null
          primary_barrier?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      coach_user_state: {
        Row: {
          created_at: string | null
          daily_mission: string | null
          data_confidence_pct: number | null
          id: string
          last_computed_at: string | null
          next_review_date: string | null
          phase: string
          primary_bottleneck: string | null
          updated_at: string | null
          user_id: string
          weekly_focus: string | null
        }
        Insert: {
          created_at?: string | null
          daily_mission?: string | null
          data_confidence_pct?: number | null
          id?: string
          last_computed_at?: string | null
          next_review_date?: string | null
          phase?: string
          primary_bottleneck?: string | null
          updated_at?: string | null
          user_id: string
          weekly_focus?: string | null
        }
        Update: {
          created_at?: string | null
          daily_mission?: string | null
          data_confidence_pct?: number | null
          id?: string
          last_computed_at?: string | null
          next_review_date?: string | null
          phase?: string
          primary_bottleneck?: string | null
          updated_at?: string | null
          user_id?: string
          weekly_focus?: string | null
        }
        Relationships: []
      }
      community_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      community_challenges: {
        Row: {
          created_at: string
          description: string
          id: string
          is_active: boolean
          title: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          is_active?: boolean
          title: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          title?: string
        }
        Relationships: []
      }
      community_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      community_commitments: {
        Row: {
          created_at: string
          id: string
          partner_days_logged: number
          partner_id: string
          status: string
          target_days: number
          user_days_logged: number
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          partner_days_logged?: number
          partner_id: string
          status?: string
          target_days?: number
          user_days_logged?: number
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          id?: string
          partner_days_logged?: number
          partner_id?: string
          status?: string
          target_days?: number
          user_days_logged?: number
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_commitments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_commitments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      community_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      community_polls: {
        Row: {
          created_at: string
          id: string
          options: Json
          post_id: string
          question: string
          votes: Json
        }
        Insert: {
          created_at?: string
          id?: string
          options?: Json
          post_id: string
          question: string
          votes?: Json
        }
        Update: {
          created_at?: string
          id?: string
          options?: Json
          post_id?: string
          question?: string
          votes?: Json
        }
        Relationships: [
          {
            foreignKeyName: "community_polls_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          category: string
          comments_count: number
          content: string
          created_at: string
          food_calories: number | null
          food_name: string | null
          food_protein: number | null
          id: string
          image_url: string | null
          is_founder_post: boolean
          is_pinned: boolean
          likes_count: number
          section: string
          user_id: string
        }
        Insert: {
          category?: string
          comments_count?: number
          content: string
          created_at?: string
          food_calories?: number | null
          food_name?: string | null
          food_protein?: number | null
          id?: string
          image_url?: string | null
          is_founder_post?: boolean
          is_pinned?: boolean
          likes_count?: number
          section: string
          user_id: string
        }
        Update: {
          category?: string
          comments_count?: number
          content?: string
          created_at?: string
          food_calories?: number | null
          food_name?: string | null
          food_protein?: number | null
          id?: string
          image_url?: string | null
          is_founder_post?: boolean
          is_pinned?: boolean
          likes_count?: number
          section?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      community_reports: {
        Row: {
          created_at: string
          id: string
          post_id: string | null
          reason: string
          reporter_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id?: string | null
          reason: string
          reporter_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string | null
          reason?: string
          reporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      community_unlock_counter: {
        Row: {
          active_user_count: number
          id: number
          updated_at: string | null
        }
        Insert: {
          active_user_count?: number
          id?: number
          updated_at?: string | null
        }
        Update: {
          active_user_count?: number
          id?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      daily_macro_tiers: {
        Row: {
          date: string
          locked: boolean
          macro: string
          tier: number
          updated_at: string
          user_id: string
          xp_awarded: number
        }
        Insert: {
          date: string
          locked?: boolean
          macro: string
          tier?: number
          updated_at?: string
          user_id: string
          xp_awarded?: number
        }
        Update: {
          date?: string
          locked?: boolean
          macro?: string
          tier?: number
          updated_at?: string
          user_id?: string
          xp_awarded?: number
        }
        Relationships: []
      }
      daily_missions: {
        Row: {
          bonus_claimed: boolean
          created_at: string
          date: string
          days_active: number
          id: string
          mission_1_completed: boolean
          mission_1_completed_at: string | null
          mission_1_target: number
          mission_1_type: string
          mission_2_completed: boolean
          mission_2_completed_at: string | null
          mission_2_target: number
          mission_2_type: string
          mission_3_completed: boolean
          mission_3_completed_at: string | null
          mission_3_target: number
          mission_3_type: string
          mission_4_completed: boolean
          mission_4_completed_at: string | null
          mission_4_target: number | null
          mission_4_type: string | null
          mission_5_completed: boolean
          mission_5_completed_at: string | null
          mission_5_target: number | null
          mission_5_type: string | null
          mission_tier: number
          translations: Json | null
          user_id: string
        }
        Insert: {
          bonus_claimed?: boolean
          created_at?: string
          date: string
          days_active?: number
          id?: string
          mission_1_completed?: boolean
          mission_1_completed_at?: string | null
          mission_1_target?: number
          mission_1_type: string
          mission_2_completed?: boolean
          mission_2_completed_at?: string | null
          mission_2_target?: number
          mission_2_type: string
          mission_3_completed?: boolean
          mission_3_completed_at?: string | null
          mission_3_target?: number
          mission_3_type: string
          mission_4_completed?: boolean
          mission_4_completed_at?: string | null
          mission_4_target?: number | null
          mission_4_type?: string | null
          mission_5_completed?: boolean
          mission_5_completed_at?: string | null
          mission_5_target?: number | null
          mission_5_type?: string | null
          mission_tier?: number
          translations?: Json | null
          user_id: string
        }
        Update: {
          bonus_claimed?: boolean
          created_at?: string
          date?: string
          days_active?: number
          id?: string
          mission_1_completed?: boolean
          mission_1_completed_at?: string | null
          mission_1_target?: number
          mission_1_type?: string
          mission_2_completed?: boolean
          mission_2_completed_at?: string | null
          mission_2_target?: number
          mission_2_type?: string
          mission_3_completed?: boolean
          mission_3_completed_at?: string | null
          mission_3_target?: number
          mission_3_type?: string
          mission_4_completed?: boolean
          mission_4_completed_at?: string | null
          mission_4_target?: number | null
          mission_4_type?: string | null
          mission_5_completed?: boolean
          mission_5_completed_at?: string | null
          mission_5_target?: number | null
          mission_5_type?: string | null
          mission_tier?: number
          translations?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_missions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      edu_post_topics: {
        Row: {
          created_at: string | null
          id: string
          topic: string
          week_start: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          topic: string
          week_start: string
        }
        Update: {
          created_at?: string | null
          id?: string
          topic?: string
          week_start?: string
        }
        Relationships: []
      }
      estimator_corrections: {
        Row: {
          corrected_grams: number | null
          created_at: string | null
          detected_restaurant: string | null
          food_item_name: string
          from_cache: boolean | null
          id: string
          id_confidence: string | null
          model_portion_confidence: string | null
          nutrition_confidence: string | null
          nutrition_match_confidence: string | null
          predicted_grams: number | null
          retrieval_date: string | null
          scale_verified: boolean | null
          scan_mode: string | null
          source_name: string | null
          source_type: string | null
          source_url: string | null
          user_id: string | null
        }
        Insert: {
          corrected_grams?: number | null
          created_at?: string | null
          detected_restaurant?: string | null
          food_item_name: string
          from_cache?: boolean | null
          id?: string
          id_confidence?: string | null
          model_portion_confidence?: string | null
          nutrition_confidence?: string | null
          nutrition_match_confidence?: string | null
          predicted_grams?: number | null
          retrieval_date?: string | null
          scale_verified?: boolean | null
          scan_mode?: string | null
          source_name?: string | null
          source_type?: string | null
          source_url?: string | null
          user_id?: string | null
        }
        Update: {
          corrected_grams?: number | null
          created_at?: string | null
          detected_restaurant?: string | null
          food_item_name?: string
          from_cache?: boolean | null
          id?: string
          id_confidence?: string | null
          model_portion_confidence?: string | null
          nutrition_confidence?: string | null
          nutrition_match_confidence?: string | null
          predicted_grams?: number | null
          retrieval_date?: string | null
          scale_verified?: boolean | null
          scan_mode?: string | null
          source_name?: string | null
          source_type?: string | null
          source_url?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      favorites: {
        Row: {
          brand: string | null
          created_at: string
          default_grams: number
          food_code: string | null
          food_item_id: string | null
          food_name: string
          food_source: string
          id: string
          per100_calories: number
          per100_carbs: number
          per100_fat: number
          per100_fiber: number
          per100_protein: number
          serving_size: string | null
          serving_unit: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          brand?: string | null
          created_at?: string
          default_grams?: number
          food_code?: string | null
          food_item_id?: string | null
          food_name: string
          food_source: string
          id?: string
          per100_calories?: number
          per100_carbs?: number
          per100_fat?: number
          per100_fiber?: number
          per100_protein?: number
          serving_size?: string | null
          serving_unit?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          brand?: string | null
          created_at?: string
          default_grams?: number
          food_code?: string | null
          food_item_id?: string | null
          food_name?: string
          food_source?: string
          id?: string
          per100_calories?: number
          per100_carbs?: number
          per100_fat?: number
          per100_fiber?: number
          per100_protein?: number
          serving_size?: string | null
          serving_unit?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "food_items"
            referencedColumns: ["id"]
          },
        ]
      }
      flash_challenges: {
        Row: {
          accepted_at: string | null
          baseline_value: number | null
          challenge_status: string
          completed: boolean
          completed_at: string | null
          created_at: string
          date: string
          description: string
          difficulty: string
          duration_hours: number
          expires_at: string
          id: string
          metric_type: string
          target_unit: string
          target_value: number
          title: string
          translations: Json | null
          updated_at: string
          user_id: string
          xp_reward: number
        }
        Insert: {
          accepted_at?: string | null
          baseline_value?: number | null
          challenge_status?: string
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          date: string
          description: string
          difficulty: string
          duration_hours?: number
          expires_at?: string
          id?: string
          metric_type: string
          target_unit: string
          target_value: number
          title: string
          translations?: Json | null
          updated_at?: string
          user_id: string
          xp_reward: number
        }
        Update: {
          accepted_at?: string | null
          baseline_value?: number | null
          challenge_status?: string
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          date?: string
          description?: string
          difficulty?: string
          duration_hours?: number
          expires_at?: string
          id?: string
          metric_type?: string
          target_unit?: string
          target_value?: number
          title?: string
          translations?: Json | null
          updated_at?: string
          user_id?: string
          xp_reward?: number
        }
        Relationships: []
      }
      follow_requests: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          id: string
          owner_id: string
          requester_id: string
          revision: number
          state: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          id?: string
          owner_id: string
          requester_id: string
          revision?: number
          state?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          id?: string
          owner_id?: string
          requester_id?: string
          revision?: number
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_requests_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_requests_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      food_item_logs: {
        Row: {
          food_item_id: string
          id: string
          logged_at: string
          points: number
          source: string
          user_id: string
        }
        Insert: {
          food_item_id: string
          id?: string
          logged_at?: string
          points?: number
          source?: string
          user_id: string
        }
        Update: {
          food_item_id?: string
          id?: string
          logged_at?: string
          points?: number
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_item_logs_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "food_items"
            referencedColumns: ["id"]
          },
        ]
      }
      food_items: {
        Row: {
          added_sugar_g: number | null
          added_sugars: number | null
          ai_verified: boolean | null
          ai_verified_at: string | null
          ai_verified_source: string | null
          alcohol_g: number | null
          allergens: string[] | null
          barcode: string | null
          biotin: number | null
          biotin_mcg: number | null
          brand: string | null
          brands: string | null
          calcium: number | null
          calcium_mg: number | null
          calories: number | null
          carbs: number | null
          chloride: number | null
          cholesterol: number | null
          cholesterol_mg: number | null
          choline: number | null
          choline_mg: number | null
          chromium: number | null
          chromium_mcg: number | null
          confidence: string | null
          copper: number | null
          copper_mg: number | null
          created_at: string
          data_quality_score: number | null
          fat: number | null
          fiber: number | null
          folate_mcg: number | null
          generic_name: string | null
          id: string
          image_url: string | null
          ingredients_text: string | null
          insoluble_fiber: number | null
          insoluble_fiber_g: number | null
          iodine: number | null
          iodine_mcg: number | null
          iron: number | null
          iron_mg: number | null
          last_logged_at: string | null
          last_searched_at: string | null
          last_verified_at: string | null
          logs_last_30d: number
          logs_last_90d: number
          logs_total: number
          macros_per: string | null
          magnesium: number | null
          magnesium_mg: number | null
          manganese: number | null
          manganese_mg: number | null
          molybdenum: number | null
          monounsaturated_fat: number | null
          monounsaturated_fat_g: number | null
          name: string
          nutriments: Json
          nutriscore_grade: string | null
          off_data: Json | null
          pantothenic_acid_mg: number | null
          phosphorus: number | null
          phosphorus_mg: number | null
          polyunsaturated_fat: number | null
          polyunsaturated_fat_g: number | null
          popularity_score: number
          potassium: number | null
          potassium_mg: number | null
          product_name: string | null
          protein: number | null
          saturated_fat: number | null
          saturated_fat_g: number | null
          search_count: number
          search_vector: unknown
          selenium: number | null
          selenium_mcg: number | null
          serving_count: number | null
          serving_description: string | null
          serving_quantity: string | null
          serving_size: number | null
          serving_unit: string | null
          sodium: number | null
          sodium_mg: number | null
          soluble_fiber: number | null
          soluble_fiber_g: number | null
          source: string
          source_id: string | null
          starch: number | null
          sugar: number | null
          sugar_alcohols: number | null
          sugar_g: number | null
          total_logs: number | null
          trans_fat: number | null
          trans_fat_g: number | null
          updated_at: string
          usda_fdc_id: string | null
          verified: boolean | null
          vitamin_a: number | null
          vitamin_a_mcg: number | null
          vitamin_b1: number | null
          vitamin_b1_mg: number | null
          vitamin_b12: number | null
          vitamin_b12_mcg: number | null
          vitamin_b2: number | null
          vitamin_b2_mg: number | null
          vitamin_b3: number | null
          vitamin_b3_mg: number | null
          vitamin_b5: number | null
          vitamin_b6: number | null
          vitamin_b6_mg: number | null
          vitamin_b9: number | null
          vitamin_c: number | null
          vitamin_c_mg: number | null
          vitamin_d: number | null
          vitamin_d_mcg: number | null
          vitamin_e: number | null
          vitamin_e_mg: number | null
          vitamin_k: number | null
          vitamin_k_mcg: number | null
          water_g: number | null
          zinc: number | null
          zinc_mg: number | null
        }
        Insert: {
          added_sugar_g?: number | null
          added_sugars?: number | null
          ai_verified?: boolean | null
          ai_verified_at?: string | null
          ai_verified_source?: string | null
          alcohol_g?: number | null
          allergens?: string[] | null
          barcode?: string | null
          biotin?: number | null
          biotin_mcg?: number | null
          brand?: string | null
          brands?: string | null
          calcium?: number | null
          calcium_mg?: number | null
          calories?: number | null
          carbs?: number | null
          chloride?: number | null
          cholesterol?: number | null
          cholesterol_mg?: number | null
          choline?: number | null
          choline_mg?: number | null
          chromium?: number | null
          chromium_mcg?: number | null
          confidence?: string | null
          copper?: number | null
          copper_mg?: number | null
          created_at?: string
          data_quality_score?: number | null
          fat?: number | null
          fiber?: number | null
          folate_mcg?: number | null
          generic_name?: string | null
          id?: string
          image_url?: string | null
          ingredients_text?: string | null
          insoluble_fiber?: number | null
          insoluble_fiber_g?: number | null
          iodine?: number | null
          iodine_mcg?: number | null
          iron?: number | null
          iron_mg?: number | null
          last_logged_at?: string | null
          last_searched_at?: string | null
          last_verified_at?: string | null
          logs_last_30d?: number
          logs_last_90d?: number
          logs_total?: number
          macros_per?: string | null
          magnesium?: number | null
          magnesium_mg?: number | null
          manganese?: number | null
          manganese_mg?: number | null
          molybdenum?: number | null
          monounsaturated_fat?: number | null
          monounsaturated_fat_g?: number | null
          name: string
          nutriments?: Json
          nutriscore_grade?: string | null
          off_data?: Json | null
          pantothenic_acid_mg?: number | null
          phosphorus?: number | null
          phosphorus_mg?: number | null
          polyunsaturated_fat?: number | null
          polyunsaturated_fat_g?: number | null
          popularity_score?: number
          potassium?: number | null
          potassium_mg?: number | null
          product_name?: string | null
          protein?: number | null
          saturated_fat?: number | null
          saturated_fat_g?: number | null
          search_count?: number
          search_vector?: unknown
          selenium?: number | null
          selenium_mcg?: number | null
          serving_count?: number | null
          serving_description?: string | null
          serving_quantity?: string | null
          serving_size?: number | null
          serving_unit?: string | null
          sodium?: number | null
          sodium_mg?: number | null
          soluble_fiber?: number | null
          soluble_fiber_g?: number | null
          source?: string
          source_id?: string | null
          starch?: number | null
          sugar?: number | null
          sugar_alcohols?: number | null
          sugar_g?: number | null
          total_logs?: number | null
          trans_fat?: number | null
          trans_fat_g?: number | null
          updated_at?: string
          usda_fdc_id?: string | null
          verified?: boolean | null
          vitamin_a?: number | null
          vitamin_a_mcg?: number | null
          vitamin_b1?: number | null
          vitamin_b1_mg?: number | null
          vitamin_b12?: number | null
          vitamin_b12_mcg?: number | null
          vitamin_b2?: number | null
          vitamin_b2_mg?: number | null
          vitamin_b3?: number | null
          vitamin_b3_mg?: number | null
          vitamin_b5?: number | null
          vitamin_b6?: number | null
          vitamin_b6_mg?: number | null
          vitamin_b9?: number | null
          vitamin_c?: number | null
          vitamin_c_mg?: number | null
          vitamin_d?: number | null
          vitamin_d_mcg?: number | null
          vitamin_e?: number | null
          vitamin_e_mg?: number | null
          vitamin_k?: number | null
          vitamin_k_mcg?: number | null
          water_g?: number | null
          zinc?: number | null
          zinc_mg?: number | null
        }
        Update: {
          added_sugar_g?: number | null
          added_sugars?: number | null
          ai_verified?: boolean | null
          ai_verified_at?: string | null
          ai_verified_source?: string | null
          alcohol_g?: number | null
          allergens?: string[] | null
          barcode?: string | null
          biotin?: number | null
          biotin_mcg?: number | null
          brand?: string | null
          brands?: string | null
          calcium?: number | null
          calcium_mg?: number | null
          calories?: number | null
          carbs?: number | null
          chloride?: number | null
          cholesterol?: number | null
          cholesterol_mg?: number | null
          choline?: number | null
          choline_mg?: number | null
          chromium?: number | null
          chromium_mcg?: number | null
          confidence?: string | null
          copper?: number | null
          copper_mg?: number | null
          created_at?: string
          data_quality_score?: number | null
          fat?: number | null
          fiber?: number | null
          folate_mcg?: number | null
          generic_name?: string | null
          id?: string
          image_url?: string | null
          ingredients_text?: string | null
          insoluble_fiber?: number | null
          insoluble_fiber_g?: number | null
          iodine?: number | null
          iodine_mcg?: number | null
          iron?: number | null
          iron_mg?: number | null
          last_logged_at?: string | null
          last_searched_at?: string | null
          last_verified_at?: string | null
          logs_last_30d?: number
          logs_last_90d?: number
          logs_total?: number
          macros_per?: string | null
          magnesium?: number | null
          magnesium_mg?: number | null
          manganese?: number | null
          manganese_mg?: number | null
          molybdenum?: number | null
          monounsaturated_fat?: number | null
          monounsaturated_fat_g?: number | null
          name?: string
          nutriments?: Json
          nutriscore_grade?: string | null
          off_data?: Json | null
          pantothenic_acid_mg?: number | null
          phosphorus?: number | null
          phosphorus_mg?: number | null
          polyunsaturated_fat?: number | null
          polyunsaturated_fat_g?: number | null
          popularity_score?: number
          potassium?: number | null
          potassium_mg?: number | null
          product_name?: string | null
          protein?: number | null
          saturated_fat?: number | null
          saturated_fat_g?: number | null
          search_count?: number
          search_vector?: unknown
          selenium?: number | null
          selenium_mcg?: number | null
          serving_count?: number | null
          serving_description?: string | null
          serving_quantity?: string | null
          serving_size?: number | null
          serving_unit?: string | null
          sodium?: number | null
          sodium_mg?: number | null
          soluble_fiber?: number | null
          soluble_fiber_g?: number | null
          source?: string
          source_id?: string | null
          starch?: number | null
          sugar?: number | null
          sugar_alcohols?: number | null
          sugar_g?: number | null
          total_logs?: number | null
          trans_fat?: number | null
          trans_fat_g?: number | null
          updated_at?: string
          usda_fdc_id?: string | null
          verified?: boolean | null
          vitamin_a?: number | null
          vitamin_a_mcg?: number | null
          vitamin_b1?: number | null
          vitamin_b1_mg?: number | null
          vitamin_b12?: number | null
          vitamin_b12_mcg?: number | null
          vitamin_b2?: number | null
          vitamin_b2_mg?: number | null
          vitamin_b3?: number | null
          vitamin_b3_mg?: number | null
          vitamin_b5?: number | null
          vitamin_b6?: number | null
          vitamin_b6_mg?: number | null
          vitamin_b9?: number | null
          vitamin_c?: number | null
          vitamin_c_mg?: number | null
          vitamin_d?: number | null
          vitamin_d_mcg?: number | null
          vitamin_e?: number | null
          vitamin_e_mg?: number | null
          vitamin_k?: number | null
          vitamin_k_mcg?: number | null
          water_g?: number | null
          zinc?: number | null
          zinc_mg?: number | null
        }
        Relationships: []
      }
      food_scans: {
        Row: {
          food_item_id: string
          id: string
          scanned_at: string
          scanned_date: string | null
          user_id: string
        }
        Insert: {
          food_item_id: string
          id?: string
          scanned_at?: string
          scanned_date?: string | null
          user_id: string
        }
        Update: {
          food_item_id?: string
          id?: string
          scanned_at?: string
          scanned_date?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_scans_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "food_items"
            referencedColumns: ["id"]
          },
        ]
      }
      food_submissions: {
        Row: {
          ai_confidence: number | null
          ai_notes: string | null
          barcode: string
          created_at: string
          extracted_data: Json | null
          food_item_id: string | null
          id: string
          photo_front_url: string | null
          photo_label_url: string
          status: string
          submitted_by_user_id: string | null
          type: string
        }
        Insert: {
          ai_confidence?: number | null
          ai_notes?: string | null
          barcode: string
          created_at?: string
          extracted_data?: Json | null
          food_item_id?: string | null
          id?: string
          photo_front_url?: string | null
          photo_label_url: string
          status?: string
          submitted_by_user_id?: string | null
          type: string
        }
        Update: {
          ai_confidence?: number | null
          ai_notes?: string | null
          barcode?: string
          created_at?: string
          extracted_data?: Json | null
          food_item_id?: string | null
          id?: string
          photo_front_url?: string | null
          photo_label_url?: string
          status?: string
          submitted_by_user_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_submissions_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "food_items"
            referencedColumns: ["id"]
          },
        ]
      }
      food_usage_logs: {
        Row: {
          food_item_id: string
          id: string
          logged_at: string
          source: string
          user_id: string | null
        }
        Insert: {
          food_item_id: string
          id?: string
          logged_at?: string
          source?: string
          user_id?: string | null
        }
        Update: {
          food_item_id?: string
          id?: string
          logged_at?: string
          source?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "food_usage_logs_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "food_items"
            referencedColumns: ["id"]
          },
        ]
      }
      foods: {
        Row: {
          barcode: string | null
          brand: string | null
          calories: number
          carbs: number
          created_at: string | null
          created_by: string | null
          data_type: string | null
          fats: number
          fdc_id: number | null
          fiber: number
          id: string
          name: string
          protein: number
          serving_amount: number
          serving_unit: string
          updated_at: string | null
          user_created: boolean | null
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          calories: number
          carbs: number
          created_at?: string | null
          created_by?: string | null
          data_type?: string | null
          fats: number
          fdc_id?: number | null
          fiber?: number
          id?: string
          name: string
          protein: number
          serving_amount: number
          serving_unit: string
          updated_at?: string | null
          user_created?: boolean | null
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          calories?: number
          carbs?: number
          created_at?: string | null
          created_by?: string | null
          data_type?: string | null
          fats?: number
          fdc_id?: number | null
          fiber?: number
          id?: string
          name?: string
          protein?: number
          serving_amount?: number
          serving_unit?: string
          updated_at?: string | null
          user_created?: boolean | null
        }
        Relationships: []
      }
      founder_post_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          post_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          post_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          post_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "founder_post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "founder_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      founder_post_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "founder_post_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "founder_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      founder_posts: {
        Row: {
          author_id: string
          category: string
          content: string
          created_at: string
          id: string
          image_url: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          category?: string
          content: string
          created_at?: string
          id?: string
          image_url?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          category?: string
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          base_daily_calories: number | null
          carbs_g: number
          created_at: string | null
          daily_calories: number
          fats_g: number
          fiber_g: number
          goal_intensity: number | null
          goal_type: string
          id: string
          is_active: boolean | null
          last_adaptive_update: string | null
          loss_rate_lbs_per_week: number | null
          macro_preset: string | null
          protein_g: number
          start_date: string | null
          start_journey_date: string | null
          target_weight: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          base_daily_calories?: number | null
          carbs_g: number
          created_at?: string | null
          daily_calories: number
          fats_g: number
          fiber_g: number
          goal_intensity?: number | null
          goal_type: string
          id?: string
          is_active?: boolean | null
          last_adaptive_update?: string | null
          loss_rate_lbs_per_week?: number | null
          macro_preset?: string | null
          protein_g: number
          start_date?: string | null
          start_journey_date?: string | null
          target_weight?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          base_daily_calories?: number | null
          carbs_g?: number
          created_at?: string | null
          daily_calories?: number
          fats_g?: number
          fiber_g?: number
          goal_intensity?: number | null
          goal_type?: string
          id?: string
          is_active?: boolean | null
          last_adaptive_update?: string | null
          loss_rate_lbs_per_week?: number | null
          macro_preset?: string | null
          protein_g?: number
          start_date?: string | null
          start_journey_date?: string | null
          target_weight?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_bot_steps: {
        Row: {
          bot_id: string
          id: string
          step_date: string
          steps: number
        }
        Insert: {
          bot_id: string
          id?: string
          step_date: string
          steps?: number
        }
        Update: {
          bot_id?: string
          id?: string
          step_date?: string
          steps?: number
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_bot_steps_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "league_bots"
            referencedColumns: ["id"]
          },
        ]
      }
      league_bot_tracker_data: {
        Row: {
          bot_id: string
          date: string
          tracker_name: string
          value: number
        }
        Insert: {
          bot_id: string
          date: string
          tracker_name: string
          value?: number
        }
        Update: {
          bot_id?: string
          date?: string
          tracker_name?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "league_bot_tracker_data_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "league_bots"
            referencedColumns: ["id"]
          },
        ]
      }
      league_bot_weekly_xp: {
        Row: {
          bot_id: string
          room_id: string | null
          week_start: string
          weekly_target: number
          xp: number
        }
        Insert: {
          bot_id: string
          room_id?: string | null
          week_start: string
          weekly_target?: number
          xp?: number
        }
        Update: {
          bot_id?: string
          room_id?: string | null
          week_start?: string
          weekly_target?: number
          xp?: number
        }
        Relationships: [
          {
            foreignKeyName: "league_bot_weekly_xp_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "league_bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_bot_weekly_xp_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "league_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      league_bots: {
        Row: {
          avatar_url: string
          created_at: string | null
          id: string
          tier: string
          username: string
        }
        Insert: {
          avatar_url: string
          created_at?: string | null
          id?: string
          tier: string
          username: string
        }
        Update: {
          avatar_url?: string
          created_at?: string | null
          id?: string
          tier?: string
          username?: string
        }
        Relationships: []
      }
      league_rooms: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          member_count: number
          tier: string
          week_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          member_count?: number
          tier: string
          week_start: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          member_count?: number
          tier?: string
          week_start?: string
        }
        Relationships: []
      }
      meal_items: {
        Row: {
          calories: number
          carbs: number
          created_at: string | null
          fats: number
          fiber: number
          food_brand: string | null
          food_id: string | null
          food_item_id: string | null
          food_name: string | null
          grams: number | null
          id: string
          is_scheduled: boolean
          logged_at: string | null
          meal_id: string
          off_data: Json | null
          protein: number
          quantity: number
          serving_description: string | null
          serving_unit: string | null
        }
        Insert: {
          calories: number
          carbs: number
          created_at?: string | null
          fats: number
          fiber?: number
          food_brand?: string | null
          food_id?: string | null
          food_item_id?: string | null
          food_name?: string | null
          grams?: number | null
          id?: string
          is_scheduled?: boolean
          logged_at?: string | null
          meal_id: string
          off_data?: Json | null
          protein: number
          quantity?: number
          serving_description?: string | null
          serving_unit?: string | null
        }
        Update: {
          calories?: number
          carbs?: number
          created_at?: string | null
          fats?: number
          fiber?: number
          food_brand?: string | null
          food_id?: string | null
          food_item_id?: string | null
          food_name?: string | null
          grams?: number | null
          id?: string
          is_scheduled?: boolean
          logged_at?: string | null
          meal_id?: string
          off_data?: Json | null
          protein?: number
          quantity?: number
          serving_description?: string | null
          serving_unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_items_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_items_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "food_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_items_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "meals"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan_items: {
        Row: {
          brand: string | null
          calories: number
          carbs: number
          created_at: string | null
          date: string
          dish_description: string | null
          fats: number
          fiber: number | null
          food_id: string | null
          food_item_id: string | null
          food_name: string
          grams: number | null
          id: string
          meal_type: string
          plan_id: string
          protein: number
          quantity: number
          recipe_url: string | null
          serving_description: string | null
          serving_unit: string | null
          translations: Json | null
        }
        Insert: {
          brand?: string | null
          calories?: number
          carbs?: number
          created_at?: string | null
          date: string
          dish_description?: string | null
          fats?: number
          fiber?: number | null
          food_id?: string | null
          food_item_id?: string | null
          food_name: string
          grams?: number | null
          id?: string
          meal_type: string
          plan_id: string
          protein?: number
          quantity?: number
          recipe_url?: string | null
          serving_description?: string | null
          serving_unit?: string | null
          translations?: Json | null
        }
        Update: {
          brand?: string | null
          calories?: number
          carbs?: number
          created_at?: string | null
          date?: string
          dish_description?: string | null
          fats?: number
          fiber?: number | null
          food_id?: string | null
          food_item_id?: string | null
          food_name?: string
          grams?: number | null
          id?: string
          meal_type?: string
          plan_id?: string
          protein?: number
          quantity?: number
          recipe_url?: string | null
          serving_description?: string | null
          serving_unit?: string | null
          translations?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_items_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_items_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "food_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plans: {
        Row: {
          created_at: string | null
          description: string | null
          end_date: string
          id: string
          name: string
          start_date: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          end_date: string
          id?: string
          name: string
          start_date: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          end_date?: string
          id?: string
          name?: string
          start_date?: string
          user_id?: string
        }
        Relationships: []
      }
      meal_recipes: {
        Row: {
          approved_for_meal_plan: boolean | null
          average_rating: number | null
          calories: number
          carbs: number
          created_at: string | null
          created_by: string | null
          cuisine: string
          description: string
          dietary_tags: string[] | null
          fat: number
          id: string
          ingredients: Json | null
          instructions: string | null
          is_public: boolean | null
          main_protein: string | null
          meal_type: string
          mealdb_id: string | null
          name: string
          protein: number
          protein_type: string | null
          recipe_style_tags: string[] | null
          review_count: number | null
          source: string | null
          thumbnail_url: string | null
          translations: Json | null
        }
        Insert: {
          approved_for_meal_plan?: boolean | null
          average_rating?: number | null
          calories: number
          carbs: number
          created_at?: string | null
          created_by?: string | null
          cuisine: string
          description: string
          dietary_tags?: string[] | null
          fat: number
          id?: string
          ingredients?: Json | null
          instructions?: string | null
          is_public?: boolean | null
          main_protein?: string | null
          meal_type: string
          mealdb_id?: string | null
          name: string
          protein: number
          protein_type?: string | null
          recipe_style_tags?: string[] | null
          review_count?: number | null
          source?: string | null
          thumbnail_url?: string | null
          translations?: Json | null
        }
        Update: {
          approved_for_meal_plan?: boolean | null
          average_rating?: number | null
          calories?: number
          carbs?: number
          created_at?: string | null
          created_by?: string | null
          cuisine?: string
          description?: string
          dietary_tags?: string[] | null
          fat?: number
          id?: string
          ingredients?: Json | null
          instructions?: string | null
          is_public?: boolean | null
          main_protein?: string | null
          meal_type?: string
          mealdb_id?: string | null
          name?: string
          protein?: number
          protein_type?: string | null
          recipe_style_tags?: string[] | null
          review_count?: number | null
          source?: string | null
          thumbnail_url?: string | null
          translations?: Json | null
        }
        Relationships: []
      }
      meals: {
        Row: {
          created_at: string | null
          date: string
          id: string
          meal_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          meal_type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          meal_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      nutrition_cache: {
        Row: {
          cache_key: string
          calories_per_100g: number | null
          carbs_per_100g: number | null
          created_at: string | null
          expires_at: string
          fat_per_100g: number | null
          fiber_per_100g: number | null
          food_name: string
          id: string
          nutrition_match_confidence: string | null
          protein_per_100g: number | null
          restaurant_name: string | null
          retrieval_date: string | null
          source_name: string | null
          source_type: string
          source_url: string | null
        }
        Insert: {
          cache_key: string
          calories_per_100g?: number | null
          carbs_per_100g?: number | null
          created_at?: string | null
          expires_at: string
          fat_per_100g?: number | null
          fiber_per_100g?: number | null
          food_name: string
          id?: string
          nutrition_match_confidence?: string | null
          protein_per_100g?: number | null
          restaurant_name?: string | null
          retrieval_date?: string | null
          source_name?: string | null
          source_type: string
          source_url?: string | null
        }
        Update: {
          cache_key?: string
          calories_per_100g?: number | null
          carbs_per_100g?: number | null
          created_at?: string | null
          expires_at?: string
          fat_per_100g?: number | null
          fiber_per_100g?: number | null
          food_name?: string
          id?: string
          nutrition_match_confidence?: string | null
          protein_per_100g?: number | null
          restaurant_name?: string | null
          retrieval_date?: string | null
          source_name?: string | null
          source_type?: string
          source_url?: string | null
        }
        Relationships: []
      }
      onboarding_events: {
        Row: {
          created_at: string
          event: string
          id: string
          properties: Json | null
          session_id: string
          step: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          properties?: Json | null
          session_id: string
          step?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          properties?: Json | null
          session_id?: string
          step?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      onboarding_funnel: {
        Row: {
          completed: boolean
          completed_at: string | null
          first_meal_at: string | null
          first_paywall_action: string | null
          id: string
          max_step_reached: number
          paywall_action_at: string | null
          paywall_shown: boolean
          paywall_shown_at: string | null
          session_id: string
          started_at: string
          trial_skipped: boolean
          trial_started: boolean
          updated_at: string
          user_id: string | null
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          first_meal_at?: string | null
          first_paywall_action?: string | null
          id?: string
          max_step_reached?: number
          paywall_action_at?: string | null
          paywall_shown?: boolean
          paywall_shown_at?: string | null
          session_id: string
          started_at?: string
          trial_skipped?: boolean
          trial_started?: boolean
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          first_meal_at?: string | null
          first_paywall_action?: string | null
          id?: string
          max_step_reached?: number
          paywall_action_at?: string | null
          paywall_shown?: boolean
          paywall_shown_at?: string | null
          session_id?: string
          started_at?: string
          trial_skipped?: boolean
          trial_started?: boolean
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_funnel_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      popular_recipes: {
        Row: {
          calories_per_serving: number | null
          carbs_per_serving: number | null
          click_count: number | null
          description: string | null
          fat_per_serving: number | null
          fiber_per_serving: number | null
          generated_at: string | null
          id: string
          image_url: string | null
          ingredients: Json | null
          instructions: Json | null
          last_clicked_at: string | null
          name: string
          prep_time_minutes: number | null
          protein_per_serving: number | null
          recipe_id: string | null
          reviews: Json | null
          servings: number | null
          source_name: string | null
          source_url: string | null
          tags: Json | null
        }
        Insert: {
          calories_per_serving?: number | null
          carbs_per_serving?: number | null
          click_count?: number | null
          description?: string | null
          fat_per_serving?: number | null
          fiber_per_serving?: number | null
          generated_at?: string | null
          id: string
          image_url?: string | null
          ingredients?: Json | null
          instructions?: Json | null
          last_clicked_at?: string | null
          name: string
          prep_time_minutes?: number | null
          protein_per_serving?: number | null
          recipe_id?: string | null
          reviews?: Json | null
          servings?: number | null
          source_name?: string | null
          source_url?: string | null
          tags?: Json | null
        }
        Update: {
          calories_per_serving?: number | null
          carbs_per_serving?: number | null
          click_count?: number | null
          description?: string | null
          fat_per_serving?: number | null
          fiber_per_serving?: number | null
          generated_at?: string | null
          id?: string
          image_url?: string | null
          ingredients?: Json | null
          instructions?: Json | null
          last_clicked_at?: string | null
          name?: string
          prep_time_minutes?: number | null
          protein_per_serving?: number | null
          recipe_id?: string | null
          reviews?: Json | null
          servings?: number | null
          source_name?: string | null
          source_url?: string | null
          tags?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "popular_recipes_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      progress_post_media: {
        Row: {
          created_at: string
          id: string
          idempotency_key: string
          owner_id: string
          post_id: string | null
          sha256: string
          slot: number | null
          source_photo_id: string
          state: string
        }
        Insert: {
          created_at?: string
          id?: string
          idempotency_key: string
          owner_id: string
          post_id?: string | null
          sha256: string
          slot?: number | null
          source_photo_id: string
          state?: string
        }
        Update: {
          created_at?: string
          id?: string
          idempotency_key?: string
          owner_id?: string
          post_id?: string | null
          sha256?: string
          slot?: number | null
          source_photo_id?: string
          state?: string
        }
        Relationships: []
      }
      recipe_image_audits: {
        Row: {
          audited_at: string | null
          confidence: string | null
          id: string
          image_url: string | null
          match: boolean | null
          new_image_url: string | null
          reason: string | null
          recipe_id: string | null
          recipe_title: string | null
          regen_count: number
          regenerated: boolean | null
          what_image_shows: string | null
        }
        Insert: {
          audited_at?: string | null
          confidence?: string | null
          id?: string
          image_url?: string | null
          match?: boolean | null
          new_image_url?: string | null
          reason?: string | null
          recipe_id?: string | null
          recipe_title?: string | null
          regen_count?: number
          regenerated?: boolean | null
          what_image_shows?: string | null
        }
        Update: {
          audited_at?: string | null
          confidence?: string | null
          id?: string
          image_url?: string | null
          match?: boolean | null
          new_image_url?: string | null
          reason?: string | null
          recipe_id?: string | null
          recipe_title?: string | null
          regen_count?: number
          regenerated?: boolean | null
          what_image_shows?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_image_audits_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: true
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          calories_per_serving: number
          carbs_per_serving: number
          click_count: number | null
          created_at: string | null
          cuisine_type: string | null
          description: string | null
          external_id: string | null
          fat_per_serving: number
          fiber_per_serving: number | null
          id: string
          image_url: string | null
          ingredients: Json
          instructions: Json
          last_clicked_at: string | null
          last_searched_at: string | null
          last_served_at: string | null
          meal_type: string | null
          prep_time_minutes: number | null
          protein_per_serving: number
          reviews: Json
          save_count: number | null
          search_count: number
          search_vector: unknown
          servings: number | null
          source_name: string
          source_url: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
          usda_verified: boolean
          verified: boolean | null
        }
        Insert: {
          calories_per_serving: number
          carbs_per_serving?: number
          click_count?: number | null
          created_at?: string | null
          cuisine_type?: string | null
          description?: string | null
          external_id?: string | null
          fat_per_serving?: number
          fiber_per_serving?: number | null
          id?: string
          image_url?: string | null
          ingredients?: Json
          instructions?: Json
          last_clicked_at?: string | null
          last_searched_at?: string | null
          last_served_at?: string | null
          meal_type?: string | null
          prep_time_minutes?: number | null
          protein_per_serving?: number
          reviews?: Json
          save_count?: number | null
          search_count?: number
          search_vector?: unknown
          servings?: number | null
          source_name: string
          source_url?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          usda_verified?: boolean
          verified?: boolean | null
        }
        Update: {
          calories_per_serving?: number
          carbs_per_serving?: number
          click_count?: number | null
          created_at?: string | null
          cuisine_type?: string | null
          description?: string | null
          external_id?: string | null
          fat_per_serving?: number
          fiber_per_serving?: number | null
          id?: string
          image_url?: string | null
          ingredients?: Json
          instructions?: Json
          last_clicked_at?: string | null
          last_searched_at?: string | null
          last_served_at?: string | null
          meal_type?: string | null
          prep_time_minutes?: number | null
          protein_per_serving?: number
          reviews?: Json
          save_count?: number | null
          search_count?: number
          search_vector?: unknown
          servings?: number | null
          source_name?: string
          source_url?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          usda_verified?: boolean
          verified?: boolean | null
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          affiliate_applied_at: string | null
          affiliate_approved_at: string | null
          affiliate_approved_by: string | null
          code: string
          commission_notes: string | null
          commission_rate: number | null
          created_at: string
          custom_code: string | null
          id: string
          tier: string
          user_id: string
        }
        Insert: {
          affiliate_applied_at?: string | null
          affiliate_approved_at?: string | null
          affiliate_approved_by?: string | null
          code: string
          commission_notes?: string | null
          commission_rate?: number | null
          created_at?: string
          custom_code?: string | null
          id?: string
          tier?: string
          user_id: string
        }
        Update: {
          affiliate_applied_at?: string | null
          affiliate_approved_at?: string | null
          affiliate_approved_by?: string | null
          code?: string
          commission_notes?: string | null
          commission_rate?: number | null
          created_at?: string
          custom_code?: string | null
          id?: string
          tier?: string
          user_id?: string
        }
        Relationships: []
      }
      referral_commissions: {
        Row: {
          available_at: string
          commission_amount: number
          created_at: string
          id: string
          paid_at: string | null
          product_id: string
          purchase_amount: number
          referral_id: string | null
          referred_id: string
          referrer_id: string
          revenuecat_event_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          available_at: string
          commission_amount?: number
          created_at?: string
          id?: string
          paid_at?: string | null
          product_id: string
          purchase_amount?: number
          referral_id?: string | null
          referred_id: string
          referrer_id: string
          revenuecat_event_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          available_at?: string
          commission_amount?: number
          created_at?: string
          id?: string
          paid_at?: string | null
          product_id?: string
          purchase_amount?: number
          referral_id?: string | null
          referred_id?: string
          referrer_id?: string
          revenuecat_event_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_commissions_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_commissions_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_commissions_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          code_used: string
          completed_at: string | null
          converted_at: string | null
          converted_to_premium: boolean
          created_at: string
          id: string
          premium_converted_at: string | null
          referred_id: string
          referrer_id: string
          status: string
        }
        Insert: {
          code_used?: string
          completed_at?: string | null
          converted_at?: string | null
          converted_to_premium?: boolean
          created_at?: string
          id?: string
          premium_converted_at?: string | null
          referred_id: string
          referrer_id: string
          status?: string
        }
        Update: {
          code_used?: string
          completed_at?: string | null
          converted_at?: string | null
          converted_to_premium?: boolean
          created_at?: string
          id?: string
          premium_converted_at?: string | null
          referred_id?: string
          referrer_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      revenuecat_events: {
        Row: {
          amount_usd: number | null
          app_user_id: string | null
          created_at: string | null
          currency: string | null
          entitlement_ids: string[] | null
          environment: string | null
          event_data: Json
          event_type: string
          expiration_at: string | null
          id: string
          original_app_user_id: string | null
          period_type: string | null
          price_in_purchased_currency: number | null
          product_id: string | null
          purchased_at: string | null
          raw_event: Json | null
          revenue_usd: number | null
          store: string | null
          user_id: string | null
        }
        Insert: {
          amount_usd?: number | null
          app_user_id?: string | null
          created_at?: string | null
          currency?: string | null
          entitlement_ids?: string[] | null
          environment?: string | null
          event_data: Json
          event_type: string
          expiration_at?: string | null
          id?: string
          original_app_user_id?: string | null
          period_type?: string | null
          price_in_purchased_currency?: number | null
          product_id?: string | null
          purchased_at?: string | null
          raw_event?: Json | null
          revenue_usd?: number | null
          store?: string | null
          user_id?: string | null
        }
        Update: {
          amount_usd?: number | null
          app_user_id?: string | null
          created_at?: string | null
          currency?: string | null
          entitlement_ids?: string[] | null
          environment?: string | null
          event_data?: Json
          event_type?: string
          expiration_at?: string | null
          id?: string
          original_app_user_id?: string | null
          period_type?: string | null
          price_in_purchased_currency?: number | null
          product_id?: string | null
          purchased_at?: string | null
          raw_event?: Json | null
          revenue_usd?: number | null
          store?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      saved_meal_items: {
        Row: {
          calories: number | null
          carbs: number | null
          created_at: string | null
          fat: number | null
          fiber: number | null
          food_brand: string | null
          food_id: string
          food_item_id: string | null
          food_name: string | null
          id: string
          protein: number | null
          saved_meal_id: string
          serving_amount: number
          serving_unit: string
          servings_count: number
        }
        Insert: {
          calories?: number | null
          carbs?: number | null
          created_at?: string | null
          fat?: number | null
          fiber?: number | null
          food_brand?: string | null
          food_id: string
          food_item_id?: string | null
          food_name?: string | null
          id?: string
          protein?: number | null
          saved_meal_id: string
          serving_amount: number
          serving_unit: string
          servings_count?: number
        }
        Update: {
          calories?: number | null
          carbs?: number | null
          created_at?: string | null
          fat?: number | null
          fiber?: number | null
          food_brand?: string | null
          food_id?: string
          food_item_id?: string | null
          food_name?: string | null
          id?: string
          protein?: number | null
          saved_meal_id?: string
          serving_amount?: number
          serving_unit?: string
          servings_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "saved_meal_items_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_meal_items_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "food_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_meal_items_saved_meal_id_fkey"
            columns: ["saved_meal_id"]
            isOneToOne: false
            referencedRelation: "saved_meals"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_meals: {
        Row: {
          created_at: string | null
          id: string
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      saved_recipes: {
        Row: {
          created_at: string
          id: string
          recipe_data: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          recipe_data: Json
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          recipe_data?: Json
          user_id?: string
        }
        Relationships: []
      }
      search_cache: {
        Row: {
          created_at: string | null
          hit_count: number | null
          query: string
          recipe_ids: string[]
        }
        Insert: {
          created_at?: string | null
          hit_count?: number | null
          query: string
          recipe_ids: string[]
        }
        Update: {
          created_at?: string | null
          hit_count?: number | null
          query?: string
          recipe_ids?: string[]
        }
        Relationships: []
      }
      seven_day_challenges: {
        Row: {
          accepted_at: string
          badge_awarded: boolean
          completed_at: string | null
          completed_days: string[]
          created_at: string
          current_day: number
          id: string
          start_date: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          badge_awarded?: boolean
          completed_at?: string | null
          completed_days?: string[]
          created_at?: string
          current_day?: number
          id?: string
          start_date: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          badge_awarded?: boolean
          completed_at?: string | null
          completed_days?: string[]
          created_at?: string
          current_day?: number
          id?: string
          start_date?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seven_day_challenges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      social_follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: []
      }
      social_post_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_post_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_post_saves: {
        Row: {
          created_at: string | null
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_post_saves_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_post_saves_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      social_posts: {
        Row: {
          audience: string | null
          auto_post_date: string | null
          auto_post_type: string | null
          calories: number | null
          carbs: number | null
          comments_count: number
          content: string | null
          created_at: string
          edu_body: string | null
          edu_example: string | null
          edu_headline: string | null
          edu_week: string | null
          fat: number | null
          featured_recipe_id: string | null
          featured_recipe_week: string | null
          id: string
          image_url: string | null
          is_founder_post: boolean | null
          is_pinned: boolean | null
          is_public: boolean
          likes_count: number
          meal_calories: number | null
          meal_carbs: number | null
          meal_fat: number | null
          meal_ingredients: Json | null
          meal_photo_url: string | null
          meal_protein: number | null
          meal_recipe_data: Json | null
          meal_recipe_id: string | null
          meal_servings: number | null
          milestone_type: string | null
          poll_options: Json | null
          poll_votes: Json | null
          post_type: string
          post_type_v2: string | null
          progress_photo_url: string | null
          progress_stats: Json | null
          protein: number | null
          question_details: string | null
          question_title: string | null
          saves_count: number | null
          section: string | null
          streak_days: number | null
          user_id: string
          weekly_recap_day_flags: boolean[] | null
          weekly_recap_days_tracked: number | null
          weekly_recap_score: number | null
          weekly_recap_week_start: string | null
          weight_goal_pct: number | null
          weight_unit: string | null
          weight_value: number | null
        }
        Insert: {
          audience?: string | null
          auto_post_date?: string | null
          auto_post_type?: string | null
          calories?: number | null
          carbs?: number | null
          comments_count?: number
          content?: string | null
          created_at?: string
          edu_body?: string | null
          edu_example?: string | null
          edu_headline?: string | null
          edu_week?: string | null
          fat?: number | null
          featured_recipe_id?: string | null
          featured_recipe_week?: string | null
          id?: string
          image_url?: string | null
          is_founder_post?: boolean | null
          is_pinned?: boolean | null
          is_public?: boolean
          likes_count?: number
          meal_calories?: number | null
          meal_carbs?: number | null
          meal_fat?: number | null
          meal_ingredients?: Json | null
          meal_photo_url?: string | null
          meal_protein?: number | null
          meal_recipe_data?: Json | null
          meal_recipe_id?: string | null
          meal_servings?: number | null
          milestone_type?: string | null
          poll_options?: Json | null
          poll_votes?: Json | null
          post_type: string
          post_type_v2?: string | null
          progress_photo_url?: string | null
          progress_stats?: Json | null
          protein?: number | null
          question_details?: string | null
          question_title?: string | null
          saves_count?: number | null
          section?: string | null
          streak_days?: number | null
          user_id: string
          weekly_recap_day_flags?: boolean[] | null
          weekly_recap_days_tracked?: number | null
          weekly_recap_score?: number | null
          weekly_recap_week_start?: string | null
          weight_goal_pct?: number | null
          weight_unit?: string | null
          weight_value?: number | null
        }
        Update: {
          audience?: string | null
          auto_post_date?: string | null
          auto_post_type?: string | null
          calories?: number | null
          carbs?: number | null
          comments_count?: number
          content?: string | null
          created_at?: string
          edu_body?: string | null
          edu_example?: string | null
          edu_headline?: string | null
          edu_week?: string | null
          fat?: number | null
          featured_recipe_id?: string | null
          featured_recipe_week?: string | null
          id?: string
          image_url?: string | null
          is_founder_post?: boolean | null
          is_pinned?: boolean | null
          is_public?: boolean
          likes_count?: number
          meal_calories?: number | null
          meal_carbs?: number | null
          meal_fat?: number | null
          meal_ingredients?: Json | null
          meal_photo_url?: string | null
          meal_protein?: number | null
          meal_recipe_data?: Json | null
          meal_recipe_id?: string | null
          meal_servings?: number | null
          milestone_type?: string | null
          poll_options?: Json | null
          poll_votes?: Json | null
          post_type?: string
          post_type_v2?: string | null
          progress_photo_url?: string | null
          progress_stats?: Json | null
          protein?: number | null
          question_details?: string | null
          question_title?: string | null
          saves_count?: number | null
          section?: string | null
          streak_days?: number | null
          user_id?: string
          weekly_recap_day_flags?: boolean[] | null
          weekly_recap_days_tracked?: number | null
          weekly_recap_score?: number | null
          weekly_recap_week_start?: string | null
          weight_goal_pct?: number | null
          weight_unit?: string | null
          weight_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      social_profiles: {
        Row: {
          bio: string | null
          created_at: string
          followers_count: number
          following_count: number
          is_private: boolean
          posts_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          followers_count?: number
          following_count?: number
          is_private?: boolean
          posts_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          followers_count?: number
          following_count?: number
          is_private?: boolean
          posts_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      streak_freezes: {
        Row: {
          count: number
          created_at: string
          id: string
          last_grant_date: string | null
          last_used_at: string | null
          total_freezes_used: number
          updated_at: string
          user_id: string
        }
        Insert: {
          count?: number
          created_at?: string
          id?: string
          last_grant_date?: string | null
          last_used_at?: string | null
          total_freezes_used?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          count?: number
          created_at?: string
          id?: string
          last_grant_date?: string | null
          last_used_at?: string | null
          total_freezes_used?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "streak_freezes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_issues_detected_at: string | null
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          entitlement_ids: string[] | null
          environment: string | null
          expiration_at: string | null
          id: string
          period_type: string | null
          plan_name: string | null
          plan_type: string | null
          product_id: string | null
          purchased_at: string | null
          revenuecat_app_user_id: string | null
          revenuecat_original_app_user_id: string | null
          status: string
          store: string | null
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          trial_end: string | null
          unsubscribe_detected_at: string | null
          updated_at: string | null
          user_id: string
          will_renew: boolean | null
        }
        Insert: {
          billing_issues_detected_at?: string | null
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          entitlement_ids?: string[] | null
          environment?: string | null
          expiration_at?: string | null
          id?: string
          period_type?: string | null
          plan_name?: string | null
          plan_type?: string | null
          product_id?: string | null
          purchased_at?: string | null
          revenuecat_app_user_id?: string | null
          revenuecat_original_app_user_id?: string | null
          status?: string
          store?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          unsubscribe_detected_at?: string | null
          updated_at?: string | null
          user_id: string
          will_renew?: boolean | null
        }
        Update: {
          billing_issues_detected_at?: string | null
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          entitlement_ids?: string[] | null
          environment?: string | null
          expiration_at?: string | null
          id?: string
          period_type?: string | null
          plan_name?: string | null
          plan_type?: string | null
          product_id?: string | null
          purchased_at?: string | null
          revenuecat_app_user_id?: string | null
          revenuecat_original_app_user_id?: string | null
          status?: string
          store?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          unsubscribe_detected_at?: string | null
          updated_at?: string | null
          user_id?: string
          will_renew?: boolean | null
        }
        Relationships: []
      }
      tdee_estimates: {
        Row: {
          adjustment_amount: number | null
          adjustment_applied: boolean | null
          avg_calories_eaten: number | null
          avg_weight_lbs: number | null
          created_at: string | null
          data_days_count: number | null
          ema_calories: number | null
          ema_weight: number | null
          estimated_tdee: number | null
          id: string
          prescribed_calories: number | null
          prev_avg_weight_lbs: number | null
          skip_reason: string | null
          user_id: string
          week_start: string
        }
        Insert: {
          adjustment_amount?: number | null
          adjustment_applied?: boolean | null
          avg_calories_eaten?: number | null
          avg_weight_lbs?: number | null
          created_at?: string | null
          data_days_count?: number | null
          ema_calories?: number | null
          ema_weight?: number | null
          estimated_tdee?: number | null
          id?: string
          prescribed_calories?: number | null
          prev_avg_weight_lbs?: number | null
          skip_reason?: string | null
          user_id: string
          week_start: string
        }
        Update: {
          adjustment_amount?: number | null
          adjustment_applied?: boolean | null
          avg_calories_eaten?: number | null
          avg_weight_lbs?: number | null
          created_at?: string | null
          data_days_count?: number | null
          ema_calories?: number | null
          ema_weight?: number | null
          estimated_tdee?: number | null
          id?: string
          prescribed_calories?: number | null
          prev_avg_weight_lbs?: number | null
          skip_reason?: string | null
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
      template_meal_plan_days: {
        Row: {
          day_number: number
          id: string
          plan_id: string
        }
        Insert: {
          day_number: number
          id?: string
          plan_id: string
        }
        Update: {
          day_number?: number
          id?: string
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_meal_plan_days_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "template_meal_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      template_meal_plan_items: {
        Row: {
          base_calories: number
          base_carbs: number
          base_fats: number
          base_grams: number
          base_protein: number
          calories_pct: number
          carbs_pct: number
          carbs_per_100g: number | null
          day_id: string
          fats_pct: number
          fats_per_100g: number | null
          food_item_id: string | null
          food_name: string
          id: string
          kcal_per_100g: number | null
          meal_type: string
          protein_pct: number
          protein_per_100g: number | null
          protein_role: string | null
        }
        Insert: {
          base_calories?: number
          base_carbs?: number
          base_fats?: number
          base_grams?: number
          base_protein?: number
          calories_pct?: number
          carbs_pct?: number
          carbs_per_100g?: number | null
          day_id: string
          fats_pct?: number
          fats_per_100g?: number | null
          food_item_id?: string | null
          food_name: string
          id?: string
          kcal_per_100g?: number | null
          meal_type: string
          protein_pct?: number
          protein_per_100g?: number | null
          protein_role?: string | null
        }
        Update: {
          base_calories?: number
          base_carbs?: number
          base_fats?: number
          base_grams?: number
          base_protein?: number
          calories_pct?: number
          carbs_pct?: number
          carbs_per_100g?: number | null
          day_id?: string
          fats_pct?: number
          fats_per_100g?: number | null
          food_item_id?: string | null
          food_name?: string
          id?: string
          kcal_per_100g?: number | null
          meal_type?: string
          protein_pct?: number
          protein_per_100g?: number | null
          protein_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_meal_plan_items_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "template_meal_plan_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_meal_plan_items_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "food_items"
            referencedColumns: ["id"]
          },
        ]
      }
      template_meal_plans: {
        Row: {
          created_at: string
          description: string | null
          diet_type: string
          emoji: string
          goal_type: string
          id: string
          is_published: boolean
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          diet_type?: string
          emoji?: string
          goal_type?: string
          id?: string
          is_published?: boolean
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          diet_type?: string
          emoji?: string
          goal_type?: string
          id?: string
          is_published?: boolean
          name?: string
        }
        Relationships: []
      }
      template_protein_options: {
        Row: {
          emoji: string
          id: string
          meal_type: string | null
          plan_id: string
          protein_name: string
          sort_order: number
        }
        Insert: {
          emoji?: string
          id?: string
          meal_type?: string | null
          plan_id: string
          protein_name: string
          sort_order?: number
        }
        Update: {
          emoji?: string
          id?: string
          meal_type?: string | null
          plan_id?: string
          protein_name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "template_protein_options_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "template_meal_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      tracker_entries: {
        Row: {
          created_at: string
          date: string
          id: string
          notes: string | null
          tracker_id: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          notes?: string | null
          tracker_id: string
          user_id: string
          value: number
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          tracker_id?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "tracker_entries_tracker_id_fkey"
            columns: ["tracker_id"]
            isOneToOne: false
            referencedRelation: "trackers"
            referencedColumns: ["id"]
          },
        ]
      }
      trackers: {
        Row: {
          created_at: string
          emoji: string | null
          frequency: string
          goal_value: number | null
          id: string
          is_default: boolean
          name: string
          sort_order: number
          tracker_type: string
          translations: Json | null
          unit: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji?: string | null
          frequency?: string
          goal_value?: number | null
          id?: string
          is_default?: boolean
          name: string
          sort_order?: number
          tracker_type: string
          translations?: Json | null
          unit?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string | null
          frequency?: string
          goal_value?: number | null
          id?: string
          is_default?: boolean
          name?: string
          sort_order?: number
          tracker_type?: string
          translations?: Json | null
          unit?: string | null
          user_id?: string
        }
        Relationships: []
      }
      unlocked_mission_slots: {
        Row: {
          completed: boolean
          completed_at: string | null
          date: string
          id: string
          mission_type: string
          slot_index: number
          target: number | null
          unlocked_at: string
          user_id: string
          xp_reward: number
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          date: string
          id?: string
          mission_type: string
          slot_index: number
          target?: number | null
          unlocked_at?: string
          user_id: string
          xp_reward: number
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          date?: string
          id?: string
          mission_type?: string
          slot_index?: number
          target?: number | null
          unlocked_at?: string
          user_id?: string
          xp_reward?: number
        }
        Relationships: [
          {
            foreignKeyName: "unlocked_mission_slots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_consistency: {
        Row: {
          first_meal_date: string | null
          score: number
          total_days: number
          tracked_days: number
          updated_at: string
          user_id: string
        }
        Insert: {
          first_meal_date?: string | null
          score?: number
          total_days?: number
          tracked_days?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          first_meal_date?: string | null
          score?: number
          total_days?: number
          tracked_days?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_food_scores: {
        Row: {
          food_item_id: string
          id: string
          last_logged_at: string | null
          log_count: number
          user_id: string
        }
        Insert: {
          food_item_id: string
          id?: string
          last_logged_at?: string | null
          log_count?: number
          user_id: string
        }
        Update: {
          food_item_id?: string
          id?: string
          last_logged_at?: string | null
          log_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_food_scores_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "food_items"
            referencedColumns: ["id"]
          },
        ]
      }
      user_leagues: {
        Row: {
          created_at: string
          final_rank: number | null
          id: string
          promoted: boolean | null
          room_id: string
          tier: string
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          final_rank?: number | null
          id?: string
          promoted?: boolean | null
          room_id: string
          tier: string
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          final_rank?: number | null
          id?: string
          promoted?: boolean | null
          room_id?: string
          tier?: string
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_leagues_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "league_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      user_rankings: {
        Row: {
          consistency_percentile: number
          consistency_rank: number | null
          consistency_score: number
          current_streak: number
          global_rank: number | null
          percentile: number
          total_xp: number
          updated_at: string
          user_id: string
          weekly_rank: number | null
          weekly_xp: number
        }
        Insert: {
          consistency_percentile?: number
          consistency_rank?: number | null
          consistency_score?: number
          current_streak?: number
          global_rank?: number | null
          percentile?: number
          total_xp?: number
          updated_at?: string
          user_id: string
          weekly_rank?: number | null
          weekly_xp?: number
        }
        Update: {
          consistency_percentile?: number
          consistency_rank?: number | null
          consistency_score?: number
          current_streak?: number
          global_rank?: number | null
          percentile?: number
          total_xp?: number
          updated_at?: string
          user_id?: string
          weekly_rank?: number | null
          weekly_xp?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_rankings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_xp: {
        Row: {
          current_streak: number
          longest_streak: number
          updated_at: string
          user_id: string
        }
        Insert: {
          current_streak?: number
          longest_streak?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          current_streak?: number
          longest_streak?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_xp_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          activity_level: string | null
          adaptive_tdee_enabled: boolean | null
          adjustment_day: number | null
          auto_share_achievements: boolean
          auto_share_audience: string | null
          auto_share_streaks: boolean | null
          auto_share_weekly_recap: boolean | null
          auto_share_weight_milestones: boolean | null
          avatar_url: string | null
          bio: string | null
          challenger_badge: boolean
          cooking_level: string | null
          created_at: string | null
          current_weight: number | null
          date_of_birth: string | null
          dietary_restrictions: string[] | null
          disliked_foods: string | null
          email: string | null
          full_name: string | null
          goal_weight: number | null
          height: number | null
          id: string
          is_admin: boolean
          journey_restart_count: number | null
          journey_start_date: string | null
          journey_start_weight: number | null
          last_app_open: string | null
          last_streak_lost_at: string | null
          last_streak_value: number
          name: string | null
          onboarding_completed: boolean | null
          preferred_language: string | null
          preferred_units: string | null
          previous_journey_start_date: string | null
          protein_preferences: string[] | null
          recipe_styles: string[] | null
          referral_prompt_shown: boolean
          sex: string | null
          show_consistency_score: boolean
          streak_rescue_used: boolean
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_expires_at: string | null
          subscription_plan: string | null
          subscription_status: string | null
          timezone: string
          updated_at: string | null
          user_type: string | null
          username: string | null
          weight_unit: string | null
        }
        Insert: {
          activity_level?: string | null
          adaptive_tdee_enabled?: boolean | null
          adjustment_day?: number | null
          auto_share_achievements?: boolean
          auto_share_audience?: string | null
          auto_share_streaks?: boolean | null
          auto_share_weekly_recap?: boolean | null
          auto_share_weight_milestones?: boolean | null
          avatar_url?: string | null
          bio?: string | null
          challenger_badge?: boolean
          cooking_level?: string | null
          created_at?: string | null
          current_weight?: number | null
          date_of_birth?: string | null
          dietary_restrictions?: string[] | null
          disliked_foods?: string | null
          email?: string | null
          full_name?: string | null
          goal_weight?: number | null
          height?: number | null
          id: string
          is_admin?: boolean
          journey_restart_count?: number | null
          journey_start_date?: string | null
          journey_start_weight?: number | null
          last_app_open?: string | null
          last_streak_lost_at?: string | null
          last_streak_value?: number
          name?: string | null
          onboarding_completed?: boolean | null
          preferred_language?: string | null
          preferred_units?: string | null
          previous_journey_start_date?: string | null
          protein_preferences?: string[] | null
          recipe_styles?: string[] | null
          referral_prompt_shown?: boolean
          sex?: string | null
          show_consistency_score?: boolean
          streak_rescue_used?: boolean
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_expires_at?: string | null
          subscription_plan?: string | null
          subscription_status?: string | null
          timezone?: string
          updated_at?: string | null
          user_type?: string | null
          username?: string | null
          weight_unit?: string | null
        }
        Update: {
          activity_level?: string | null
          adaptive_tdee_enabled?: boolean | null
          adjustment_day?: number | null
          auto_share_achievements?: boolean
          auto_share_audience?: string | null
          auto_share_streaks?: boolean | null
          auto_share_weekly_recap?: boolean | null
          auto_share_weight_milestones?: boolean | null
          avatar_url?: string | null
          bio?: string | null
          challenger_badge?: boolean
          cooking_level?: string | null
          created_at?: string | null
          current_weight?: number | null
          date_of_birth?: string | null
          dietary_restrictions?: string[] | null
          disliked_foods?: string | null
          email?: string | null
          full_name?: string | null
          goal_weight?: number | null
          height?: number | null
          id?: string
          is_admin?: boolean
          journey_restart_count?: number | null
          journey_start_date?: string | null
          journey_start_weight?: number | null
          last_app_open?: string | null
          last_streak_lost_at?: string | null
          last_streak_value?: number
          name?: string | null
          onboarding_completed?: boolean | null
          preferred_language?: string | null
          preferred_units?: string | null
          previous_journey_start_date?: string | null
          protein_preferences?: string[] | null
          recipe_styles?: string[] | null
          referral_prompt_shown?: boolean
          sex?: string | null
          show_consistency_score?: boolean
          streak_rescue_used?: boolean
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_expires_at?: string | null
          subscription_plan?: string | null
          subscription_status?: string | null
          timezone?: string
          updated_at?: string | null
          user_type?: string | null
          username?: string | null
          weight_unit?: string | null
        }
        Relationships: []
      }
      weekly_consistency_scores: {
        Row: {
          created_at: string
          id: string
          score: number
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          score?: number
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          id?: string
          score?: number
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
      xp_event_config: {
        Row: {
          description: string | null
          event_type: string
          is_active: boolean
          xp_amount: number
        }
        Insert: {
          description?: string | null
          event_type: string
          is_active?: boolean
          xp_amount: number
        }
        Update: {
          description?: string | null
          event_type?: string
          is_active?: boolean
          xp_amount?: number
        }
        Relationships: []
      }
      xp_ledger: {
        Row: {
          base_xp: number
          created_at: string
          date: string
          event_type: string
          id: string
          metadata: Json | null
          multiplier: number
          multiplier_applied: number
          premium_multiplier: number
          source_id: string
          user_id: string
          xp_amount: number
        }
        Insert: {
          base_xp: number
          created_at?: string
          date: string
          event_type: string
          id?: string
          metadata?: Json | null
          multiplier?: number
          multiplier_applied?: number
          premium_multiplier?: number
          source_id: string
          user_id: string
          xp_amount: number
        }
        Update: {
          base_xp?: number
          created_at?: string
          date?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          multiplier?: number
          multiplier_applied?: number
          premium_multiplier?: number
          source_id?: string
          user_id?: string
          xp_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "xp_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      onboarding_funnel_enriched: {
        Row: {
          completed: boolean | null
          completed_at: string | null
          first_meal_at: string | null
          first_meal_at_actual: string | null
          first_paywall_action: string | null
          id: string | null
          max_step_reached: number | null
          paywall_action_at: string | null
          paywall_shown: boolean | null
          paywall_shown_at: string | null
          session_id: string | null
          started_at: string | null
          trial_skipped: boolean | null
          trial_started: boolean | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          completed?: boolean | null
          completed_at?: string | null
          first_meal_at?: string | null
          first_meal_at_actual?: never
          first_paywall_action?: string | null
          id?: string | null
          max_step_reached?: number | null
          paywall_action_at?: string | null
          paywall_shown?: boolean | null
          paywall_shown_at?: string | null
          session_id?: string | null
          started_at?: string | null
          trial_skipped?: boolean | null
          trial_started?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          completed?: boolean | null
          completed_at?: string | null
          first_meal_at?: string | null
          first_meal_at_actual?: never
          first_paywall_action?: string | null
          id?: string | null
          max_step_reached?: number | null
          paywall_action_at?: string | null
          paywall_shown?: boolean | null
          paywall_shown_at?: string | null
          session_id?: string | null
          started_at?: string | null
          trial_skipped?: boolean | null
          trial_started?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_funnel_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_funnel_report: {
        Row: {
          descripcion: string | null
          orden: number | null
          usuarios: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      apply_verified_food_correction_v1: {
        Args: { p_expected_revision: number; p_id: string; p_values: Json }
        Returns: Json
      }
      backfill_missing_commissions: { Args: never; Returns: undefined }
      bind_progress_media: {
        Args: { p_actor: string; p_ids: string[]; p_post: string }
        Returns: boolean
      }
      bot_xp_range: {
        Args: { p_tier: string }
        Returns: {
          max_xp: number
          min_xp: number
        }[]
      }
      bytea_to_text: { Args: { data: string }; Returns: string }
      can_access_premium_club: { Args: never; Returns: boolean }
      can_read_progress_club: { Args: { p_actor: string }; Returns: boolean }
      can_view_profile: { Args: { p_target: string }; Returns: boolean }
      change_follow_request: {
        Args: { p_action: string; p_expected_revision: number; p_other: string }
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          id: string
          owner_id: string
          requester_id: string
          revision: number
          state: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "follow_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      change_outbound_follow: {
        Args: {
          p_action: string
          p_expected_revision: string
          p_request_id: string
          p_target_id: string
        }
        Returns: Json
      }
      claim_barcode_recovery: {
        Args: {
          p_barcode: string
          p_owner: string
          p_phase: string
          p_submission: string
        }
        Returns: number
      }
      coach_authorize_phase_v2: {
        Args: {
          p_attempt_id: string
          p_phase: string
          p_request_id: string
          p_token: string
          p_user_id: string
        }
        Returns: Json
      }
      coach_begin_execution_v2: {
        Args: {
          p_access: string
          p_fingerprint: string
          p_request_id: string
          p_request_payload: Json
          p_reserve_web: boolean
          p_retry_of_request_id: string
          p_user_id: string
        }
        Returns: Json
      }
      coach_claim_commit_v2: {
        Args: {
          p_attempt_id: string
          p_plan: Json
          p_request_id: string
          p_token: string
          p_user_id: string
        }
        Returns: Json
      }
      coach_commit_execution_v2: {
        Args: {
          p_attempt_id: string
          p_request_id: string
          p_token: string
          p_user_id: string
        }
        Returns: Json
      }
      coach_confirm_action_v1: {
        Args: { p_expected: Json; p_proposal_id: string; p_user_id: string }
        Returns: Json
      }
      coach_execution_receipt_v2: {
        Args: { p_request_id: string; p_user_id: string }
        Returns: Json
      }
      coach_finish_message_v1: {
        Args: {
          p_attempt_id: string
          p_outcome: string
          p_request_id: string
          p_result: Json
          p_user_id: string
        }
        Returns: undefined
      }
      coach_list_meal_flows_v1: { Args: { p_user_id: string }; Returns: Json }
      coach_migrate_legacy_usage_v1: {
        Args: {
          p_evidence_reference?: string
          p_proven_free_used: boolean
          p_user_id: string
        }
        Returns: Json
      }
      coach_recover_requests_v1: {
        Args: { p_offset?: number; p_request_id?: string; p_user_id: string }
        Returns: Json
      }
      coach_register_action_v1: {
        Args: { p_payload: Json; p_proposal_key: string; p_user_id: string }
        Returns: Json
      }
      coach_reserve_message_v1: {
        Args: {
          p_access: string
          p_fingerprint: string
          p_request_id: string
          p_request_payload?: Json
          p_user_id: string
        }
        Returns: Json
      }
      coach_reserve_web_v1: {
        Args: {
          p_attempt_id: string
          p_global_cap_usd: number
          p_request_id: string
          p_reserve_usd: number
          p_user_id: string
        }
        Returns: Json
      }
      coach_revoke_execution_v2: {
        Args: { p_request_id: string; p_user_id: string }
        Returns: Json
      }
      coach_settle_web_v1: {
        Args: {
          p_attempt_id: string
          p_cost_usd: number
          p_error_code: string
          p_generation_id: string
          p_request_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      coach_stop_execution_v2: {
        Args: {
          p_attempt_id: string
          p_audit: Json
          p_outcome: string
          p_request_id: string
          p_token: string
          p_user_id: string
        }
        Returns: Json
      }
      coach_store_memory_v1: {
        Args: {
          p_category: string
          p_key: string
          p_user_id: string
          p_value: string
        }
        Returns: boolean
      }
      coach_store_summary_v1: {
        Args: {
          p_conversation_id: string
          p_importance: number
          p_message_count: number
          p_summary: Json
          p_user_id: string
        }
        Returns: boolean
      }
      coach_web_pilot_enabled_v1: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      community_privacy_eligibility: { Args: never; Returns: Json }
      confirm_barcode_recovery: {
        Args: { p_owner: string; p_payload: Json; p_submission: string }
        Returns: Json
      }
      current_week_start: { Args: never; Returns: string }
      decrement_comments: { Args: { post_id: string }; Returns: undefined }
      decrement_likes: { Args: { post_id: string }; Returns: number }
      decrement_saves: { Args: { post_id: string }; Returns: number }
      discover_profiles: {
        Args: { p_ids: string[] }
        Returns: {
          avatar_url: string
          full_name: string
          id: string
          name: string
          username: string
        }[]
      }
      generate_daily_bot_tracker_data: { Args: never; Returns: undefined }
      generate_weekly_bot_xp: { Args: never; Returns: undefined }
      get_incoming_follower_status: {
        Args: { p_requester_id: string }
        Returns: Json
      }
      get_leaderboard:
        | {
            Args: { p_limit?: number; p_period: string; p_tracker_name: string }
            Returns: {
              rank: number
              total_value: number
              user_id: string
              username: string
            }[]
          }
        | {
            Args: {
              p_end_date: string
              p_limit?: number
              p_start_date: string
              p_tracker_name: string
            }
            Returns: {
              rank: number
              total_value: number
              user_id: string
              username: string
            }[]
          }
      get_leaderboard_steps: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          total_value: number
          user_id: string
          username: string
        }[]
      }
      get_outbound_follow_status: {
        Args: { p_target_id: string }
        Returns: Json
      }
      get_premium_member_count: { Args: never; Returns: number }
      get_premium_members: {
        Args: never
        Returns: {
          avatar_url: string
          full_name: string
          id: string
          username: string
        }[]
      }
      get_streak_freeze_status: { Args: { p_user_id: string }; Returns: Json }
      get_unaudited_recipes: {
        Args: never
        Returns: {
          description: string
          id: string
          image_url: string
          ingredients: Json
          instructions: Json
          title: string
        }[]
      }
      get_user_percentile:
        | {
            Args: {
              p_period: string
              p_tracker_name: string
              p_user_id: string
            }
            Returns: {
              community_avg: number
              percentile: number
              total_users: number
              user_rank: number
              user_total: number
            }[]
          }
        | {
            Args: {
              p_end_date: string
              p_start_date: string
              p_tracker_name: string
              p_user_id: string
            }
            Returns: {
              community_avg: number
              percentile: number
              total_users: number
              user_rank: number
              user_total: number
            }[]
          }
      grow_daily_bot_xp: { Args: never; Returns: undefined }
      http: {
        Args: { request: Database["public"]["CompositeTypes"]["http_request"] }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "http_request"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_delete:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_get:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_head: {
        Args: { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_header: {
        Args: { field: string; value: string }
        Returns: Database["public"]["CompositeTypes"]["http_header"]
        SetofOptions: {
          from: "*"
          to: "http_header"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_list_curlopt: {
        Args: never
        Returns: {
          curlopt: string
          value: string
        }[]
      }
      http_patch: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_post:
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_put: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_reset_curlopt: { Args: never; Returns: boolean }
      http_set_curlopt: {
        Args: { curlopt: string; value: string }
        Returns: boolean
      }
      import_usda_page: {
        Args: { p_data_type: string; p_page_number: number }
        Returns: Json
      }
      increment_comments: { Args: { post_id: string }; Returns: undefined }
      increment_food_search_counts: {
        Args: { food_ids: string[] }
        Returns: undefined
      }
      increment_likes: { Args: { post_id: string }; Returns: number }
      increment_popularity_score: {
        Args: { p_food_item_id: string; p_points: number }
        Returns: undefined
      }
      increment_recipe_click: {
        Args: { recipe_id: string }
        Returns: undefined
      }
      increment_recipe_search: {
        Args: { recipe_id: string }
        Returns: undefined
      }
      increment_saves: { Args: { post_id: string }; Returns: number }
      is_admin: { Args: never; Returns: boolean }
      is_founder_user: { Args: never; Returns: boolean }
      is_user_premium: { Args: { p_user_id: string }; Returns: boolean }
      level_from_total_xp: { Args: { total_xp: number }; Returns: number }
      list_accepted_profile_connections: {
        Args: {
          p_after_id?: string
          p_direction: string
          p_limit?: number
          p_target_id: string
        }
        Returns: Json
      }
      list_follow_request_inbox: {
        Args: { p_cursor?: string; p_limit?: number }
        Returns: Json
      }
      list_my_blocked_accounts: {
        Args: { p_cursor?: string; p_limit?: number }
        Returns: Json
      }
      list_profile_posts: {
        Args: { p_cursor?: string; p_limit?: number; p_target_id: string }
        Returns: Json
      }
      list_profile_posts_with_media: {
        Args: { p_cursor?: string; p_limit?: number; p_target_id: string }
        Returns: Json
      }
      log_food: {
        Args: {
          p_calories?: number
          p_carbs?: number
          p_date: string
          p_fats?: number
          p_fiber?: number
          p_food_brand?: string
          p_food_id?: string
          p_food_item_id?: string
          p_food_name?: string
          p_grams?: number
          p_logged_at?: string
          p_meal_type: string
          p_protein?: number
          p_quantity?: number
          p_serving_description?: string
          p_user_id: string
        }
        Returns: Json
      }
      log_food_item_usage: {
        Args: {
          p_food_item_id: string
          p_points?: number
          p_source?: string
          p_user_id: string
        }
        Returns: undefined
      }
      mg_eval_20261015_finish_v1: {
        Args: {
          p_case_id: string
          p_cost: number
          p_result: Json
          p_uncertain: boolean
          p_user_id: string
        }
        Returns: boolean
      }
      mg_eval_20261015_observe_config_v1: {
        Args: {
          p_byok: boolean
          p_configured: boolean
          p_limit: number
          p_metadata_ok: boolean
          p_no_reset: boolean
          p_remaining: number
          p_verified: boolean
        }
        Returns: undefined
      }
      mg_eval_20261015_reserve_v1: {
        Args: { p_case_id: string; p_paid: boolean; p_user_id: string }
        Returns: Json
      }
      mg_eval_20261015_status_v1: { Args: never; Returns: Json }
      nullify_zero_byte_checkin_photos: { Args: never; Returns: undefined }
      process_last_week: { Args: never; Returns: undefined }
      profile_nutrition: {
        Args: { p_from: string; p_target: string; p_to: string }
        Returns: Json
      }
      profile_snapshot: {
        Args: {
          p_from: string
          p_target: string
          p_to: string
          p_today: string
        }
        Returns: Json
      }
      profile_summary: {
        Args: { p_target: string }
        Returns: {
          avatar_url: string
          bio: string
          full_name: string
          id: string
          is_premium: boolean
          name: string
          username: string
        }[]
      }
      profile_weekly_tracking: {
        Args: { p_from: string; p_target_id: string; p_to: string }
        Returns: Json
      }
      publish_weekly_edu_post: { Args: never; Returns: undefined }
      publish_weekly_edu_post_test: {
        Args: never
        Returns: {
          body: string
          example: string
          headline: string
          status: string
          topic: string
        }[]
      }
      publish_weekly_featured_recipe: { Args: never; Returns: Json }
      read_food_correction_targets_v1: {
        Args: { p_barcodes: string[]; p_id: string }
        Returns: Json
      }
      read_usda_portions_v1: {
        Args: { p_fdc_ids: string[] }
        Returns: {
          fdc_id: string
          payload: Json
        }[]
      }
      ready_progress_media: {
        Args: { p_actor: string; p_digest: string; p_media: string }
        Returns: boolean
      }
      recalculate_popularity_scores: { Args: never; Returns: undefined }
      record_food_nutrition_evidence_v1: {
        Args: {
          p_expected_revision: number
          p_food_id: string
          p_payload: Json
        }
        Returns: number
      }
      record_private_checkpoint_v1: {
        Args: { p_payload: Json; p_user_id: string }
        Returns: string
      }
      record_usda_portions_v1: {
        Args: { p_fdc_id: string; p_payload: Json }
        Returns: undefined
      }
      record_weekly_xp: { Args: { p_xp: number }; Returns: undefined }
      refresh_active_user_count: { Args: never; Returns: undefined }
      remove_profile_follower: {
        Args: {
          p_expected_revision: string
          p_request_id: string
          p_requester_id: string
        }
        Returns: Json
      }
      reserve_progress_media: {
        Args: {
          p_actor: string
          p_digest: string
          p_key: string
          p_source: string
        }
        Returns: Json
      }
      respond_follow_request: {
        Args: {
          p_decision: string
          p_expected_revision: string
          p_request_id: string
          p_requester_id: string
        }
        Returns: Json
      }
      search_food_catalog_v2: {
        Args: { p_limit?: number; p_queries: string[] }
        Returns: Json[]
      }
      search_foods_hybrid: {
        Args: { result_limit?: number; search_query: string }
        Returns: {
          added_sugar_g: number | null
          added_sugars: number | null
          ai_verified: boolean | null
          ai_verified_at: string | null
          ai_verified_source: string | null
          alcohol_g: number | null
          allergens: string[] | null
          barcode: string | null
          biotin: number | null
          biotin_mcg: number | null
          brand: string | null
          brands: string | null
          calcium: number | null
          calcium_mg: number | null
          calories: number | null
          carbs: number | null
          chloride: number | null
          cholesterol: number | null
          cholesterol_mg: number | null
          choline: number | null
          choline_mg: number | null
          chromium: number | null
          chromium_mcg: number | null
          confidence: string | null
          copper: number | null
          copper_mg: number | null
          created_at: string
          data_quality_score: number | null
          fat: number | null
          fiber: number | null
          folate_mcg: number | null
          generic_name: string | null
          id: string
          image_url: string | null
          ingredients_text: string | null
          insoluble_fiber: number | null
          insoluble_fiber_g: number | null
          iodine: number | null
          iodine_mcg: number | null
          iron: number | null
          iron_mg: number | null
          last_logged_at: string | null
          last_searched_at: string | null
          last_verified_at: string | null
          logs_last_30d: number
          logs_last_90d: number
          logs_total: number
          macros_per: string | null
          magnesium: number | null
          magnesium_mg: number | null
          manganese: number | null
          manganese_mg: number | null
          molybdenum: number | null
          monounsaturated_fat: number | null
          monounsaturated_fat_g: number | null
          name: string
          nutriments: Json
          nutriscore_grade: string | null
          off_data: Json | null
          pantothenic_acid_mg: number | null
          phosphorus: number | null
          phosphorus_mg: number | null
          polyunsaturated_fat: number | null
          polyunsaturated_fat_g: number | null
          popularity_score: number
          potassium: number | null
          potassium_mg: number | null
          product_name: string | null
          protein: number | null
          saturated_fat: number | null
          saturated_fat_g: number | null
          search_count: number
          search_vector: unknown
          selenium: number | null
          selenium_mcg: number | null
          serving_count: number | null
          serving_description: string | null
          serving_quantity: string | null
          serving_size: number | null
          serving_unit: string | null
          sodium: number | null
          sodium_mg: number | null
          soluble_fiber: number | null
          soluble_fiber_g: number | null
          source: string
          source_id: string | null
          starch: number | null
          sugar: number | null
          sugar_alcohols: number | null
          sugar_g: number | null
          total_logs: number | null
          trans_fat: number | null
          trans_fat_g: number | null
          updated_at: string
          usda_fdc_id: string | null
          verified: boolean | null
          vitamin_a: number | null
          vitamin_a_mcg: number | null
          vitamin_b1: number | null
          vitamin_b1_mg: number | null
          vitamin_b12: number | null
          vitamin_b12_mcg: number | null
          vitamin_b2: number | null
          vitamin_b2_mg: number | null
          vitamin_b3: number | null
          vitamin_b3_mg: number | null
          vitamin_b5: number | null
          vitamin_b6: number | null
          vitamin_b6_mg: number | null
          vitamin_b9: number | null
          vitamin_c: number | null
          vitamin_c_mg: number | null
          vitamin_d: number | null
          vitamin_d_mcg: number | null
          vitamin_e: number | null
          vitamin_e_mg: number | null
          vitamin_k: number | null
          vitamin_k_mcg: number | null
          water_g: number | null
          zinc: number | null
          zinc_mg: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "food_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      search_foods_personalized: {
        Args: { p_limit?: number; p_query: string; p_user_id: string }
        Returns: {
          barcode: string
          brand: string
          brands: string
          calories: number
          carbs: number
          combined_score: number
          fat: number
          fiber: number
          id: string
          image_url: string
          name: string
          nutriments: Json
          popularity_score: number
          product_name: string
          protein: number
          serving_quantity: string
          serving_size: number
          serving_unit: string
          sugar: number
        }[]
      }
      search_foods_ranked: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          barcode: string
          brand: string
          calories: number
          carbs: number
          fat: number
          fiber: number
          id: string
          image_url: string
          logs_last_30d: number
          logs_last_90d: number
          macros_per: string
          name: string
          off_data: Json
          popularity_score: number
          protein: number
          serving_description: string
          serving_size: number
          serving_unit: string
        }[]
      }
      search_profile_identities: {
        Args: { p_after_id?: string; p_limit?: number; p_query: string }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      social_post_author_visible: {
        Args: { p_author: string }
        Returns: boolean
      }
      text_to_bytea: { Args: { data: string }; Returns: string }
      toggle_post_like: {
        Args: { p_post_id: string; p_user_id: string }
        Returns: {
          liked: boolean
          likes_count: number
        }[]
      }
      unblock_my_account: { Args: { p_target_id: string }; Returns: Json }
      update_food_item_log_counts: {
        Args: { p_food_item_id: string }
        Returns: undefined
      }
      update_vault_openrouter_key: {
        Args: { p_key: string }
        Returns: undefined
      }
      url_encode: { Args: { input: string }; Returns: string }
      urlencode:
        | { Args: { data: Json }; Returns: string }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      usda_energy: { Args: { nutrients: Json }; Returns: number }
      usda_nutrient: { Args: { num: string; nutrients: Json }; Returns: number }
      user_in_my_room: {
        Args: { target_user: string; target_week: string }
        Returns: boolean
      }
      vault_create_service_role_secret: {
        Args: { p_secret: string }
        Returns: string
      }
      visible_post_authors: { Args: { p_post_ids: string[] }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      http_header: {
        field: string | null
        value: string | null
      }
      http_request: {
        method: unknown
        uri: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content_type: string | null
        content: string | null
      }
      http_response: {
        status: number | null
        content_type: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content: string | null
      }
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
    Enums: {},
  },
} as const
