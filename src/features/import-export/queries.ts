import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '../../lib/supabase';
import { accountsKey } from '../accounts/queries';
import { categoryUsageKey } from '../categories/queries';
import { transactionsKey } from '../transactions/queries';
import type { Database } from '../../lib/database.types';
import type { ImportRow } from './csv';

export type ImportBatch = Database['public']['Tables']['import_batches']['Row'];

export const importBatchesKey = ['import_batches'] as const;

export function useImportBatches() {
  return useQuery({
    queryKey: importBatchesKey,
    queryFn: async (): Promise<ImportBatch[]> => {
      const { data, error } = await db()
        .from('import_batches')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });
}

function useInvalidateAfterImport() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: importBatchesKey });
    void queryClient.invalidateQueries({ queryKey: transactionsKey });
    void queryClient.invalidateQueries({ queryKey: accountsKey });
    void queryClient.invalidateQueries({ queryKey: categoryUsageKey });
  };
}

export type ImportResult = { batch_id: string; inserted_count: number; duplicate_count: number };

// One call, one database transaction: either every row lands or none does,
// and a row already imported is skipped by its source_ref rather than
// duplicated. The RPC writes the audit event itself.
export function useImportTransactions() {
  const invalidate = useInvalidateAfterImport();
  return useMutation({
    mutationFn: async ({ filename, rows }: { filename: string; rows: ImportRow[] }): Promise<ImportResult> => {
      const { data, error } = await db().rpc('import_transactions', {
        p_batch: { source: 'csv', filename },
        p_rows: rows,
      });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      if (!result) throw new Error('The import returned nothing.');
      return result as ImportResult;
    },
    onSuccess: invalidate,
  });
}

// Undo: deleting the batch cascades to every transaction it created.
export function useUndoImport() {
  const invalidate = useInvalidateAfterImport();
  return useMutation({
    mutationFn: async (batchId: string) => {
      const { error } = await db().from('import_batches').delete().eq('id', batchId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
