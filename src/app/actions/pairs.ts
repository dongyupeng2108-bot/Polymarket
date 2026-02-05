'use server';

import { createPair, updatePairStatus } from '@/lib/services/pairs';
import { PairStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';

export async function addPairAction(formData: FormData) {
  const pm_id_input = formData.get('pm_market_id') as string; // This is likely the Token ID or Slug from the form
  const kh_id_input = formData.get('kh_market_id') as string; // This is likely the Ticker

  const title_pm = formData.get('title_pm') as string;
  const title_kh = formData.get('title_kh') as string;
  const resolve_time_pm = new Date(formData.get('resolve_time_pm') as string);
  const resolve_time_kh = new Date(formData.get('resolve_time_kh') as string);
  const rules_pm = formData.get('rules_pm') as string;
  const rules_kh = formData.get('rules_kh') as string;
  const tags = (formData.get('tags') as string)?.split(',').map(t => t.trim()).filter(Boolean);

  // Mapping form inputs to service arguments
  // We assume the user inputs the "YES Token ID" for PM and "Ticker" for KH
  
  await createPair({
    pm_yes_token_id: pm_id_input,
    pm_no_token_id: null,
    pm_market_slug: null,
    pm_market_id: null, // Gamma ID not provided by simple form yet
    kh_ticker: kh_id_input,
    kh_yes_contract_id: null,
    kh_no_contract_id: null,
    title_pm,
    title_kh,
    resolve_time_pm,
    resolve_time_kh,
    rules_pm,
    rules_kh,
    tags,
  });

  revalidatePath('/pairs');
}

export async function updateStatusAction(id: number, status: PairStatus) {
  await updatePairStatus(id, status);
  revalidatePath('/pairs');
}
