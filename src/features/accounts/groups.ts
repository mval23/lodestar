import type { AccountType } from './queries';

// The open accounts by what they are. The Accounts list and its "What you
// have" bar both use these, so a group reads the same in both places.
export type AccountGroup = { title: string; types: AccountType[] };

export const ASSET_GROUPS: AccountGroup[] = [
  { title: 'Cash', types: ['checking', 'cash'] },
  { title: 'Savings', types: ['savings'] },
  { title: 'Investments', types: ['investment'] },
  { title: 'Owed to you', types: ['other_asset'] },
];

export const ACCOUNT_GROUPS: AccountGroup[] = [...ASSET_GROUPS, { title: 'Cards and loans', types: ['credit_card', 'loan'] }];
