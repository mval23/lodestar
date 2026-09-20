// Hand-written subset of the generated types, covering what Phase 3 uses.
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
          description: string;
        };
        Update: { status?: Database['public']['Enums']['txn_status'] };
        Relationships: [];
      };
    };
    Views: {
      account_balances: {
        Row: {
          user_id: string;
          account_id: string;
          name: string;
          type: Database['public']['Enums']['account_type'];
          is_liability: boolean;
          sort_order: number;
          archived_at: string | null;
          opening_balance_minor: number;
          money_in_minor: number;
          money_out_minor: number;
          balance_minor: number;
          cleared_balance_minor: number;
        };
        Relationships: [];
      };
    };
    Functions: { [_ in never]: never };
    Enums: {
      account_type: 'checking' | 'savings' | 'credit_card' | 'cash' | 'investment' | 'loan' | 'other_asset';
      txn_kind: 'expense' | 'income' | 'transfer';
      txn_status: 'cleared' | 'pending';
      category_kind: 'expense' | 'income';
    };
    CompositeTypes: { [_ in never]: never };
  };
};
