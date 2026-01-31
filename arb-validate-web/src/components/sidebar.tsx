'use client';

import Link from 'next/link';
import { LayoutDashboard, Scale, ListFilter, Settings, FileOutput, BookOpen, PlayCircle, Languages } from 'lucide-react';
import { useI18n } from '@/lib/i18n/context';

export function Sidebar() {
  const { t, locale, setLocale } = useI18n();

  return (
    <div className="h-screen w-64 bg-gray-900 text-white flex flex-col fixed left-0 top-0">
      <div className="p-6 border-b border-gray-800">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Scale className="text-emerald-400" />
          {t('Arb-Validate')}
        </h1>
      </div>
      
      <nav className="flex-1 p-4 space-y-2">
        <Link href="/" className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition-colors">
          <LayoutDashboard size={20} />
          {t('Dashboard')}
        </Link>
        <Link href="/pairs" className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition-colors">
          <Scale size={20} />
          {t('Pairs Management')}
        </Link>
        <Link href="/opportunities" className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition-colors">
          <ListFilter size={20} />
          {t('Opportunities')}
        </Link>
        <Link href="/paper-trading" className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition-colors">
          <PlayCircle size={20} />
          {t('Paper Trading')}
        </Link>
        <Link href="/trade" className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition-colors">
          <BookOpen size={20} />
          {t('Trade Explanation')}
        </Link>
        <Link href="/exports" className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition-colors">
          <FileOutput size={20} />
          {t('Exports')}
        </Link>
        <Link href="/settings" className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition-colors">
          <Settings size={20} />
          {t('Settings')}
        </Link>
      </nav>

      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-2 mb-2 text-gray-400 text-xs uppercase tracking-wider">
          <Languages size={14} />
          <span>{t('Language')}</span>
        </div>
        <select 
          value={locale}
          onChange={(e) => setLocale(e.target.value as 'zh' | 'en')}
          className="w-full bg-gray-800 text-white border border-gray-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-emerald-500 mb-4"
        >
          <option value="zh">中文 (Chinese)</option>
          <option value="en">English</option>
        </select>
        <div className="text-xs text-gray-500">
          {t('v0.1.0 MVP')}
        </div>
      </div>
    </div>
  );
}
