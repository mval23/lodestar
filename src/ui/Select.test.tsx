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
  // An iPhone with the keyboard up: Safari has panned the visible part of the
  // page 400 px down and shrunk it to 300 px. The field sits near its bottom,
  // so the list goes above it, and must stay inside that band rather than be
  // measured from the top of the page.
  it('opens its list inside the part of the page on screen when a phone keyboard is up', async () => {
    const listeners = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: { offsetTop: 400, offsetLeft: 0, height: 300, width: 390, ...listeners },
    });
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const box = this.classList.contains('combo-popup')
        ? { top: 0, bottom: 180, left: 0, right: 358, width: 358, height: 180 }
        : { top: 600, bottom: 644, left: 16, right: 374, width: 358, height: 44 };
      return { ...box, x: box.left, y: box.top, toJSON: () => box } as DOMRect;
    });
    try {
      render(<Picker />);
      await userEvent.click(screen.getByRole('combobox', { name: 'From' }));
      const popup = screen.getByRole('listbox', { name: 'From' }).closest('.combo-popup') as HTMLElement;
      // 192 px free above the field, inside the band: the list fits there.
      expect(popup.style.maxHeight).toBe('186px');
      // Its top edge 6 px above the field, less its height: 600 − 6 − 180,
      // inside the band, which starts at 400.
      expect(popup.style.top).toBe('414px');
      expect(listeners.addEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
    } finally {
      rect.mockRestore();
      Reflect.deleteProperty(window, 'visualViewport');
    }
  });

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
