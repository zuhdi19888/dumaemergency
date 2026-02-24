import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Lock, Loader2, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import clinicLogo from '@/assets/clinic-logo.jpeg';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { signIn } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isRTL = language === 'ar';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      toast({
        variant: 'destructive',
        title: t('فشل تسجيل الدخول', 'Login Failed'),
        description: error.message,
      });
    } else {
      navigate('/dashboard');
    }

    setIsLoading(false);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="absolute inset-0 bg-gradient-to-br from-teal-600 via-cyan-600 to-teal-700" />

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-20 top-0 h-72 w-72 animate-float rounded-full bg-gradient-to-br from-teal-400/30 to-cyan-500/20 blur-3xl" />
        <div
          className="absolute -bottom-32 -left-32 h-96 w-96 animate-float rounded-full bg-gradient-to-br from-amber-400/20 to-yellow-500/15 blur-3xl"
          style={{ animationDelay: '2s' }}
        />
        <div
          className="absolute left-1/3 top-1/2 h-64 w-64 animate-float rounded-full bg-gradient-to-br from-teal-500/20 to-cyan-400/25 blur-3xl"
          style={{ animationDelay: '4s' }}
        />
      </div>

      <div className="animate-pulse-glow absolute left-10 top-10 h-20 w-20 rounded-full border-2 border-white/20" />
      <div
        className="absolute bottom-20 right-20 h-32 w-32 animate-float rounded-full border border-amber-400/30"
        style={{ animationDelay: '1s' }}
      />
      <div
        className="absolute right-10 top-1/3 h-16 w-16 rotate-45 animate-float rounded-xl bg-gradient-to-br from-amber-400/20 to-yellow-500/10"
        style={{ animationDelay: '2s' }}
      />

      <div className="animate-scroll-scale relative z-10 mx-4 w-full max-w-md overflow-hidden rounded-[26px] border border-white/30 bg-[#d9edf1]/82 p-0 shadow-[0_24px_70px_-35px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
        <div className="h-1.5 bg-gradient-to-r from-transparent via-amber-300 to-amber-400" />

        <div className="p-8">
          <div className="mb-8 text-center">
            <div className="relative mb-4 inline-block">
              <div className="animate-pulse-glow absolute -inset-2 rounded-full bg-gradient-to-r from-teal-400 to-amber-400 opacity-40 blur-lg" />
              <img
                src={clinicLogo}
                alt={t('مركز طوارئ دوما', 'Duma Emergency Center')}
                className="relative h-24 w-24 rounded-full border-4 border-white object-cover shadow-2xl"
              />
              <div className="absolute -bottom-1 -right-1 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 p-1.5 shadow-lg">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
            </div>

            <h1 className="mb-1 text-2xl font-bold text-gradient-teal">
              {t('مركز طوارئ دوما', 'Duma Emergency Center')}
            </h1>
            <p className="text-muted-foreground">{t('سجل دخولك للمتابعة', 'Sign in to continue')}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-slate-800">
                {t('البريد الإلكتروني', 'Email')}
              </Label>
              <div className="group relative">
                <Mail
                  className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-teal-500 ${
                    isRTL ? 'right-3' : 'left-3'
                  }`}
                />
                <Input
                  id="email"
                  type="email"
                  placeholder="doctor@clinic.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`${isRTL ? 'pr-10' : 'pl-10'} h-12 rounded-xl border-2 border-white/55 bg-white/88 transition-all focus:border-teal-500 focus:bg-white`}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-slate-800">
                {t('كلمة المرور', 'Password')}
              </Label>
              <div className="group relative">
                <Lock
                  className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-teal-500 ${
                    isRTL ? 'right-3' : 'left-3'
                  }`}
                />
                <Input
                  id="password"
                  type="password"
                  placeholder="********"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${isRTL ? 'pr-10' : 'pl-10'} h-12 rounded-xl border-2 border-white/55 bg-white/88 transition-all focus:border-teal-500 focus:bg-white`}
                  required
                />
              </div>
            </div>

            <Button type="submit" className="btn-gradient-teal h-12 w-full rounded-xl text-base font-semibold" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className={`h-5 w-5 animate-spin ${isRTL ? 'ml-2' : 'mr-2'}`} />
                  {t('جاري التحميل...', 'Loading...')}
                </>
              ) : (
                <>
                  <Sparkles className={`h-5 w-5 ${isRTL ? 'ml-2' : 'mr-2'}`} />
                  {t('تسجيل الدخول', 'Sign In')}
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              {t('ليس لديك حساب؟', "Don't have an account?")}{' '}
              <Link to="/register" className="font-semibold text-teal-600 transition-colors hover:text-teal-700 hover:underline">
                {t('إنشاء حساب', 'Sign up')}
              </Link>
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
