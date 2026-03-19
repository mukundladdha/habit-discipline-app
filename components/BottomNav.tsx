'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  {
    href: '/today',
    label: 'Today',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    href: '/progress',
    label: 'Progress',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-[#1e293b] border-t border-white/[0.06] shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.5)]"
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="mx-auto max-w-[420px] flex items-center justify-around">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || pathname?.startsWith(tab.href + '?');
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center min-w-[80px] py-3 px-4 transition-colors ${
                isActive ? 'text-[#22c55e]' : 'text-slate-500'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span>{tab.icon}</span>
              <span className="text-xs font-medium mt-1">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
