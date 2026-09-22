// What a backup holds and how it goes back, kept apart from the network so
// every rule here can be tested without a project to talk to.
//
// The free tier takes no backups, so this is the only one there is
// (docs/phase-10/production.md).

export const FORMAT = 'lodestar-backup-1';

// Restore order is dependency order: a row is never written before the rows
// it points at. Each table lists the columns the database lets an ordinary
// signed-in person insert, which is why a restore can keep its ids.
// scripts/backup/plan.test.mjs checks these against the migrations.
export const TABLES = [
  { name: 'category_groups', columns: ['id', 'name', 'sort_order'] },
  { name: 'accounts', columns: ['id', 'name', 'type', 'opening_balance_minor', 'opening_date', 'sort_order', 'archived_at', 'source_ref'] },
  { name: 'categories', columns: ['id', 'group_id', 'name', 'kind', 'sort_order', 'archived_at', 'source_ref'] },
  { name: 'import_batches', columns: ['id', 'source', 'filename', 'row_count'] },
  {
    name: 'recurring_items',
    columns: ['id', 'name', 'label', 'kind', 'amount_minor', 'amount_is_variable', 'from_account_id', 'to_account_id',
      'category_id', 'cadence_unit', 'cadence_interval', 'anchor_on', 'next_due_on', 'ends_on', 'archived_at'],
  },
  { name: 'goals', columns: ['id', 'account_id', 'name', 'target_minor', 'target_date', 'monthly_plan_minor', 'sort_order', 'achieved_at', 'archived_at'] },
  { name: 'budgets', columns: ['id', 'category_id', 'month', 'amount_minor'] },
  {
    name: 'transactions',
    columns: ['id', 'kind', 'occurred_on', 'amount_minor', 'from_account_id', 'to_account_id', 'category_id',
      'description', 'notes', 'recurring_item_id', 'import_batch_id', 'source_ref', 'created_at'],
  },
];

// The profile already exists in any account: the sign-up trigger makes it.
// A restore puts its settings back rather than inserting a row.
export const PROFILE_COLUMNS = ['display_name', 'currency', 'timezone', 'week_start'];

// audit_events is left out on purpose: it is a security log, nobody may
// insert into it, and it says nothing about your money.

export function tableNames() {
  return TABLES.map((table) => table.name);
}

// Only the columns a restore can write. Anything else the API returns
// (user_id, updated_at, generated columns) is dropped here, so a backup file
// holds what it can put back and not a row of noise.
export function pickRow(table, row) {
  const columns = TABLES.find((entry) => entry.name === table)?.columns ?? [];
  const out = {};
  for (const column of columns) {
    if (row[column] !== undefined) out[column] = row[column];
  }
  return out;
}

export function makeBackup({ rows, profile, takenAt, project, userId }) {
  const tables = {};
  for (const { name } of TABLES) tables[name] = (rows[name] ?? []).map((row) => pickRow(name, row));
  return {
    format: FORMAT,
    taken_at: takenAt,
    // Which project and account it came from, so a restore can say when it is
    // about to put one person's data into another's account.
    project,
    user_id: userId,
    profile: profile ? pick(profile, PROFILE_COLUMNS) : null,
    counts: Object.fromEntries(Object.entries(tables).map(([name, list]) => [name, list.length])),
    tables,
  };
}

function pick(row, columns) {
  const out = {};
  for (const column of columns) if (row[column] !== undefined) out[column] = row[column];
  return out;
}

export function readBackup(text) {
  let file;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error('That file is not a Lodestar backup: it is not JSON.');
  }
  if (file?.format !== FORMAT) {
    throw new Error(`That file is not a Lodestar backup (format ${String(file?.format ?? 'missing')}).`);
  }
  for (const { name } of TABLES) {
    if (!Array.isArray(file.tables?.[name])) throw new Error(`The backup is missing its ${name}.`);
  }
  return file;
}

// A restore writes into an empty account, so nothing can collide with what is
// already there and no id has to be rewritten.
export function emptinessProblem(counts) {
  const holding = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([table, count]) => `${count} ${table.replace(/_/g, ' ')}`);
  if (holding.length === 0) return null;
  return `This account already holds ${holding.join(', ')}. Restore into an empty account: delete this one in Settings, sign up again, and run the restore then.`;
}

// Compares what was restored with what the backup holds, column by column,
// ignoring the order rows came back in.
export function compare(backup, actual) {
  const problems = [];
  for (const { name } of TABLES) {
    const wanted = [...(backup.tables[name] ?? [])].sort(byId);
    const got = [...(actual[name] ?? [])].map((row) => pickRow(name, row)).sort(byId);
    if (wanted.length !== got.length) {
      problems.push(`${name}: ${wanted.length} in the backup, ${got.length} restored`);
      continue;
    }
    const differing = wanted.filter((row, index) => JSON.stringify(row) !== JSON.stringify(got[index]));
    if (differing.length > 0) {
      problems.push(`${name}: ${differing.length} of ${wanted.length} rows came back different`);
    }
  }
  return problems;
}

function byId(a, b) {
  return String(a.id).localeCompare(String(b.id));
}

// Rows go in batches: one statement per few hundred rows rather than per row.
export function chunk(rows, size = 500) {
  const out = [];
  for (let at = 0; at < rows.length; at += size) out.push(rows.slice(at, at + size));
  return out;
}

// The insert grants in the migrations, as the database has them. The test
// reads these and holds the lists above to them.
export function insertGrants(sql) {
  const grants = {};
  const pattern = /grant\s+insert\s*\(([^)]*)\)\s*(?:\n\s*)?on\s+public\.([a-z_]+)/gis;
  for (const match of sql.matchAll(pattern)) {
    const columns = match[1]
      .split(',')
      .map((column) => column.trim())
      .filter(Boolean);
    grants[match[2]] = columns;
  }
  return grants;
}
