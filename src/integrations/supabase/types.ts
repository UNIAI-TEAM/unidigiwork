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
      admin_rules: {
        Row: {
          action: Json
          condition: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_enabled: boolean
          kind: string
          name: string
          updated_at: string
        }
        Insert: {
          action?: Json
          condition?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean
          kind?: string
          name: string
          updated_at?: string
        }
        Update: {
          action?: Json
          condition?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean
          kind?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          action: string | null
          actor_id: string | null
          actor_user_id: string | null
          after_state: Json | null
          aggregate_id: string | null
          aggregate_type: string | null
          before_state: Json | null
          correlation_id: string | null
          created_at: string
          event_type: string | null
          id: string
          idempotency_key: string | null
          ip_address: unknown
          occurred_at: string
          payload: Json | null
          resource_id: string | null
          resource_type: string | null
          source: string | null
          tenant_id: string | null
          user_agent: string | null
        }
        Insert: {
          action?: string | null
          actor_id?: string | null
          actor_user_id?: string | null
          after_state?: Json | null
          aggregate_id?: string | null
          aggregate_type?: string | null
          before_state?: Json | null
          correlation_id?: string | null
          created_at?: string
          event_type?: string | null
          id?: string
          idempotency_key?: string | null
          ip_address?: unknown
          occurred_at?: string
          payload?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          source?: string | null
          tenant_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string | null
          actor_id?: string | null
          actor_user_id?: string | null
          after_state?: Json | null
          aggregate_id?: string | null
          aggregate_type?: string | null
          before_state?: Json | null
          correlation_id?: string | null
          created_at?: string
          event_type?: string | null
          id?: string
          idempotency_key?: string | null
          ip_address?: unknown
          occurred_at?: string
          payload?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          source?: string | null
          tenant_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          content: string
          created_at: string
          deleted_at: string | null
          folder: string
          id: string
          row_version: number
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          deleted_at?: string | null
          folder?: string
          id?: string
          row_version?: number
          tenant_id: string
          title: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          content?: string
          created_at?: string
          deleted_at?: string | null
          folder?: string
          id?: string
          row_version?: number
          tenant_id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          body: string
          cc_user_ids: string[]
          created_at: string
          created_by: string | null
          from_user_id: string
          id: string
          is_draft: boolean
          row_version: number
          sent_at: string | null
          subject: string
          tenant_id: string
          thread_id: string
          to_user_ids: string[]
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          body?: string
          cc_user_ids?: string[]
          created_at?: string
          created_by?: string | null
          from_user_id: string
          id?: string
          is_draft?: boolean
          row_version?: number
          sent_at?: string | null
          subject: string
          tenant_id: string
          thread_id: string
          to_user_ids?: string[]
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          body?: string
          cc_user_ids?: string[]
          created_at?: string
          created_by?: string | null
          from_user_id?: string
          id?: string
          is_draft?: boolean
          row_version?: number
          sent_at?: string | null
          subject?: string
          tenant_id?: string
          thread_id?: string
          to_user_ids?: string[]
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_states: {
        Row: {
          folder: string
          is_read: boolean
          is_starred: boolean
          message_id: string
          row_version: number
          tenant_id: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          folder?: string
          is_read?: boolean
          is_starred?: boolean
          message_id: string
          row_version?: number
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          folder?: string
          is_read?: boolean
          is_starred?: boolean
          message_id?: string
          row_version?: number
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_states_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_states_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_states_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_threads: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          last_message_at: string
          row_version: number
          subject: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          last_message_at?: string
          row_version?: number
          subject: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          last_message_at?: string
          row_version?: number
          subject?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_threads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_threads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_threads_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      external_identities: {
        Row: {
          created_at: string
          email_snapshot: string | null
          id: string
          provider: string
          provider_subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_snapshot?: string | null
          id?: string
          provider: string
          provider_subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_snapshot?: string | null
          id?: string
          provider?: string
          provider_subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_identities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          email_daily_digest: boolean
          email_document: boolean
          email_meeting: boolean
          email_mention: boolean
          email_product_news: boolean
          email_system: boolean
          email_task: boolean
          email_workflow: boolean
          in_app_document: boolean
          in_app_meeting: boolean
          in_app_mention: boolean
          in_app_system: boolean
          in_app_task: boolean
          in_app_workflow: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_daily_digest?: boolean
          email_document?: boolean
          email_meeting?: boolean
          email_mention?: boolean
          email_product_news?: boolean
          email_system?: boolean
          email_task?: boolean
          email_workflow?: boolean
          in_app_document?: boolean
          in_app_meeting?: boolean
          in_app_mention?: boolean
          in_app_system?: boolean
          in_app_task?: boolean
          in_app_workflow?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_daily_digest?: boolean
          email_document?: boolean
          email_meeting?: boolean
          email_mention?: boolean
          email_product_news?: boolean
          email_system?: boolean
          email_task?: boolean
          email_workflow?: boolean
          in_app_document?: boolean
          in_app_meeting?: boolean
          in_app_mention?: boolean
          in_app_system?: boolean
          in_app_task?: boolean
          in_app_workflow?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          id: string
          is_read: boolean
          link: string | null
          meta: Json
          read_at: string | null
          row_version: number
          scope_type: string
          tenant_id: string | null
          title: string
          type: string
          updated_at: string
          updated_by: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          meta?: Json
          read_at?: string | null
          row_version?: number
          scope_type?: string
          tenant_id?: string | null
          title: string
          type: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          meta?: Json
          read_at?: string | null
          row_version?: number
          scope_type?: string
          tenant_id?: string | null
          title?: string
          type?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      outbox_events: {
        Row: {
          aggregate_id: string
          aggregate_type: string
          attempt_count: number
          available_at: string
          correlation_id: string | null
          created_at: string
          event_type: string
          event_version: number
          id: string
          idempotency_key: string | null
          last_error: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          occurred_at: string
          payload: Json
          processed_at: string | null
          status: string
          tenant_id: string | null
        }
        Insert: {
          aggregate_id: string
          aggregate_type: string
          attempt_count?: number
          available_at?: string
          correlation_id?: string | null
          created_at?: string
          event_type: string
          event_version?: number
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          occurred_at?: string
          payload?: Json
          processed_at?: string | null
          status?: string
          tenant_id?: string | null
        }
        Update: {
          aggregate_id?: string
          aggregate_type?: string
          attempt_count?: number
          available_at?: string
          correlation_id?: string | null
          created_at?: string
          event_type?: string
          event_version?: number
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          occurred_at?: string
          payload?: Json
          processed_at?: string | null
          status?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outbox_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
        }
        Relationships: []
      }
      tenant_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["tenant_role"]
          row_version: number
          status: string
          tenant_id: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["tenant_role"]
          row_version?: number
          status?: string
          tenant_id: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["tenant_role"]
          row_version?: number
          status?: string
          tenant_id?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          role: Database["public"]["Enums"]["tenant_role"]
          row_version: number
          status: Database["public"]["Enums"]["tenant_member_status"]
          tenant_id: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["tenant_role"]
          row_version?: number
          status?: Database["public"]["Enums"]["tenant_member_status"]
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["tenant_role"]
          row_version?: number
          status?: Database["public"]["Enums"]["tenant_member_status"]
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_members_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          name: string
          row_version: number
          slug: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name: string
          row_version?: number
          slug: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name?: string
          row_version?: number
          slug?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenants_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
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
      users: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          primary_email: string | null
          row_version: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          primary_email?: string | null
          row_version?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          primary_email?: string | null
          row_version?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          created_at: string
          role: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          role?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          role?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          owner_id: string
          row_version: number
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          owner_id: string
          row_version?: number
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          owner_id?: string
          row_version?: number
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspaces_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_tenant_invitation: {
        Args: { _correlation_id?: string; _token_hash: string }
        Returns: {
          created_at: string
          created_by: string | null
          id: string
          role: Database["public"]["Enums"]["tenant_role"]
          row_version: number
          status: Database["public"]["Enums"]["tenant_member_status"]
          tenant_id: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "tenant_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      change_tenant_member_role: {
        Args: {
          _correlation_id?: string
          _new_role: Database["public"]["Enums"]["tenant_role"]
          _tenant_id: string
          _user_id: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          id: string
          role: Database["public"]["Enums"]["tenant_role"]
          row_version: number
          status: Database["public"]["Enums"]["tenant_member_status"]
          tenant_id: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "tenant_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      change_tenant_member_status: {
        Args: {
          _correlation_id?: string
          _new_status: Database["public"]["Enums"]["tenant_member_status"]
          _tenant_id: string
          _user_id: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          id: string
          role: Database["public"]["Enums"]["tenant_role"]
          row_version: number
          status: Database["public"]["Enums"]["tenant_member_status"]
          tenant_id: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "tenant_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      change_tenant_status: {
        Args: {
          _correlation_id?: string
          _new_status: string
          _tenant_id: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          name: string
          row_version: number
          slug: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tenants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_outbox_events: {
        Args: { _batch?: number; _lease_seconds?: number; _worker: string }
        Returns: {
          aggregate_id: string
          aggregate_type: string
          attempt_count: number
          available_at: string
          correlation_id: string | null
          created_at: string
          event_type: string
          event_version: number
          id: string
          idempotency_key: string | null
          last_error: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          occurred_at: string
          payload: Json
          processed_at: string | null
          status: string
          tenant_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "outbox_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_outbox_event: {
        Args: { _id: string; _worker: string }
        Returns: boolean
      }
      create_tenant_invitation: {
        Args: {
          _correlation_id?: string
          _email: string
          _expires_at: string
          _role: Database["public"]["Enums"]["tenant_role"]
          _tenant_id: string
          _token_hash: string
        }
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["tenant_role"]
          row_version: number
          status: string
          tenant_id: string
          token_hash: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tenant_invitations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_internal_user_id: { Args: never; Returns: string }
      dblink: { Args: { "": string }; Returns: Record<string, unknown>[] }
      dblink_cancel_query: { Args: { "": string }; Returns: string }
      dblink_close: { Args: { "": string }; Returns: string }
      dblink_connect: { Args: { "": string }; Returns: string }
      dblink_connect_u: { Args: { "": string }; Returns: string }
      dblink_current_query: { Args: never; Returns: string }
      dblink_disconnect:
        | { Args: never; Returns: string }
        | { Args: { "": string }; Returns: string }
      dblink_error_message: { Args: { "": string }; Returns: string }
      dblink_exec: { Args: { "": string }; Returns: string }
      dblink_fdw_validator: {
        Args: { catalog: unknown; options: string[] }
        Returns: undefined
      }
      dblink_get_connections: { Args: never; Returns: string[] }
      dblink_get_notify:
        | { Args: { conname: string }; Returns: Record<string, unknown>[] }
        | { Args: never; Returns: Record<string, unknown>[] }
      dblink_get_pkey: {
        Args: { "": string }
        Returns: Database["public"]["CompositeTypes"]["dblink_pkey_results"][]
        SetofOptions: {
          from: "*"
          to: "dblink_pkey_results"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      dblink_get_result: {
        Args: { "": string }
        Returns: Record<string, unknown>[]
      }
      dblink_is_busy: { Args: { "": string }; Returns: number }
      extend_outbox_lease: {
        Args: { _id: string; _seconds: number; _worker: string }
        Returns: boolean
      }
      fail_outbox_event: {
        Args: {
          _error: string
          _id: string
          _retry_after_seconds?: number
          _worker: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_tenant_role: {
        Args: {
          _role: Database["public"]["Enums"]["tenant_role"]
          _tenant_id: string
        }
        Returns: boolean
      }
      is_reserved_slug: { Args: { _slug: string }; Returns: boolean }
      is_tenant_member: { Args: { _tenant_id: string }; Returns: boolean }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      is_workspace_owner: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      provision_tenant: {
        Args: {
          _correlation_id?: string
          _default_workspace_name: string
          _idempotency_key?: string
          _name: string
          _owner_id: string
          _slug: string
        }
        Returns: {
          membership_id: string
          tenant_id: string
          workspace_id: string
        }[]
      }
      revoke_tenant_invitation: {
        Args: { _correlation_id?: string; _invitation_id: string }
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["tenant_role"]
          row_version: number
          status: string
          tenant_id: string
          token_hash: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tenant_invitations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transfer_tenant_ownership: {
        Args: {
          _correlation_id?: string
          _new_owner_id: string
          _tenant_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      tenant_member_status: "active" | "invited" | "suspended" | "removed"
      tenant_role:
        | "tenant_owner"
        | "tenant_admin"
        | "manager"
        | "member"
        | "guest"
    }
    CompositeTypes: {
      dblink_pkey_results: {
        position: number | null
        colname: string | null
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
      app_role: ["admin", "moderator", "user"],
      tenant_member_status: ["active", "invited", "suspended", "removed"],
      tenant_role: [
        "tenant_owner",
        "tenant_admin",
        "manager",
        "member",
        "guest",
      ],
    },
  },
} as const
