// Reading a whole account out, and putting one back. Takes a signed-in
// client, so the same code runs against a real project and against the
// stand-in PostgREST in runner.test.mjs.

import { chunk, compare, emptinessProblem, makeBackup, PROFILE_COLUMNS, TABLES } from './plan.mjs';

// PostgREST answers at most a page at a time, so every table is read in pages
// until a short one ends it. Ordered by id, so the pages cannot overlap or
// skip a row as they are read.
export const PAGE = 1000;

export async function readAll(supabase, table, { page = PAGE } = {}) {
  const rows = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase.from(table).select('*').order('id').range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < page) return rows;
  }
}

export async function readEverything(supabase, { onProgress = () => {}, page = PAGE } = {}) {
  const rows = {};
  for (const { name } of TABLES) {
    rows[name] = await readAll(supabase, name, { page });
    onProgress(name, rows[name].length);
  }
  return rows;
}

export async function createBackup(supabase, { takenAt, project, userId, onProgress, page } = {}) {
  const rows = await readEverything(supabase, { onProgress, page });
  const { data: profile, error } = await supabase.from('profiles').select('*').maybeSingle();
  if (error) throw new Error(`profile: ${error.message}`);
  return makeBackup({ rows, profile, takenAt: takenAt ?? new Date().toISOString(), project, userId });
}

export async function countRows(supabase) {
  const counts = {};
  for (const { name } of TABLES) {
    const { count, error } = await supabase.from(name).select('id', { count: 'exact', head: true });
    if (error) throw new Error(`${name}: ${error.message}`);
    counts[name] = count ?? 0;
  }
  return counts;
}

// Writes a backup into an empty account. Refuses one that holds anything, so
// nothing can collide and no id has to be rewritten.
export async function restoreBackup(supabase, file, { userId, onProgress = () => {}, page } = {}) {
  const problem = emptinessProblem(await countRows(supabase));
  if (problem) throw new Error(problem);

  // The profile first: currency can only be set while there are no
  // transactions, and every amount below is in that currency.
  if (file.profile) {
    const changes = {};
    for (const column of PROFILE_COLUMNS) if (file.profile[column] !== undefined) changes[column] = file.profile[column];
    const { error } = await supabase.from('profiles').update(changes).eq('id', userId);
    if (error) throw new Error(`profile: ${error.message}`);
  }

  // In dependency order, so a row is never written before what it points at.
  for (const { name } of TABLES) {
    const rows = file.tables[name] ?? [];
    let written = 0;
    for (const batch of chunk(rows)) {
      const { error } = await supabase.from(name).insert(batch);
      if (error) throw new Error(`${name}: ${error.message}`);
      written += batch.length;
      onProgress(name, written);
    }
    if (rows.length === 0) onProgress(name, 0);
  }

  return compare(file, await readEverything(supabase, { page }));
}

export async function verifyBackup(supabase, file, { page } = {}) {
  return compare(file, await readEverything(supabase, { page }));
}
