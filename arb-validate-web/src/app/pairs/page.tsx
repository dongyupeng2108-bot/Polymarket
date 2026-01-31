import { getPairs } from '@/lib/services/pairs';
import PairsClient from './pairs-client';

export default async function PairsPage() {
  const rawPairs = await getPairs();
  // Serialize dates to strings to avoid "Date objects cannot be passed to Client Components" error
  const pairs = JSON.parse(JSON.stringify(rawPairs));

  return <PairsClient pairs={pairs} />;
}
