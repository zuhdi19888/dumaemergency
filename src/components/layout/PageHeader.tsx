import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import clinicHeader from '@/assets/clinic-header.jpeg';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, action, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'animate-scroll-fade-up overflow-hidden rounded-[26px] border border-white/35 bg-gradient-to-r from-[#24c8c0] via-[#22b9cf] to-[#1ea7c8] shadow-[0_26px_52px_-34px_rgba(26,151,188,0.82)]',
        className,
      )}
    >
      <div className="flex justify-center border-b border-black/5 bg-white/10 px-4 py-3 backdrop-blur-sm">
        <img
          src={clinicHeader}
          alt="Duma Emergency"
          className="h-16 w-auto rounded-xl border border-white/35 object-contain shadow-[0_14px_28px_-18px_rgba(2,28,44,0.7)] md:h-20"
        />
      </div>
      <div className="flex items-center justify-between gap-3 bg-black/10 px-5 py-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white drop-shadow-lg md:text-[2.1rem]">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-cyan-50/95 drop-shadow md:text-base">{subtitle}</p>}
        </div>
        {action && <div className="no-print">{action}</div>}
      </div>
    </div>
  );
}
