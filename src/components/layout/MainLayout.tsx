import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useLanguage } from '@/contexts/LanguageContext';

export function MainLayout() {
  const { language } = useLanguage();

  return (
    <div className="relative min-h-screen bg-[#eef3f6]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_14%,rgba(43,207,194,0.16),transparent_28%),radial-gradient(circle_at_88%_78%,rgba(234,191,67,0.13),transparent_28%),linear-gradient(180deg,#f3f7fa_0%,#eef3f6_100%)]" />
      <Sidebar />
      <main className={`relative min-h-screen transition-all duration-300 ${language === 'ar' ? 'mr-64' : 'ml-64'}`}>
        <div className="min-h-screen p-6 pb-20 lg:p-8 lg:pb-20">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
