// Hand-written subset of the generated types, covering what the app uses today.
// Regenerate the full file with `npm run db:types` (needs `supabase start`).
// CI regenerates it from the migrations and type-checks the app against it.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      currencies: {
        Row: { code: string; name: string; exponent: number; created_at: string; updated_at: string };
        Insert: { code: string; name: string; exponent: number; created_at?: string; updated_at?: string };
        Update: { code?: string; name?: string; exponent?: number; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          currency: string;
          timezone: string;
          week_start: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          display_name?: string | null;
          currency?: string;
          timezone?: string;
          week_start?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          currency?: string;
          timezone?: string;
          week_start?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      accounts: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          type: Database['public']['Enums']['account_type'];
          opening_balance_minor: number;
          opening_date: string | null;
          sort_order: number;
          archived_at: string | null;
          source_ref: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          type: Database['public']['Enums']['account_type'];
          opening_balance_minor?: number;
          opening_date?: string | null;
          sort_order?: number;
          archived_at?: string | null;
          source_ref?: string | null;
        };
        Update: {
          name?: string;
          type?: Database['public']['Enums']['account_type'];
          opening_balance_minor?: number;
          opening_date?: string | null;
          sort_order?: number;
          archived_at?: string | null;
        };
        Relationships: [];
      };
      category_groups: {
        Row: { id: string; user_id: string; name: string; sort_order: number; created_at: string; updated_at: string };
        Insert: { id?: string; name: string; sort_order?: number };
        Update: { name?: string; sort_order?: number };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          user_id: string;
          group_id: string | null;
          name: string;
          kind: Database['public']['Enums']['category_kind'];
          sort_order: number;
          archived_at: string | null;
          source_ref: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          group_id?: string | null;
          name: string;
          kind: Database['public']['Enums']['category_kind'];
          sort_order?: number;
          archived_at?: string | null;
          source_ref?: string | null;
        };
        Update: {
          group_id?: string | null;
          name?: string;
          kind?: Database['public']['Enums']['category_kind'];
          sort_order?: number;
          archived_at?: string | null;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          kind: Database['public']['Enums']['txn_kind'];
          occurred_on: string;
          amount_minor: number;
          from_account_id: string | null;
          to_account_id: string | null;
          category_id: string | null;
          category_kind: Database['public']['Enums']['category_kind'] | null;
          description: string;
          notes: string | null;
          status: Database['public']['Enums']['txn_status'];
          recurring_item_id: string | null;
          import_batch_id: string | null;
          source_ref: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          kind: Database['public']['Enums']['txn_kind'];
          occurred_on: string;
          amount_minor: number;
          from_account_id?: string | null;
          to_account_id?: string | null;
          category_id?: string | null;
          description: string;
          notes?: string | null;
          status?: Database['public']['Enums']['txn_status'];
          recurring_item_id?: string | null;
          import_batch_id?: string | null;
          source_ref?: string | null;
        };
        Update: {
          kind?: Database['public']['Enums']['txn_kind'];
          occurred_on?: string;
          amount_minor?: number;
          from_account_id?: string | null;
          to_account_id?: string | null;
          category_id?: string | null;
          description?: string;
          notes?: string | null;
          status?: Database['public']['Enums']['txn_status'];
        };
        Relationships: [];
      };
    };
    Views: {
      category_usage: {
        Row: {
          user_id: string | null;
          category_id: string | null;
          kind: Database['public']['Enums']['category_kind'] | null;
          last_used_at: string | null;
          use_count: number | null;
        };
        Relationships: [];
      };
      // Every column of a view is nullable in the generated types: Postgres
      // cannot prove otherwise through a view. The queries normalize.
      account_balances: {
        Row: {
          user_id: string | null;
          account_id: string | null;
          name: string | null;
          type: Database['public']['Enums']['account_type'] | null;
          is_liability: boolean | null;
          sort_order: number | null;
          archived_at: string | null;
          opening_balance_minor: number | null;
          money_in_minor: number | null;
          money_out_minor: number | null;
          balance_minor: number | null;
          cleared_balance_minor: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      merge_categories: {
        Args: { p_source_id: string; p_target_id: string };
        Returns: number;
      };
    };
    Enums: {
      account_type: 'checking' | 'savings' | 'credit_card' | 'cash' | 'investment' | 'loan' | 'other_asset';
      txn_kind: 'expense' | 'income' | 'transfer';
      txn_status: 'cleared' | 'pending';
      category_kind: 'expense' | 'income';
    };
    CompositeTypes: { [_ in never]: never };
  };
};
