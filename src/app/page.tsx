import { getDashboardStats } from '@/lib/services/analytics';
import DashboardClient from './dashboard-client';

export default async function DashboardPage() {
  const rawStats = await getDashboardStats();
  const stats = JSON.parse(JSON.stringify(rawStats));

  return <DashboardClient stats={stats} />;
}
