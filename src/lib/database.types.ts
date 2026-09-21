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
      budgets: {
        Row: {
          id: string;
          user_id: string;
          category_id: string;
          category_kind: 'expense';
          month: string;
          amount_minor: number;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; category_id: string; month: string; amount_minor: number };
        Update: { amount_minor?: number; month?: string; category_id?: string };
        Relationships: [];
      };
      goals: {
        Row: {
          id: string;
          user_id: string;
          account_id: string;
          name: string;
          target_minor: number | null;
          target_date: string | null;
          monthly_plan_minor: number | null;
          sort_order: number;
          achieved_at: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          name: string;
          target_minor?: number | null;
          target_date?: string | null;
          monthly_plan_minor?: number | null;
          sort_order?: number;
          achieved_at?: string | null;
          archived_at?: string | null;
        };
        Update: {
          account_id?: string;
          name?: string;
          target_minor?: number | null;
          target_date?: string | null;
          monthly_plan_minor?: number | null;
          sort_order?: number;
          achieved_at?: string | null;
          archived_at?: string | null;
        };
        Relationships: [];
      };
      import_batches: {
        Row: {
          id: string;
          user_id: string;
          source: 'csv' | 'notion';
          filename: string | null;
          row_count: number;
          status: 'imported' | 'reconciled';
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; source: 'csv' | 'notion'; filename?: string | null; row_count: number };
        Update: { status?: 'imported' | 'reconciled' };
        Relationships: [];
      };
      recurring_items: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          label: Database['public']['Enums']['recurring_label'];
          kind: Database['public']['Enums']['txn_kind'];
          amount_minor: number;
          amount_is_variable: boolean;
          from_account_id: string | null;
          to_account_id: string | null;
          category_id: string | null;
          category_kind: Database['public']['Enums']['category_kind'] | null;
          cadence_unit: Database['public']['Enums']['cadence_unit'];
          cadence_interval: number;
          anchor_on: string;
          next_due_on: string;
          ends_on: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          label: Database['public']['Enums']['recurring_label'];
          kind: Database['public']['Enums']['txn_kind'];
          amount_minor: number;
          amount_is_variable?: boolean;
          from_account_id?: string | null;
          to_account_id?: string | null;
          category_id?: string | null;
          cadence_unit: Database['public']['Enums']['cadence_unit'];
          cadence_interval?: number;
          anchor_on: string;
          next_due_on: string;
          ends_on?: string | null;
          archived_at?: string | null;
        };
        Update: {
          name?: string;
          label?: Database['public']['Enums']['recurring_label'];
          kind?: Database['public']['Enums']['txn_kind'];
          amount_minor?: number;
          amount_is_variable?: boolean;
          from_account_id?: string | null;
          to_account_id?: string | null;
          category_id?: string | null;
          cadence_unit?: Database['public']['Enums']['cadence_unit'];
          cadence_interval?: number;
          anchor_on?: string;
          next_due_on?: string;
          ends_on?: string | null;
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
      budget_progress: {
        Row: {
          user_id: string | null;
          budget_id: string | null;
          category_id: string | null;
          category_name: string | null;
          group_id: string | null;
          month: string | null;
          planned_minor: number | null;
          spent_minor: number | null;
          left_minor: number | null;
        };
        Relationships: [];
      };
      goal_progress: {
        Row: {
          user_id: string | null;
          goal_id: string | null;
          account_id: string | null;
          name: string | null;
          target_minor: number | null;
          target_date: string | null;
          monthly_plan_minor: number | null;
          sort_order: number | null;
          achieved_at: string | null;
          archived_at: string | null;
          balance_minor: number | null;
          remaining_minor: number | null;
          this_month: string | null;
          this_month_contributed_minor: number | null;
        };
        Relationships: [];
      };
      monthly_cash_flow: {
        Row: {
          user_id: string | null;
          month: string | null;
          money_in_minor: number | null;
          money_out_minor: number | null;
          net_minor: number | null;
        };
        Relationships: [];
      };
      net_worth_by_month: {
        Row: {
          user_id: string | null;
          month: string | null;
          assets_minor: number | null;
          liabilities_minor: number | null;
          net_worth_minor: number | null;
        };
        Relationships: [];
      };
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
      account_month_flow: {
        Row: {
          user_id: string | null;
          account_id: string | null;
          month: string | null;
          income_minor: number | null;
          income_count: number | null;
          expense_minor: number | null;
          expense_count: number | null;
          transfer_in_minor: number | null;
          transfer_in_count: number | null;
          transfer_out_minor: number | null;
          transfer_out_count: number | null;
          net_minor: number | null;
          closing_balance_minor: number | null;
        };
        Relationships: [];
      };
      account_ledger: {
        Row: {
          user_id: string | null;
          account_id: string | null;
          transaction_id: string | null;
          kind: Database['public']['Enums']['txn_kind'] | null;
          status: Database['public']['Enums']['txn_status'] | null;
          occurred_on: string | null;
          created_at: string | null;
          signed_amount_minor: number | null;
          description: string | null;
          category_id: string | null;
          from_account_id: string | null;
          to_account_id: string | null;
          balance_after_minor: number | null;
        };
        Relationships: [];
      };
      category_month_totals: {
        Row: {
          user_id: string | null;
          category_id: string | null;
          kind: Database['public']['Enums']['category_kind'] | null;
          month: string | null;
          total_minor: number | null;
          txn_count: number | null;
        };
        Relationships: [];
      };
      month_summary: {
        Row: {
          user_id: string | null;
          month: string | null;
          income_minor: number | null;
          income_count: number | null;
          expense_minor: number | null;
          expense_count: number | null;
          transfer_minor: number | null;
          transfer_count: number | null;
          to_goals_minor: number | null;
          net_minor: number | null;
        };
        Relationships: [];
      };
      recurring_item_months: {
        Row: {
          user_id: string | null;
          recurring_item_id: string | null;
          month: string | null;
          paid_minor: number | null;
          payment_count: number | null;
          last_paid_on: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      category_top_descriptions: {
        Args: { p_category_id: string; p_from: string; p_to: string; p_limit?: number };
        Returns: { description: string; total_minor: number; txn_count: number }[];
      };
      copy_budgets: {
        Args: { p_from_month: string; p_to_month: string };
        Returns: number;
      };
      import_transactions: {
        Args: { p_batch: Json; p_rows: Json };
        Returns: { batch_id: string; inserted_count: number; duplicate_count: number }[];
      };
      log_event: {
        Args: {
          p_event: 'export' | 'import' | 'bulk_delete' | 'account_delete_requested';
          p_subject_id?: string | null;
          p_row_count?: number | null;
        };
        Returns: undefined;
      };
      mark_bill_paid: {
        Args: { p_item_id: string; p_paid_on?: string; p_amount_minor?: number };
        Returns: { transaction_id: string; next_due_on: string }[];
      };
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
      cadence_unit: 'week' | 'month' | 'year';
      recurring_label: 'bill' | 'subscription' | 'income' | 'transfer';
    };
    CompositeTypes: { [_ in never]: never };
  };
};
