// Reading the Notion hub, once, on the owner's machine.
//
// Notion is read-only here and always: this file only ever queries. The token
// comes from the environment, is never written to disk by this script, and is
// revoked after cutover. The extract is written to a local file that .gitignore
// keeps out of the repository, because it holds real financial data.

import { Client } from '@notionhq/client';

/** Plain text out of a Notion rich-text or title property. */
function textOf(property) {
  if (!property) return '';
  const parts = property.title ?? property.rich_text ?? [];
  return parts.map((part) => part.plain_text ?? '').join('').trim();
}

function numberOf(property) {
  return property && typeof property.number === 'number' ? property.number : null;
}

function selectOf(property) {
  return property?.select?.name ?? null;
}

function dateOf(property) {
  return property?.date?.start ? property.date.start.slice(0, 10) : null;
}

function relationOf(property) {
  const relations = property?.relation ?? [];
  return relations.length > 0 ? relations[0].id : null;
}

function multiOf(property) {
  if (property?.multi_select) return property.multi_select.map((option) => option.name);
  const single = selectOf(property);
  return single ? [single] : [];
}

/**
 * A database id is not a data source id. Notion's current API holds the rows
 * in one or more data sources inside the database, and the query wants their
 * ids, so they are looked up first. Older clients queried the database
 * directly, which is kept as a fallback.
 */
async function dataSourceIdsFor(notion, databaseId) {
  if (typeof notion.databases?.retrieve !== 'function') return [databaseId];
  const database = await notion.databases.retrieve({ database_id: databaseId });
  const sources = Array.isArray(database.data_sources) ? database.data_sources : [];
  return sources.length > 0 ? sources.map((source) => source.id) : [databaseId];
}

/** Every page of a database, following Notion's cursor. */
async function queryAll(notion, databaseId) {
  const pages = [];
  for (const dataSourceId of await dataSourceIdsFor(notion, databaseId)) {
    let cursor;
    do {
      const response =
        typeof notion.dataSources?.query === 'function'
          ? await notion.dataSources.query({ data_source_id: dataSourceId, start_cursor: cursor, page_size: 100 })
          : await notion.databases.query({ database_id: dataSourceId, start_cursor: cursor, page_size: 100 });
      pages.push(...response.results);
      cursor = response.has_more ? response.next_cursor : undefined;
    } while (cursor);
  }
  return pages;
}

/**
 * Pulls the three databases of the active hub. Property names are passed in
 * rather than guessed, because Notion lets them be renamed and a wrong guess
 * would silently migrate nothing.
 */
export async function extract({ token, accountsDb, categoriesDb, transactionsDb, properties, client }) {
  // The client is injectable so the shape of what comes back can be tested
  // without a token and without touching anyone's Notion.
  const notion = client ?? new Client({ auth: token });
  const p = {
    account_name: 'Name',
    account_type: 'Account Type',
    account_starting_balance: 'Starting Balance',
    category_name: 'Category',
    category_group: 'Type',
    category_budget: 'Budget',
    txn_description: 'Description',
    txn_amount: 'Amount',
    txn_date: 'Date',
    txn_source: 'Source',
    txn_destination: 'Destination',
    txn_category: 'Category',
    txn_tags: 'tag',
    txn_notes: 'Notes',
    ...properties,
  };

  const [accountPages, categoryPages, transactionPages] = await Promise.all([
    queryAll(notion, accountsDb),
    queryAll(notion, categoriesDb),
    queryAll(notion, transactionsDb),
  ]);

  return {
    extracted_at: new Date().toISOString(),
    accounts: accountPages.map((page) => ({
      id: page.id,
      name: textOf(page.properties[p.account_name]),
      type: selectOf(page.properties[p.account_type]),
      starting_balance: numberOf(page.properties[p.account_starting_balance]),
    })),
    categories: categoryPages.map((page) => ({
      id: page.id,
      name: textOf(page.properties[p.category_name]),
      group: selectOf(page.properties[p.category_group]),
      budget: numberOf(page.properties[p.category_budget]),
    })),
    transactions: transactionPages.map((page) => ({
      id: page.id,
      description: textOf(page.properties[p.txn_description]),
      amount: numberOf(page.properties[p.txn_amount]),
      date: dateOf(page.properties[p.txn_date]),
      source_id: relationOf(page.properties[p.txn_source]),
      destination_id: relationOf(page.properties[p.txn_destination]),
      category_id: relationOf(page.properties[p.txn_category]),
      tags: multiOf(page.properties[p.txn_tags]),
      notes: textOf(page.properties[p.txn_notes]),
    })),
  };
}
