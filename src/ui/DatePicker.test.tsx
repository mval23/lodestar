import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DatePicker } from './DatePicker';

vi.mock('../lib/profile', () => ({ useProfile: () => ({ data: { timezone: 'UTC' } }) }));

function Field({ initial = '2026-10-17', onChange = vi.fn(), ...rest }: Partial<Parameters<typeof DatePicker>[0]> & { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <DatePicker
      label="Date"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      {...rest}
    />
  );
}

describe('DatePicker', () => {
  it('shows the date in words and opens on its month', async () => {
    render(<Field />);
    const trigger = screen.getByRole('button', { name: 'Date, Oct 17, 2026' });
    await userEvent.click(trigger);
    expect(screen.getByRole('grid', { name: /October 2026/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Oct 17, 2026' })).toHaveFocus();
  });

  it('chooses a day with a click', async () => {
    const onChange = vi.fn();
    render(<Field onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /^Date,/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Oct 9, 2026' }));
    expect(onChange).toHaveBeenCalledWith('2026-10-09');
    expect(screen.getByRole('button', { name: 'Date, Oct 9, 2026' })).toBeInTheDocument();
  });

  it('moves by day, week and month from the keyboard, and Enter chooses', async () => {
    const onChange = vi.fn();
    render(<Field onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /^Date,/ }));
    await userEvent.keyboard('{ArrowRight}{ArrowDown}{PageDown}');
    expect(screen.getByRole('button', { name: 'Nov 25, 2026' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('2026-11-25');
  });

  it('jumps to another month from the title', async () => {
    render(<Field />);
    await userEvent.click(screen.getByRole('button', { name: /^Date,/ }));
    await userEvent.click(screen.getByRole('button', { name: /October 2026, choose another month/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Previous year' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mar' }));
    expect(screen.getByRole('grid', { name: /March 2025/ })).toBeInTheDocument();
  });

  it('can be cleared when the date is optional, and says what empty means', async () => {
    const onChange = vi.fn();
    render(<Field clearable placeholder="Never" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /^Date,/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenCalledWith('');
    expect(screen.getByRole('button', { name: 'Date, Never' })).toBeInTheDocument();
  });

  it('will not choose a day outside its bounds', async () => {
    render(<Field max="2026-10-20" />);
    await userEvent.click(screen.getByRole('button', { name: /^Date,/ }));
    expect(screen.getByRole('button', { name: 'Oct 21, 2026' })).toBeDisabled();
  });
});
