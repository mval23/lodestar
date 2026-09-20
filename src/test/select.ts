import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Drives the custom Select: open the trigger, then choose an option by name.
// A native <select> would be one call to selectOptions; this is the price of
// a list the app can style.
export async function pick(label: string, option: string | RegExp) {
  await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${label},`) }));
  const list = await screen.findByRole('listbox', { name: label });
  await userEvent.click(within(list).getByRole('option', { name: option }));
}

export function chosen(label: string): string {
  return screen.getByRole('button', { name: new RegExp(`^${label},`) }).textContent ?? '';
}
