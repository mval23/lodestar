import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Select } from './Select';

const ACCOUNTS = [
  { value: 'astro', label: 'Astropay Dollars' },
  { value: 'banco', label: 'Bancolombia' },
  { value: 'cash', label: 'Cash' },
  { value: 'xmas', label: 'Christmas' },
];

function Picker({ initial = '', onKeyDown }: { initial?: string; onKeyDown?: (key: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    // Stands in for a sheet around the picker, to see which keys reach it.
    <div onKeyDown={(event) => onKeyDown?.(event.key)}>
      <Select label="From" placeholder="Choose an account" value={value} options={ACCOUNTS} onChange={setValue} />
    </div>
  );
}

describe('Select', () => {
  it('is a field that searches as you type, with no second search box', async () => {
    render(<Picker />);
    const field = screen.getByRole('combobox', { name: 'From' });
    expect(field).toHaveAttribute('placeholder', 'Choose an account');
    await userEvent.click(field);
    const list = screen.getByRole('listbox', { name: 'From' });
    expect(within(list).getAllByRole('option')).toHaveLength(4);
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();

    await userEvent.type(field, 'c');
    // Bancolombia, Cash and Christmas all contain a "c".
    expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual(['Bancolombia', 'Cash', 'Christmas']);
    await userEvent.type(field, 'hr');
    expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual(['Christmas']);
    await userEvent.keyboard('{Enter}');
    expect(field).toHaveValue('Christmas');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('shows the current choice faintly while you search, and keeps it if you leave', async () => {
    render(<Picker initial="cash" />);
    const field = screen.getByRole('combobox', { name: 'From' });
    expect(field).toHaveValue('Cash');
    await userEvent.click(field);
    expect(field).toHaveValue('');
    expect(field).toHaveAttribute('placeholder', 'Cash');
    await userEvent.keyboard('zzz');
    expect(screen.getByText('Nothing matches “zzz”.')).toBeInTheDocument();
    await userEvent.tab();
    expect(field).toHaveValue('Cash');
  });

  it('opens on the first letter typed, and moves through the matches with the arrow keys', async () => {
    render(<Picker />);
    const field = screen.getByRole('combobox', { name: 'From' });
    field.focus();
    await userEvent.keyboard('a');
    expect(field).toHaveValue('a');
    // Astropay Dollars, Bancolombia, Cash: first is highlighted, then the next.
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(field).toHaveValue('Bancolombia');
  });

  it('closes only its list on Esc, never the sheet it sits in', async () => {
    const keys = vi.fn();
    render(<Picker onKeyDown={keys} />);
    const field = screen.getByRole('combobox', { name: 'From' });
    await userEvent.click(field);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(keys).not.toHaveBeenCalledWith('Escape');
  });

  it('chooses with a click on an option', async () => {
    render(<Picker />);
    await userEvent.click(screen.getByRole('combobox', { name: 'From' }));
    await userEvent.click(screen.getByRole('option', { name: 'Bancolombia' }));
    expect(screen.getByRole('combobox', { name: 'From' })).toHaveValue('Bancolombia');
  });
});
