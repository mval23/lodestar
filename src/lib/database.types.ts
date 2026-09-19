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
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      txn_kind: 'expense' | 'income' | 'transfer';
      txn_status: 'cleared' | 'pending';
      category_kind: 'expense' | 'income';
    };
    CompositeTypes: { [_ in never]: never };
  };
};
