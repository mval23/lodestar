import { guessMap, parseCsvAmount, parseCsvDate, prepareRows, sourceRef, toCsv, type ColumnMap } from './csv';

describe('parseCsvDate', () => {
  it('reads an ISO date without needing the chosen order', () => {
    expect(parseCsvDate('2026-09-19', 'mdy')).toBe('2026-09-19');
    expect(parseCsvDate('2026-09-19', 'dmy')).toBe('2026-09-19');
  });

  it('honours the order for the ambiguous ones', () => {
    // The whole reason the wizard asks: this is Sep 3 or Mar 9.
    expect(parseCsvDate('03/09/2026', 'dmy')).toBe('2026-09-03');
    expect(parseCsvDate('03/09/2026', 'mdy')).toBe('2026-03-09');
  });

  it('accepts the separators banks actually use', () => {
    expect(parseCsvDate('19-09-2026', 'dmy')).toBe('2026-09-19');
    expect(parseCsvDate('19.09.2026', 'dmy')).toBe('2026-09-19');
    expect(parseCsvDate('9/19/26', 'mdy')).toBe('2026-09-19');
  });

  it('refuses a date that does not exist, rather than rolling it over', () => {
    expect(parseCsvDate('31/02/2026', 'dmy')).toBeUndefined();
    expect(parseCsvDate('13/13/2026', 'dmy')).toBeUndefined();
    expect(parseCsvDate('', 'dmy')).toBeUndefined();
    expect(parseCsvDate('yesterday', 'dmy')).toBeUndefined();
  });

  it('keeps a leap day that does exist', () => {
    expect(parseCsvDate('29/02/2028', 'dmy')).toBe('2028-02-29');
    expect(parseCsvDate('29/02/2027', 'dmy')).toBeUndefined();
  });
});

describe('parseCsvAmount', () => {
  it('reads the three ways a bank writes money out', () => {
    expect(parseCsvAmount('-45.50', 'USD')).toEqual({ minor: 4550, outgoing: true });
    expect(parseCsvAmount('(45.50)', 'USD')).toEqual({ minor: 4550, outgoing: true });
    expect(parseCsvAmount('−45.50', 'USD')).toEqual({ minor: 4550, outgoing: true });
  });

  it('reads money in', () => {
    expect(parseCsvAmount('1,234.50', 'USD')).toEqual({ minor: 123450, outgoing: false });
    expect(parseCsvAmount('+120', 'USD')).toEqual({ minor: 12000, outgoing: false });
  });

  it('refuses zero and anything unreadable, instead of importing a wrong number', () => {
    expect(parseCsvAmount('0', 'USD')).toHaveProperty('error');
    expect(parseCsvAmount('', 'USD')).toHaveProperty('error');
    expect(parseCsvAmount('n/a', 'USD')).toHaveProperty('error');
    expect(parseCsvAmount('10.005', 'USD')).toHaveProperty('error');
  });
});

describe('sourceRef', () => {
  const base = {
    accountId: 'acc-1',
    occurredOn: '2026-09-19',
    amountMinor: 4550,
    description: 'Market',
    outgoing: true,
    occurrence: 1,
  };

  it('is stable for the same row', () => {
    expect(sourceRef(base)).toBe(sourceRef({ ...base }));
    // Case and spacing in the description must not create a new identity.
    expect(sourceRef({ ...base, description: '  MARKET  ' })).toBe(sourceRef(base));
  });

  it('separates two identical purchases on the same day', () => {
    expect(sourceRef({ ...base, occurrence: 2 })).not.toBe(sourceRef(base));
  });

  it('separates the same row in another account, or the other direction', () => {
    expect(sourceRef({ ...base, accountId: 'acc-2' })).not.toBe(sourceRef(base));
    expect(sourceRef({ ...base, outgoing: false })).not.toBe(sourceRef(base));
  });

  it('stays inside the column limit', () => {
    expect(sourceRef({ ...base, description: 'x'.repeat(500) }).length).toBeLessThanOrEqual(200);
  });
});

describe('guessMap', () => {
  it('recognises common headers, in English and Spanish', () => {
    expect(guessMap(['Date', 'Description', 'Amount'])).toMatchObject({
      date: 'Date',
      description: 'Description',
      amount: 'Amount',
    });
    expect(guessMap(['Fecha', 'Concepto', 'Valor'])).toMatchObject({
      date: 'Fecha',
      description: 'Concepto',
      amount: 'Valor',
    });
  });

  it('spots a split debit and credit file', () => {
    const map = guessMap(['Posted Date', 'Payee', 'Debit', 'Credit']);
    expect(map.amount).toBe('Debit');
    expect(map.amountIn).toBe('Credit');
  });

  it('leaves what it cannot recognise empty, rather than guessing wrong', () => {
    expect(guessMap(['col1', 'col2'])).toMatchObject({ date: '', description: '', amount: '' });
  });
});

describe('prepareRows', () => {
  const map: ColumnMap = { date: 'Date', description: 'Description', amount: 'Amount', amountIn: '', notes: '', category: '' };
  const options = {
    map,
    dateOrder: 'dmy' as const,
    currency: 'USD' as const,
    accountId: 'acc-1',
    allOutgoing: false,
    categoryIdByName: new Map([['groceries', 'cat-1']]),
  };

  it('turns a signed file into expenses and income', () => {
    const { rows, problems } = prepareRows({
      ...options,
      rows: [
        { Date: '19/09/2026', Description: 'Market', Amount: '-45.50' },
        { Date: '20/09/2026', Description: 'Salary', Amount: '2500.00' },
      ],
    });

    expect(problems).toEqual([]);
    expect(rows[0]!.row).toMatchObject({
      kind: 'expense',
      occurred_on: '2026-09-19',
      amount_minor: 4550,
      from_account_id: 'acc-1',
      to_account_id: null,
      description: 'Market',
    });
    expect(rows[1]!.row).toMatchObject({ kind: 'income', amount_minor: 250000, to_account_id: 'acc-1', from_account_id: null });
  });

  it('reports the line number of a row it cannot read, and keeps the rest', () => {
    const { rows, problems } = prepareRows({
      ...options,
      rows: [
        { Date: '19/09/2026', Description: 'Market', Amount: '-45.50' },
        { Date: '31/02/2026', Description: 'Impossible', Amount: '-10.00' },
        { Date: '21/09/2026', Description: 'No amount', Amount: '' },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(problems.map((p) => p.line)).toEqual([3, 4]);
    expect(problems[0]!.message).toContain('can’t be read');
  });

  it('uses a split debit and credit pair when the file has one', () => {
    const { rows } = prepareRows({
      ...options,
      map: { ...map, amount: 'Debit', amountIn: 'Credit' },
      rows: [
        { Date: '19/09/2026', Description: 'Market', Debit: '45.50', Credit: '' },
        { Date: '20/09/2026', Description: 'Salary', Debit: '', Credit: '2500.00' },
      ],
    });
    expect(rows[0]!.row.kind).toBe('expense');
    expect(rows[1]!.row.kind).toBe('income');
  });

  it('refuses a row where both sides of a split pair are filled', () => {
    const { problems } = prepareRows({
      ...options,
      map: { ...map, amount: 'Debit', amountIn: 'Credit' },
      rows: [{ Date: '19/09/2026', Description: 'Both', Debit: '10.00', Credit: '5.00' }],
    });
    expect(problems[0]!.message).toContain('both have a value');
  });

  it('treats every row as money out when the file carries no signs', () => {
    const { rows } = prepareRows({
      ...options,
      allOutgoing: true,
      rows: [{ Date: '19/09/2026', Description: 'Market', Amount: '45.50' }],
    });
    expect(rows[0]!.row.kind).toBe('expense');
  });

  it('matches a category by name, and leaves an unknown one unset', () => {
    const { rows } = prepareRows({
      ...options,
      map: { ...map, category: 'Category' },
      rows: [
        { Date: '19/09/2026', Description: 'Market', Amount: '-45.50', Category: 'Groceries' },
        { Date: '19/09/2026', Description: 'Other', Amount: '-10.00', Category: 'Unknown' },
      ],
    });
    expect(rows[0]!.row.category_id).toBe('cat-1');
    expect(rows[1]!.row.category_id).toBeNull();
  });

  it('gives two identical rows different identities, so both import', () => {
    const { rows } = prepareRows({
      ...options,
      rows: [
        { Date: '19/09/2026', Description: 'Coffee', Amount: '-4.50' },
        { Date: '19/09/2026', Description: 'Coffee', Amount: '-4.50' },
      ],
    });
    expect(rows[0]!.row.source_ref).not.toBe(rows[1]!.row.source_ref);
  });

  it('names an unnamed row after its direction, and skips blank lines', () => {
    const { rows } = prepareRows({
      ...options,
      rows: [
        { Date: '', Description: '', Amount: '' },
        { Date: '19/09/2026', Description: '', Amount: '-4.50' },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.row.description).toBe('Expense');
  });
});

describe('toCsv', () => {
  it('quotes only what needs quoting', () => {
    expect(toCsv([['a', 'b'], ['plain', 'has,comma']])).toBe('a,b\r\nplain,"has,comma"');
    expect(toCsv([['say "hi"']])).toBe('"say ""hi"""');
    expect(toCsv([['line\nbreak']])).toBe('"line\nbreak"');
  });
});
