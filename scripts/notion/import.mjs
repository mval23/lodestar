// Writing the plan into Lodestar, as the owner.
//
// This signs in with the owner's own email and password and uses the JWT that
// comes back, so every insert passes through Row Level Security exactly as it
// would from the app. The service-role key is never used here, and is not
// available to this script by design.

import { createClient } from '@supabase/supabase-js';

export async function signIn({ url, publishableKey, email, password }) {
  const supabase = createClient(url, publishableKey, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Could not sign in: ${error.message}`);
  return { supabase, userId: data.user.id };
}

const CHUNK = 500;

/**
 * Applies a plan. Accounts, categories, groups and goals are ordinary
 * inserts; transactions go through import_transactions, which is one database
 * transaction per call, skips anything already imported by its source_ref,
 * and writes the audit event itself.
 *
 * Returns the ids needed to undo: delete the batches and the rows go with
 * them.
 */
export async function applyPlan(supabase, plan, { onProgress = () => {} } = {}) {
  const accountIdByNotionId = new Map();
  const categoryIdByNotionId = new Map();
  const groupIdByName = new Map();
  const batches = [];

  onProgress(`Creating ${plan.groups.length} category groups…`);
  for (const name of plan.groups) {
    const { data, error } = await supabase.from('category_groups').insert({ name }).select('id').single();
    if (error) throw new Error(`Category group "${name}": ${error.message}`);
    groupIdByName.set(name, data.id);
  }

  onProgress(`Creating ${plan.accounts.length} accounts…`);
  for (const account of plan.accounts) {
    const { data, error } = await supabase
      .from('accounts')
      .insert({
        name: account.name,
        type: account.type,
        opening_balance_minor: account.opening_balance_minor,
        source_ref: account.source_ref,
      })
      .select('id')
      .single();
    if (error) throw new Error(`Account "${account.name}": ${error.message}`);
    accountIdByNotionId.set(account.notion_id, data.id);
  }

  onProgress(`Creating ${plan.categories.length} categories…`);
  for (const category of plan.categories) {
    const { data, error } = await supabase
      .from('categories')
      .insert({
        name: category.name,
        kind: category.kind,
        group_id: category.group ? (groupIdByName.get(category.group) ?? null) : null,
        source_ref: category.source_ref,
      })
      .select('id')
      .single();
    if (error) throw new Error(`Category "${category.name}": ${error.message}`);
    categoryIdByNotionId.set(category.notion_id, data.id);
  }

  onProgress(`Creating ${plan.goals.length} goals…`);
  for (const goal of plan.goals) {
    const accountId = accountIdByNotionId.get(goal.account_notion_id);
    if (!accountId) continue;
    const { error } = await supabase.from('goals').insert({
      account_id: accountId,
      name: goal.name,
      monthly_plan_minor: goal.monthly_plan_minor ?? null,
    });
    if (error) throw new Error(`Goal "${goal.name}": ${error.message}`);
  }

  if (plan.budgets.length > 0) {
    // Notion holds one budget per category with no month attached, so it
    // becomes this month's plan; earlier months had no stored plan to carry.
    const month = `${new Date().toISOString().slice(0, 7)}-01`;
    onProgress(`Setting ${plan.budgets.length} budgets for ${month}…`);
    for (const budget of plan.budgets) {
      const categoryId = categoryIdByNotionId.get(budget.category_notion_id);
      if (!categoryId) continue;
      const { error } = await supabase
        .from('budgets')
        .insert({ category_id: categoryId, month, amount_minor: budget.amount_minor });
      if (error) throw new Error(`Budget for category ${budget.category_notion_id}: ${error.message}`);
    }
  }

  const rows = plan.transactions.map((row) => ({
    kind: row.kind,
    occurred_on: row.occurred_on,
    amount_minor: row.amount_minor,
    from_account_id: row.from_account_notion_id ? accountIdByNotionId.get(row.from_account_notion_id) : null,
    to_account_id: row.to_account_notion_id ? accountIdByNotionId.get(row.to_account_notion_id) : null,
    category_id: row.category_notion_id ? (categoryIdByNotionId.get(row.category_notion_id) ?? null) : null,
    description: row.description,
    notes: row.notes,
    status: row.status,
    source_ref: row.source_ref,
  }));

  for (let start = 0; start < rows.length; start += CHUNK) {
    const chunk = rows.slice(start, start + CHUNK);
    onProgress(`Importing transactions ${start + 1}–${start + chunk.length} of ${rows.length}…`);
    const { data, error } = await supabase.rpc('import_transactions', {
      p_batch: { source: 'notion', filename: `notion-${start / CHUNK + 1}` },
      p_rows: chunk,
    });
    if (error) throw new Error(`Import failed at row ${start + 1}: ${error.message}`);
    const result = Array.isArray(data) ? data[0] : data;
    batches.push(result);
  }

  return {
    batches,
    inserted: batches.reduce((total, batch) => total + (batch?.inserted_count ?? 0), 0),
    duplicates: batches.reduce((total, batch) => total + (batch?.duplicate_count ?? 0), 0),
    accountIdByNotionId,
  };
}

/** What Lodestar now reports, for the reconciliation. */
export async function readBalances(supabase) {
  const { data, error } = await supabase.from('account_balances').select('name, balance_minor');
  if (error) throw new Error(`Could not read balances: ${error.message}`);
  return data.map((row) => ({ name: row.name ?? '', balance_minor: row.balance_minor ?? 0 }));
}

export async function readMonthlyTotals(supabase) {
  const { data, error } = await supabase.from('monthly_cash_flow').select('month, money_in_minor, money_out_minor');
  if (error) throw new Error(`Could not read monthly totals: ${error.message}`);
  return data
    .map((row) => ({
      month: (row.month ?? '').slice(0, 10),
      money_in_minor: row.money_in_minor ?? 0,
      money_out_minor: row.money_out_minor ?? 0,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/** Rollback: deleting a batch cascades to every transaction it created. */
export async function undo(supabase, batchIds) {
  for (const id of batchIds) {
    const { error } = await supabase.from('import_batches').delete().eq('id', id);
    if (error) throw new Error(`Could not undo batch ${id}: ${error.message}`);
  }
}
