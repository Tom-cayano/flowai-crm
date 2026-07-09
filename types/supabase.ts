/**
 * Supabase Database types.
 *
 * Auto-generate this file with the Supabase CLI whenever your schema changes:
 *
 *   npx supabase login
 *   npx supabase gen types typescript \
 *     --project-id "$SUPABASE_PROJECT_ID" \
 *     --schema public \
 *     > types/supabase.ts
 *
 * Or, if you use a local Supabase instance:
 *   npx supabase gen types typescript --local > types/supabase.ts
 *
 * The stubs below keep TypeScript happy until you run the generator.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          role: "admin" | "agent" | "supervisor";
          status: "online" | "away" | "offline";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: "admin" | "agent" | "supervisor";
          status?: "online" | "away" | "offline";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: "admin" | "agent" | "supervisor";
          status?: "online" | "away" | "offline";
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      contacts: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          phone: string | null;
          whatsapp: string | null;
          email: string | null;
          instagram: string | null;
          company: string | null;
          location: string | null;
          notes: string | null;
          status: "active" | "inactive" | "blocked";
          tags: string[];
          source: string | null;
          custom_fields: Json;
          last_interaction: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          phone?: string | null;
          whatsapp?: string | null;
          email?: string | null;
          instagram?: string | null;
          company?: string | null;
          location?: string | null;
          notes?: string | null;
          status?: "active" | "inactive" | "blocked";
          tags?: string[];
          source?: string | null;
          custom_fields?: Json;
          last_interaction?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          phone?: string | null;
          whatsapp?: string | null;
          email?: string | null;
          instagram?: string | null;
          company?: string | null;
          location?: string | null;
          notes?: string | null;
          status?: "active" | "inactive" | "blocked";
          tags?: string[];
          source?: string | null;
          custom_fields?: Json;
          last_interaction?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      conversations: {
        Row: {
          id: string;
          user_id: string;
          contact_id: string | null;
          contact_name: string;
          contact_phone: string | null;
          assigned_to: string | null;
          status: "open" | "resolved" | "pending" | "spam";
          channel: "whatsapp" | "email" | "sms" | "instagram" | "messenger";
          tags: string[];
          unread_count: number;
          last_message_at: string | null;
          last_message_preview: string | null;
          last_message_sender: "agent" | "contact" | null;
          instance_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          contact_id?: string | null;
          contact_name: string;
          contact_phone?: string | null;
          assigned_to?: string | null;
          status?: "open" | "resolved" | "pending" | "spam";
          channel?: "whatsapp" | "email" | "sms" | "instagram" | "messenger";
          tags?: string[];
          unread_count?: number;
          last_message_at?: string | null;
          last_message_preview?: string | null;
          last_message_sender?: "agent" | "contact" | null;
          instance_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          contact_name?: string;
          contact_phone?: string | null;
          assigned_to?: string | null;
          status?: "open" | "resolved" | "pending" | "spam";
          tags?: string[];
          unread_count?: number;
          last_message_at?: string | null;
          last_message_preview?: string | null;
          last_message_sender?: "agent" | "contact" | null;
          instance_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          content: string;
          type: "text" | "image" | "audio" | "document" | "template";
          sender: "agent" | "contact";
          status: "sent" | "delivered" | "read" | "failed";
          agent_name: string | null;
          external_id: string | null;
          media_url: string | null;
          media_mime_type: string | null;
          thumbnail_url: string | null;
          quoted_message_id: string | null;
          retry_count: number;
          failed_reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          content: string;
          type?: "text" | "image" | "audio" | "document" | "template";
          sender: "agent" | "contact";
          status?: "sent" | "delivered" | "read" | "failed";
          agent_name?: string | null;
          external_id?: string | null;
          media_url?: string | null;
          media_mime_type?: string | null;
          thumbnail_url?: string | null;
          quoted_message_id?: string | null;
          retry_count?: number;
          failed_reason?: string | null;
          created_at?: string;
        };
        Update: {
          content?: string;
          status?: "sent" | "delivered" | "read" | "failed";
          external_id?: string | null;
          media_url?: string | null;
          media_mime_type?: string | null;
          thumbnail_url?: string | null;
          retry_count?: number;
          failed_reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      campaigns: {
        Row: {
          id: string;
          workspace_id: string;
          name: string;
          status: "draft" | "scheduled" | "running" | "completed" | "paused";
          template: string;
          audience_count: number;
          sent_count: number;
          delivered_count: number;
          read_count: number;
          replied_count: number;
          scheduled_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          name: string;
          status?: "draft" | "scheduled" | "running" | "completed" | "paused";
          template: string;
          audience_count?: number;
          sent_count?: number;
          delivered_count?: number;
          read_count?: number;
          replied_count?: number;
          scheduled_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          status?: "draft" | "scheduled" | "running" | "completed" | "paused";
          sent_count?: number;
          delivered_count?: number;
          read_count?: number;
          replied_count?: number;
          scheduled_at?: string | null;
          completed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      automations: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string;
          status: "active" | "inactive" | "draft";
          workflow: Json;
          trigger_type: string | null;
          execution_count: number;
          last_triggered_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string;
          status?: "active" | "inactive" | "draft";
          workflow?: Json;
          trigger_type?: string | null;
          execution_count?: number;
          last_triggered_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          description?: string;
          status?: "active" | "inactive" | "draft";
          workflow?: Json;
          trigger_type?: string | null;
          execution_count?: number;
          last_triggered_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      whatsapp_instances: {
        Row: {
          id: string;
          user_id: string;
          instance_name: string;
          server_url: string;
          api_key: string;
          connection_state: "open" | "close" | "connecting";
          phone_number: string | null;
          display_name: string | null;
          avatar_url: string | null;
          is_active: boolean;
          label: string | null;
          webhook_set: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          instance_name: string;
          server_url: string;
          api_key: string;
          connection_state?: "open" | "close" | "connecting";
          phone_number?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          is_active?: boolean;
          label?: string | null;
          webhook_set?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          instance_name?: string;
          server_url?: string;
          api_key?: string;
          connection_state?: "open" | "close" | "connecting";
          phone_number?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          is_active?: boolean;
          label?: string | null;
          webhook_set?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      whatsapp_contacts: {
        Row: {
          id: string;
          user_id: string;
          instance_id: string;
          contact_id: string | null;
          whatsapp_id: string;
          phone: string | null;
          push_name: string | null;
          business_name: string | null;
          about: string | null;
          avatar_url: string | null;
          is_business: boolean;
          is_blocked: boolean;
          is_my_contact: boolean;
          last_seen_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          instance_id: string;
          contact_id?: string | null;
          whatsapp_id: string;
          phone?: string | null;
          push_name?: string | null;
          business_name?: string | null;
          about?: string | null;
          avatar_url?: string | null;
          is_business?: boolean;
          is_blocked?: boolean;
          is_my_contact?: boolean;
          last_seen_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          contact_id?: string | null;
          push_name?: string | null;
          business_name?: string | null;
          about?: string | null;
          avatar_url?: string | null;
          is_business?: boolean;
          is_blocked?: boolean;
          is_my_contact?: boolean;
          last_seen_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_contacts_instance_id_fkey";
            columns: ["instance_id"];
            referencedRelation: "whatsapp_instances";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_contacts_contact_id_fkey";
            columns: ["contact_id"];
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_chats: {
        Row: {
          id: string;
          user_id: string;
          instance_id: string;
          whatsapp_contact_id: string | null;
          conversation_id: string | null;
          remote_jid: string;
          name: string | null;
          is_group: boolean;
          group_description: string | null;
          unread_count: number;
          pinned: boolean;
          archived: boolean;
          muted_until: string | null;
          last_message_at: string | null;
          last_message_preview: string | null;
          last_message_sender: "me" | "them" | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          instance_id: string;
          whatsapp_contact_id?: string | null;
          conversation_id?: string | null;
          remote_jid: string;
          name?: string | null;
          is_group?: boolean;
          group_description?: string | null;
          unread_count?: number;
          pinned?: boolean;
          archived?: boolean;
          muted_until?: string | null;
          last_message_at?: string | null;
          last_message_preview?: string | null;
          last_message_sender?: "me" | "them" | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          whatsapp_contact_id?: string | null;
          conversation_id?: string | null;
          name?: string | null;
          is_group?: boolean;
          group_description?: string | null;
          unread_count?: number;
          pinned?: boolean;
          archived?: boolean;
          muted_until?: string | null;
          last_message_at?: string | null;
          last_message_preview?: string | null;
          last_message_sender?: "me" | "them" | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_chats_instance_id_fkey";
            columns: ["instance_id"];
            referencedRelation: "whatsapp_instances";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_chats_whatsapp_contact_id_fkey";
            columns: ["whatsapp_contact_id"];
            referencedRelation: "whatsapp_contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_chats_conversation_id_fkey";
            columns: ["conversation_id"];
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_messages: {
        Row: {
          id: string;
          user_id: string;
          instance_id: string;
          chat_id: string;
          quoted_message_id: string | null;
          external_id: string;
          remote_jid: string;
          push_name: string | null;
          from_me: boolean;
          type: "text" | "image" | "video" | "audio" | "document" | "sticker" | "location" | "contact" | "reaction" | "poll" | "template" | "ptv" | "unknown";
          content: string;
          caption: string | null;
          raw_content: Json | null;
          media_url: string | null;
          media_mime_type: string | null;
          media_size: number | null;
          media_sha256: string | null;
          media_duration_sec: number | null;
          status: "pending" | "sent" | "delivered" | "read" | "played" | "received" | "failed";
          is_forwarded: boolean;
          is_starred: boolean;
          is_ephemeral: boolean;
          timestamp: string;
          edited_at: string | null;
          deleted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          instance_id: string;
          chat_id: string;
          quoted_message_id?: string | null;
          external_id: string;
          remote_jid: string;
          push_name?: string | null;
          from_me: boolean;
          type?: "text" | "image" | "video" | "audio" | "document" | "sticker" | "location" | "contact" | "reaction" | "poll" | "template" | "ptv" | "unknown";
          content?: string;
          caption?: string | null;
          raw_content?: Json | null;
          media_url?: string | null;
          media_mime_type?: string | null;
          media_size?: number | null;
          media_sha256?: string | null;
          media_duration_sec?: number | null;
          status?: "pending" | "sent" | "delivered" | "read" | "played" | "received" | "failed";
          is_forwarded?: boolean;
          is_starred?: boolean;
          is_ephemeral?: boolean;
          timestamp: string;
          edited_at?: string | null;
          deleted_at?: string | null;
          created_at?: string;
        };
        Update: {
          quoted_message_id?: string | null;
          push_name?: string | null;
          content?: string;
          caption?: string | null;
          raw_content?: Json | null;
          media_url?: string | null;
          media_mime_type?: string | null;
          media_size?: number | null;
          media_sha256?: string | null;
          media_duration_sec?: number | null;
          status?: "pending" | "sent" | "delivered" | "read" | "played" | "received" | "failed";
          is_starred?: boolean;
          edited_at?: string | null;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_instance_id_fkey";
            columns: ["instance_id"];
            referencedRelation: "whatsapp_instances";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_messages_chat_id_fkey";
            columns: ["chat_id"];
            referencedRelation: "whatsapp_chats";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_messages_quoted_message_id_fkey";
            columns: ["quoted_message_id"];
            referencedRelation: "whatsapp_messages";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_automation_logs: {
        Row: {
          id: string;
          user_id: string;
          automation_id: string | null;
          instance_id: string | null;
          chat_id: string | null;
          trigger_event: string;
          trigger_payload: Json;
          status: "completed" | "failed" | "skipped";
          actions_executed: Json;
          error_message: string | null;
          duration_ms: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          automation_id?: string | null;
          instance_id?: string | null;
          chat_id?: string | null;
          trigger_event: string;
          trigger_payload?: Json;
          status?: "completed" | "failed" | "skipped";
          actions_executed?: Json;
          error_message?: string | null;
          duration_ms?: number | null;
          created_at?: string;
        };
        Update: {
          status?: "completed" | "failed" | "skipped";
          actions_executed?: Json;
          error_message?: string | null;
          duration_ms?: number | null;
        };
        Relationships: [];
      };
      message_queue: {
        Row: {
          id: string;
          user_id: string;
          instance_id: string | null;
          conversation_id: string | null;
          phone: string;
          content: string;
          type: "text" | "image" | "audio" | "document" | "template";
          status: "pending" | "processing" | "sent" | "failed";
          attempts: number;
          max_attempts: number;
          scheduled_at: string;
          sent_at: string | null;
          error_message: string | null;
          origin: string;
          origin_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          instance_id?: string | null;
          conversation_id?: string | null;
          phone: string;
          content: string;
          type?: "text" | "image" | "audio" | "document" | "template";
          status?: "pending" | "processing" | "sent" | "failed";
          attempts?: number;
          max_attempts?: number;
          scheduled_at?: string;
          sent_at?: string | null;
          error_message?: string | null;
          origin?: string;
          origin_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: "pending" | "processing" | "sent" | "failed";
          attempts?: number;
          sent_at?: string | null;
          error_message?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      session_health_events: {
        Row: {
          id: string;
          instance_id: string | null;
          user_id: string;
          event_type: string;
          from_state: string | null;
          to_state: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          instance_id?: string | null;
          user_id: string;
          event_type: string;
          from_state?: string | null;
          to_state: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          event_type?: string;
          from_state?: string | null;
          to_state?: string;
          metadata?: Json;
        };
        Relationships: [];
      };
      automation_executions: {
        Row: {
          id: string;
          automation_id: string;
          user_id: string;
          conversation_id: string | null;
          contact_id: string | null;
          status: "running" | "completed" | "failed" | "cancelled";
          current_node_id: string | null;
          context: Json;
          error: string | null;
          started_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          automation_id: string;
          user_id: string;
          conversation_id?: string | null;
          contact_id?: string | null;
          status?: "running" | "completed" | "failed" | "cancelled";
          current_node_id?: string | null;
          context?: Json;
          error?: string | null;
          started_at?: string;
          completed_at?: string | null;
        };
        Update: {
          status?: "running" | "completed" | "failed" | "cancelled";
          current_node_id?: string | null;
          context?: Json;
          error?: string | null;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      automation_step_logs: {
        Row: {
          id: string;
          execution_id: string;
          node_id: string;
          node_type: string;
          level: "debug" | "info" | "warn" | "error";
          message: string;
          data: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          execution_id: string;
          node_id: string;
          node_type: string;
          level?: "debug" | "info" | "warn" | "error";
          message: string;
          data?: Json | null;
          created_at?: string;
        };
        Update: { level?: "debug" | "info" | "warn" | "error"; message?: string };
        Relationships: [];
      };
      scheduled_tasks: {
        Row: {
          id: string;
          user_id: string;
          automation_id: string | null;
          execution_id: string | null;
          node_id: string;
          run_at: string;
          payload: Json;
          status: "pending" | "running" | "done" | "cancelled";
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          automation_id?: string | null;
          execution_id?: string | null;
          node_id: string;
          run_at: string;
          payload?: Json;
          status?: "pending" | "running" | "done" | "cancelled";
          created_at?: string;
        };
        Update: {
          status?: "pending" | "running" | "done" | "cancelled";
          run_at?: string;
        };
        Relationships: [];
      };
      ai_prompts: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string;
          system_prompt: string;
          model: string;
          max_tokens: number;
          temperature: number;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string;
          system_prompt: string;
          model?: string;
          max_tokens?: number;
          temperature?: number;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          description?: string;
          system_prompt?: string;
          model?: string;
          max_tokens?: number;
          temperature?: number;
          is_default?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      contact_scores: {
        Row: {
          id: string;
          user_id: string;
          contact_id: string;
          score: number;
          events: Json;
          last_updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          contact_id: string;
          score?: number;
          events?: Json;
          last_updated_at?: string;
        };
        Update: { score?: number; events?: Json; last_updated_at?: string };
        Relationships: [];
      };
      contact_segments: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string;
          rules: Json;
          member_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string;
          rules?: Json;
          member_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          description?: string;
          rules?: Json;
          member_count?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      contact_segment_members: {
        Row: { segment_id: string; contact_id: string; added_at: string };
        Insert: { segment_id: string; contact_id: string; added_at?: string };
        Update: Record<string, never>;
        Relationships: [];
      };
      ai_context: {
        Row: {
          id: string;
          user_id: string;
          conversation_id: string;
          summary: string | null;
          facts: Json;
          message_window: number;
          tokens_used: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          conversation_id: string;
          summary?: string | null;
          facts?: Json;
          message_window?: number;
          tokens_used?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          summary?: string | null;
          facts?: Json;
          message_window?: number;
          tokens_used?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_ai_settings: {
        Row: {
          id: string;
          user_id: string;
          enabled: boolean;
          model: string;
          system_prompt: string | null;
          max_tokens: number;
          temperature: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          enabled?: boolean;
          model?: string;
          system_prompt?: string | null;
          max_tokens?: number;
          temperature?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          enabled?: boolean;
          model?: string;
          system_prompt?: string | null;
          max_tokens?: number;
          temperature?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      webhook_automations: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          enabled: boolean;
          trigger_event: string;
          conditions: Json;
          actions: Json;
          priority: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          enabled?: boolean;
          trigger_event?: string;
          conditions?: Json;
          actions?: Json;
          priority?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          enabled?: boolean;
          trigger_event?: string;
          conditions?: Json;
          actions?: Json;
          priority?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      appointments: {
        Row: {
          id: string;
          user_id: string;
          contact_id: string | null;
          conversation_id: string | null;
          kind: "valoracion_video" | "valoracion_llamada" | "clase_prueba";
          scheduled_at: string;
          duration_minutes: number;
          status: "confirmed" | "completed" | "cancelled" | "no_show";
          contact_name: string;
          contact_phone: string;
          goal: string | null;
          lead_source: string | null;
          calendar_event_id: string | null;
          meet_link: string | null;
          reminder_24h_sent_at: string | null;
          reminder_1h_sent_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          contact_id?: string | null;
          conversation_id?: string | null;
          kind: "valoracion_video" | "valoracion_llamada" | "clase_prueba";
          scheduled_at: string;
          duration_minutes?: number;
          status?: "confirmed" | "completed" | "cancelled" | "no_show";
          contact_name?: string;
          contact_phone?: string;
          goal?: string | null;
          lead_source?: string | null;
          calendar_event_id?: string | null;
          meet_link?: string | null;
          reminder_24h_sent_at?: string | null;
          reminder_1h_sent_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          kind?: "valoracion_video" | "valoracion_llamada" | "clase_prueba";
          scheduled_at?: string;
          duration_minutes?: number;
          status?: "confirmed" | "completed" | "cancelled" | "no_show";
          contact_name?: string;
          contact_phone?: string;
          goal?: string | null;
          lead_source?: string | null;
          calendar_event_id?: string | null;
          meet_link?: string | null;
          reminder_24h_sent_at?: string | null;
          reminder_1h_sent_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      webhook_integrations: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          source_key: string;
          token: string;
          hmac_secret: string | null;
          enabled: boolean;
          default_tags: string[];
          total_events: number;
          total_errors: number;
          last_event_at: string | null;
          last_event_status: string | null;
          last_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          source_key: string;
          token: string;
          hmac_secret?: string | null;
          enabled?: boolean;
          default_tags?: string[];
          total_events?: number;
          total_errors?: number;
          last_event_at?: string | null;
          last_event_status?: string | null;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          source_key?: string;
          token?: string;
          hmac_secret?: string | null;
          enabled?: boolean;
          default_tags?: string[];
          total_events?: number;
          total_errors?: number;
          last_event_at?: string | null;
          last_event_status?: string | null;
          last_error?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      integration_events: {
        Row: {
          id: string;
          integration_id: string;
          user_id: string;
          source: string;
          event: string;
          payload: Json;
          idempotency_key: string | null;
          status: "received" | "processed" | "failed" | "retrying" | "dead";
          error: string | null;
          attempts: number;
          contact_id: string | null;
          contact_created: boolean;
          automations_triggered: Json;
          processing_ms: number | null;
          created_at: string;
          processed_at: string | null;
        };
        Insert: {
          id?: string;
          integration_id: string;
          user_id: string;
          source: string;
          event: string;
          payload?: Json;
          idempotency_key?: string | null;
          status?: "received" | "processed" | "failed" | "retrying" | "dead";
          error?: string | null;
          attempts?: number;
          contact_id?: string | null;
          contact_created?: boolean;
          automations_triggered?: Json;
          processing_ms?: number | null;
          created_at?: string;
          processed_at?: string | null;
        };
        Update: {
          status?: "received" | "processed" | "failed" | "retrying" | "dead";
          error?: string | null;
          attempts?: number;
          contact_id?: string | null;
          contact_created?: boolean;
          automations_triggered?: Json;
          processing_ms?: number | null;
          processed_at?: string | null;
        };
        Relationships: [];
      };
      integration_security_events: {
        Row: {
          id: string;
          integration_id: string | null;
          user_id: string | null;
          ip: string | null;
          reason: string;
          detail: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          integration_id?: string | null;
          user_id?: string | null;
          ip?: string | null;
          reason: string;
          detail?: string | null;
          created_at?: string;
        };
        Update: {
          reason?: string;
          detail?: string | null;
        };
        Relationships: [];
      };
      workspaces: {
        Row: {
          id: string; owner_id: string; parent_id: string | null;
          name: string; slug: string; plan_id: string; is_agency: boolean;
          stripe_customer_id: string | null; stripe_subscription_id: string | null;
          subscription_status: string; trial_ends_at: string | null;
          current_period_end: string | null; billing_interval: string;
          logo_url: string | null; primary_color: string;
          company_name: string | null; custom_domain: string | null;
          support_email: string | null; timezone: string; locale: string;
          is_active: boolean; created_at: string; updated_at: string;
          grace_period_ends_at: string | null;
        };
        Insert: {
          id?: string; owner_id: string; parent_id?: string | null;
          name: string; slug: string; plan_id?: string; is_agency?: boolean;
          stripe_customer_id?: string | null; stripe_subscription_id?: string | null;
          subscription_status?: string; trial_ends_at?: string | null;
          current_period_end?: string | null; billing_interval?: string;
          logo_url?: string | null; primary_color?: string;
          company_name?: string | null; custom_domain?: string | null;
          support_email?: string | null; timezone?: string; locale?: string;
          is_active?: boolean; created_at?: string; updated_at?: string;
          grace_period_ends_at?: string | null;
        };
        Update: {
          name?: string; slug?: string; plan_id?: string; is_agency?: boolean;
          stripe_customer_id?: string | null; stripe_subscription_id?: string | null;
          subscription_status?: string; trial_ends_at?: string | null;
          current_period_end?: string | null; billing_interval?: string;
          logo_url?: string | null; primary_color?: string;
          company_name?: string | null; custom_domain?: string | null;
          support_email?: string | null; timezone?: string; locale?: string;
          is_active?: boolean; updated_at?: string;
          grace_period_ends_at?: string | null;
        };
        Relationships: [];
      };
      ai_usage_logs: {
        Row: {
          id: string;
          user_id: string;
          conversation_id: string | null;
          model: string;
          operation: string;
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
          estimated_cost_usd: number;
          latency_ms: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          conversation_id?: string | null;
          model: string;
          operation: string;
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
          estimated_cost_usd?: number;
          latency_ms?: number | null;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      conversation_embeddings: {
        Row: {
          id: string;
          user_id: string;
          conversation_id: string;
          message_id: string | null;
          content: string;
          embedding: number[] | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          conversation_id: string;
          message_id?: string | null;
          content: string;
          embedding?: number[] | null;
          created_at?: string;
        };
        Update: { embedding?: number[] | null };
        Relationships: [];
      };
      ai_handoffs: {
        Row: {
          id: string;
          user_id: string;
          conversation_id: string;
          reason: string;
          confidence: number | null;
          triggered_message: string | null;
          created_at: string;
          resolved_at: string | null;
          resolved_by: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          conversation_id: string;
          reason: string;
          confidence?: number | null;
          triggered_message?: string | null;
          created_at?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
        Update: {
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
        Relationships: [];
      };
      ai_feedback: {
        Row: {
          id: string;
          user_id: string;
          conversation_id: string;
          ai_response_text: string | null;
          rating: number | null;
          feedback_text: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          conversation_id: string;
          ai_response_text?: string | null;
          rating?: number | null;
          feedback_text?: string | null;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      job_failures: {
        Row: {
          id: string;
          queue_name: string;
          job_id: string;
          job_name: string;
          data: Json | null;
          opts: Json | null;
          error: string | null;
          stack_trace: string | null;
          attempts_made: number;
          failed_at: string;
          replayed_at: string | null;
          replayed_by: string | null;
          replay_job_id: string | null;
          user_id: string | null;
          correlation_id: string | null;
        };
        Insert: {
          id?: string;
          queue_name: string;
          job_id: string;
          job_name: string;
          data?: Json | null;
          opts?: Json | null;
          error?: string | null;
          stack_trace?: string | null;
          attempts_made?: number;
          failed_at?: string;
          replayed_at?: string | null;
          replayed_by?: string | null;
          replay_job_id?: string | null;
          user_id?: string | null;
          correlation_id?: string | null;
        };
        Update: {
          replayed_at?: string | null;
          replayed_by?: string | null;
          replay_job_id?: string | null;
        };
        Relationships: [];
      };
      metrics_snapshots: {
        Row: {
          id: string;
          captured_at: string;
          queue_name: string;
          waiting: number;
          active: number;
          completed: number;
          failed: number;
          delayed: number;
          throughput_1h: number;
          avg_latency_ms: number | null;
        };
        Insert: {
          id?: string;
          captured_at?: string;
          queue_name: string;
          waiting?: number;
          active?: number;
          completed?: number;
          failed?: number;
          delayed?: number;
          throughput_1h?: number;
          avg_latency_ms?: number | null;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string | null;
          action: string;
          resource_type: string;
          resource_id: string | null;
          metadata: Json | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          action: string;
          resource_type: string;
          resource_id?: string | null;
          metadata?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      worker_heartbeats: {
        Row: {
          id: string;
          worker_id: string;
          queues: string[];
          started_at: string;
          last_beat: string;
          version: string | null;
        };
        Insert: {
          id?: string;
          worker_id: string;
          queues: string[];
          started_at: string;
          last_beat?: string;
          version?: string | null;
        };
        Update: {
          last_beat?: string;
          queues?: string[];
          version?: string | null;
        };
        Relationships: [];
      };
      rate_limit_events: {
        Row: {
          id: string;
          user_id: string;
          automation_id: string | null;
          conversation_id: string | null;
          triggered_at: string;
          window_count: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          automation_id?: string | null;
          conversation_id?: string | null;
          triggered_at?: string;
          window_count?: number;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      // ─── SaaS layer (new tables) ─────────────────────────────
      plans: {
        Row: {
          id: string; name: string; description: string | null;
          price_monthly: number; price_yearly: number;
          stripe_price_monthly: string | null; stripe_price_yearly: string | null;
          max_seats: number; max_messages_monthly: number; max_ai_credits: number;
          max_automations: number; max_workspaces: number;
          features: Json; is_active: boolean; sort_order: number; created_at: string;
        };
        Insert: { id: string; name: string; price_monthly?: number; price_yearly?: number; max_seats?: number; max_messages_monthly?: number; max_ai_credits?: number; max_automations?: number; max_workspaces?: number; features?: Json; is_active?: boolean; sort_order?: number; };
        Update: { name?: string; description?: string | null; price_monthly?: number; price_yearly?: number; stripe_price_monthly?: string | null; stripe_price_yearly?: string | null; max_seats?: number; max_messages_monthly?: number; max_ai_credits?: number; max_automations?: number; max_workspaces?: number; features?: Json; is_active?: boolean; sort_order?: number; };
        Relationships: [];
      };
      workspace_members: {
        Row: {
          id: string; workspace_id: string; user_id: string;
          role: "owner" | "admin" | "manager" | "agent";
          permissions: Json | null; display_name: string | null;
          avatar_url: string | null; is_active: boolean;
          last_seen_at: string | null; invited_by: string | null; joined_at: string;
        };
        Insert: {
          id?: string; workspace_id: string; user_id: string;
          role?: "owner" | "admin" | "manager" | "agent";
          permissions?: Json | null; display_name?: string | null;
          avatar_url?: string | null; is_active?: boolean;
          last_seen_at?: string | null; invited_by?: string | null; joined_at?: string;
        };
        Update: {
          role?: "owner" | "admin" | "manager" | "agent";
          permissions?: Json | null; display_name?: string | null;
          avatar_url?: string | null; is_active?: boolean; last_seen_at?: string | null;
        };
        Relationships: [];
      };
      workspace_invitations: {
        Row: {
          id: string; workspace_id: string; email: string;
          role: "owner" | "admin" | "manager" | "agent";
          token: string; invited_by: string;
          accepted_at: string | null; expires_at: string; created_at: string;
        };
        Insert: {
          id?: string; workspace_id: string; email: string;
          role?: "owner" | "admin" | "manager" | "agent";
          token?: string; invited_by: string;
          accepted_at?: string | null; expires_at?: string; created_at?: string;
        };
        Update: {
          role?: "owner" | "admin" | "manager" | "agent";
          accepted_at?: string | null; expires_at?: string;
        };
        Relationships: [];
      };
      billing_events: {
        Row: {
          id: string; workspace_id: string; event_type: string;
          stripe_event_id: string | null; payload: Json; processed_at: string;
        };
        Insert: {
          id?: string; workspace_id: string; event_type: string;
          stripe_event_id?: string | null; payload?: Json; processed_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      usage_records: {
        Row: {
          id: string; workspace_id: string;
          period_start: string; period_end: string;
          messages_sent: number; ai_credits_used: number;
          automations_executed: number; active_seats: number; updated_at: string;
        };
        Insert: {
          id?: string; workspace_id: string;
          period_start: string; period_end: string;
          messages_sent?: number; ai_credits_used?: number;
          automations_executed?: number; active_seats?: number; updated_at?: string;
        };
        Update: {
          messages_sent?: number; ai_credits_used?: number;
          automations_executed?: number; active_seats?: number; updated_at?: string;
        };
        Relationships: [];
      };
      onboarding_progress: {
        Row: {
          workspace_id: string; whatsapp_connected: boolean;
          first_message_sent: boolean; ai_configured: boolean;
          team_member_invited: boolean; automation_created: boolean;
          billing_setup: boolean; wizard_completed: boolean;
          wizard_dismissed: boolean; current_step: number;
          completed_at: string | null; updated_at: string;
        };
        Insert: {
          workspace_id: string; whatsapp_connected?: boolean;
          first_message_sent?: boolean; ai_configured?: boolean;
          team_member_invited?: boolean; automation_created?: boolean;
          billing_setup?: boolean; wizard_completed?: boolean;
          wizard_dismissed?: boolean; current_step?: number;
          completed_at?: string | null; updated_at?: string;
        };
        Update: {
          whatsapp_connected?: boolean; first_message_sent?: boolean;
          ai_configured?: boolean; team_member_invited?: boolean;
          automation_created?: boolean; billing_setup?: boolean;
          wizard_completed?: boolean; wizard_dismissed?: boolean;
          current_step?: number; completed_at?: string | null; updated_at?: string;
        };
        Relationships: [];
      };
      templates: {
        Row: {
          id: string; workspace_id: string | null;
          type: "workflow" | "prompt" | "campaign" | "canned_response";
          name: string; description: string; category: string; tags: string[];
          thumbnail_url: string | null; content: Json;
          is_public: boolean; is_featured: boolean;
          install_count: number; rating_sum: number; rating_count: number;
          created_by: string | null; created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; workspace_id?: string | null;
          type: "workflow" | "prompt" | "campaign" | "canned_response";
          name: string; description?: string; category?: string; tags?: string[];
          thumbnail_url?: string | null; content: Json;
          is_public?: boolean; is_featured?: boolean;
          install_count?: number; rating_sum?: number; rating_count?: number;
          created_by?: string | null; created_at?: string; updated_at?: string;
        };
        Update: {
          name?: string; description?: string; category?: string; tags?: string[];
          thumbnail_url?: string | null; content?: Json;
          is_public?: boolean; is_featured?: boolean;
          install_count?: number; rating_sum?: number; rating_count?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      template_installs: {
        Row: { id: string; template_id: string; workspace_id: string; installed_by: string; created_at: string; };
        Insert: { id?: string; template_id: string; workspace_id: string; installed_by: string; created_at?: string; };
        Update: Record<string, never>;
        Relationships: [];
      };
      template_ratings: {
        Row: { id: string; template_id: string; workspace_id: string; rating: number; created_at: string; };
        Insert: { id?: string; template_id: string; workspace_id: string; rating: number; created_at?: string; };
        Update: { rating?: number; };
        Relationships: [];
      };
      workspace_health: {
        Row: {
          workspace_id: string; health_score: number; login_score: number;
          message_score: number; ai_score: number; automation_score: number;
          churn_risk: string; activation_score: number;
          last_active_at: string | null; days_since_last_login: number | null;
          messages_last_7_days: number; ai_calls_last_7_days: number; computed_at: string;
        };
        Insert: {
          workspace_id: string; health_score?: number; login_score?: number;
          message_score?: number; ai_score?: number; automation_score?: number;
          churn_risk?: string; activation_score?: number;
          last_active_at?: string | null; days_since_last_login?: number | null;
          messages_last_7_days?: number; ai_calls_last_7_days?: number; computed_at?: string;
        };
        Update: {
          health_score?: number; login_score?: number; message_score?: number;
          ai_score?: number; automation_score?: number; churn_risk?: string;
          activation_score?: number; last_active_at?: string | null;
          days_since_last_login?: number | null;
          messages_last_7_days?: number; ai_calls_last_7_days?: number; computed_at?: string;
        };
        Relationships: [];
      };
      feature_flags: {
        Row: { id: string; workspace_id: string; flag: string; enabled: boolean; override_reason: string | null; set_by: string | null; created_at: string; };
        Insert: { id?: string; workspace_id: string; flag: string; enabled?: boolean; override_reason?: string | null; set_by?: string | null; created_at?: string; };
        Update: { enabled?: boolean; override_reason?: string | null; };
        Relationships: [];
      };
      asset_uploads: {
        Row: {
          id:              string;
          workspace_id:    string;
          uploaded_by:     string;
          category:        "logo" | "thumbnail" | "banner";
          storage_path:    string;
          public_url:      string;
          original_name:   string | null;
          mime_type:       string | null;
          size_bytes:      number | null;
          size_bytes_webp: number | null;
          created_at:      string;
        };
        Insert: {
          id?:             string;
          workspace_id:    string;
          uploaded_by:     string;
          category:        "logo" | "thumbnail" | "banner";
          storage_path:    string;
          public_url:      string;
          original_name?:  string | null;
          mime_type?:      string | null;
          size_bytes?:     number | null;
          size_bytes_webp?: number | null;
          created_at?:     string;
        };
        Update: {
          original_name?:  string | null;
          mime_type?:      string | null;
        };
        Relationships: [];
      };
      instagram_accounts: {
        Row: {
          id:               string;
          workspace_id:     string;
          user_id:          string;
          ig_user_id:       string;
          ig_username:      string;
          access_token_enc: string;
          token_expires_at: string | null;
          page_id:          string;
          page_name:        string | null;
          avatar_url:       string | null;
          followers_count:  number;
          connection_state: string;
          last_error:       string | null;
          last_synced_at:   string | null;
          is_active:        boolean;
          created_at:       string;
          updated_at:       string;
        };
        Insert: {
          id?:              string;
          workspace_id:     string;
          user_id:          string;
          ig_user_id:       string;
          ig_username?:     string;
          access_token_enc: string;
          token_expires_at?: string | null;
          page_id:          string;
          page_name?:       string | null;
          avatar_url?:      string | null;
          followers_count?: number;
          connection_state?: string;
          last_error?:      string | null;
          last_synced_at?:  string | null;
          is_active?:       boolean;
          created_at?:      string;
          updated_at?:      string;
        };
        Update: {
          ig_username?:     string;
          access_token_enc?: string;
          token_expires_at?: string | null;
          page_name?:       string | null;
          avatar_url?:      string | null;
          followers_count?: number;
          connection_state?: string;
          last_error?:      string | null;
          last_synced_at?:  string | null;
          is_active?:       boolean;
          updated_at?:      string;
        };
        Relationships: [];
      };
      instagram_contacts: {
        Row: {
          id:           string;
          account_id:   string;
          user_id:      string;
          ig_user_id:   string;
          ig_username:  string | null;
          avatar_url:   string | null;
          last_seen_at: string | null;
          created_at:   string;
        };
        Insert: {
          id?:          string;
          account_id:   string;
          user_id:      string;
          ig_user_id:   string;
          ig_username?:  string | null;
          avatar_url?:  string | null;
          last_seen_at?: string | null;
          created_at?:  string;
        };
        Update: {
          ig_username?:  string | null;
          avatar_url?:  string | null;
          last_seen_at?: string | null;
        };
        Relationships: [];
      };
      instagram_threads: {
        Row: {
          id:              string;
          account_id:      string;
          user_id:         string;
          ig_thread_id:    string;
          ig_contact_id:   string | null;
          conversation_id: string | null;
          updated_at:      string;
          created_at:      string;
        };
        Insert: {
          id?:             string;
          account_id:      string;
          user_id:         string;
          ig_thread_id:    string;
          ig_contact_id?:  string | null;
          conversation_id?: string | null;
          updated_at?:     string;
          created_at?:     string;
        };
        Update: {
          ig_contact_id?:  string | null;
          conversation_id?: string | null;
          updated_at?:     string;
        };
        Relationships: [];
      };
      instagram_messages: {
        Row: {
          id:              string;
          thread_id:       string;
          account_id:      string;
          user_id:         string;
          ig_message_id:   string;
          from_ig_user_id: string;
          from_me:         boolean;
          content:         string | null;
          message_type:    string;
          media_url:       string | null;
          status:          string;
          external_id:     string | null;
          created_at:      string;
        };
        Insert: {
          id?:             string;
          thread_id:       string;
          account_id:      string;
          user_id:         string;
          ig_message_id:   string;
          from_ig_user_id: string;
          from_me?:        boolean;
          content?:        string | null;
          message_type?:   string;
          media_url?:      string | null;
          status?:         string;
          external_id?:    string | null;
          created_at?:     string;
        };
        Update: {
          content?:     string | null;
          status?:      string;
          external_id?: string | null;
          media_url?:   string | null;
        };
        Relationships: [];
      };
      instagram_webhook_events: {
        Row: {
          id:          string;
          event_id:    string;
          event_type:  string;
          account_id:  string;
          raw_payload: Json;
          created_at:  string;
        };
        Insert: {
          id?:         string;
          event_id:    string;
          event_type:  string;
          account_id:  string;
          raw_payload?: Json;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      instagram_comment_events: {
        Row: {
          id:                string;
          account_id:        string;
          user_id:           string;
          ig_comment_id:     string;
          ig_media_id:       string | null;
          media_type:        string | null;
          from_ig_user_id:   string;
          from_username:     string | null;
          content:           string | null;
          parent_comment_id: string | null;
          created_at:        string;
        };
        Insert: {
          id?:               string;
          account_id:        string;
          user_id:           string;
          ig_comment_id:     string;
          ig_media_id?:      string | null;
          media_type?:       string | null;
          from_ig_user_id:   string;
          from_username?:    string | null;
          content?:          string | null;
          parent_comment_id?: string | null;
          created_at?:       string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      // ─── Facebook Messenger ──────────────────────────────────────────────────
      facebook_pages: {
        Row: {
          id:                    string;
          workspace_id:          string;
          user_id:               string;
          page_id:               string;
          page_name:             string | null;
          page_access_token_enc: string;
          is_active:             boolean;
          connected_at:          string;
          updated_at:            string;
        };
        Insert: {
          id?:                    string;
          workspace_id:           string;
          user_id:                string;
          page_id:                string;
          page_name?:             string | null;
          page_access_token_enc:  string;
          is_active?:             boolean;
          connected_at?:          string;
          updated_at?:            string;
        };
        Update: {
          page_name?:             string | null;
          page_access_token_enc?: string;
          is_active?:             boolean;
          updated_at?:            string;
        };
        Relationships: [
          { foreignKeyName: "facebook_pages_workspace_id_fkey"; columns: ["workspace_id"]; referencedRelation: "workspaces"; referencedColumns: ["id"]; },
          { foreignKeyName: "facebook_pages_user_id_fkey";      columns: ["user_id"];      referencedRelation: "users";      referencedColumns: ["id"]; },
        ];
      };
      messenger_webhook_events: {
        Row: {
          id:           string;
          event_id:     string;
          event_type:   string;
          page_id:      string | null;
          raw_payload:  Record<string, unknown>;
          processed_at: string;
        };
        Insert: {
          id?:          string;
          event_id:     string;
          event_type:   string;
          page_id?:     string | null;
          raw_payload?: Record<string, unknown>;
          processed_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      // ─── WhatsApp Cloud API ──────────────────────────────────────────────────
      whatsapp_cloud_accounts: {
        Row: {
          id:              string;
          workspace_id:    string;
          user_id:         string;
          waba_id:         string;
          phone_number_id: string;
          phone_number:    string | null;
          display_name:    string | null;
          access_token:    string;
          token_expires_at: string | null;
          webhook_verify_token: string | null;
          connection_state: string;
          is_active:       boolean;
          created_at:      string;
          updated_at:      string;
        };
        Insert: {
          id?:              string;
          workspace_id:     string;
          user_id:          string;
          waba_id:          string;
          phone_number_id:  string;
          phone_number?:    string | null;
          display_name?:    string | null;
          access_token:     string;
          token_expires_at?: string | null;
          webhook_verify_token?: string | null;
          connection_state?: string;
          is_active?:       boolean;
          created_at?:      string;
          updated_at?:      string;
        };
        Update: {
          phone_number?:    string | null;
          display_name?:    string | null;
          access_token?:    string;
          token_expires_at?: string | null;
          connection_state?: string;
          is_active?:       boolean;
          updated_at?:      string;
        };
        Relationships: [];
      };
      whatsapp_cloud_events: {
        Row: {
          wamid:       string;
          account_id:  string;
          received_at: string;
        };
        Insert: {
          wamid:        string;
          account_id:   string;
          received_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
    };

    Views: Record<string, never>;
    Functions: {
      dashboard_stats: {
        Args: { p_user_id: string };
        Returns: Json;
      };
      increment_unread: {
        Args: { p_id: string };
        Returns: void;
      };
      increment_usage: {
        Args: { p_workspace_id: string; p_field: string; p_amount?: number };
        Returns: void;
      };
      get_user_workspace: {
        Args: { p_user_id: string };
        Returns: string;
      };
      match_conversation_embeddings: {
        Args: {
          p_user_id:         string;
          p_conversation_id: string;
          p_query_embedding: string;
          p_match_count:     number;
          p_exclude_conv:    boolean;
        };
        Returns: Array<{ content: string; similarity: number }>;
      };
    };
    Enums: {
      contact_status: "active" | "inactive" | "blocked";
      conversation_status: "open" | "resolved" | "pending" | "spam";
      campaign_status: "draft" | "scheduled" | "running" | "completed" | "paused";
      automation_status: "active" | "inactive" | "draft";
      agent_role: "admin" | "agent" | "supervisor";
      user_status: "online" | "away" | "offline";
      workspace_role: "owner" | "admin" | "manager" | "agent";
      template_type: "workflow" | "prompt" | "campaign" | "canned_response";
    };
    CompositeTypes: Record<string, never>;
  };
}

// ─── Convenience helpers ───────────────────────────────────────────────────────

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];
