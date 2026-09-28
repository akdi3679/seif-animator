import { supabase } from './supabase.js';

export async function logFinancialEvent({
  source,
  sourceId = null,
  field = null,
  oldValue = 0,
  newValue = 0,
  description,
}: {
  source: 'worker' | 'expense' | 'tool' | 'manual';
  sourceId?: string | null;
  field?: string | null;
  oldValue?: number;
  newValue?: number;
  description: string;
}) {
  // Single atomic call. Either the event is inserted AND the summary
  // is updated, or neither happens. No partial state.
  const { data, error } = await supabase.rpc('atomic_log_financial_event', {
    p_source: source,
    p_source_id: sourceId,
    p_field: field,
    p_old_value: oldValue,
    p_new_value: newValue,
    p_description: description,
  });

  if (error) {
    console.error('❌ Failed to log financial event:', error);
    throw error; // Surface to caller; let route handle the 500
  }

  return data; // The created event with id, change, createdAt, etc.
}