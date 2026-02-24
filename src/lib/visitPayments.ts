import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

type VisitRowWithPaid = {
  id: string;
  visit_date: string;
  patient_id: string | null;
  status?: string | null;
  notes?: string | null;
  paid_amount?: number | string | null;
  paid_collected_by?: string | null;
  doctor_id?: string | null;
  created_by?: string | null;
};

type VisitRowNoPaid = {
  id: string;
  visit_date: string;
  patient_id: string | null;
  status?: string | null;
  notes?: string | null;
  paid_collected_by?: string | null;
  doctor_id?: string | null;
  created_by?: string | null;
};

type PatientLookupRow = {
  id: string;
  first_name: string;
  last_name: string;
};

type ProfileLookupRow = {
  id: string;
  full_name: string | null;
  email: string;
};

export interface VisitPayment {
  id: string;
  visit_date: string;
  patient_id: string | null;
  paid_amount: number;
  patient?: {
    first_name?: string;
    last_name?: string;
  } | null;
  collector?: {
    id: string;
    full_name?: string | null;
    email?: string | null;
  } | null;
}

export interface VisitPaymentsResult {
  payments: VisitPayment[];
  paidAmountColumnAvailable: boolean;
  usedNotesFallback: boolean;
  errorMessage?: string;
}

interface LoadVisitPaymentsOptions {
  completedOnly?: boolean;
  visitIds?: string[];
  limit?: number;
  includeZeroPayments?: boolean;
  persistParsedAmounts?: boolean;
}

export const isMissingPaidAmountColumnError = (message: string) =>
  /paid_amount/i.test(message) && (/does not exist/i.test(message) || /column/i.test(message));

const isMissingPaymentMetadataColumnsError = (message: string) =>
  /(paid_amount|paid_collected_by|paid_collected_at)/i.test(message) &&
  (/does not exist/i.test(message) || /column/i.test(message) || /schema cache/i.test(message));

const chunkArray = <T,>(items: T[], chunkSize: number): T[][] => {
  if (chunkSize <= 0) return [items];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
};

const normalizeAmount = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseAmountFromNotes = (notes: string | null | undefined): number => {
  if (!notes) return 0;

  const normalized = notes.replace(',', '.');
  const patterns = [
    /(?:paid(?:\s*amount)?|amount|price|\u0627\u0644\u0645\u0628\u0644\u063A|\u0627\u0644\u0645\u062F\u0641\u0648\u0639|\u062F\u0641\u0639)\s*[:=-]?\s*([0-9]+(?:\.[0-9]+)?)/i,
    /([0-9]+(?:\.[0-9]+)?)\s*(?:\u20AA|nis|n\.?i\.?s|shekel|shekels|\u0634\u064A\u0643\u0644|\u0634\u064A\u0642\u0644)/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match?.[1]) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0) return value;
  }

  return 0;
};

const fetchPatientsMap = async (
  supabase: SupabaseClient<Database>,
  patientIds: string[],
): Promise<{ map: Record<string, { first_name?: string; last_name?: string }>; errorMessage?: string }> => {
  const uniqueIds = Array.from(new Set(patientIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return { map: {} };
  }

  const idChunks = chunkArray(uniqueIds, 25);
  const map: Record<string, { first_name?: string; last_name?: string }> = {};

  for (const idsChunk of idChunks) {
    const result = await supabase
      .from('patients')
      .select('id, first_name, last_name')
      .in('id', idsChunk);

    if (result.error) {
      return { map, errorMessage: result.error.message };
    }

    for (const patient of ((result.data ?? []) as PatientLookupRow[])) {
      map[patient.id] = { first_name: patient.first_name, last_name: patient.last_name };
    }
  }

  return { map };
};

const fetchProfilesMap = async (
  supabase: SupabaseClient<Database>,
  profileIds: string[],
): Promise<{ map: Record<string, { id: string; full_name?: string | null; email?: string | null }>; errorMessage?: string }> => {
  const uniqueIds = Array.from(new Set(profileIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return { map: {} };
  }

  const idChunks = chunkArray(uniqueIds, 25);
  const map: Record<string, { id: string; full_name?: string | null; email?: string | null }> = {};

  for (const idsChunk of idChunks) {
    const result = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', idsChunk);

    if (result.error) {
      return { map, errorMessage: result.error.message };
    }

    for (const profile of ((result.data ?? []) as ProfileLookupRow[])) {
      map[profile.id] = {
        id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
      };
    }
  }

  return { map };
};

const getCollectorId = (row: VisitRowWithPaid | VisitRowNoPaid): string | null => {
  if (typeof row.paid_collected_by === 'string' && row.paid_collected_by) return row.paid_collected_by;
  if (typeof row.doctor_id === 'string' && row.doctor_id) return row.doctor_id;
  if (typeof row.created_by === 'string' && row.created_by) return row.created_by;
  return null;
};

type BackfillCandidate = {
  id: string;
  paid_amount: number;
  paid_collected_by: string | null;
};

const persistBackfilledPaidAmounts = async (
  supabase: SupabaseClient<Database>,
  candidates: BackfillCandidate[],
): Promise<string | undefined> => {
  if (candidates.length === 0) return undefined;

  const updates = candidates.map(async (candidate) => {
    const payload: { paid_amount: number; paid_collected_by?: string | null } = {
      paid_amount: candidate.paid_amount,
    };
    if (candidate.paid_collected_by) {
      payload.paid_collected_by = candidate.paid_collected_by;
    }

    const result = await supabase
      .from('visits')
      .update(payload)
      .eq('id', candidate.id);

    return result.error?.message;
  });

  const errors = await Promise.all(updates);
  return errors.find((message): message is string => Boolean(message));
};

export async function loadVisitPayments(
  supabase: SupabaseClient<Database>,
  options: LoadVisitPaymentsOptions = {},
): Promise<VisitPaymentsResult> {
  const completedOnly = options.completedOnly ?? true;
  const includeZeroPayments = options.includeZeroPayments ?? false;
  const visitIds = (options.visitIds ?? []).filter(Boolean);
  const limit = options.limit && options.limit > 0 ? options.limit : undefined;
  const persistParsedAmounts = options.persistParsedAmounts ?? false;

  let withMetadataQuery = supabase
    .from('visits')
    .select('id, visit_date, patient_id, status, notes, paid_amount, paid_collected_by, doctor_id, created_by')
    .order('visit_date', { ascending: false });

  if (completedOnly) {
    withMetadataQuery = withMetadataQuery.eq('status', 'completed');
  }
  if (visitIds.length > 0) {
    withMetadataQuery = withMetadataQuery.in('id', visitIds);
  }
  if (limit) {
    withMetadataQuery = withMetadataQuery.limit(limit);
  }

  const withMetadataResult = await withMetadataQuery;

  let rows: Array<VisitRowWithPaid | VisitRowNoPaid> = [];
  let paidAmountColumnAvailable = true;
  let usedNotesFallback = false;

  if (withMetadataResult.error) {
    if (!isMissingPaymentMetadataColumnsError(withMetadataResult.error.message)) {
      return {
        payments: [],
        paidAmountColumnAvailable,
        usedNotesFallback,
        errorMessage: withMetadataResult.error.message,
      };
    }

    let withPaidOnlyQuery = supabase
      .from('visits')
      .select('id, visit_date, patient_id, status, notes, paid_amount, doctor_id, created_by')
      .order('visit_date', { ascending: false });

    if (completedOnly) {
      withPaidOnlyQuery = withPaidOnlyQuery.eq('status', 'completed');
    }
    if (visitIds.length > 0) {
      withPaidOnlyQuery = withPaidOnlyQuery.in('id', visitIds);
    }
    if (limit) {
      withPaidOnlyQuery = withPaidOnlyQuery.limit(limit);
    }

    const withPaidOnlyResult = await withPaidOnlyQuery;

    if (!withPaidOnlyResult.error) {
      rows = (withPaidOnlyResult.data ?? []) as VisitRowWithPaid[];
    } else if (!isMissingPaidAmountColumnError(withPaidOnlyResult.error.message)) {
      return {
        payments: [],
        paidAmountColumnAvailable,
        usedNotesFallback,
        errorMessage: withPaidOnlyResult.error.message,
      };
    } else {
      let fallbackQuery = supabase
        .from('visits')
        .select('id, visit_date, patient_id, status, notes, doctor_id, created_by')
        .order('visit_date', { ascending: false });

      if (completedOnly) {
        fallbackQuery = fallbackQuery.eq('status', 'completed');
      }
      if (visitIds.length > 0) {
        fallbackQuery = fallbackQuery.in('id', visitIds);
      }
      if (limit) {
        fallbackQuery = fallbackQuery.limit(limit);
      }

      const fallbackResult = await fallbackQuery;
      if (fallbackResult.error) {
        return {
          payments: [],
          paidAmountColumnAvailable: false,
          usedNotesFallback: true,
          errorMessage: fallbackResult.error.message,
        };
      }

      rows = (fallbackResult.data ?? []) as VisitRowNoPaid[];
      paidAmountColumnAvailable = false;
      usedNotesFallback = true;
    }
  } else {
    rows = (withMetadataResult.data ?? []) as VisitRowWithPaid[];
  }

  const patientIds = rows
    .map((row) => row.patient_id)
    .filter((id): id is string => Boolean(id));

  const patientsResult = await fetchPatientsMap(supabase, patientIds);
  if (patientsResult.errorMessage) {
    return {
      payments: [],
      paidAmountColumnAvailable,
      usedNotesFallback,
      errorMessage: patientsResult.errorMessage,
    };
  }

  const collectorIds = rows
    .map((row) => getCollectorId(row))
    .filter((id): id is string => Boolean(id));

  const profilesResult = await fetchProfilesMap(supabase, collectorIds);
  if (profilesResult.errorMessage) {
    return {
      payments: [],
      paidAmountColumnAvailable,
      usedNotesFallback,
      errorMessage: profilesResult.errorMessage,
    };
  }

  const backfillCandidates: BackfillCandidate[] = [];
  const payments = rows
    .map((row) => {
      const collectorId = getCollectorId(row);
      const storedAmount = paidAmountColumnAvailable
        ? normalizeAmount((row as VisitRowWithPaid).paid_amount)
        : 0;
      const parsedNotesAmount = parseAmountFromNotes(row.notes);
      const amount = storedAmount > 0 ? storedAmount : parsedNotesAmount;

      if (paidAmountColumnAvailable && storedAmount <= 0 && parsedNotesAmount > 0) {
        backfillCandidates.push({
          id: row.id,
          paid_amount: parsedNotesAmount,
          paid_collected_by: collectorId,
        });
      }

      return {
        id: row.id,
        visit_date: row.visit_date,
        patient_id: row.patient_id,
        paid_amount: amount,
        patient: row.patient_id ? patientsResult.map[row.patient_id] ?? null : null,
        collector: collectorId ? profilesResult.map[collectorId] ?? null : null,
      } as VisitPayment;
    })
    .filter((row) => includeZeroPayments || row.paid_amount > 0);

  if (persistParsedAmounts && paidAmountColumnAvailable && backfillCandidates.length > 0) {
    const persistError = await persistBackfilledPaidAmounts(supabase, backfillCandidates);
    if (persistError) {
      // Keep UI data available even if automatic persistence is blocked by DB permissions/policies.
      console.warn('Failed to persist parsed paid_amount values:', persistError);
    }
  }

  return {
    payments,
    paidAmountColumnAvailable,
    usedNotesFallback,
  };
}
