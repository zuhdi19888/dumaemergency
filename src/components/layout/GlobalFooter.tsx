import { useLanguage } from '@/contexts/LanguageContext';

export function GlobalFooter() {
  const { language } = useLanguage();

  return (
    <footer
      className={`pointer-events-none fixed bottom-3 z-50 px-3 ${
        language === 'ar' ? 'left-3' : 'right-3'
      }`}
    >
      <p className="pointer-events-auto w-fit rounded-full border border-white/35 bg-white/80 px-4 py-1.5 text-center text-xs text-slate-600 shadow-sm backdrop-blur">
        Developed by{' '}
        <a
          href="https://www.facebook.com/dawabshasys"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-teal-700 hover:text-teal-800 hover:underline"
        >
          Zuhdi Dawabsha
        </a>
      </p>
    </footer>
  );
}
