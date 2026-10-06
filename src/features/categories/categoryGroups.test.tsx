import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { CategoriesPage } from './CategoryManager';

const rename = vi.fn();

const category = (over = {}) => ({
  id: 'c1',
  user_id: 'u1',
  group_id: 'g1',
  name: 'Groceries',
  kind: 'expense',
  sort_order: 0,
  archived_at: null,
  source_ref: null,
  created_at: '',
  updated_at: '',
  ...over,
});

vi.mock('./queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./queries')>();
  const pending = { mutateAsync: vi.fn(), isPending: false };
  return {
    ...actual,
    useCategories: () => ({
      data: [category(), category({ id: 'c2', group_id: null, name: 'Gifts' })],
      isSuccess: true,
      isPending: false,
      isError: false,
    }),
    useCategoryGroups: () => ({
      data: [{ id: 'g1', user_id: 'u1', name: 'Home', sort_order: 0, created_at: '', updated_at: '' }],
    }),
    useCategoryUsage: () => ({ data: [] }),
    useCreateCategory: () => pending,
    useUpdateCategory: () => pending,
    useDeleteCategory: () => pending,
    useMergeCategories: () => pending,
    useCreateCategoryGroup: () => pending,
    useRenameCategoryGroup: () => ({ mutateAsync: rename, isPending: false }),
  };
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <CategoriesPage />
    </MemoryRouter>,
  );

describe('renaming a category group', () => {
  // A function returned from beforeEach runs as teardown, so don't return the mock.
  beforeEach(() => {
    rename.mockReset();
  });

  it('offers a rename for real groups, not for Ungrouped', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Rename Home' })).toBeInTheDocument();
    expect(screen.getByText('Ungrouped')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Rename/ })).toHaveLength(1);
  });

  it('saves the trimmed new name', async () => {
    rename.mockResolvedValue({});
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Rename Home' }));
    const field = screen.getByLabelText('Name');
    await userEvent.clear(field);
    await userEvent.type(field, '  Household  ');
    await userEvent.click(screen.getByRole('button', { name: 'Save group' }));
    expect(rename).toHaveBeenCalledWith({ id: 'g1', name: 'Household' });
  });

  it('says so when the name is already taken', async () => {
    rename.mockRejectedValue({ code: '23505' });
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Rename Home' }));
    const field = screen.getByLabelText('Name');
    await userEvent.clear(field);
    await userEvent.type(field, 'Fun');
    await userEvent.click(screen.getByRole('button', { name: 'Save group' }));
    expect(await screen.findByText('You already have a group called “Fun”.')).toBeInTheDocument();
  });

  it('asks for a name rather than saving an empty one', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Rename Home' }));
    await userEvent.clear(screen.getByLabelText('Name'));
    await userEvent.click(screen.getByRole('button', { name: 'Save group' }));
    expect(screen.getByText('Give the group a name.')).toBeInTheDocument();
    expect(rename).not.toHaveBeenCalled();
  });
});
