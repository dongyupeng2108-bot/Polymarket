'use client';

import { Badge } from '@/components/ui/badge';
import { PairStatus } from '@prisma/client';
import { useI18n } from '@/lib/i18n/context';

export function StatusBadge({ status }: { status: PairStatus }) {
  const { t } = useI18n();
  const styles: Record<PairStatus, string> = {
    verified: 'bg-green-100 text-green-700 hover:bg-green-200',
    unverified: 'bg-orange-100 text-orange-700 hover:bg-orange-200',
  };

  const labels: Record<PairStatus, string> = {
    verified: 'Verified',
    unverified: 'Unverified',
  };

  return (
    <Badge className={styles[status] || 'bg-gray-200'} variant="secondary">
      {t(labels[status] || status)}
    </Badge>
  );
}
