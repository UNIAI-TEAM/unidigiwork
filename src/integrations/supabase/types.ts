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
      ai_action_proposals: {
        Row: {
          action_type: string
          ai_worker_id: string | null
          confirmed_at: string | null
          created_at: string
          description: string | null
          error_code: string | null
          executed_at: string | null
          execution_id: string | null
          expected_row_version: number | null
          expires_at: string
          governance: Json
          id: string
          idempotency_key: string
          payload: Json
          result: Json | null
          risk: string
          source: string
          source_refs: Json
          status: string
          target_id: string | null
          target_type: string | null
          tenant_id: string
          title: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          action_type: string
          ai_worker_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          description?: string | null
          error_code?: string | null
          executed_at?: string | null
          execution_id?: string | null
          expected_row_version?: number | null
          expires_at?: string
          governance?: Json
          id?: string
          idempotency_key?: string
          payload?: Json
          result?: Json | null
          risk?: string
          source?: string
          source_refs?: Json
          status?: string
          target_id?: string | null
          target_type?: string | null
          tenant_id: string
          title: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          action_type?: string
          ai_worker_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          description?: string | null
          error_code?: string | null
          executed_at?: string | null
          execution_id?: string | null
          expected_row_version?: number | null
          expires_at?: string
          governance?: Json
          id?: string
          idempotency_key?: string
          payload?: Json
          result?: Json | null
          risk?: string
          source?: string
          source_refs?: Json
          status?: string
          target_id?: string | null
          target_type?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_action_proposals_ai_worker_id_fkey"
            columns: ["ai_worker_id"]
            isOneToOne: false
            referencedRelation: "ai_workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_action_proposals_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "ai_task_executions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_performance: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          last_run_at: string | null
          market_agent_id: string | null
          proposals_approved: number
          proposals_sent: number
          runs_total: number
          tasks_completed: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          last_run_at?: string | null
          market_agent_id?: string | null
          proposals_approved?: number
          proposals_sent?: number
          runs_total?: number
          tasks_completed?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          last_run_at?: string | null
          market_agent_id?: string | null
          proposals_approved?: number
          proposals_sent?: number
          runs_total?: number
          tasks_completed?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_performance_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "workflow_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_performance_market_agent_id_fkey"
            columns: ["market_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_market_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_performance_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_context_metrics: {
        Row: {
          created_at: string
          estimated_tokens: number
          id: string
          latency_ms: number
          max_tokens: number
          operation: string
          partial: boolean
          request_id: string
          root_entity_type: string | null
          source_count: number
          strategy: string | null
          tenant_id: string | null
          timings: Json
          truncated: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          estimated_tokens?: number
          id?: string
          latency_ms?: number
          max_tokens?: number
          operation?: string
          partial?: boolean
          request_id: string
          root_entity_type?: string | null
          source_count?: number
          strategy?: string | null
          tenant_id?: string | null
          timings?: Json
          truncated?: boolean
          user_id?: string
        }
        Update: {
          created_at?: string
          estimated_tokens?: number
          id?: string
          latency_ms?: number
          max_tokens?: number
          operation?: string
          partial?: boolean
          request_id?: string
          root_entity_type?: string | null
          source_count?: number
          strategy?: string | null
          tenant_id?: string | null
          timings?: Json
          truncated?: boolean
          user_id?: string
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          last_message_at: string
          model: string
          tenant_id: string
          title: string
          total_input_tokens: number
          total_output_tokens: number
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          last_message_at?: string
          model?: string
          tenant_id: string
          title?: string
          total_input_tokens?: number
          total_output_tokens?: number
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          last_message_at?: string
          model?: string
          tenant_id?: string
          title?: string
          total_input_tokens?: number
          total_output_tokens?: number
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_employment_events: {
        Row: {
          actor_id: string | null
          created_at: string
          employment_id: string
          from_status: string | null
          id: string
          note: string
          salary_amount: number | null
          tenant_id: string
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          employment_id: string
          from_status?: string | null
          id?: string
          note?: string
          salary_amount?: number | null
          tenant_id: string
          to_status: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          employment_id?: string
          from_status?: string | null
          id?: string
          note?: string
          salary_amount?: number | null
          tenant_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_employment_events_employment_id_fkey"
            columns: ["employment_id"]
            isOneToOne: false
            referencedRelation: "ai_employments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_employment_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_employments: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          ended_at: string | null
          fee_per_action: number
          hired_at: string | null
          id: string
          market_agent_id: string
          salary_amount: number
          status: string
          tenant_id: string
          term_months: number
          terms: string
          trial_ends_at: string | null
          trial_started_at: string | null
          updated_at: string
          updated_by: string | null
          workflow_agent_id: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          ended_at?: string | null
          fee_per_action?: number
          hired_at?: string | null
          id?: string
          market_agent_id: string
          salary_amount?: number
          status?: string
          tenant_id: string
          term_months?: number
          terms?: string
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
          updated_by?: string | null
          workflow_agent_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          ended_at?: string | null
          fee_per_action?: number
          hired_at?: string | null
          id?: string
          market_agent_id?: string
          salary_amount?: number
          status?: string
          tenant_id?: string
          term_months?: number
          terms?: string
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
          updated_by?: string | null
          workflow_agent_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_employments_market_agent_id_fkey"
            columns: ["market_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_market_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_employments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_employments_workflow_agent_id_fkey"
            columns: ["workflow_agent_id"]
            isOneToOne: false
            referencedRelation: "workflow_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_employments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_interview_messages: {
        Row: {
          case_id: string | null
          content: string
          created_at: string
          id: string
          interview_id: string
          role: string
          score: number | null
          tenant_id: string
        }
        Insert: {
          case_id?: string | null
          content?: string
          created_at?: string
          id?: string
          interview_id: string
          role: string
          score?: number | null
          tenant_id: string
        }
        Update: {
          case_id?: string | null
          content?: string
          created_at?: string
          id?: string
          interview_id?: string
          role?: string
          score?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_interview_messages_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "ai_market_interview_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_interview_messages_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "ai_interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_interview_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_interviews: {
        Row: {
          created_at: string
          created_by: string | null
          employment_id: string | null
          id: string
          market_agent_id: string
          max_score: number | null
          max_turns: number
          score: number | null
          tenant_id: string
          turns_used: number
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          employment_id?: string | null
          id?: string
          market_agent_id: string
          max_score?: number | null
          max_turns?: number
          score?: number | null
          tenant_id: string
          turns_used?: number
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          employment_id?: string | null
          id?: string
          market_agent_id?: string
          max_score?: number | null
          max_turns?: number
          score?: number | null
          tenant_id?: string
          turns_used?: number
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_interviews_employment_id_fkey"
            columns: ["employment_id"]
            isOneToOne: false
            referencedRelation: "ai_employments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_interviews_market_agent_id_fkey"
            columns: ["market_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_market_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_interviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_interviews_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_market_agents: {
        Row: {
          bio: string
          code: string
          completed_tasks: number
          created_at: string
          currency: string
          domain: string
          fee_per_action: number
          hires_count: number
          id: string
          languages: string[]
          mission: string
          name: string
          persona: string
          published: boolean
          rating: number
          salary_max: number
          salary_min: number
          seniority: string
          skills: string[]
          sort_order: number
          tenant_id: string | null
          title: string
          updated_at: string
          worker_profile: string | null
        }
        Insert: {
          bio?: string
          code: string
          completed_tasks?: number
          created_at?: string
          currency?: string
          domain: string
          fee_per_action?: number
          hires_count?: number
          id?: string
          languages?: string[]
          mission?: string
          name: string
          persona?: string
          published?: boolean
          rating?: number
          salary_max?: number
          salary_min?: number
          seniority?: string
          skills?: string[]
          sort_order?: number
          tenant_id?: string | null
          title?: string
          updated_at?: string
          worker_profile?: string | null
        }
        Update: {
          bio?: string
          code?: string
          completed_tasks?: number
          created_at?: string
          currency?: string
          domain?: string
          fee_per_action?: number
          hires_count?: number
          id?: string
          languages?: string[]
          mission?: string
          name?: string
          persona?: string
          published?: boolean
          rating?: number
          salary_max?: number
          salary_min?: number
          seniority?: string
          skills?: string[]
          sort_order?: number
          tenant_id?: string | null
          title?: string
          updated_at?: string
          worker_profile?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_market_agents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_market_experiences: {
        Row: {
          company_label: string
          completed_tasks: number
          created_at: string
          duration_months: number
          id: string
          industry: string
          market_agent_id: string
          sort_order: number
          summary: string
        }
        Insert: {
          company_label?: string
          completed_tasks?: number
          created_at?: string
          duration_months?: number
          id?: string
          industry: string
          market_agent_id: string
          sort_order?: number
          summary?: string
        }
        Update: {
          company_label?: string
          completed_tasks?: number
          created_at?: string
          duration_months?: number
          id?: string
          industry?: string
          market_agent_id?: string
          sort_order?: number
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_market_experiences_market_agent_id_fkey"
            columns: ["market_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_market_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_market_interview_cases: {
        Row: {
          code: string
          created_at: string
          domain: string
          id: string
          max_score: number
          prompt: string
          rubric: string
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          domain: string
          id?: string
          max_score?: number
          prompt: string
          rubric?: string
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          domain?: string
          id?: string
          max_score?: number
          prompt?: string
          rubric?: string
          sort_order?: number
        }
        Relationships: []
      }
      ai_market_skills: {
        Row: {
          action_types: string[]
          code: string
          created_at: string
          description: string
          example: string
          id: string
          kind: string
          name: string
          published: boolean
          sort_order: number
          sources: string[]
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          action_types?: string[]
          code: string
          created_at?: string
          description?: string
          example?: string
          id?: string
          kind?: string
          name: string
          published?: boolean
          sort_order?: number
          sources?: string[]
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          action_types?: string[]
          code?: string
          created_at?: string
          description?: string
          example?: string
          id?: string
          kind?: string
          name?: string
          published?: boolean
          sort_order?: number
          sources?: string[]
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_market_skills_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_message_versions: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          edited_by: string | null
          id: string
          message_id: string
          tenant_id: string
          version: number
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          edited_by?: string | null
          id?: string
          message_id: string
          tenant_id: string
          version: number
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          edited_by?: string | null
          id?: string
          message_id?: string
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_message_versions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_message_versions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "ai_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_message_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          created_by: string | null
          id: string
          input_tokens: number
          metadata: Json
          model: string | null
          output_tokens: number
          role: string
          tenant_id: string
        }
        Insert: {
          content?: string
          conversation_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          input_tokens?: number
          metadata?: Json
          model?: string | null
          output_tokens?: number
          role: string
          tenant_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          input_tokens?: number
          metadata?: Json
          model?: string | null
          output_tokens?: number
          role?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_model_cost_rates: {
        Row: {
          created_at: string
          currency: string
          effective_from: string
          effective_to: string | null
          id: string
          input_token_rate: number
          model: string
          output_token_rate: number
          provider: string
          rate_unit: string
          rate_version: number
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          input_token_rate: number
          model: string
          output_token_rate: number
          provider: string
          rate_unit?: string
          rate_version?: number
          source: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          input_token_rate?: number
          model?: string
          output_token_rate?: number
          provider?: string
          rate_unit?: string
          rate_version?: number
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_skills: {
        Row: {
          action_types: string[]
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          enabled: boolean
          example: string
          id: string
          is_system: boolean
          kind: string
          name: string
          sources: string[]
          tenant_id: string
          updated_at: string
          updated_by: string | null
          workspace_id: string | null
        }
        Insert: {
          action_types?: string[]
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          enabled?: boolean
          example?: string
          id?: string
          is_system?: boolean
          kind: string
          name: string
          sources?: string[]
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string | null
        }
        Update: {
          action_types?: string[]
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          enabled?: boolean
          example?: string
          id?: string
          is_system?: boolean
          kind?: string
          name?: string
          sources?: string[]
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_skills_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_skills_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_task_executions: {
        Row: {
          accepted_with_warnings: boolean
          ai_worker_id: string
          change_request: string | null
          cohort_class: string
          cohort_exclusion_reason: string | null
          completed_at: string | null
          contract_hash: string | null
          contract_snapshot: Json | null
          created_at: string
          created_by: string | null
          deliverable_content: string | null
          deliverable_title: string | null
          deliverable_type: string | null
          error_code: string | null
          evidence: Json
          evidence_pack: Json
          id: string
          outcome: Json
          quality_assessment: Json
          quality_passed: boolean | null
          quality_score: number | null
          quality_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          revision: number
          row_version: number
          source_refs: Json
          started_at: string | null
          status: string
          task_id: string
          template_code: string | null
          tenant_id: string
          updated_at: string
          work_product_inputs: Json | null
          work_unit_code: string | null
          work_unit_version: number | null
          workspace_id: string
        }
        Insert: {
          accepted_with_warnings?: boolean
          ai_worker_id: string
          change_request?: string | null
          cohort_class?: string
          cohort_exclusion_reason?: string | null
          completed_at?: string | null
          contract_hash?: string | null
          contract_snapshot?: Json | null
          created_at?: string
          created_by?: string | null
          deliverable_content?: string | null
          deliverable_title?: string | null
          deliverable_type?: string | null
          error_code?: string | null
          evidence?: Json
          evidence_pack?: Json
          id?: string
          outcome?: Json
          quality_assessment?: Json
          quality_passed?: boolean | null
          quality_score?: number | null
          quality_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision?: number
          row_version?: number
          source_refs?: Json
          started_at?: string | null
          status?: string
          task_id: string
          template_code?: string | null
          tenant_id: string
          updated_at?: string
          work_product_inputs?: Json | null
          work_unit_code?: string | null
          work_unit_version?: number | null
          workspace_id: string
        }
        Update: {
          accepted_with_warnings?: boolean
          ai_worker_id?: string
          change_request?: string | null
          cohort_class?: string
          cohort_exclusion_reason?: string | null
          completed_at?: string | null
          contract_hash?: string | null
          contract_snapshot?: Json | null
          created_at?: string
          created_by?: string | null
          deliverable_content?: string | null
          deliverable_title?: string | null
          deliverable_type?: string | null
          error_code?: string | null
          evidence?: Json
          evidence_pack?: Json
          id?: string
          outcome?: Json
          quality_assessment?: Json
          quality_passed?: boolean | null
          quality_score?: number | null
          quality_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision?: number
          row_version?: number
          source_refs?: Json
          started_at?: string | null
          status?: string
          task_id?: string
          template_code?: string | null
          tenant_id?: string
          updated_at?: string
          work_product_inputs?: Json | null
          work_unit_code?: string | null
          work_unit_version?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_task_executions_ai_worker_id_fkey"
            columns: ["ai_worker_id"]
            isOneToOne: false
            referencedRelation: "ai_workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_task_executions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_task_executions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_task_executions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_task_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_task_executions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_events: {
        Row: {
          conversation_id: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          execution_id: string | null
          execution_revision: number | null
          id: string
          input_tokens: number
          message_id: string | null
          model: string
          output_tokens: number
          provider: string | null
          purpose: string
          run_id: string | null
          status: string
          tenant_id: string
          token_precision: string
          total_tokens: number
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          execution_id?: string | null
          execution_revision?: number | null
          id?: string
          input_tokens?: number
          message_id?: string | null
          model: string
          output_tokens?: number
          provider?: string | null
          purpose?: string
          run_id?: string | null
          status?: string
          tenant_id: string
          token_precision?: string
          total_tokens?: number
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          execution_id?: string | null
          execution_revision?: number | null
          id?: string
          input_tokens?: number
          message_id?: string | null
          model?: string
          output_tokens?: number
          provider?: string | null
          purpose?: string
          run_id?: string | null
          status?: string
          tenant_id?: string
          token_precision?: string
          total_tokens?: number
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "ai_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_workers: {
        Row: {
          allowed_tools: string[]
          autonomy_policy: Json
          code: string
          created_at: string
          id: string
          name: string
          permission_scope: string
          provider_config_ref: string
          role: string
          scope_object_types: string[]
          scope_project_ids: string[] | null
          scope_workspace_ids: string[] | null
          skills: string[]
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          allowed_tools?: string[]
          autonomy_policy?: Json
          code: string
          created_at?: string
          id?: string
          name: string
          permission_scope?: string
          provider_config_ref?: string
          role: string
          scope_object_types?: string[]
          scope_project_ids?: string[] | null
          scope_workspace_ids?: string[] | null
          skills?: string[]
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          allowed_tools?: string[]
          autonomy_policy?: Json
          code?: string
          created_at?: string
          id?: string
          name?: string
          permission_scope?: string
          provider_config_ref?: string
          role?: string
          scope_object_types?: string[]
          scope_project_ids?: string[] | null
          scope_workspace_ids?: string[] | null
          skills?: string[]
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_workers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
      blog_posts: {
        Row: {
          author_name: string
          author_seed: string
          category: string
          content: string
          cover_url: string | null
          created_at: string
          excerpt: string
          id: string
          is_featured: boolean
          published_at: string | null
          read_time: string
          slug: string
          status: string
          title: string
          updated_at: string
          view_count: number
        }
        Insert: {
          author_name?: string
          author_seed?: string
          category?: string
          content?: string
          cover_url?: string | null
          created_at?: string
          excerpt?: string
          id?: string
          is_featured?: boolean
          published_at?: string | null
          read_time?: string
          slug: string
          status?: string
          title: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          author_name?: string
          author_seed?: string
          category?: string
          content?: string
          cover_url?: string | null
          created_at?: string
          excerpt?: string
          id?: string
          is_featured?: boolean
          published_at?: string | null
          read_time?: string
          slug?: string
          status?: string
          title?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: []
      }
      ceo_kpi_settings: {
        Row: {
          auto_retrain: boolean
          auto_retrain_at: string | null
          auto_retrain_signature: string | null
          auto_standup: boolean
          auto_standup_at: string | null
          created_at: string
          department_weights: Json
          kpi_refreshed_at: string | null
          kpi_snapshot: Json | null
          standup_snapshot: Json | null
          targets: Json
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auto_retrain?: boolean
          auto_retrain_at?: string | null
          auto_retrain_signature?: string | null
          auto_standup?: boolean
          auto_standup_at?: string | null
          created_at?: string
          department_weights?: Json
          kpi_refreshed_at?: string | null
          kpi_snapshot?: Json | null
          standup_snapshot?: Json | null
          targets?: Json
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auto_retrain?: boolean
          auto_retrain_at?: string | null
          auto_retrain_signature?: string | null
          auto_standup?: boolean
          auto_standup_at?: string | null
          created_at?: string
          department_weights?: Json
          kpi_refreshed_at?: string | null
          kpi_snapshot?: Json | null
          standup_snapshot?: Json | null
          targets?: Json
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      ceo_kpi_snapshots: {
        Row: {
          ai_share_pct: number | null
          captured_at: string
          completed: number
          configured: boolean
          id: string
          overdue: number
          payload: Json
          score: number | null
          source: string
          tenant_id: string
          total_tasks: number
        }
        Insert: {
          ai_share_pct?: number | null
          captured_at?: string
          completed?: number
          configured?: boolean
          id?: string
          overdue?: number
          payload?: Json
          score?: number | null
          source?: string
          tenant_id: string
          total_tasks?: number
        }
        Update: {
          ai_share_pct?: number | null
          captured_at?: string
          completed?: number
          configured?: boolean
          id?: string
          overdue?: number
          payload?: Json
          score?: number | null
          source?: string
          tenant_id?: string
          total_tasks?: number
        }
        Relationships: []
      }
      ceo_report_runs: {
        Row: {
          created_at: string
          id: string
          notified_count: number
          pdf_path: string | null
          period_end: string
          tenant_id: string
          xlsx_path: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          notified_count?: number
          pdf_path?: string | null
          period_end: string
          tenant_id: string
          xlsx_path?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          notified_count?: number
          pdf_path?: string | null
          period_end?: string
          tenant_id?: string
          xlsx_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ceo_report_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_channels: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_private: boolean
          kind: string
          last_message_at: string | null
          name: string
          row_version: number
          tenant_id: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_private?: boolean
          kind?: string
          last_message_at?: string | null
          name: string
          row_version?: number
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_private?: boolean
          kind?: string
          last_message_at?: string | null
          name?: string
          row_version?: number
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_channels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_channels_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_members: {
        Row: {
          channel_id: string
          created_at: string
          is_favorite: boolean
          last_read_at: string | null
          role: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          is_favorite?: boolean
          last_read_at?: string | null
          role?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          is_favorite?: boolean
          last_read_at?: string | null
          role?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          attachments: Json
          author_id: string
          body: string
          channel_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          parent_message_id: string | null
          pinned_at: string | null
          pinned_by: string | null
          row_version: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attachments?: Json
          author_id: string
          body: string
          channel_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          parent_message_id?: string | null
          pinned_at?: string | null
          pinned_by?: string | null
          row_version?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attachments?: Json
          author_id?: string
          body?: string
          channel_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          parent_message_id?: string | null
          pinned_at?: string | null
          pinned_by?: string | null
          row_version?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_requests: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          notes: string | null
          role: string
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name: string
          notes?: string | null
          role: string
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          notes?: string | null
          role?: string
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      document_access_logs: {
        Row: {
          action: string
          actor_id: string
          context: Json
          document_id: string
          document_title: string | null
          id: string
          occurred_at: string
          tenant_id: string
          version: number | null
          workspace_id: string
        }
        Insert: {
          action: string
          actor_id: string
          context?: Json
          document_id: string
          document_title?: string | null
          id?: string
          occurred_at?: string
          tenant_id: string
          version?: number | null
          workspace_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          context?: Json
          document_id?: string
          document_title?: string | null
          id?: string
          occurred_at?: string
          tenant_id?: string
          version?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_access_logs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_access_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_access_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_permissions: {
        Row: {
          created_at: string
          document_id: string
          granted_by: string | null
          id: string
          level: string
          principal_id: string
          principal_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_id: string
          granted_by?: string | null
          id?: string
          level: string
          principal_id: string
          principal_type: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_id?: string
          granted_by?: string | null
          id?: string
          level?: string
          principal_id?: string
          principal_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_permissions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_permissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          author_id: string | null
          comment: string | null
          created_at: string
          document_id: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          storage_ref: Json | null
          tenant_id: string
          version: number
        }
        Insert: {
          author_id?: string | null
          comment?: string | null
          created_at?: string
          document_id: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_ref?: Json | null
          tenant_id: string
          version: number
        }
        Update: {
          author_id?: string | null
          comment?: string | null
          created_at?: string
          document_id?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_ref?: Json | null
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_tenant_id_fkey"
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
          created_by: string | null
          current_version: number
          deleted_at: string | null
          folder: string
          id: string
          mime_type: string | null
          row_version: number
          size_bytes: number | null
          storage_ref: Json | null
          tags: string[]
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          created_by?: string | null
          current_version?: number
          deleted_at?: string | null
          folder?: string
          id?: string
          mime_type?: string | null
          row_version?: number
          size_bytes?: number | null
          storage_ref?: Json | null
          tags?: string[]
          tenant_id: string
          title: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          current_version?: number
          deleted_at?: string | null
          folder?: string
          id?: string
          mime_type?: string | null
          row_version?: number
          size_bytes?: number | null
          storage_ref?: Json | null
          tags?: string[]
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
      entitlements: {
        Row: {
          enabled: boolean
          feature_key: string
          quota_limit: number | null
          source: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          feature_key: string
          quota_limit?: number | null
          source?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          feature_key?: string
          quota_limit?: number | null
          source?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entitlements_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "entitlements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
      features: {
        Row: {
          category: string
          created_at: string
          key: string
          kind: string
          name: string
          sort_order: number
          unit: string | null
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          key: string
          kind: string
          name: string
          sort_order?: number
          unit?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          key?: string
          kind?: string
          name?: string
          sort_order?: number
          unit?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      human_cost_policies: {
        Row: {
          approval_event_cost: number
          basis: string
          change_request_cost: number
          created_at: string
          currency: string
          effective_from: string
          effective_to: string | null
          id: string
          policy_version: number
          review_event_cost: number
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          approval_event_cost?: number
          basis?: string
          change_request_cost?: number
          created_at?: string
          currency?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          policy_version?: number
          review_event_cost?: number
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          approval_event_cost?: number
          basis?: string
          change_request_cost?: number
          created_at?: string
          currency?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          policy_version?: number
          review_event_cost?: number
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      invite_email_template_versions: {
        Row: {
          action: string
          body: string
          changed_by: string | null
          created_at: string
          cta_label: string
          footer: string
          heading: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["tenant_role"]
          subject: string
          tenant_id: string
          version: number
        }
        Insert: {
          action?: string
          body: string
          changed_by?: string | null
          created_at?: string
          cta_label: string
          footer?: string
          heading: string
          id?: string
          is_active?: boolean
          role: Database["public"]["Enums"]["tenant_role"]
          subject: string
          tenant_id: string
          version: number
        }
        Update: {
          action?: string
          body?: string
          changed_by?: string | null
          created_at?: string
          cta_label?: string
          footer?: string
          heading?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["tenant_role"]
          subject?: string
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "invite_email_template_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_email_templates: {
        Row: {
          body: string
          created_at: string
          cta_label: string
          footer: string
          heading: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["tenant_role"]
          subject: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          created_at?: string
          cta_label?: string
          footer?: string
          heading: string
          id?: string
          is_active?: boolean
          role: Database["public"]["Enums"]["tenant_role"]
          subject: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          cta_label?: string
          footer?: string
          heading?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["tenant_role"]
          subject?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invite_email_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          created_at: string
          currency: string
          due_at: string | null
          id: string
          invoice_number: string
          issued_at: string
          note: string | null
          paid_at: string | null
          payment_method: string | null
          period_end: string | null
          period_start: string | null
          plan_id: string | null
          plan_name: string | null
          status: string
          subscription_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          due_at?: string | null
          id?: string
          invoice_number: string
          issued_at?: string
          note?: string | null
          paid_at?: string | null
          payment_method?: string | null
          period_end?: string | null
          period_start?: string | null
          plan_id?: string | null
          plan_name?: string | null
          status?: string
          subscription_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          due_at?: string | null
          id?: string
          invoice_number?: string
          issued_at?: string
          note?: string | null
          paid_at?: string | null
          payment_method?: string | null
          period_end?: string | null
          period_start?: string | null
          plan_id?: string | null
          plan_name?: string | null
          status?: string
          subscription_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_articles: {
        Row: {
          category: string
          content: string
          cover_url: string | null
          created_at: string
          created_by: string | null
          id: string
          published_at: string | null
          row_version: number
          slug: string
          status: string
          summary: string
          tags: string[]
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
          view_count: number
        }
        Insert: {
          category?: string
          content?: string
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          row_version?: number
          slug: string
          status?: string
          summary?: string
          tags?: string[]
          tenant_id: string
          title: string
          updated_at?: string
          updated_by?: string | null
          view_count?: number
        }
        Update: {
          category?: string
          content?: string
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          row_version?: number
          slug?: string
          status?: string
          summary?: string
          tags?: string[]
          tenant_id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_articles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_action_item_states: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          item_key: string
          meeting_id: string
          status: string
          task_id: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          item_key: string
          meeting_id: string
          status?: string
          task_id?: string | null
          tenant_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          item_key?: string
          meeting_id?: string
          status?: string
          task_id?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_action_item_states_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_action_item_states_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_action_item_states_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_artifacts: {
        Row: {
          confidence: string | null
          created_at: string
          detail: string | null
          id: string
          item_key: string
          kind: string
          meeting_id: string
          source_ids: string[]
          summary_version: number
          tenant_id: string
          title: string
          transcript_checksum: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          confidence?: string | null
          created_at?: string
          detail?: string | null
          id: string
          item_key: string
          kind: string
          meeting_id: string
          source_ids?: string[]
          summary_version?: number
          tenant_id: string
          title: string
          transcript_checksum?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          confidence?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          item_key?: string
          kind?: string
          meeting_id?: string
          source_ids?: string[]
          summary_version?: number
          tenant_id?: string
          title?: string
          transcript_checksum?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_artifacts_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_artifacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_artifacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_attendance: {
        Row: {
          created_at: string
          id: string
          joined_at: string
          left_at: string | null
          meeting_id: string
          minutes: number
          tenant_id: string
          updated_at: string
          usage_recorded: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          joined_at?: string
          left_at?: string | null
          meeting_id: string
          minutes?: number
          tenant_id: string
          updated_at?: string
          usage_recorded?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          joined_at?: string
          left_at?: string | null
          meeting_id?: string
          minutes?: number
          tenant_id?: string
          updated_at?: string
          usage_recorded?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_attendance_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_attendance_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_invite_links: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          label: string | null
          max_uses: number | null
          meeting_id: string
          revoked_at: string | null
          tenant_id: string
          token_hash: string
          updated_at: string
          used_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          label?: string | null
          max_uses?: number | null
          meeting_id: string
          revoked_at?: string | null
          tenant_id: string
          token_hash: string
          updated_at?: string
          used_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          label?: string | null
          max_uses?: number | null
          meeting_id?: string
          revoked_at?: string | null
          tenant_id?: string
          token_hash?: string
          updated_at?: string
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "meeting_invite_links_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_invite_links_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_join_requests: {
        Row: {
          correlation_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          meeting_id: string
          message: string | null
          requester_id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          correlation_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          meeting_id: string
          message?: string | null
          requester_id: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          correlation_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          meeting_id?: string
          message?: string | null
          requester_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_join_requests_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_join_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_join_tokens: {
        Row: {
          correlation_id: string | null
          created_at: string
          expires_at: string
          id: string
          idempotency_key: string | null
          issued_at: string
          meeting_id: string
          role: string
          tenant_id: string
          token_fingerprint: string
          user_id: string
        }
        Insert: {
          correlation_id?: string | null
          created_at?: string
          expires_at: string
          id?: string
          idempotency_key?: string | null
          issued_at?: string
          meeting_id: string
          role: string
          tenant_id: string
          token_fingerprint: string
          user_id: string
        }
        Update: {
          correlation_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          idempotency_key?: string | null
          issued_at?: string
          meeting_id?: string
          role?: string
          tenant_id?: string
          token_fingerprint?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_join_tokens_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_join_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_participants: {
        Row: {
          created_at: string
          meeting_id: string
          role: string
          rsvp: Database["public"]["Enums"]["meeting_rsvp"]
          rsvp_at: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          meeting_id: string
          role?: string
          rsvp?: Database["public"]["Enums"]["meeting_rsvp"]
          rsvp_at?: string | null
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          meeting_id?: string
          role?: string
          rsvp?: Database["public"]["Enums"]["meeting_rsvp"]
          rsvp_at?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_participants_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_participants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_provider_events: {
        Row: {
          correlation_id: string | null
          created_at: string
          duplicate_count: number
          event_id: string
          event_type: string
          id: string
          last_duplicate_at: string | null
          meeting_id: string
          occurred_at: string | null
          participant_identity: string | null
          payload: Json
          provider: string
          room_sid: string | null
          tenant_id: string
        }
        Insert: {
          correlation_id?: string | null
          created_at?: string
          duplicate_count?: number
          event_id: string
          event_type: string
          id?: string
          last_duplicate_at?: string | null
          meeting_id: string
          occurred_at?: string | null
          participant_identity?: string | null
          payload?: Json
          provider?: string
          room_sid?: string | null
          tenant_id: string
        }
        Update: {
          correlation_id?: string | null
          created_at?: string
          duplicate_count?: number
          event_id?: string
          event_type?: string
          id?: string
          last_duplicate_at?: string | null
          meeting_id?: string
          occurred_at?: string | null
          participant_identity?: string | null
          payload?: Json
          provider?: string
          room_sid?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      meeting_recordings: {
        Row: {
          created_at: string
          duration_seconds: number
          egress_id: string | null
          ended_at: string | null
          error_message: string | null
          file_size_bytes: number | null
          file_url: string | null
          id: string
          meeting_id: string
          provider: string
          started_at: string
          started_by: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number
          egress_id?: string | null
          ended_at?: string | null
          error_message?: string | null
          file_size_bytes?: number | null
          file_url?: string | null
          id?: string
          meeting_id: string
          provider?: string
          started_at?: string
          started_by?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number
          egress_id?: string | null
          ended_at?: string | null
          error_message?: string | null
          file_size_bytes?: number | null
          file_url?: string | null
          id?: string
          meeting_id?: string
          provider?: string
          started_at?: string
          started_by?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_recordings_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_recordings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_summaries: {
        Row: {
          action_items: Json
          created_at: string
          decisions: Json
          followup: Json
          generated_at: string
          generated_by: string | null
          highlights: Json
          id: string
          meeting_id: string
          model: string | null
          open_questions: Json
          risks: Json
          segment_count: number
          sources: Json
          status: string
          summary: string
          tenant_id: string
          transcript_checksum: string | null
          updated_at: string
          version: number
        }
        Insert: {
          action_items?: Json
          created_at?: string
          decisions?: Json
          followup?: Json
          generated_at?: string
          generated_by?: string | null
          highlights?: Json
          id?: string
          meeting_id: string
          model?: string | null
          open_questions?: Json
          risks?: Json
          segment_count?: number
          sources?: Json
          status?: string
          summary?: string
          tenant_id: string
          transcript_checksum?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          action_items?: Json
          created_at?: string
          decisions?: Json
          followup?: Json
          generated_at?: string
          generated_by?: string | null
          highlights?: Json
          id?: string
          meeting_id?: string
          model?: string | null
          open_questions?: Json
          risks?: Json
          segment_count?: number
          sources?: Json
          status?: string
          summary?: string
          tenant_id?: string
          transcript_checksum?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "meeting_summaries_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_summaries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_summary_progress: {
        Row: {
          chunks: Json
          completed_chunks: number
          failed_chunks: number
          finished_at: string | null
          meeting_id: string
          phase: string
          run_id: string
          staged: boolean
          started_at: string
          tenant_id: string
          total_chunks: number
          truncated: boolean
          updated_at: string
        }
        Insert: {
          chunks?: Json
          completed_chunks?: number
          failed_chunks?: number
          finished_at?: string | null
          meeting_id: string
          phase?: string
          run_id: string
          staged?: boolean
          started_at?: string
          tenant_id: string
          total_chunks?: number
          truncated?: boolean
          updated_at?: string
        }
        Update: {
          chunks?: Json
          completed_chunks?: number
          failed_chunks?: number
          finished_at?: string | null
          meeting_id?: string
          phase?: string
          run_id?: string
          staged?: boolean
          started_at?: string
          tenant_id?: string
          total_chunks?: number
          truncated?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_summary_progress_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_summary_progress_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_transcript_segments: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          meeting_id: string
          offset_seconds: number
          source: string
          speaker_name: string | null
          speaker_user_id: string | null
          tenant_id: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          meeting_id: string
          offset_seconds?: number
          source?: string
          speaker_name?: string | null
          speaker_user_id?: string | null
          tenant_id: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          meeting_id?: string
          offset_seconds?: number
          source?: string
          speaker_name?: string | null
          speaker_user_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_transcript_segments_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_transcript_segments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          agenda: string | null
          conference_provider: string | null
          conference_ref: Json | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          department: string | null
          end_at: string
          id: string
          location: string | null
          project_id: string | null
          row_version: number
          rrule: string | null
          start_at: string
          status: Database["public"]["Enums"]["meeting_status"]
          tenant_id: string
          timezone: string
          title: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          agenda?: string | null
          conference_provider?: string | null
          conference_ref?: Json | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department?: string | null
          end_at: string
          id?: string
          location?: string | null
          project_id?: string | null
          row_version?: number
          rrule?: string | null
          start_at: string
          status?: Database["public"]["Enums"]["meeting_status"]
          tenant_id: string
          timezone?: string
          title: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          agenda?: string | null
          conference_provider?: string | null
          conference_ref?: Json | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department?: string | null
          end_at?: string
          id?: string
          location?: string | null
          project_id?: string | null
          row_version?: number
          rrule?: string | null
          start_at?: string
          status?: Database["public"]["Enums"]["meeting_status"]
          tenant_id?: string
          timezone?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
      outbox_deliveries: {
        Row: {
          channel: string
          created_at: string
          duration_ms: number | null
          error: string | null
          event_id: string
          event_type: string
          http_status: number | null
          id: string
          status: string
          target: string | null
          tenant_id: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          event_id: string
          event_type: string
          http_status?: number | null
          id?: string
          status: string
          target?: string | null
          tenant_id?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          event_id?: string
          event_type?: string
          http_status?: number | null
          id?: string
          status?: string
          target?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outbox_deliveries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "outbox_events"
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
      plan_features: {
        Row: {
          enabled: boolean
          feature_key: string
          plan_id: string
          quota_limit: number | null
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          feature_key: string
          plan_id: string
          quota_limit?: number | null
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          feature_key?: string
          plan_id?: string
          quota_limit?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_features_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "plan_features_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          billing_period: string
          code: string
          created_at: string
          cta_label: string | null
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          is_featured: boolean
          name: string
          price_amount: number | null
          price_currency: string
          price_label: string | null
          price_unit_label: string | null
          row_version: number
          sort_order: number
          tagline: string | null
          updated_at: string
        }
        Insert: {
          billing_period?: string
          code: string
          created_at?: string
          cta_label?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          is_featured?: boolean
          name: string
          price_amount?: number | null
          price_currency?: string
          price_label?: string | null
          price_unit_label?: string | null
          row_version?: number
          sort_order?: number
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          billing_period?: string
          code?: string
          created_at?: string
          cta_label?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          is_featured?: boolean
          name?: string
          price_amount?: number | null
          price_currency?: string
          price_label?: string | null
          price_unit_label?: string | null
          row_version?: number
          sort_order?: number
          tagline?: string | null
          updated_at?: string
        }
        Relationships: []
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
      project_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          project_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          project_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          project_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_comments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          code: string | null
          color: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          due_date: string | null
          id: string
          name: string
          notes: string | null
          owner_id: string | null
          start_date: string | null
          status: string
          tags: string[]
          tenant_id: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          code?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          name: string
          notes?: string | null
          owner_id?: string | null
          start_date?: string | null
          status?: string
          tags?: string[]
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          code?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string | null
          start_date?: string | null
          status?: string
          tags?: string[]
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          enabled: boolean
          endpoint: string
          failure_count: number
          id: string
          last_used_at: string | null
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          enabled?: boolean
          endpoint: string
          failure_count?: number
          id?: string
          last_used_at?: string | null
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          enabled?: boolean
          endpoint?: string
          failure_count?: number
          id?: string
          last_used_at?: string | null
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      quota_alert_events: {
        Row: {
          correlation_id: string | null
          created_at: string
          exceeded_count: number
          id: string
          meter_key: string
          notified_user_ids: string[]
          rule_id: string | null
          tenant_id: string
          threshold_count: number
          window_end: string
          window_start: string
        }
        Insert: {
          correlation_id?: string | null
          created_at?: string
          exceeded_count: number
          id?: string
          meter_key: string
          notified_user_ids?: string[]
          rule_id?: string | null
          tenant_id: string
          threshold_count: number
          window_end: string
          window_start: string
        }
        Update: {
          correlation_id?: string | null
          created_at?: string
          exceeded_count?: number
          id?: string
          meter_key?: string
          notified_user_ids?: string[]
          rule_id?: string | null
          tenant_id?: string
          threshold_count?: number
          window_end?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "quota_alert_events_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "quota_alert_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quota_alert_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quota_alert_rules: {
        Row: {
          cooldown_minutes: number
          created_at: string
          enabled: boolean
          id: string
          meter_key: string | null
          tenant_id: string | null
          threshold_count: number
          updated_at: string
          window_minutes: number
        }
        Insert: {
          cooldown_minutes?: number
          created_at?: string
          enabled?: boolean
          id?: string
          meter_key?: string | null
          tenant_id?: string | null
          threshold_count?: number
          updated_at?: string
          window_minutes?: number
        }
        Update: {
          cooldown_minutes?: number
          created_at?: string
          enabled?: boolean
          id?: string
          meter_key?: string | null
          tenant_id?: string | null
          threshold_count?: number
          updated_at?: string
          window_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "quota_alert_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quota_check_events: {
        Row: {
          actor_id: string | null
          allowed: boolean
          correlation_id: string | null
          current_usage: number
          id: string
          meter_key: string
          occurred_at: string
          quota_limit: number | null
          reason: string
          requested_delta: number
          tenant_id: string
        }
        Insert: {
          actor_id?: string | null
          allowed: boolean
          correlation_id?: string | null
          current_usage: number
          id?: string
          meter_key: string
          occurred_at?: string
          quota_limit?: number | null
          reason: string
          requested_delta: number
          tenant_id: string
        }
        Update: {
          actor_id?: string | null
          allowed?: boolean
          correlation_id?: string | null
          current_usage?: number
          id?: string
          meter_key?: string
          occurred_at?: string
          quota_limit?: number | null
          reason?: string
          requested_delta?: number
          tenant_id?: string
        }
        Relationships: []
      }
      quota_export_jobs: {
        Row: {
          columns: string[] | null
          completed_at: string | null
          correlation_id: string | null
          created_at: string
          error: string | null
          expires_at: string
          file_path: string | null
          file_size_bytes: number | null
          format: string
          from_ts: string
          id: string
          max_rows: number
          meter_key: string | null
          requested_by: string
          row_count: number | null
          started_at: string | null
          status: string
          status_filter: string
          tenant_id: string | null
          to_ts: string
          truncated: boolean
        }
        Insert: {
          columns?: string[] | null
          completed_at?: string | null
          correlation_id?: string | null
          created_at?: string
          error?: string | null
          expires_at?: string
          file_path?: string | null
          file_size_bytes?: number | null
          format?: string
          from_ts: string
          id?: string
          max_rows?: number
          meter_key?: string | null
          requested_by: string
          row_count?: number | null
          started_at?: string | null
          status?: string
          status_filter?: string
          tenant_id?: string | null
          to_ts: string
          truncated?: boolean
        }
        Update: {
          columns?: string[] | null
          completed_at?: string | null
          correlation_id?: string | null
          created_at?: string
          error?: string | null
          expires_at?: string
          file_path?: string | null
          file_size_bytes?: number | null
          format?: string
          from_ts?: string
          id?: string
          max_rows?: number
          meter_key?: string | null
          requested_by?: string
          row_count?: number | null
          started_at?: string | null
          status?: string
          status_filter?: string
          tenant_id?: string | null
          to_ts?: string
          truncated?: boolean
        }
        Relationships: []
      }
      sell_work_commercial_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          occurred_at: string
          payload: Json
          pilot_id: string
          tenant_id: string
          work_unit_code: string | null
          work_unit_version: number | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          occurred_at?: string
          payload?: Json
          pilot_id: string
          tenant_id: string
          work_unit_code?: string | null
          work_unit_version?: number | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          occurred_at?: string
          payload?: Json
          pilot_id?: string
          tenant_id?: string
          work_unit_code?: string | null
          work_unit_version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sell_work_commercial_events_pilot_id_fkey"
            columns: ["pilot_id"]
            isOneToOne: false
            referencedRelation: "sell_work_pilots"
            referencedColumns: ["id"]
          },
        ]
      }
      sell_work_pilot_products: {
        Row: {
          activated_at: string | null
          commercial_hypothesis: string | null
          created_at: string
          expected_deliverable: string | null
          expected_frequency: string | null
          expected_user_group: string | null
          id: string
          measurable_outcome: string | null
          pilot_id: string
          status: string
          success_criteria: string | null
          target_problem: string | null
          updated_at: string
          work_unit_code: string
          work_unit_version: number
        }
        Insert: {
          activated_at?: string | null
          commercial_hypothesis?: string | null
          created_at?: string
          expected_deliverable?: string | null
          expected_frequency?: string | null
          expected_user_group?: string | null
          id?: string
          measurable_outcome?: string | null
          pilot_id: string
          status?: string
          success_criteria?: string | null
          target_problem?: string | null
          updated_at?: string
          work_unit_code: string
          work_unit_version?: number
        }
        Update: {
          activated_at?: string | null
          commercial_hypothesis?: string | null
          created_at?: string
          expected_deliverable?: string | null
          expected_frequency?: string | null
          expected_user_group?: string | null
          id?: string
          measurable_outcome?: string | null
          pilot_id?: string
          status?: string
          success_criteria?: string | null
          target_problem?: string | null
          updated_at?: string
          work_unit_code?: string
          work_unit_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "sell_work_pilot_products_pilot_id_fkey"
            columns: ["pilot_id"]
            isOneToOne: false
            referencedRelation: "sell_work_pilots"
            referencedColumns: ["id"]
          },
        ]
      }
      sell_work_pilot_support: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          id: string
          minutes: number | null
          occurred_at: string
          pilot_id: string
          summary: string | null
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          id?: string
          minutes?: number | null
          occurred_at?: string
          pilot_id: string
          summary?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          minutes?: number | null
          occurred_at?: string
          pilot_id?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sell_work_pilot_support_pilot_id_fkey"
            columns: ["pilot_id"]
            isOneToOne: false
            referencedRelation: "sell_work_pilots"
            referencedColumns: ["id"]
          },
        ]
      }
      sell_work_pilots: {
        Row: {
          activated_at: string | null
          commercial_feedback: string | null
          commercial_model: string | null
          contract_value: number | null
          created_at: string
          created_by: string | null
          currency: string | null
          customer_segment: string | null
          id: string
          industry: string | null
          last_active_at: string | null
          lost_primary_reason: string | null
          lost_secondary_reason: string | null
          notes: string | null
          paid_evidence_reference: string | null
          paid_verified_at: string | null
          paid_verified_by: string | null
          pilot_owner: string | null
          start_date: string
          status: string
          success_criteria: Json
          target_end_date: string | null
          tenant_id: string
          updated_at: string
          wtp_amount: number | null
          wtp_billing_basis: string | null
          wtp_currency: string | null
          wtp_signal: string
        }
        Insert: {
          activated_at?: string | null
          commercial_feedback?: string | null
          commercial_model?: string | null
          contract_value?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_segment?: string | null
          id?: string
          industry?: string | null
          last_active_at?: string | null
          lost_primary_reason?: string | null
          lost_secondary_reason?: string | null
          notes?: string | null
          paid_evidence_reference?: string | null
          paid_verified_at?: string | null
          paid_verified_by?: string | null
          pilot_owner?: string | null
          start_date?: string
          status?: string
          success_criteria?: Json
          target_end_date?: string | null
          tenant_id: string
          updated_at?: string
          wtp_amount?: number | null
          wtp_billing_basis?: string | null
          wtp_currency?: string | null
          wtp_signal?: string
        }
        Update: {
          activated_at?: string | null
          commercial_feedback?: string | null
          commercial_model?: string | null
          contract_value?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_segment?: string | null
          id?: string
          industry?: string | null
          last_active_at?: string | null
          lost_primary_reason?: string | null
          lost_secondary_reason?: string | null
          notes?: string | null
          paid_evidence_reference?: string | null
          paid_verified_at?: string | null
          paid_verified_by?: string | null
          pilot_owner?: string | null
          start_date?: string
          status?: string
          success_criteria?: Json
          target_end_date?: string | null
          tenant_id?: string
          updated_at?: string
          wtp_amount?: number | null
          wtp_billing_basis?: string | null
          wtp_currency?: string | null
          wtp_signal?: string
        }
        Relationships: [
          {
            foreignKeyName: "sell_work_pilots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sell_work_pricing_experiments: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          customer_response: string
          id: string
          included_volume: number | null
          notes: string | null
          overage_price: number | null
          pilot_id: string
          price: number
          pricing_basis: string
          proposed_at: string
          responded_at: string | null
          updated_at: string
          work_unit_code: string
          work_unit_version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency: string
          customer_response?: string
          id?: string
          included_volume?: number | null
          notes?: string | null
          overage_price?: number | null
          pilot_id: string
          price: number
          pricing_basis: string
          proposed_at?: string
          responded_at?: string | null
          updated_at?: string
          work_unit_code: string
          work_unit_version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_response?: string
          id?: string
          included_volume?: number | null
          notes?: string | null
          overage_price?: number | null
          pilot_id?: string
          price?: number
          pricing_basis?: string
          proposed_at?: string
          responded_at?: string | null
          updated_at?: string
          work_unit_code?: string
          work_unit_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "sell_work_pricing_experiments_pilot_id_fkey"
            columns: ["pilot_id"]
            isOneToOne: false
            referencedRelation: "sell_work_pilots"
            referencedColumns: ["id"]
          },
        ]
      }
      sell_work_revenue_records: {
        Row: {
          amount: number
          created_at: string
          currency: string
          evidence_reference: string | null
          id: string
          period_end: string | null
          period_start: string | null
          pilot_id: string
          revenue_class: string
          revenue_group: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency: string
          evidence_reference?: string | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          pilot_id: string
          revenue_class: string
          revenue_group: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          evidence_reference?: string | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          pilot_id?: string
          revenue_class?: string
          revenue_group?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sell_work_revenue_records_pilot_id_fkey"
            columns: ["pilot_id"]
            isOneToOne: false
            referencedRelation: "sell_work_pilots"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at: string | null
          canceled_at: string | null
          created_at: string
          created_by: string | null
          id: string
          metadata: Json
          period_end: string | null
          period_start: string
          plan_id: string
          provider: string
          provider_ref: string | null
          row_version: number
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cancel_at?: string | null
          canceled_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          period_end?: string | null
          period_start?: string
          plan_id: string
          provider?: string
          provider_ref?: string | null
          row_version?: number
          status: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cancel_at?: string | null
          canceled_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          period_end?: string | null
          period_start?: string
          plan_id?: string
          provider?: string
          provider_ref?: string | null
          row_version?: number
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignees: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          role: string
          task_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          role?: string
          task_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          role?: string
          task_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      task_attachments: {
        Row: {
          created_at: string
          file_name: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          task_id: string
          tenant_id: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          task_id: string
          tenant_id: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          task_id?: string
          tenant_id?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          row_version: number
          task_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          row_version?: number
          task_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          row_version?: number
          task_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      task_due_reminders: {
        Row: {
          due_at: string
          id: string
          kind: string
          sent_at: string
          task_id: string
          tenant_id: string | null
        }
        Insert: {
          due_at: string
          id?: string
          kind: string
          sent_at?: string
          task_id: string
          tenant_id?: string | null
        }
        Update: {
          due_at?: string
          id?: string
          kind?: string
          sent_at?: string
          task_id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_due_reminders_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_due_reminders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      task_followers: {
        Row: {
          created_at: string
          id: string
          task_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          task_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          task_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_followers_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_saved_views: {
        Row: {
          created_at: string
          id: string
          name: string
          priority: string
          tags: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          priority?: string
          tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          priority?: string
          tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          acceptance_criteria: string | null
          ai_execution_status: string
          ai_worker_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          due_at: string | null
          end_at: string | null
          execution_mode: string
          expected_deliverable: string | null
          human_owner_id: string | null
          id: string
          parent_task_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          progress_pct: number
          project_id: string | null
          row_version: number
          start_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          tags: string[]
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          acceptance_criteria?: string | null
          ai_execution_status?: string
          ai_worker_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_at?: string | null
          end_at?: string | null
          execution_mode?: string
          expected_deliverable?: string | null
          human_owner_id?: string | null
          id?: string
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          progress_pct?: number
          project_id?: string | null
          row_version?: number
          start_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          tags?: string[]
          tenant_id: string
          title: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          acceptance_criteria?: string | null
          ai_execution_status?: string
          ai_worker_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_at?: string | null
          end_at?: string | null
          execution_mode?: string
          expected_deliverable?: string | null
          human_owner_id?: string | null
          id?: string
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          progress_pct?: number
          project_id?: string | null
          row_version?: number
          start_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          tags?: string[]
          tenant_id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_human_owner_id_fkey"
            columns: ["human_owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      tenant_member_profiles: {
        Row: {
          about: string | null
          created_at: string
          department: string | null
          emp_id: string | null
          join_date: string | null
          location: string | null
          phone: string | null
          reports_to: string | null
          skills: string[]
          team: string | null
          teams: string[]
          tenant_id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          about?: string | null
          created_at?: string
          department?: string | null
          emp_id?: string | null
          join_date?: string | null
          location?: string | null
          phone?: string | null
          reports_to?: string | null
          skills?: string[]
          team?: string | null
          teams?: string[]
          tenant_id: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          about?: string | null
          created_at?: string
          department?: string | null
          emp_id?: string | null
          join_date?: string | null
          location?: string | null
          phone?: string | null
          reports_to?: string | null
          skills?: string[]
          team?: string | null
          teams?: string[]
          tenant_id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_member_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_member_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
          max_users: number | null
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
          max_users?: number | null
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
          max_users?: number | null
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
      usage_counters: {
        Row: {
          meter_key: string
          period_end: string | null
          period_start: string
          row_version: number
          tenant_id: string
          total: number
          updated_at: string
        }
        Insert: {
          meter_key: string
          period_end?: string | null
          period_start: string
          row_version?: number
          tenant_id: string
          total?: number
          updated_at?: string
        }
        Update: {
          meter_key?: string
          period_end?: string | null
          period_start?: string
          row_version?: number
          tenant_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_counters_meter_key_fkey"
            columns: ["meter_key"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "usage_counters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_events: {
        Row: {
          actor_id: string | null
          correlation_id: string | null
          created_at: string
          id: string
          idempotency_key: string | null
          metadata: Json
          meter_key: string
          occurred_at: string
          quantity: number
          tenant_id: string
          workspace_id: string | null
        }
        Insert: {
          actor_id?: string | null
          correlation_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          meter_key: string
          occurred_at?: string
          quantity: number
          tenant_id: string
          workspace_id?: string | null
        }
        Update: {
          actor_id?: string | null
          correlation_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          meter_key?: string
          occurred_at?: string
          quantity?: number
          tenant_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_meter_key_fkey"
            columns: ["meter_key"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "usage_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_dashboard_prefs: {
        Row: {
          created_at: string
          id: string
          section_order: Json | null
          sections: Json
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          section_order?: Json | null
          sections?: Json
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          section_order?: Json | null
          sections?: Json
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_layout_history: {
        Row: {
          created_at: string
          id: string
          label: string | null
          prefs: Json
          scope: string
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          prefs: Json
          scope: string
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          prefs?: Json
          scope?: string
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: []
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
      user_ui_prefs: {
        Row: {
          contrast: string
          created_at: string
          font_family: string
          font_scale: string
          lang: string
          theme: string
          tone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          contrast?: string
          created_at?: string
          font_family?: string
          font_scale?: string
          lang?: string
          theme?: string
          tone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          contrast?: string
          created_at?: string
          font_family?: string
          font_scale?: string
          lang?: string
          theme?: string
          tone?: string
          updated_at?: string
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
      webhook_endpoints: {
        Row: {
          created_at: string
          created_by: string | null
          enabled: boolean
          event_types: string[]
          failure_count: number
          id: string
          last_delivered_at: string | null
          last_error: string | null
          last_status: number | null
          name: string
          secret: string
          tenant_id: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          event_types?: string[]
          failure_count?: number
          id?: string
          last_delivered_at?: string | null
          last_error?: string | null
          last_status?: number | null
          name: string
          secret?: string
          tenant_id: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          event_types?: string[]
          failure_count?: number
          id?: string
          last_delivered_at?: string | null
          last_error?: string | null
          last_status?: number | null
          name?: string
          secret?: string
          tenant_id?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      work_docx_recognition_profiles: {
        Row: {
          ai_guidance: string
          created_at: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          weights: Json
        }
        Insert: {
          ai_guidance?: string
          created_at?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          weights?: Json
        }
        Update: {
          ai_guidance?: string
          created_at?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          weights?: Json
        }
        Relationships: [
          {
            foreignKeyName: "work_docx_recognition_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      work_edges: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          metadata: Json
          origin: string
          relationship_type: string
          source_node_id: string
          target_node_id: string
          tenant_id: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          origin?: string
          relationship_type: string
          source_node_id: string
          target_node_id: string
          tenant_id: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          origin?: string
          relationship_type?: string
          source_node_id?: string
          target_node_id?: string
          tenant_id?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_edges_source_node_id_fkey"
            columns: ["source_node_id"]
            isOneToOne: false
            referencedRelation: "work_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_edges_target_node_id_fkey"
            columns: ["target_node_id"]
            isOneToOne: false
            referencedRelation: "work_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_edges_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_edges_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      work_execution_costs: {
        Row: {
          ai_compute_cost: number | null
          ai_compute_status: string
          ai_cost_breakdown: Json
          ai_currency: string | null
          completeness: string
          computed_at: string
          cost_model_version: string
          currency: string
          execution_id: string
          external_cost: number | null
          external_cost_status: string
          human_cost: number | null
          human_cost_status: string
          human_currency: string | null
          human_policy_version: number | null
          known_cost: number | null
          missing_signals: string[]
          platform_cost: number | null
          platform_cost_status: string
          rate_effective_at: string | null
          rate_model: string | null
          rate_provider: string | null
          rate_version: number | null
          tenant_id: string
          unknown_components: string[]
          work_unit_code: string
          work_unit_version: number
          workspace_id: string | null
        }
        Insert: {
          ai_compute_cost?: number | null
          ai_compute_status?: string
          ai_cost_breakdown?: Json
          ai_currency?: string | null
          completeness?: string
          computed_at?: string
          cost_model_version?: string
          currency?: string
          execution_id: string
          external_cost?: number | null
          external_cost_status?: string
          human_cost?: number | null
          human_cost_status?: string
          human_currency?: string | null
          human_policy_version?: number | null
          known_cost?: number | null
          missing_signals?: string[]
          platform_cost?: number | null
          platform_cost_status?: string
          rate_effective_at?: string | null
          rate_model?: string | null
          rate_provider?: string | null
          rate_version?: number | null
          tenant_id: string
          unknown_components?: string[]
          work_unit_code: string
          work_unit_version: number
          workspace_id?: string | null
        }
        Update: {
          ai_compute_cost?: number | null
          ai_compute_status?: string
          ai_cost_breakdown?: Json
          ai_currency?: string | null
          completeness?: string
          computed_at?: string
          cost_model_version?: string
          currency?: string
          execution_id?: string
          external_cost?: number | null
          external_cost_status?: string
          human_cost?: number | null
          human_cost_status?: string
          human_currency?: string | null
          human_policy_version?: number | null
          known_cost?: number | null
          missing_signals?: string[]
          platform_cost?: number | null
          platform_cost_status?: string
          rate_effective_at?: string | null
          rate_model?: string | null
          rate_provider?: string | null
          rate_version?: number | null
          tenant_id?: string
          unknown_components?: string[]
          work_unit_code?: string
          work_unit_version?: number
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_execution_costs_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: true
            referencedRelation: "ai_task_executions"
            referencedColumns: ["id"]
          },
        ]
      }
      work_execution_feedback: {
        Row: {
          comment: string | null
          created_at: string
          created_by: string
          design_partner: boolean
          estimated_time_saved_minutes: number | null
          execution_id: string
          id: string
          segment_industry: string | null
          segment_team_size: string | null
          tenant_id: string
          updated_at: string
          usefulness: string
          work_unit_code: string | null
          work_unit_version: number | null
          would_use_again: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          created_by?: string
          design_partner?: boolean
          estimated_time_saved_minutes?: number | null
          execution_id: string
          id?: string
          segment_industry?: string | null
          segment_team_size?: string | null
          tenant_id: string
          updated_at?: string
          usefulness: string
          work_unit_code?: string | null
          work_unit_version?: number | null
          would_use_again: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          created_by?: string
          design_partner?: boolean
          estimated_time_saved_minutes?: number | null
          execution_id?: string
          id?: string
          segment_industry?: string | null
          segment_team_size?: string | null
          tenant_id?: string
          updated_at?: string
          usefulness?: string
          work_unit_code?: string | null
          work_unit_version?: number | null
          would_use_again?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_execution_feedback_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "ai_task_executions"
            referencedColumns: ["id"]
          },
        ]
      }
      work_execution_metrics: {
        Row: {
          ai_worker_id: string | null
          completeness: string
          computed_at: string
          context_partial: boolean | null
          context_source_count: number | null
          created_at: string
          evaluator_model: string | null
          execution_id: string
          execution_status: string | null
          generator_model: string | null
          human_confirmations: number
          human_review_events: number
          id: string
          input_tokens: number | null
          machine_completed_at: string | null
          machine_duration_ms: number | null
          machine_started_at: string | null
          metrics_version: string
          missing_signals: string[]
          model_calls: number
          outcome_accepted: boolean | null
          outcome_type: string | null
          outcome_verified: boolean | null
          output_tokens: number | null
          proposals_executed: number
          proposals_rejected: number
          proposals_total: number
          quality_passed: boolean | null
          quality_score: number | null
          quality_status: string | null
          queue_wait_ms: number | null
          revision: number
          revision_count: number
          sla_machine_ms: number | null
          sla_met: boolean | null
          step_awaiting_confirmation: number
          step_failed: number
          step_total: number
          task_id: string
          tenant_id: string
          token_source: string
          total_tokens: number | null
          updated_at: string
          wall_completed_at: string | null
          wall_duration_ms: number | null
          wall_started_at: string | null
          work_unit_code: string
          work_unit_resolved: boolean
          work_unit_version: number
          workspace_id: string | null
        }
        Insert: {
          ai_worker_id?: string | null
          completeness?: string
          computed_at?: string
          context_partial?: boolean | null
          context_source_count?: number | null
          created_at?: string
          evaluator_model?: string | null
          execution_id: string
          execution_status?: string | null
          generator_model?: string | null
          human_confirmations?: number
          human_review_events?: number
          id?: string
          input_tokens?: number | null
          machine_completed_at?: string | null
          machine_duration_ms?: number | null
          machine_started_at?: string | null
          metrics_version?: string
          missing_signals?: string[]
          model_calls?: number
          outcome_accepted?: boolean | null
          outcome_type?: string | null
          outcome_verified?: boolean | null
          output_tokens?: number | null
          proposals_executed?: number
          proposals_rejected?: number
          proposals_total?: number
          quality_passed?: boolean | null
          quality_score?: number | null
          quality_status?: string | null
          queue_wait_ms?: number | null
          revision?: number
          revision_count?: number
          sla_machine_ms?: number | null
          sla_met?: boolean | null
          step_awaiting_confirmation?: number
          step_failed?: number
          step_total?: number
          task_id: string
          tenant_id: string
          token_source?: string
          total_tokens?: number | null
          updated_at?: string
          wall_completed_at?: string | null
          wall_duration_ms?: number | null
          wall_started_at?: string | null
          work_unit_code?: string
          work_unit_resolved?: boolean
          work_unit_version?: number
          workspace_id?: string | null
        }
        Update: {
          ai_worker_id?: string | null
          completeness?: string
          computed_at?: string
          context_partial?: boolean | null
          context_source_count?: number | null
          created_at?: string
          evaluator_model?: string | null
          execution_id?: string
          execution_status?: string | null
          generator_model?: string | null
          human_confirmations?: number
          human_review_events?: number
          id?: string
          input_tokens?: number | null
          machine_completed_at?: string | null
          machine_duration_ms?: number | null
          machine_started_at?: string | null
          metrics_version?: string
          missing_signals?: string[]
          model_calls?: number
          outcome_accepted?: boolean | null
          outcome_type?: string | null
          outcome_verified?: boolean | null
          output_tokens?: number | null
          proposals_executed?: number
          proposals_rejected?: number
          proposals_total?: number
          quality_passed?: boolean | null
          quality_score?: number | null
          quality_status?: string | null
          queue_wait_ms?: number | null
          revision?: number
          revision_count?: number
          sla_machine_ms?: number | null
          sla_met?: boolean | null
          step_awaiting_confirmation?: number
          step_failed?: number
          step_total?: number
          task_id?: string
          tenant_id?: string
          token_source?: string
          total_tokens?: number | null
          updated_at?: string
          wall_completed_at?: string | null
          wall_duration_ms?: number | null
          wall_started_at?: string | null
          work_unit_code?: string
          work_unit_resolved?: boolean
          work_unit_version?: number
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_execution_metrics_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: true
            referencedRelation: "ai_task_executions"
            referencedColumns: ["id"]
          },
        ]
      }
      work_execution_steps: {
        Row: {
          completed_at: string | null
          created_at: string
          detail: string | null
          error_code: string | null
          execution_id: string
          id: string
          kind: string
          output: Json
          seq: number
          started_at: string | null
          status: string
          task_id: string
          tenant_id: string
          title: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          detail?: string | null
          error_code?: string | null
          execution_id: string
          id?: string
          kind: string
          output?: Json
          seq: number
          started_at?: string | null
          status?: string
          task_id: string
          tenant_id: string
          title: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          detail?: string | null
          error_code?: string | null
          execution_id?: string
          id?: string
          kind?: string
          output?: Json
          seq?: number
          started_at?: string | null
          status?: string
          task_id?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_execution_steps_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "ai_task_executions"
            referencedColumns: ["id"]
          },
        ]
      }
      work_graph_public_shares: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          id: string
          include_documents: boolean
          include_tasks: boolean
          label: string
          last_viewed_at: string | null
          revoked_at: string | null
          tenant_id: string
          token_hash: string
          updated_at: string
          view_count: number
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          include_documents?: boolean
          include_tasks?: boolean
          label?: string
          last_viewed_at?: string | null
          revoked_at?: string | null
          tenant_id: string
          token_hash: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          include_documents?: boolean
          include_tasks?: boolean
          label?: string
          last_viewed_at?: string | null
          revoked_at?: string | null
          tenant_id?: string
          token_hash?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "work_graph_public_shares_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      work_nodes: {
        Row: {
          created_at: string
          created_by: string | null
          entity_id: string
          entity_type: string
          id: string
          metadata: Json
          tenant_id: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json
          tenant_id: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json
          tenant_id?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_nodes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_nodes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      work_pricing_policies: {
        Row: {
          bundle_price: number | null
          bundle_quantity: number | null
          commercial_unit: string
          created_at: string
          currency: string
          effective_from: string
          effective_to: string | null
          id: string
          included_quantity: number | null
          notes: string | null
          pricing_model: string
          pricing_version: number
          status: string
          tenant_id: string | null
          unit_price: number | null
          updated_at: string
          work_unit_code: string
          work_unit_version: number
        }
        Insert: {
          bundle_price?: number | null
          bundle_quantity?: number | null
          commercial_unit?: string
          created_at?: string
          currency?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          included_quantity?: number | null
          notes?: string | null
          pricing_model: string
          pricing_version?: number
          status?: string
          tenant_id?: string | null
          unit_price?: number | null
          updated_at?: string
          work_unit_code: string
          work_unit_version: number
        }
        Update: {
          bundle_price?: number | null
          bundle_quantity?: number | null
          commercial_unit?: string
          created_at?: string
          currency?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          included_quantity?: number | null
          notes?: string | null
          pricing_model?: string
          pricing_version?: number
          status?: string
          tenant_id?: string | null
          unit_price?: number | null
          updated_at?: string
          work_unit_code?: string
          work_unit_version?: number
        }
        Relationships: []
      }
      work_product_access_policies: {
        Row: {
          admin_override: boolean
          created_at: string
          edit_scope: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          view_scope: string
        }
        Insert: {
          admin_override?: boolean
          created_at?: string
          edit_scope?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          view_scope?: string
        }
        Update: {
          admin_override?: boolean
          created_at?: string
          edit_scope?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          view_scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_product_access_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      work_product_ai_proposals: {
        Row: {
          agent_id: string | null
          base_version: number
          context_sources: Json
          created_at: string
          created_by: string | null
          id: string
          instruction: string
          model: string | null
          status: string
          tenant_id: string
          updated_at: string
          work_product_id: string
        }
        Insert: {
          agent_id?: string | null
          base_version: number
          context_sources?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          instruction: string
          model?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          work_product_id: string
        }
        Update: {
          agent_id?: string | null
          base_version?: number
          context_sources?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          instruction?: string
          model?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          work_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_product_ai_proposals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_product_ai_proposals_work_product_id_fkey"
            columns: ["work_product_id"]
            isOneToOne: false
            referencedRelation: "work_products"
            referencedColumns: ["id"]
          },
        ]
      }
      work_product_artifacts: {
        Row: {
          created_at: string
          created_by: string | null
          engine: string | null
          format: string
          generated_by: string
          id: string
          immutable: boolean
          mime_type: string | null
          role: string
          sha256: string | null
          size_bytes: number | null
          storage_ref: string | null
          tenant_id: string
          updated_at: string
          version: number
          work_product_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          engine?: string | null
          format: string
          generated_by?: string
          id?: string
          immutable?: boolean
          mime_type?: string | null
          role?: string
          sha256?: string | null
          size_bytes?: number | null
          storage_ref?: string | null
          tenant_id: string
          updated_at?: string
          version?: number
          work_product_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          engine?: string | null
          format?: string
          generated_by?: string
          id?: string
          immutable?: boolean
          mime_type?: string | null
          role?: string
          sha256?: string | null
          size_bytes?: number | null
          storage_ref?: string | null
          tenant_id?: string
          updated_at?: string
          version?: number
          work_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_product_artifacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_product_artifacts_work_product_id_fkey"
            columns: ["work_product_id"]
            isOneToOne: false
            referencedRelation: "work_products"
            referencedColumns: ["id"]
          },
        ]
      }
      work_product_blocks: {
        Row: {
          block_key: string
          block_type: string
          created_at: string
          editability: string
          id: string
          ordinal: number
          source_anchor: Json
          source_artifact_id: string | null
          source_version: number
          tenant_id: string
          text: string
          updated_at: string
          work_product_id: string
        }
        Insert: {
          block_key: string
          block_type: string
          created_at?: string
          editability?: string
          id?: string
          ordinal: number
          source_anchor?: Json
          source_artifact_id?: string | null
          source_version?: number
          tenant_id: string
          text?: string
          updated_at?: string
          work_product_id: string
        }
        Update: {
          block_key?: string
          block_type?: string
          created_at?: string
          editability?: string
          id?: string
          ordinal?: number
          source_anchor?: Json
          source_artifact_id?: string | null
          source_version?: number
          tenant_id?: string
          text?: string
          updated_at?: string
          work_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_product_blocks_source_artifact_id_fkey"
            columns: ["source_artifact_id"]
            isOneToOne: false
            referencedRelation: "work_product_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_product_blocks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_product_blocks_work_product_id_fkey"
            columns: ["work_product_id"]
            isOneToOne: false
            referencedRelation: "work_products"
            referencedColumns: ["id"]
          },
        ]
      }
      work_product_change_ops: {
        Row: {
          after_text: string
          applied_version: number | null
          author_id: string | null
          base_version: number
          before_text: string
          block_id: string | null
          block_key: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          origin: string
          proposal_id: string | null
          source_anchor: Json
          status: string
          tenant_id: string
          updated_at: string
          work_product_id: string
        }
        Insert: {
          after_text?: string
          applied_version?: number | null
          author_id?: string | null
          base_version: number
          before_text?: string
          block_id?: string | null
          block_key: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          origin?: string
          proposal_id?: string | null
          source_anchor?: Json
          status?: string
          tenant_id: string
          updated_at?: string
          work_product_id: string
        }
        Update: {
          after_text?: string
          applied_version?: number | null
          author_id?: string | null
          base_version?: number
          before_text?: string
          block_id?: string | null
          block_key?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          origin?: string
          proposal_id?: string | null
          source_anchor?: Json
          status?: string
          tenant_id?: string
          updated_at?: string
          work_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_product_change_ops_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "work_product_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_product_change_ops_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "work_product_ai_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_product_change_ops_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_product_change_ops_work_product_id_fkey"
            columns: ["work_product_id"]
            isOneToOne: false
            referencedRelation: "work_products"
            referencedColumns: ["id"]
          },
        ]
      }
      work_product_comments: {
        Row: {
          anchor: Json | null
          author_id: string | null
          body: string
          created_at: string
          id: string
          parent_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          tenant_id: string
          updated_at: string
          work_product_id: string
        }
        Insert: {
          anchor?: Json | null
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          parent_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          tenant_id: string
          updated_at?: string
          work_product_id: string
        }
        Update: {
          anchor?: Json | null
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          tenant_id?: string
          updated_at?: string
          work_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_product_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "work_product_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_product_comments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_product_comments_work_product_id_fkey"
            columns: ["work_product_id"]
            isOneToOne: false
            referencedRelation: "work_products"
            referencedColumns: ["id"]
          },
        ]
      }
      work_product_engine_benchmarks: {
        Row: {
          builtin_artifact_id: string | null
          comparison_json: Json
          completed_at: string | null
          created_at: string
          created_by: string | null
          failure_reason: string | null
          format: string
          genoffice_artifact_id: string | null
          genoffice_commit_sha: string | null
          genoffice_engine_version: string | null
          id: string
          mode: string
          started_at: string
          status: string
          tenant_id: string
          updated_at: string
          version: number
          work_product_id: string
        }
        Insert: {
          builtin_artifact_id?: string | null
          comparison_json?: Json
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          failure_reason?: string | null
          format: string
          genoffice_artifact_id?: string | null
          genoffice_commit_sha?: string | null
          genoffice_engine_version?: string | null
          id?: string
          mode?: string
          started_at?: string
          status?: string
          tenant_id: string
          updated_at?: string
          version: number
          work_product_id: string
        }
        Update: {
          builtin_artifact_id?: string | null
          comparison_json?: Json
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          failure_reason?: string | null
          format?: string
          genoffice_artifact_id?: string | null
          genoffice_commit_sha?: string | null
          genoffice_engine_version?: string | null
          id?: string
          mode?: string
          started_at?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          version?: number
          work_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_product_engine_benchmarks_builtin_artifact_id_fkey"
            columns: ["builtin_artifact_id"]
            isOneToOne: false
            referencedRelation: "work_product_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_product_engine_benchmarks_genoffice_artifact_id_fkey"
            columns: ["genoffice_artifact_id"]
            isOneToOne: false
            referencedRelation: "work_product_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_product_engine_benchmarks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_product_engine_benchmarks_work_product_id_fkey"
            columns: ["work_product_id"]
            isOneToOne: false
            referencedRelation: "work_products"
            referencedColumns: ["id"]
          },
        ]
      }
      work_product_followers: {
        Row: {
          created_at: string
          id: string
          tenant_id: string
          user_id: string
          work_product_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tenant_id: string
          user_id: string
          work_product_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tenant_id?: string
          user_id?: string
          work_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_product_followers_work_product_id_fkey"
            columns: ["work_product_id"]
            isOneToOne: false
            referencedRelation: "work_products"
            referencedColumns: ["id"]
          },
        ]
      }
      work_product_reviews: {
        Row: {
          created_at: string
          decided_at: string | null
          decision_note: string | null
          due_at: string | null
          id: string
          requested_by: string | null
          reviewer_id: string
          status: string
          tenant_id: string
          updated_at: string
          version: number | null
          work_product_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decision_note?: string | null
          due_at?: string | null
          id?: string
          requested_by?: string | null
          reviewer_id: string
          status?: string
          tenant_id: string
          updated_at?: string
          version?: number | null
          work_product_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decision_note?: string | null
          due_at?: string | null
          id?: string
          requested_by?: string | null
          reviewer_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          version?: number | null
          work_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_product_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_product_reviews_work_product_id_fkey"
            columns: ["work_product_id"]
            isOneToOne: false
            referencedRelation: "work_products"
            referencedColumns: ["id"]
          },
        ]
      }
      work_product_shares: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          note: string | null
          permission: string
          shared_by: string | null
          shared_with_user_id: string | null
          status: string
          updated_at: string
          work_product_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          note?: string | null
          permission?: string
          shared_by?: string | null
          shared_with_user_id?: string | null
          status?: string
          updated_at?: string
          work_product_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          note?: string | null
          permission?: string
          shared_by?: string | null
          shared_with_user_id?: string | null
          status?: string
          updated_at?: string
          work_product_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_product_shares_shared_with_user_id_fkey"
            columns: ["shared_with_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_product_shares_work_product_id_fkey"
            columns: ["work_product_id"]
            isOneToOne: false
            referencedRelation: "work_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_product_shares_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      work_product_versions: {
        Row: {
          ai_generated: boolean
          artifacts_snapshot: Json
          author_agent_id: string | null
          author_id: string | null
          content: string
          created_at: string
          id: string
          provenance: Json
          summary: string | null
          tenant_id: string
          title: string | null
          version: number
          work_product_id: string
        }
        Insert: {
          ai_generated?: boolean
          artifacts_snapshot?: Json
          author_agent_id?: string | null
          author_id?: string | null
          content?: string
          created_at?: string
          id?: string
          provenance?: Json
          summary?: string | null
          tenant_id: string
          title?: string | null
          version: number
          work_product_id: string
        }
        Update: {
          ai_generated?: boolean
          artifacts_snapshot?: Json
          author_agent_id?: string | null
          author_id?: string | null
          content?: string
          created_at?: string
          id?: string
          provenance?: Json
          summary?: string | null
          tenant_id?: string
          title?: string | null
          version?: number
          work_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_product_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_product_versions_work_product_id_fkey"
            columns: ["work_product_id"]
            isOneToOne: false
            referencedRelation: "work_products"
            referencedColumns: ["id"]
          },
        ]
      }
      work_products: {
        Row: {
          ai_generated: boolean
          business_type: string
          content: string
          created_at: string
          created_by: string | null
          created_by_agent_id: string | null
          current_version: number
          deleted_at: string | null
          description: string | null
          id: string
          origin: string
          owner_id: string | null
          primary_context_id: string | null
          primary_context_type: string | null
          source_artifact_id: string | null
          source_engine: string | null
          source_filename: string | null
          source_imported_at: string | null
          source_mime_type: string | null
          source_sha256: string | null
          status: string
          tags: string[]
          tenant_id: string
          title: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          ai_generated?: boolean
          business_type?: string
          content?: string
          created_at?: string
          created_by?: string | null
          created_by_agent_id?: string | null
          current_version?: number
          deleted_at?: string | null
          description?: string | null
          id?: string
          origin?: string
          owner_id?: string | null
          primary_context_id?: string | null
          primary_context_type?: string | null
          source_artifact_id?: string | null
          source_engine?: string | null
          source_filename?: string | null
          source_imported_at?: string | null
          source_mime_type?: string | null
          source_sha256?: string | null
          status?: string
          tags?: string[]
          tenant_id: string
          title: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          ai_generated?: boolean
          business_type?: string
          content?: string
          created_at?: string
          created_by?: string | null
          created_by_agent_id?: string | null
          current_version?: number
          deleted_at?: string | null
          description?: string | null
          id?: string
          origin?: string
          owner_id?: string | null
          primary_context_id?: string | null
          primary_context_type?: string | null
          source_artifact_id?: string | null
          source_engine?: string | null
          source_filename?: string | null
          source_imported_at?: string | null
          source_mime_type?: string | null
          source_sha256?: string | null
          status?: string
          tags?: string[]
          tenant_id?: string
          title?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_products_source_artifact_id_fkey"
            columns: ["source_artifact_id"]
            isOneToOne: false
            referencedRelation: "work_product_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_products_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      work_relationship_types: {
        Row: {
          code: string
          created_at: string
          source_type: string
          system_creatable: boolean
          target_type: string
          user_creatable: boolean
        }
        Insert: {
          code: string
          created_at?: string
          source_type: string
          system_creatable?: boolean
          target_type: string
          user_creatable?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          source_type?: string
          system_creatable?: boolean
          target_type?: string
          user_creatable?: boolean
        }
        Relationships: []
      }
      work_units: {
        Row: {
          acceptance_contract: Json
          action_contract: Json
          category: string
          code: string
          context_contract: Json
          contract_hash: string | null
          created_at: string
          deliverable_contract: Json
          deliverable_type: string
          description: string | null
          executor_contract: Json
          expected_outcome_type: string
          input_contract: Json
          label: string
          objective: string
          quality_contract: Json
          review_contract: Json
          sla_contract: Json
          sla_machine_ms: number | null
          status: string
          template_code: string | null
          updated_at: string
          version: number
        }
        Insert: {
          acceptance_contract?: Json
          action_contract?: Json
          category?: string
          code: string
          context_contract?: Json
          contract_hash?: string | null
          created_at?: string
          deliverable_contract?: Json
          deliverable_type: string
          description?: string | null
          executor_contract?: Json
          expected_outcome_type: string
          input_contract?: Json
          label: string
          objective: string
          quality_contract?: Json
          review_contract?: Json
          sla_contract?: Json
          sla_machine_ms?: number | null
          status?: string
          template_code?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          acceptance_contract?: Json
          action_contract?: Json
          category?: string
          code?: string
          context_contract?: Json
          contract_hash?: string | null
          created_at?: string
          deliverable_contract?: Json
          deliverable_type?: string
          description?: string | null
          executor_contract?: Json
          expected_outcome_type?: string
          input_contract?: Json
          label?: string
          objective?: string
          quality_contract?: Json
          review_contract?: Json
          sla_contract?: Json
          sla_machine_ms?: number | null
          status?: string
          template_code?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      workflow_access_requests: {
        Row: {
          action: string
          created_at: string
          id: string
          message: string | null
          requester_id: string
          reviewed_at: string | null
          reviewer_id: string | null
          reviewer_note: string | null
          status: string
          tenant_id: string | null
          updated_at: string
          workflow_id: string | null
          workflow_name: string | null
          workspace_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          message?: string | null
          requester_id: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_note?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
          workflow_id?: string | null
          workflow_name?: string | null
          workspace_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          message?: string | null
          requester_id?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_note?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
          workflow_id?: string | null
          workflow_name?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_access_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_access_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_agent_runs: {
        Row: {
          agent_id: string
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          matched_count: number
          matches: Json
          proposal_id: string | null
          status: string
          tenant_id: string
          workspace_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          matched_count?: number
          matches?: Json
          proposal_id?: string | null
          status?: string
          tenant_id: string
          workspace_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          matched_count?: number
          matches?: Json
          proposal_id?: string | null
          status?: string
          tenant_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_agent_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "workflow_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_agent_runs_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "ai_action_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_agent_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_agent_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_agents: {
        Row: {
          action_type: string
          allowed_action_types: string[]
          allowed_sources: string[]
          conditions: Json
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          enabled: boolean
          id: string
          instruction: string
          name: string
          requires_approval: boolean
          row_version: number
          skills: string[]
          tenant_id: string
          trigger_type: string
          updated_at: string
          updated_by: string | null
          worker_profile: string | null
          workspace_id: string
        }
        Insert: {
          action_type: string
          allowed_action_types?: string[]
          allowed_sources?: string[]
          conditions?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          instruction?: string
          name: string
          requires_approval?: boolean
          row_version?: number
          skills?: string[]
          tenant_id: string
          trigger_type: string
          updated_at?: string
          updated_by?: string | null
          worker_profile?: string | null
          workspace_id: string
        }
        Update: {
          action_type?: string
          allowed_action_types?: string[]
          allowed_sources?: string[]
          conditions?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          instruction?: string
          name?: string
          requires_approval?: boolean
          row_version?: number
          skills?: string[]
          tenant_id?: string
          trigger_type?: string
          updated_at?: string
          updated_by?: string | null
          worker_profile?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_agents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_agents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_permission_denials: {
        Row: {
          action: string
          correlation_id: string | null
          created_at: string
          error_code: string | null
          id: string
          occurred_at: string
          source: string
          tenant_id: string | null
          user_id: string
          workflow_id: string | null
          workflow_name: string | null
          workspace_id: string
        }
        Insert: {
          action: string
          correlation_id?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          occurred_at?: string
          source?: string
          tenant_id?: string | null
          user_id: string
          workflow_id?: string | null
          workflow_name?: string | null
          workspace_id: string
        }
        Update: {
          action?: string
          correlation_id?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          occurred_at?: string
          source?: string
          tenant_id?: string | null
          user_id?: string
          workflow_id?: string | null
          workflow_name?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_permission_denials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_permission_denials_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_permissions: {
        Row: {
          can_edit: boolean
          can_publish: boolean
          can_run: boolean
          created_at: string
          granted_by: string | null
          id: string
          tenant_id: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          can_edit?: boolean
          can_publish?: boolean
          can_run?: boolean
          created_at?: string
          granted_by?: string | null
          id?: string
          tenant_id: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          can_edit?: boolean
          can_publish?: boolean
          can_run?: boolean
          created_at?: string
          granted_by?: string | null
          id?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_permissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_permissions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_role_permissions: {
        Row: {
          can_edit: boolean
          can_publish: boolean
          can_run: boolean
          created_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["tenant_role"]
          tenant_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          can_edit?: boolean
          can_publish?: boolean
          can_run?: boolean
          created_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["tenant_role"]
          tenant_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          can_edit?: boolean
          can_publish?: boolean
          can_run?: boolean
          created_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["tenant_role"]
          tenant_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_role_permissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_role_permissions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_runs: {
        Row: {
          context: Json
          correlation_id: string | null
          created_at: string
          ended_at: string | null
          id: string
          row_version: number
          started_at: string | null
          status: Database["public"]["Enums"]["workflow_run_status"]
          tenant_id: string
          triggered_by: string | null
          updated_at: string
          workflow_id: string
          workflow_version: number
        }
        Insert: {
          context?: Json
          correlation_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          row_version?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["workflow_run_status"]
          tenant_id: string
          triggered_by?: string | null
          updated_at?: string
          workflow_id: string
          workflow_version: number
        }
        Update: {
          context?: Json
          correlation_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          row_version?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["workflow_run_status"]
          tenant_id?: string
          triggered_by?: string | null
          updated_at?: string
          workflow_id?: string
          workflow_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_step_types: {
        Row: {
          code: string
          color: string
          created_at: string
          default_config: Json
          description_en: string | null
          description_vi: string | null
          icon: string
          id: string
          is_enabled: boolean
          label_en: string
          label_vi: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          color?: string
          created_at?: string
          default_config?: Json
          description_en?: string | null
          description_vi?: string | null
          icon?: string
          id?: string
          is_enabled?: boolean
          label_en: string
          label_vi: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          color?: string
          created_at?: string
          default_config?: Json
          description_en?: string | null
          description_vi?: string | null
          icon?: string
          id?: string
          is_enabled?: boolean
          label_en?: string
          label_vi?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      workflow_steps: {
        Row: {
          created_at: string
          ended_at: string | null
          error: string | null
          id: string
          input: Json
          output: Json | null
          row_version: number
          run_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["workflow_step_status"]
          step_key: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          error?: string | null
          id?: string
          input?: Json
          output?: Json | null
          row_version?: number
          run_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["workflow_step_status"]
          step_key: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          error?: string | null
          id?: string
          input?: Json
          output?: Json | null
          row_version?: number
          run_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["workflow_step_status"]
          step_key?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_steps_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_triggers: {
        Row: {
          at_hour: number | null
          at_minute: number | null
          created_at: string
          created_by: string | null
          event_type: string | null
          frequency: string | null
          id: string
          interval_minutes: number | null
          is_enabled: boolean
          kind: string
          last_fired_at: string | null
          next_run_at: string | null
          payload: Json
          tenant_id: string
          timezone: string
          updated_at: string
          weekday: number | null
          workflow_id: string
          workspace_id: string
        }
        Insert: {
          at_hour?: number | null
          at_minute?: number | null
          created_at?: string
          created_by?: string | null
          event_type?: string | null
          frequency?: string | null
          id?: string
          interval_minutes?: number | null
          is_enabled?: boolean
          kind: string
          last_fired_at?: string | null
          next_run_at?: string | null
          payload?: Json
          tenant_id: string
          timezone?: string
          updated_at?: string
          weekday?: number | null
          workflow_id: string
          workspace_id: string
        }
        Update: {
          at_hour?: number | null
          at_minute?: number | null
          created_at?: string
          created_by?: string | null
          event_type?: string | null
          frequency?: string | null
          id?: string
          interval_minutes?: number | null
          is_enabled?: boolean
          kind?: string
          last_fired_at?: string | null
          next_run_at?: string | null
          payload?: Json
          tenant_id?: string
          timezone?: string
          updated_at?: string
          weekday?: number | null
          workflow_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_triggers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_triggers_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_triggers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          created_at: string
          created_by: string | null
          definition: Json
          deleted_at: string | null
          description: string | null
          id: string
          name: string
          published_at: string | null
          row_version: number
          status: Database["public"]["Enums"]["workflow_status"]
          tenant_id: string
          updated_at: string
          updated_by: string | null
          version: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          definition?: Json
          deleted_at?: string | null
          description?: string | null
          id?: string
          name: string
          published_at?: string | null
          row_version?: number
          status?: Database["public"]["Enums"]["workflow_status"]
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          definition?: Json
          deleted_at?: string | null
          description?: string | null
          id?: string
          name?: string
          published_at?: string | null
          row_version?: number
          status?: Database["public"]["Enums"]["workflow_status"]
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflows_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invitation_defaults: {
        Row: {
          can_edit: boolean
          can_publish: boolean
          can_run: boolean
          created_at: string
          created_by: string | null
          invitation_id: string
          tenant_id: string
          updated_at: string
          workspace_id: string
          workspace_role: string
        }
        Insert: {
          can_edit?: boolean
          can_publish?: boolean
          can_run?: boolean
          created_at?: string
          created_by?: string | null
          invitation_id: string
          tenant_id: string
          updated_at?: string
          workspace_id: string
          workspace_role?: string
        }
        Update: {
          can_edit?: boolean
          can_publish?: boolean
          can_run?: boolean
          created_at?: string
          created_by?: string | null
          invitation_id?: string
          tenant_id?: string
          updated_at?: string
          workspace_id?: string
          workspace_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitation_defaults_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: true
            referencedRelation: "tenant_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invitation_defaults_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invitation_defaults_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      workspace_tags: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_tags_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          allow_member_invites: boolean
          created_at: string
          default_member_role: string
          default_task_due_days: number
          default_task_priority: string
          default_task_title_prefix: string
          deleted_at: string | null
          description: string | null
          id: string
          name: string
          owner_id: string
          row_version: number
          tenant_id: string
          timezone: string
          updated_at: string
          updated_by: string | null
          visibility: string
        }
        Insert: {
          allow_member_invites?: boolean
          created_at?: string
          default_member_role?: string
          default_task_due_days?: number
          default_task_priority?: string
          default_task_title_prefix?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name: string
          owner_id: string
          row_version?: number
          tenant_id: string
          timezone?: string
          updated_at?: string
          updated_by?: string | null
          visibility?: string
        }
        Update: {
          allow_member_invites?: boolean
          created_at?: string
          default_member_role?: string
          default_task_due_days?: number
          default_task_priority?: string
          default_task_title_prefix?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name?: string
          owner_id?: string
          row_version?: number
          tenant_id?: string
          timezone?: string
          updated_at?: string
          updated_by?: string | null
          visibility?: string
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
      v_quota_check_metrics: {
        Row: {
          fail_count: number | null
          fail_disabled: number | null
          fail_exceeded: number | null
          fail_no_entitlement: number | null
          last_check_at: string | null
          last_fail_at: string | null
          meter_key: string | null
          pass_count: number | null
          tenant_id: string | null
          total_checks: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _emit_outbox_event: {
        Args: {
          _aggregate_id: string
          _aggregate_type: string
          _correlation_id?: string
          _event_type: string
          _idempotency_key?: string
          _payload: Json
          _tenant_id: string
        }
        Returns: string
      }
      _meeting_artifact_id: {
        Args: { _item_key: string; _kind: string; _meeting_id: string }
        Returns: string
      }
      _meeting_host_guard: {
        Args: { _meeting_id: string }
        Returns: {
          agenda: string | null
          conference_provider: string | null
          conference_ref: Json | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          department: string | null
          end_at: string
          id: string
          location: string | null
          project_id: string | null
          row_version: number
          rrule: string | null
          start_at: string
          status: Database["public"]["Enums"]["meeting_status"]
          tenant_id: string
          timezone: string
          title: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "meetings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _meeting_item_key: {
        Args: { _source_ids: string[]; _title: string }
        Returns: string
      }
      _raise_quota_exceeded: {
        Args: { _delta: number; _meter_key: string; _tenant_id: string }
        Returns: undefined
      }
      _rebuild_tenant_work_graph_core: {
        Args: { _tenant_id: string }
        Returns: undefined
      }
      _resolve_workspace_tenant: {
        Args: { _workspace_id: string }
        Returns: string
      }
      _set_correlation_context: {
        Args: { _correlation_id: string }
        Returns: undefined
      }
      _start_workflow_run_internal: {
        Args: {
          _context: Json
          _correlation_id: string
          _trigger_id: string
          _workflow_id: string
        }
        Returns: string
      }
      _test_purge_tenant: { Args: { _tenant_id: string }; Returns: undefined }
      _test_seed_entitlement: {
        Args: {
          _enabled: boolean
          _feature_key: string
          _quota_limit: number
          _tenant_id: string
        }
        Returns: undefined
      }
      _test_set_tenant_member: {
        Args: {
          _role?: Database["public"]["Enums"]["tenant_role"]
          _status?: Database["public"]["Enums"]["tenant_member_status"]
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
      _test_unconfirm_auth_email: {
        Args: { _user_id: string }
        Returns: boolean
      }
      _upsert_meeting_artifact: {
        Args: {
          _checksum: string
          _confidence: string
          _detail: string
          _item_key: string
          _kind: string
          _meeting_id: string
          _source_ids: string[]
          _title: string
          _version: number
        }
        Returns: string
      }
      _work_entity_scope: {
        Args: { _entity_id: string; _entity_type: string }
        Returns: {
          tenant_id: string
          workspace_id: string
        }[]
      }
      _work_graph_link_system: {
        Args: {
          _metadata?: Json
          _relationship: string
          _source_id: string
          _source_type: string
          _target_id: string
          _target_type: string
        }
        Returns: string
      }
      _work_graph_reconcile_single: {
        Args: {
          _relationship: string
          _source_id: string
          _source_type: string
          _target_id: string
          _target_type: string
        }
        Returns: undefined
      }
      _workflow_next_run: {
        Args: {
          _at_hour: number
          _at_minute: number
          _frequency: string
          _from: string
          _interval_minutes: number
          _timezone: string
          _weekday: number
        }
        Returns: string
      }
      accept_ai_task_execution: {
        Args: {
          _complete_task?: boolean
          _correlation_id?: string
          _execution_id: string
          _idempotency_key?: string
        }
        Returns: {
          accepted_with_warnings: boolean
          ai_worker_id: string
          change_request: string | null
          cohort_class: string
          cohort_exclusion_reason: string | null
          completed_at: string | null
          contract_hash: string | null
          contract_snapshot: Json | null
          created_at: string
          created_by: string | null
          deliverable_content: string | null
          deliverable_title: string | null
          deliverable_type: string | null
          error_code: string | null
          evidence: Json
          evidence_pack: Json
          id: string
          outcome: Json
          quality_assessment: Json
          quality_passed: boolean | null
          quality_score: number | null
          quality_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          revision: number
          row_version: number
          source_refs: Json
          started_at: string | null
          status: string
          task_id: string
          template_code: string | null
          tenant_id: string
          updated_at: string
          work_product_inputs: Json | null
          work_unit_code: string | null
          work_unit_version: number | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "ai_task_executions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
      advance_workflow_step: {
        Args: {
          _correlation_id?: string
          _error?: string
          _idempotency_key?: string
          _input?: Json
          _output?: Json
          _run_id: string
          _step_key: string
          _to_status: Database["public"]["Enums"]["workflow_step_status"]
        }
        Returns: {
          created_at: string
          ended_at: string | null
          error: string | null
          id: string
          input: Json
          output: Json | null
          row_version: number
          run_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["workflow_step_status"]
          step_key: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "workflow_steps"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      append_meeting_transcript: {
        Args: { _meeting_id: string; _segments: Json; _source?: string }
        Returns: number
      }
      archive_document: {
        Args: {
          _correlation_id?: string
          _document_id: string
          _expected_row_version?: number
          _idempotency_key?: string
        }
        Returns: {
          content: string
          created_at: string
          created_by: string | null
          current_version: number
          deleted_at: string | null
          folder: string
          id: string
          mime_type: string | null
          row_version: number
          size_bytes: number | null
          storage_ref: Json | null
          tags: string[]
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "documents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      archive_workflow: {
        Args: {
          _archived?: boolean
          _correlation_id?: string
          _idempotency_key?: string
          _workflow_id: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          definition: Json
          deleted_at: string | null
          description: string | null
          id: string
          name: string
          published_at: string | null
          row_version: number
          status: Database["public"]["Enums"]["workflow_status"]
          tenant_id: string
          updated_at: string
          updated_by: string | null
          version: number
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workflows"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assign_task: {
        Args: {
          _assignee_id: string
          _correlation_id?: string
          _idempotency_key?: string
          _role?: string
          _task_id: string
        }
        Returns: {
          acceptance_criteria: string | null
          ai_execution_status: string
          ai_worker_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          due_at: string | null
          end_at: string | null
          execution_mode: string
          expected_deliverable: string | null
          human_owner_id: string | null
          id: string
          parent_task_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          progress_pct: number
          project_id: string | null
          row_version: number
          start_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          tags: string[]
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assign_task_to_ai: {
        Args: {
          _acceptance_criteria: string
          _ai_worker_id: string
          _correlation_id?: string
          _expected_deliverable: string
          _idempotency_key?: string
          _task_id: string
        }
        Returns: {
          acceptance_criteria: string | null
          ai_execution_status: string
          ai_worker_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          due_at: string | null
          end_at: string | null
          execution_mode: string
          expected_deliverable: string | null
          human_owner_id: string | null
          id: string
          parent_task_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          progress_pct: number
          project_id: string | null
          row_version: number
          start_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          tags: string[]
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      attach_meeting_recording_egress: {
        Args: { _egress_id: string; _recording_id: string }
        Returns: {
          created_at: string
          duration_seconds: number
          egress_id: string | null
          ended_at: string | null
          error_message: string | null
          file_size_bytes: number | null
          file_url: string | null
          id: string
          meeting_id: string
          provider: string
          started_at: string
          started_by: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "meeting_recordings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      bind_work_product_execution: {
        Args: {
          _code: string
          _execution_id: string
          _inputs?: Json
          _version: number
        }
        Returns: Json
      }
      can_access_document: { Args: { _document_id: string }; Returns: boolean }
      can_edit_work_product: { Args: { _id: string }; Returns: boolean }
      can_manage_document_shares: {
        Args: { _document_id: string }
        Returns: boolean
      }
      can_manage_meeting_access: {
        Args: { _meeting_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_workflow_permissions: {
        Args: { _workspace_id: string }
        Returns: boolean
      }
      can_view_chat_channel: {
        Args: { _channel_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_work_entity: {
        Args: { _entity_id: string; _entity_type: string }
        Returns: boolean
      }
      can_view_work_product: { Args: { _id: string }; Returns: boolean }
      cancel_meeting: {
        Args: {
          _correlation_id?: string
          _expected_row_version?: number
          _idempotency_key?: string
          _meeting_id: string
          _reason?: string
        }
        Returns: {
          agenda: string | null
          conference_provider: string | null
          conference_ref: Json | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          department: string | null
          end_at: string
          id: string
          location: string | null
          project_id: string | null
          row_version: number
          rrule: string | null
          start_at: string
          status: Database["public"]["Enums"]["meeting_status"]
          tenant_id: string
          timezone: string
          title: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "meetings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_subscription: {
        Args: {
          _correlation_id?: string
          _expected_row_version?: number
          _idempotency_key?: string
          _immediate?: boolean
          _tenant_id: string
        }
        Returns: {
          cancel_at: string | null
          canceled_at: string | null
          created_at: string
          created_by: string | null
          id: string
          metadata: Json
          period_end: string | null
          period_start: string
          plan_id: string
          provider: string
          provider_ref: string | null
          row_version: number
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_workflow_run: {
        Args: {
          _correlation_id?: string
          _idempotency_key?: string
          _reason?: string
          _run_id: string
        }
        Returns: {
          context: Json
          correlation_id: string | null
          created_at: string
          ended_at: string | null
          id: string
          row_version: number
          started_at: string | null
          status: Database["public"]["Enums"]["workflow_run_status"]
          tenant_id: string
          triggered_by: string | null
          updated_at: string
          workflow_id: string
          workflow_version: number
        }
        SetofOptions: {
          from: "*"
          to: "workflow_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      change_subscription: {
        Args: {
          _correlation_id?: string
          _expected_row_version?: number
          _idempotency_key?: string
          _plan_code: string
          _tenant_id: string
        }
        Returns: {
          cancel_at: string | null
          canceled_at: string | null
          created_at: string
          created_by: string | null
          id: string
          metadata: Json
          period_end: string | null
          period_start: string
          plan_id: string
          provider: string
          provider_ref: string | null
          row_version: number
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
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
          max_users: number | null
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
      check_quota: {
        Args: { _delta?: number; _meter_key: string; _tenant_id: string }
        Returns: boolean
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
      close_meeting_attendance: {
        Args: { _correlation_id?: string; _meeting_id: string }
        Returns: {
          created_at: string
          id: string
          joined_at: string
          left_at: string | null
          meeting_id: string
          minutes: number
          tenant_id: string
          updated_at: string
          usage_recorded: boolean
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "meeting_attendance"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      comment_task: {
        Args: {
          _body: string
          _correlation_id?: string
          _idempotency_key?: string
          _task_id: string
        }
        Returns: {
          author_id: string
          body: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          row_version: number
          task_id: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "task_comments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_outbox_event: {
        Args: { _id: string; _worker: string }
        Returns: boolean
      }
      compute_sell_work_pilot_metrics: {
        Args: { _from?: string; _pilot_id: string; _to?: string }
        Returns: Json
      }
      compute_sell_work_pilot_portfolio: {
        Args: { _from?: string; _to?: string }
        Returns: Json
      }
      compute_work_product_cohort: {
        Args: {
          _code: string
          _from?: string
          _include_synthetic?: boolean
          _tenant_id?: string
          _to?: string
          _version?: number
        }
        Returns: Json
      }
      compute_work_quality_score: {
        Args: { _assessment: Json }
        Returns: number
      }
      confirm_meeting_action_item: {
        Args: {
          _assignee_id?: string
          _description?: string
          _due_at?: string
          _item_key: string
          _meeting_id: string
          _title: string
          _workspace_id: string
        }
        Returns: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          item_key: string
          meeting_id: string
          status: string
          task_id: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "meeting_action_item_states"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_chat_mention_notifications: {
        Args: { _message_id: string; _user_ids: string[] }
        Returns: number
      }
      create_document: {
        Args: {
          _correlation_id?: string
          _folder?: string
          _idempotency_key?: string
          _mime_type?: string
          _size_bytes?: number
          _storage_ref?: Json
          _tags?: string[]
          _title: string
          _workspace_id: string
        }
        Returns: {
          content: string
          created_at: string
          created_by: string | null
          current_version: number
          deleted_at: string | null
          folder: string
          id: string
          mime_type: string | null
          row_version: number
          size_bytes: number | null
          storage_ref: Json | null
          tags: string[]
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "documents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_meeting_invite_link: {
        Args: {
          _expires_in_minutes?: number
          _label?: string
          _max_uses?: number
          _meeting_id: string
        }
        Returns: Json
      }
      create_sell_work_pilot: {
        Args: {
          _commercial_model?: string
          _customer_segment?: string
          _industry?: string
          _notes?: string
          _pilot_owner?: string
          _start_date?: string
          _success_criteria?: Json
          _target_end_date?: string
          _tenant_id: string
        }
        Returns: string
      }
      create_subtask: {
        Args: {
          _correlation_id?: string
          _due_at?: string
          _idempotency_key?: string
          _parent_task_id: string
          _priority?: Database["public"]["Enums"]["task_priority"]
          _title: string
        }
        Returns: {
          acceptance_criteria: string | null
          ai_execution_status: string
          ai_worker_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          due_at: string | null
          end_at: string | null
          execution_mode: string
          expected_deliverable: string | null
          human_owner_id: string | null
          id: string
          parent_task_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          progress_pct: number
          project_id: string | null
          row_version: number
          start_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          tags: string[]
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_task: {
        Args: {
          _assignee_id?: string
          _correlation_id?: string
          _description?: string
          _due_at?: string
          _idempotency_key?: string
          _priority?: Database["public"]["Enums"]["task_priority"]
          _title: string
          _workspace_id: string
        }
        Returns: {
          acceptance_criteria: string | null
          ai_execution_status: string
          ai_worker_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          due_at: string | null
          end_at: string | null
          execution_mode: string
          expected_deliverable: string | null
          human_owner_id: string | null
          id: string
          parent_task_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          progress_pct: number
          project_id: string | null
          row_version: number
          start_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          tags: string[]
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
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
      create_workflow:
        | {
            Args: {
              _correlation_id?: string
              _definition: Json
              _description?: string
              _idempotency_key?: string
              _name: string
              _workspace_id: string
            }
            Returns: {
              created_at: string
              created_by: string | null
              definition: Json
              deleted_at: string | null
              description: string | null
              id: string
              name: string
              published_at: string | null
              row_version: number
              status: Database["public"]["Enums"]["workflow_status"]
              tenant_id: string
              updated_at: string
              updated_by: string | null
              version: number
              workspace_id: string
            }
            SetofOptions: {
              from: "*"
              to: "workflows"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              _correlation_id: string
              _definition: Json
              _description: string
              _idempotency_key: string
              _name: string
              _workspace_id: string
            }
            Returns: {
              created_at: string
              created_by: string | null
              definition: Json
              deleted_at: string | null
              description: string | null
              id: string
              name: string
              published_at: string | null
              row_version: number
              status: Database["public"]["Enums"]["workflow_status"]
              tenant_id: string
              updated_at: string
              updated_by: string | null
              version: number
              workspace_id: string
            }
            SetofOptions: {
              from: "*"
              to: "workflows"
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
      decide_meeting_join_request: {
        Args: {
          _approve: boolean
          _correlation_id?: string
          _note?: string
          _request_id: string
        }
        Returns: Json
      }
      delete_workflow: {
        Args: {
          _correlation_id?: string
          _idempotency_key?: string
          _workflow_id: string
        }
        Returns: boolean
      }
      delete_workflow_trigger: {
        Args: { _trigger_id: string }
        Returns: boolean
      }
      dismiss_meeting_action_item: {
        Args: { _item_key: string; _meeting_id: string; _title?: string }
        Returns: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          item_key: string
          meeting_id: string
          status: string
          task_id: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "meeting_action_item_states"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      dispatch_task_due_reminders: { Args: never; Returns: number }
      dispatch_workflow_schedules: { Args: never; Returns: number }
      end_meeting: {
        Args: {
          _correlation_id?: string
          _expected_row_version?: number
          _idempotency_key?: string
          _meeting_id: string
        }
        Returns: {
          agenda: string | null
          conference_provider: string | null
          conference_ref: Json | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          department: string | null
          end_at: string
          id: string
          location: string | null
          project_id: string | null
          row_version: number
          rrule: string | null
          start_at: string
          status: Database["public"]["Enums"]["meeting_status"]
          tenant_id: string
          timezone: string
          title: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "meetings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_default_ai_workers: {
        Args: { _tenant_id: string }
        Returns: {
          allowed_tools: string[]
          autonomy_policy: Json
          code: string
          created_at: string
          id: string
          name: string
          permission_scope: string
          provider_config_ref: string
          role: string
          scope_object_types: string[]
          scope_project_ids: string[] | null
          scope_workspace_ids: string[] | null
          skills: string[]
          status: string
          tenant_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ai_workers"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      ensure_work_node: {
        Args: { _entity_id: string; _entity_type: string }
        Returns: string
      }
      evaluate_quota_alert: {
        Args: {
          _correlation_id: string
          _meter_key: string
          _tenant_id: string
        }
        Returns: undefined
      }
      explain_my_workflow_permissions: {
        Args: { _workspace_id: string }
        Returns: Json
      }
      extend_outbox_lease: {
        Args: { _id: string; _seconds: number; _worker: string }
        Returns: boolean
      }
      fail_meeting_recording: {
        Args: { _error: string; _recording_id: string }
        Returns: {
          created_at: string
          duration_seconds: number
          egress_id: string | null
          ended_at: string | null
          error_message: string | null
          file_size_bytes: number | null
          file_url: string | null
          id: string
          meeting_id: string
          provider: string
          started_at: string
          started_by: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "meeting_recordings"
          isOneToOne: true
          isSetofReturn: false
        }
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
      fanout_email_inbox_states: {
        Args: { p_message_id: string; p_user_ids: string[] }
        Returns: number
      }
      finalize_meeting_from_provider: {
        Args: {
          _correlation_id?: string
          _idempotency_key: string
          _meeting_id: string
        }
        Returns: undefined
      }
      finalize_meeting_recording_from_egress: {
        Args: {
          _duration_seconds?: number
          _egress_id: string
          _error?: string
          _file_size_bytes?: number
          _file_url?: string
          _status: string
        }
        Returns: {
          created_at: string
          duration_seconds: number
          egress_id: string | null
          ended_at: string | null
          error_message: string | null
          file_size_bytes: number | null
          file_url: string | null
          id: string
          meeting_id: string
          provider: string
          started_at: string
          started_by: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "meeting_recordings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finalize_work_outcome: {
        Args: { _execution_id: string }
        Returns: {
          accepted_with_warnings: boolean
          ai_worker_id: string
          change_request: string | null
          cohort_class: string
          cohort_exclusion_reason: string | null
          completed_at: string | null
          contract_hash: string | null
          contract_snapshot: Json | null
          created_at: string
          created_by: string | null
          deliverable_content: string | null
          deliverable_title: string | null
          deliverable_type: string | null
          error_code: string | null
          evidence: Json
          evidence_pack: Json
          id: string
          outcome: Json
          quality_assessment: Json
          quality_passed: boolean | null
          quality_score: number | null
          quality_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          revision: number
          row_version: number
          source_refs: Json
          started_at: string | null
          status: string
          task_id: string
          template_code: string | null
          tenant_id: string
          updated_at: string
          work_product_inputs: Json | null
          work_unit_code: string | null
          work_unit_version: number | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "ai_task_executions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finish_ai_task_execution: {
        Args: {
          _correlation_id?: string
          _deliverable_content?: string
          _deliverable_title?: string
          _deliverable_type?: string
          _error_code?: string
          _evidence?: Json
          _execution_id: string
          _source_refs?: Json
          _status: string
        }
        Returns: {
          accepted_with_warnings: boolean
          ai_worker_id: string
          change_request: string | null
          cohort_class: string
          cohort_exclusion_reason: string | null
          completed_at: string | null
          contract_hash: string | null
          contract_snapshot: Json | null
          created_at: string
          created_by: string | null
          deliverable_content: string | null
          deliverable_title: string | null
          deliverable_type: string | null
          error_code: string | null
          evidence: Json
          evidence_pack: Json
          id: string
          outcome: Json
          quality_assessment: Json
          quality_passed: boolean | null
          quality_score: number | null
          quality_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          revision: number
          row_version: number
          source_refs: Json
          started_at: string | null
          status: string
          task_id: string
          template_code: string | null
          tenant_id: string
          updated_at: string
          work_product_inputs: Json | null
          work_unit_code: string | null
          work_unit_version: number | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "ai_task_executions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fire_workflow_event: {
        Args: { _event_type: string; _payload?: Json; _workspace_id: string }
        Returns: number
      }
      get_ai_context_budget_metrics: {
        Args: { _hours?: number }
        Returns: Json
      }
      get_ai_task_brief: { Args: { _task_id: string }; Returns: Json }
      get_dashboard_ai_summary: {
        Args: { _day_end?: string; _day_start?: string; _workspace_id?: string }
        Returns: Json
      }
      get_home_summary: { Args: never; Returns: Json }
      get_meeting_stats: { Args: { _meeting_id: string }; Returns: Json }
      get_my_workflow_permissions: {
        Args: { _workspace_id: string }
        Returns: Json
      }
      get_task_snapshot: {
        Args: { _task_id: string }
        Returns: {
          id: string
          row_version: number
          title: string
        }[]
      }
      get_unread_counts: {
        Args: never
        Returns: {
          chat: number
          email: number
        }[]
      }
      get_work_context: {
        Args: { _entity_id: string; _entity_type: string; _limit?: number }
        Returns: Json
      }
      get_workspace_meeting_stats: {
        Args: { _workspace_id: string }
        Returns: {
          live_count: number
          recording_count: number
          summary_count: number
          today_count: number
        }[]
      }
      global_search: {
        Args: {
          _assignee_id?: string
          _from?: string
          _kinds?: string[]
          _limit?: number
          _offset?: number
          _q?: string
          _sort?: string
          _to?: string
          _workspace_id?: string
        }
        Returns: {
          id: string
          kind: string
          kind_counts: Json
          occurred_at: string
          owner_id: string
          owner_name: string
          score: number
          snippet: string
          title: string
          total_count: number
          workspace_id: string
          workspace_name: string
        }[]
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
      has_workflow_permission: {
        Args: { _action: string; _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      ingest_meeting_provider_event: {
        Args: {
          _correlation_id?: string
          _duration_seconds?: number
          _event_id: string
          _event_type: string
          _meeting_id: string
          _occurred_at?: string
          _participant_identity?: string
          _payload?: Json
          _room_sid?: string
        }
        Returns: Json
      }
      invite_meeting_participant: {
        Args: { _correlation_id?: string; _email: string; _meeting_id: string }
        Returns: Json
      }
      is_chat_channel_admin: {
        Args: { _channel_id: string; _user_id: string }
        Returns: boolean
      }
      is_chat_member: {
        Args: { _channel_id: string; _user_id: string }
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
      issue_meeting_join_token: {
        Args: {
          _correlation_id?: string
          _expires_at: string
          _idempotency_key?: string
          _meeting_id: string
          _token_fingerprint: string
        }
        Returns: Json
      }
      link_work_entities: {
        Args: {
          _metadata?: Json
          _relationship: string
          _source_id: string
          _source_type: string
          _target_id: string
          _target_type: string
        }
        Returns: Json
      }
      list_workflow_access_requests: {
        Args: { _limit?: number; _status?: string; _workspace_id: string }
        Returns: {
          action: string
          created_at: string
          id: string
          message: string
          requester_id: string
          requester_name: string
          reviewed_at: string
          reviewer_id: string
          reviewer_name: string
          reviewer_note: string
          status: string
          workflow_id: string
          workflow_name: string
        }[]
      }
      list_workflow_denials: {
        Args: { _action?: string; _limit?: number; _workspace_id: string }
        Returns: {
          action: string
          correlation_id: string
          error_code: string
          id: string
          occurred_at: string
          source: string
          user_id: string
          user_name: string
          workflow_id: string
          workflow_name: string
        }[]
      }
      list_workflow_permission_audit: {
        Args: { _limit?: number; _workspace_id: string }
        Returns: {
          action: string
          actor_id: string
          actor_name: string
          after_state: Json
          before_state: Json
          id: string
          occurred_at: string
          target_name: string
          target_role: string
          target_user_id: string
        }[]
      }
      list_workflow_permissions: {
        Args: { _workspace_id: string }
        Returns: {
          can_edit: boolean
          can_publish: boolean
          can_run: boolean
          display_name: string
          email: string
          is_owner: boolean
          source: string
          tenant_role: string
          updated_at: string
          user_id: string
          workspace_role: string
        }[]
      }
      list_workflow_role_permissions: {
        Args: { _workspace_id: string }
        Returns: {
          can_edit: boolean
          can_publish: boolean
          can_run: boolean
          is_configured: boolean
          member_count: number
          role: string
          updated_at: string
        }[]
      }
      log_document_access: {
        Args: { _action: string; _context?: Json; _document_id: string }
        Returns: {
          action: string
          actor_id: string
          context: Json
          document_id: string
          document_title: string | null
          id: string
          occurred_at: string
          tenant_id: string
          version: number | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "document_access_logs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      log_meeting_host_action: {
        Args: {
          _action: string
          _correlation_id?: string
          _error_code?: string
          _idempotency_key?: string
          _meeting_id: string
          _outcome: string
        }
        Returns: string
      }
      log_workflow_denial: {
        Args: {
          _action: string
          _correlation_id?: string
          _error_code?: string
          _source?: string
          _workflow_id?: string
          _workspace_id: string
        }
        Returns: string
      }
      open_meeting_attendance: {
        Args: { _correlation_id?: string; _meeting_id: string }
        Returns: {
          created_at: string
          id: string
          joined_at: string
          left_at: string | null
          meeting_id: string
          minutes: number
          tenant_id: string
          updated_at: string
          usage_recorded: boolean
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "meeting_attendance"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      persist_work_quality: {
        Args: {
          _assessment: Json
          _evidence_pack: Json
          _execution_id: string
          _outcome: Json
        }
        Returns: {
          accepted_with_warnings: boolean
          ai_worker_id: string
          change_request: string | null
          cohort_class: string
          cohort_exclusion_reason: string | null
          completed_at: string | null
          contract_hash: string | null
          contract_snapshot: Json | null
          created_at: string
          created_by: string | null
          deliverable_content: string | null
          deliverable_title: string | null
          deliverable_type: string | null
          error_code: string | null
          evidence: Json
          evidence_pack: Json
          id: string
          outcome: Json
          quality_assessment: Json
          quality_passed: boolean | null
          quality_score: number | null
          quality_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          revision: number
          row_version: number
          source_refs: Json
          started_at: string | null
          status: string
          task_id: string
          template_code: string | null
          tenant_id: string
          updated_at: string
          work_product_inputs: Json | null
          work_unit_code: string | null
          work_unit_version: number | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "ai_task_executions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      provision_default_subscription: {
        Args: { _actor: string; _tenant_id: string }
        Returns: string
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
      publish_workflow: {
        Args: {
          _correlation_id?: string
          _expected_row_version?: number
          _idempotency_key?: string
          _workflow_id: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          definition: Json
          deleted_at: string | null
          description: string | null
          id: string
          name: string
          published_at: string | null
          row_version: number
          status: Database["public"]["Enums"]["workflow_status"]
          tenant_id: string
          updated_at: string
          updated_by: string | null
          version: number
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workflows"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rebuild_tenant_work_graph: { Args: { _tenant_id: string }; Returns: Json }
      recompute_ai_agent_performance: {
        Args: { _agent_id: string; _tenant_id: string }
        Returns: undefined
      }
      recompute_work_execution_cost: {
        Args: { _execution_id: string }
        Returns: {
          ai_compute_cost: number | null
          ai_compute_status: string
          ai_cost_breakdown: Json
          ai_currency: string | null
          completeness: string
          computed_at: string
          cost_model_version: string
          currency: string
          execution_id: string
          external_cost: number | null
          external_cost_status: string
          human_cost: number | null
          human_cost_status: string
          human_currency: string | null
          human_policy_version: number | null
          known_cost: number | null
          missing_signals: string[]
          platform_cost: number | null
          platform_cost_status: string
          rate_effective_at: string | null
          rate_model: string | null
          rate_provider: string | null
          rate_version: number | null
          tenant_id: string
          unknown_components: string[]
          work_unit_code: string
          work_unit_version: number
          workspace_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "work_execution_costs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      recompute_work_execution_metrics: {
        Args: { _execution_id: string }
        Returns: Json
      }
      reconcile_work_execution_steps: {
        Args: { _execution_id: string }
        Returns: Json
      }
      record_ai_usage_event: {
        Args: {
          _duration_ms?: number
          _execution_id: string
          _input_tokens: number
          _model: string
          _output_tokens: number
          _provider?: string
          _purpose: string
          _token_precision?: string
        }
        Returns: string
      }
      record_meeting_usage: {
        Args: {
          _correlation_id?: string
          _idempotency_key: string
          _meeting_id: string
          _participant_minutes: number
        }
        Returns: undefined
      }
      record_sell_work_pilot_support: {
        Args: {
          _category: string
          _minutes?: number
          _pilot_id: string
          _summary?: string
        }
        Returns: string
      }
      record_sell_work_pricing_experiment: {
        Args: {
          _code: string
          _currency: string
          _included_volume?: number
          _notes?: string
          _overage_price?: number
          _pilot_id: string
          _price: number
          _pricing_basis: string
          _version: number
        }
        Returns: string
      }
      record_tenant_invitation_rejection: {
        Args: {
          _actor_id: string
          _correlation_id?: string
          _invitation_id: string
          _reason_code: string
        }
        Returns: string
      }
      record_usage: {
        Args: {
          _correlation_id?: string
          _idempotency_key?: string
          _metadata?: Json
          _meter_key: string
          _quantity: number
          _tenant_id: string
          _workspace_id?: string
        }
        Returns: string
      }
      record_work_execution_step: {
        Args: {
          _detail?: string
          _error_code?: string
          _execution_id: string
          _kind: string
          _output?: Json
          _seq: number
          _status: string
          _title: string
        }
        Returns: {
          completed_at: string | null
          created_at: string
          detail: string | null
          error_code: string | null
          execution_id: string
          id: string
          kind: string
          output: Json
          seq: number
          started_at: string | null
          status: string
          task_id: string
          tenant_id: string
          title: string
          updated_at: string
          workspace_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "work_execution_steps"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      redeem_meeting_invite_link: { Args: { _token: string }; Returns: Json }
      refresh_entitlements: { Args: { _tenant_id: string }; Returns: undefined }
      remove_meeting_participant: {
        Args: {
          _correlation_id?: string
          _meeting_id: string
          _user_id: string
        }
        Returns: Json
      }
      repair_workflow_run_timestamps: {
        Args: { _run_ids: string[] }
        Returns: {
          ended_at: string
          id: string
          started_at: string
        }[]
      }
      report_overview: {
        Args: { _days?: number; _workspace_id?: string }
        Returns: Json
      }
      report_overview_range: {
        Args: { _from?: string; _to?: string; _workspace_id?: string }
        Returns: Json
      }
      request_ai_execution_changes: {
        Args: {
          _correlation_id?: string
          _execution_id: string
          _feedback: string
        }
        Returns: {
          accepted_with_warnings: boolean
          ai_worker_id: string
          change_request: string | null
          cohort_class: string
          cohort_exclusion_reason: string | null
          completed_at: string | null
          contract_hash: string | null
          contract_snapshot: Json | null
          created_at: string
          created_by: string | null
          deliverable_content: string | null
          deliverable_title: string | null
          deliverable_type: string | null
          error_code: string | null
          evidence: Json
          evidence_pack: Json
          id: string
          outcome: Json
          quality_assessment: Json
          quality_passed: boolean | null
          quality_score: number | null
          quality_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          revision: number
          row_version: number
          source_refs: Json
          started_at: string | null
          status: string
          task_id: string
          template_code: string | null
          tenant_id: string
          updated_at: string
          work_product_inputs: Json | null
          work_unit_code: string | null
          work_unit_version: number | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "ai_task_executions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_meeting_join: {
        Args: {
          _correlation_id?: string
          _meeting_id: string
          _message?: string
        }
        Returns: Json
      }
      request_workflow_access: {
        Args: {
          _action: string
          _message?: string
          _workflow_id?: string
          _workspace_id: string
        }
        Returns: string
      }
      reset_workflow_permission: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      reset_workflow_role_permission: {
        Args: {
          _role: Database["public"]["Enums"]["tenant_role"]
          _workspace_id: string
        }
        Returns: boolean
      }
      resolve_work_unit_for_execution: {
        Args: { _execution_id: string }
        Returns: {
          acceptance_contract: Json
          action_contract: Json
          category: string
          code: string
          context_contract: Json
          contract_hash: string | null
          created_at: string
          deliverable_contract: Json
          deliverable_type: string
          description: string | null
          executor_contract: Json
          expected_outcome_type: string
          input_contract: Json
          label: string
          objective: string
          quality_contract: Json
          review_contract: Json
          sla_contract: Json
          sla_machine_ms: number | null
          status: string
          template_code: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "work_units"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_workflow_access_request: {
        Args: { _approve: boolean; _note?: string; _request_id: string }
        Returns: string
      }
      resume_subscription: {
        Args: { _correlation_id?: string; _tenant_id: string }
        Returns: {
          cancel_at: string | null
          canceled_at: string | null
          created_at: string
          created_by: string | null
          id: string
          metadata: Json
          period_end: string | null
          period_start: string
          plan_id: string
          provider: string
          provider_ref: string | null
          row_version: number
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      retry_workflow_run: {
        Args: {
          _correlation_id?: string
          _idempotency_key?: string
          _mode?: string
          _run_id: string
        }
        Returns: {
          context: Json
          correlation_id: string | null
          created_at: string
          ended_at: string | null
          id: string
          row_version: number
          started_at: string | null
          status: Database["public"]["Enums"]["workflow_run_status"]
          tenant_id: string
          triggered_by: string | null
          updated_at: string
          workflow_id: string
          workflow_version: number
        }
        SetofOptions: {
          from: "*"
          to: "workflow_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revoke_document_share: {
        Args: {
          _correlation_id?: string
          _document_id: string
          _idempotency_key?: string
          _principal_id: string
          _principal_type: string
        }
        Returns: boolean
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
      save_meeting_summary: {
        Args: {
          _action_items: Json
          _decisions: Json
          _followup?: Json
          _highlights: Json
          _meeting_id: string
          _model: string
          _open_questions?: Json
          _risks?: Json
          _segment_count: number
          _sources: Json
          _status: string
          _summary: string
          _transcript_checksum?: string
        }
        Returns: {
          action_items: Json
          created_at: string
          decisions: Json
          followup: Json
          generated_at: string
          generated_by: string | null
          highlights: Json
          id: string
          meeting_id: string
          model: string | null
          open_questions: Json
          risks: Json
          segment_count: number
          sources: Json
          status: string
          summary: string
          tenant_id: string
          transcript_checksum: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "meeting_summaries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_meeting_summary_progress: {
        Args: {
          _chunks: Json
          _meeting_id: string
          _phase: string
          _run_id: string
          _staged: boolean
          _truncated: boolean
        }
        Returns: {
          chunks: Json
          completed_chunks: number
          failed_chunks: number
          finished_at: string | null
          meeting_id: string
          phase: string
          run_id: string
          staged: boolean
          started_at: string
          tenant_id: string
          total_chunks: number
          truncated: boolean
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "meeting_summary_progress"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      schedule_meeting:
        | {
            Args: {
              _agenda: string
              _correlation_id: string
              _end_at: string
              _idempotency_key: string
              _location: string
              _participant_ids: string[]
              _rrule: string
              _start_at: string
              _timezone: string
              _title: string
              _workspace_id: string
            }
            Returns: {
              agenda: string | null
              conference_provider: string | null
              conference_ref: Json | null
              created_at: string
              created_by: string | null
              deleted_at: string | null
              department: string | null
              end_at: string
              id: string
              location: string | null
              project_id: string | null
              row_version: number
              rrule: string | null
              start_at: string
              status: Database["public"]["Enums"]["meeting_status"]
              tenant_id: string
              timezone: string
              title: string
              updated_at: string
              updated_by: string | null
              workspace_id: string
            }
            SetofOptions: {
              from: "*"
              to: "meetings"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              _agenda?: string
              _correlation_id?: string
              _end_at: string
              _idempotency_key?: string
              _location?: string
              _participant_ids?: string[]
              _rrule?: string
              _start_at: string
              _timezone?: string
              _title: string
              _workspace_id: string
            }
            Returns: {
              agenda: string | null
              conference_provider: string | null
              conference_ref: Json | null
              created_at: string
              created_by: string | null
              deleted_at: string | null
              department: string | null
              end_at: string
              id: string
              location: string | null
              project_id: string | null
              row_version: number
              rrule: string | null
              start_at: string
              status: Database["public"]["Enums"]["meeting_status"]
              tenant_id: string
              timezone: string
              title: string
              updated_at: string
              updated_by: string | null
              workspace_id: string
            }
            SetofOptions: {
              from: "*"
              to: "meetings"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      search_norm: { Args: { _t: string }; Returns: string }
      search_universal: {
        Args: {
          _entity_types?: string[]
          _limit?: number
          _offset?: number
          _q: string
          _tenant_id: string
          _workspace_id?: string
        }
        Returns: {
          entity_id: string
          entity_type: string
          kind_counts: Json
          match_type: string
          parent_id: string
          parent_title: string
          parent_type: string
          score: number
          snippet: string
          subtitle: string
          title: string
          total_count: number
          updated_at: string
          workspace_id: string
          workspace_name: string
        }[]
      }
      set_chat_message_pin: {
        Args: { _message_id: string; _pinned: boolean }
        Returns: boolean
      }
      set_meeting_rsvp: {
        Args: {
          _correlation_id?: string
          _idempotency_key?: string
          _meeting_id: string
          _rsvp: Database["public"]["Enums"]["meeting_rsvp"]
        }
        Returns: {
          created_at: string
          meeting_id: string
          role: string
          rsvp: Database["public"]["Enums"]["meeting_rsvp"]
          rsvp_at: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "meeting_participants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_sell_work_pilot_status: {
        Args: {
          _pilot_id: string
          _reason?: string
          _secondary_reason?: string
          _status: string
        }
        Returns: Json
      }
      set_sell_work_pilot_wtp: {
        Args: {
          _amount?: number
          _billing_basis?: string
          _currency?: string
          _pilot_id: string
          _signal: string
        }
        Returns: undefined
      }
      set_sell_work_pricing_response: {
        Args: { _experiment_id: string; _notes?: string; _response: string }
        Returns: undefined
      }
      set_task_tags: {
        Args: { _tags: string[]; _task_id: string }
        Returns: {
          acceptance_criteria: string | null
          ai_execution_status: string
          ai_worker_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          due_at: string | null
          end_at: string | null
          execution_mode: string
          expected_deliverable: string | null
          human_owner_id: string | null
          id: string
          parent_task_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          progress_pct: number
          project_id: string | null
          row_version: number
          start_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          tags: string[]
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_workflow_permission: {
        Args: {
          _can_edit: boolean
          _can_publish: boolean
          _can_run: boolean
          _user_id: string
          _workspace_id: string
        }
        Returns: string
      }
      set_workflow_role_permission: {
        Args: {
          _can_edit: boolean
          _can_publish: boolean
          _can_run: boolean
          _role: Database["public"]["Enums"]["tenant_role"]
          _workspace_id: string
        }
        Returns: string
      }
      set_workspace_timezone: {
        Args: { _timezone: string; _workspace_id: string }
        Returns: {
          id: string
          timezone: string
        }[]
      }
      share_document: {
        Args: {
          _correlation_id?: string
          _document_id: string
          _idempotency_key?: string
          _level: string
          _principal_id: string
          _principal_type: string
        }
        Returns: {
          created_at: string
          document_id: string
          granted_by: string | null
          id: string
          level: string
          principal_id: string
          principal_type: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "document_permissions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      simulate_workflow_run: {
        Args: {
          _fail_step_key?: string
          _payload?: Json
          _trigger_source?: string
          _workflow_id: string
        }
        Returns: Json
      }
      split_ai_model_identity: {
        Args: { _raw: string }
        Returns: {
          model: string
          provider: string
        }[]
      }
      start_ai_task_execution: {
        Args: {
          _correlation_id?: string
          _idempotency_key?: string
          _task_id: string
          _template_code?: string
        }
        Returns: {
          accepted_with_warnings: boolean
          ai_worker_id: string
          change_request: string | null
          cohort_class: string
          cohort_exclusion_reason: string | null
          completed_at: string | null
          contract_hash: string | null
          contract_snapshot: Json | null
          created_at: string
          created_by: string | null
          deliverable_content: string | null
          deliverable_title: string | null
          deliverable_type: string | null
          error_code: string | null
          evidence: Json
          evidence_pack: Json
          id: string
          outcome: Json
          quality_assessment: Json
          quality_passed: boolean | null
          quality_score: number | null
          quality_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          revision: number
          row_version: number
          source_refs: Json
          started_at: string | null
          status: string
          task_id: string
          template_code: string | null
          tenant_id: string
          updated_at: string
          work_product_inputs: Json | null
          work_unit_code: string | null
          work_unit_version: number | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "ai_task_executions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_meeting: {
        Args: {
          _correlation_id?: string
          _expected_row_version?: number
          _idempotency_key?: string
          _meeting_id: string
        }
        Returns: {
          agenda: string | null
          conference_provider: string | null
          conference_ref: Json | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          department: string | null
          end_at: string
          id: string
          location: string | null
          project_id: string | null
          row_version: number
          rrule: string | null
          start_at: string
          status: Database["public"]["Enums"]["meeting_status"]
          tenant_id: string
          timezone: string
          title: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "meetings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_meeting_recording: {
        Args: {
          _correlation_id?: string
          _idempotency_key?: string
          _meeting_id: string
        }
        Returns: {
          created_at: string
          duration_seconds: number
          egress_id: string | null
          ended_at: string | null
          error_message: string | null
          file_size_bytes: number | null
          file_url: string | null
          id: string
          meeting_id: string
          provider: string
          started_at: string
          started_by: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "meeting_recordings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_workflow_run: {
        Args: {
          _context?: Json
          _correlation_id?: string
          _idempotency_key?: string
          _workflow_id: string
        }
        Returns: {
          context: Json
          correlation_id: string | null
          created_at: string
          ended_at: string | null
          id: string
          row_version: number
          started_at: string | null
          status: Database["public"]["Enums"]["workflow_run_status"]
          tenant_id: string
          triggered_by: string | null
          updated_at: string
          workflow_id: string
          workflow_version: number
        }
        SetofOptions: {
          from: "*"
          to: "workflow_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      stop_meeting_recording: {
        Args: {
          _correlation_id?: string
          _file_size_bytes?: number
          _file_url?: string
          _idempotency_key?: string
          _meeting_id: string
        }
        Returns: {
          created_at: string
          duration_seconds: number
          egress_id: string | null
          ended_at: string | null
          error_message: string | null
          file_size_bytes: number | null
          file_url: string | null
          id: string
          meeting_id: string
          provider: string
          started_at: string
          started_by: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "meeting_recordings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      swp2_assert_admin_read: { Args: never; Returns: undefined }
      swp2_assert_admin_write: { Args: never; Returns: undefined }
      sync_meeting_artifacts: { Args: { _meeting_id: string }; Returns: number }
      tenant_work_graph_stats: { Args: { _tenant_id: string }; Returns: Json }
      transfer_meeting_host: {
        Args: {
          _correlation_id?: string
          _idempotency_key?: string
          _meeting_id: string
          _new_host_user_id: string
        }
        Returns: Json
      }
      transfer_tenant_ownership: {
        Args: {
          _correlation_id?: string
          _new_owner_id: string
          _tenant_id: string
        }
        Returns: undefined
      }
      transition_task: {
        Args: {
          _correlation_id?: string
          _expected_row_version?: number
          _idempotency_key?: string
          _task_id: string
          _to_status: Database["public"]["Enums"]["task_status"]
        }
        Returns: {
          acceptance_criteria: string | null
          ai_execution_status: string
          ai_worker_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          due_at: string | null
          end_at: string | null
          execution_mode: string
          expected_deliverable: string | null
          human_owner_id: string | null
          id: string
          parent_task_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          progress_pct: number
          project_id: string | null
          row_version: number
          start_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          tags: string[]
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      unlink_work_entities: { Args: { _edge_id: string }; Returns: Json }
      update_document: {
        Args: {
          _content?: string
          _correlation_id?: string
          _document_id: string
          _expected_row_version?: number
          _folder?: string
          _idempotency_key?: string
          _tags?: string[]
          _title?: string
        }
        Returns: {
          content: string
          created_at: string
          created_by: string | null
          current_version: number
          deleted_at: string | null
          folder: string
          id: string
          mime_type: string | null
          row_version: number
          size_bytes: number | null
          storage_ref: Json | null
          tags: string[]
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "documents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_meeting: {
        Args: {
          _agenda?: string
          _correlation_id?: string
          _end_at?: string
          _expected_row_version?: number
          _idempotency_key?: string
          _location?: string
          _meeting_id: string
          _start_at?: string
          _timezone?: string
          _title?: string
        }
        Returns: {
          agenda: string | null
          conference_provider: string | null
          conference_ref: Json | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          department: string | null
          end_at: string
          id: string
          location: string | null
          project_id: string | null
          row_version: number
          rrule: string | null
          start_at: string
          status: Database["public"]["Enums"]["meeting_status"]
          tenant_id: string
          timezone: string
          title: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "meetings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_task: {
        Args: {
          _correlation_id?: string
          _description?: string
          _due_at?: string
          _expected_row_version?: number
          _idempotency_key?: string
          _priority?: Database["public"]["Enums"]["task_priority"]
          _task_id: string
          _title?: string
        }
        Returns: {
          acceptance_criteria: string | null
          ai_execution_status: string
          ai_worker_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          due_at: string | null
          end_at: string | null
          execution_mode: string
          expected_deliverable: string | null
          human_owner_id: string | null
          id: string
          parent_task_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          progress_pct: number
          project_id: string | null
          row_version: number
          start_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          tags: string[]
          tenant_id: string
          title: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_workflow: {
        Args: {
          _correlation_id?: string
          _definition?: Json
          _description?: string
          _expected_row_version?: number
          _idempotency_key?: string
          _name?: string
          _workflow_id: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          definition: Json
          deleted_at: string | null
          description: string | null
          id: string
          name: string
          published_at: string | null
          row_version: number
          status: Database["public"]["Enums"]["workflow_status"]
          tenant_id: string
          updated_at: string
          updated_by: string | null
          version: number
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workflows"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upload_document_version: {
        Args: {
          _comment?: string
          _correlation_id?: string
          _document_id: string
          _idempotency_key?: string
          _mime_type?: string
          _size_bytes?: number
          _storage_ref: Json
        }
        Returns: {
          author_id: string | null
          comment: string | null
          created_at: string
          document_id: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          storage_ref: Json | null
          tenant_id: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "document_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_sell_work_pilot_product: {
        Args: {
          _activate?: boolean
          _code: string
          _commercial_hypothesis?: string
          _expected_deliverable?: string
          _expected_frequency?: string
          _expected_user_group?: string
          _measurable_outcome?: string
          _pilot_id: string
          _success_criteria?: string
          _target_problem?: string
          _version?: number
        }
        Returns: string
      }
      upsert_workflow_trigger: {
        Args: {
          _at_hour?: number
          _at_minute?: number
          _event_type?: string
          _frequency?: string
          _interval_minutes?: number
          _is_enabled?: boolean
          _kind: string
          _payload?: Json
          _timezone?: string
          _trigger_id?: string
          _weekday?: number
          _workflow_id: string
        }
        Returns: {
          at_hour: number | null
          at_minute: number | null
          created_at: string
          created_by: string | null
          event_type: string | null
          frequency: string | null
          id: string
          interval_minutes: number | null
          is_enabled: boolean
          kind: string
          last_fired_at: string | null
          next_run_at: string | null
          payload: Json
          tenant_id: string
          timezone: string
          updated_at: string
          weekday: number | null
          workflow_id: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workflow_triggers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      verify_sell_work_paid_pilot: {
        Args: {
          _amount: number
          _currency: string
          _evidence_reference: string
          _pilot_id: string
          _revenue_class?: string
          _revenue_group?: string
        }
        Returns: undefined
      }
      work_economics_summary: {
        Args: {
          _from?: string
          _tenant_id: string
          _to?: string
          _workspace_id?: string
        }
        Returns: Json
      }
      work_graph_backfill: {
        Args: { _batch?: number; _dry_run?: boolean }
        Returns: Json
      }
      work_graph_health: { Args: never; Returns: Json }
      work_product_contract_payload: {
        Args: { _r: Database["public"]["Tables"]["work_units"]["Row"] }
        Returns: Json
      }
      work_product_economics: {
        Args: {
          _code: string
          _from?: string
          _tenant_id: string
          _to?: string
          _version: number
          _workspace_id?: string
        }
        Returns: Json
      }
      work_product_summary: {
        Args: { _from?: string; _tenant_id: string; _to?: string }
        Returns: Json
      }
      wp_access_scope: {
        Args: { _kind: string; _tenant_id: string }
        Returns: string
      }
      wp_admin_override: { Args: { _tenant_id: string }; Returns: boolean }
      wp_scope_allows: {
        Args: {
          _created_by: string
          _kind: string
          _owner_id: string
          _tenant_id: string
          _workspace_id: string
        }
        Returns: boolean
      }
      wp_share_allows: {
        Args: { _kind: string; _work_product_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      meeting_rsvp: "pending" | "accepted" | "declined" | "tentative"
      meeting_status: "scheduled" | "live" | "ended" | "canceled"
      task_priority: "low" | "normal" | "high" | "urgent"
      task_status: "todo" | "in_progress" | "blocked" | "done" | "canceled"
      tenant_member_status: "active" | "invited" | "suspended" | "removed"
      tenant_role:
        | "tenant_owner"
        | "tenant_admin"
        | "manager"
        | "member"
        | "guest"
      workflow_run_status:
        | "pending"
        | "running"
        | "succeeded"
        | "failed"
        | "canceled"
      workflow_status: "draft" | "published" | "archived"
      workflow_step_status:
        | "pending"
        | "running"
        | "succeeded"
        | "failed"
        | "skipped"
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
      app_role: ["admin", "moderator", "user"],
      meeting_rsvp: ["pending", "accepted", "declined", "tentative"],
      meeting_status: ["scheduled", "live", "ended", "canceled"],
      task_priority: ["low", "normal", "high", "urgent"],
      task_status: ["todo", "in_progress", "blocked", "done", "canceled"],
      tenant_member_status: ["active", "invited", "suspended", "removed"],
      tenant_role: [
        "tenant_owner",
        "tenant_admin",
        "manager",
        "member",
        "guest",
      ],
      workflow_run_status: [
        "pending",
        "running",
        "succeeded",
        "failed",
        "canceled",
      ],
      workflow_status: ["draft", "published", "archived"],
      workflow_step_status: [
        "pending",
        "running",
        "succeeded",
        "failed",
        "skipped",
      ],
    },
  },
} as const
