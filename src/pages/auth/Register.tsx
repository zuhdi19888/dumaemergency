import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Stethoscope, Loader2, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { signUp } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await signUp(email, password, fullName);

    if (error) {
      toast({
        variant: 'destructive',
        title: t('فشل إنشاء الحساب', 'Registration Failed'),
        description: error.message,
      });
    } else {
      setIsSuccess(true);
      toast({
        title: t('تم إنشاء الحساب بنجاح', 'Registration Successful'),
        description: t('يرجى التحقق من بريدك الإلكتروني لتفعيل الحساب.', 'Please check your email to verify your account.'),
      });
    }

    setIsLoading(false);
  };

  if (isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md animate-fade-in text-center">
          <CardHeader>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
              <CheckCircle className="h-7 w-7 text-success" />
            </div>
            <CardTitle className="text-2xl font-semibold">{t('تحقق من بريدك الإلكتروني', 'Check Your Email')}</CardTitle>
            <CardDescription>
              {t('تم إرسال رابط التحقق إلى', "We've sent a verification link to")} <strong>{email}</strong>.
              {' '}
              {t('يرجى الضغط على الرابط لتفعيل حسابك.', 'Please click the link to verify your account.')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t('بعد التفعيل، تواصل مع المدير لتعيين الصلاحية المناسبة.', 'After verification, contact an administrator to assign you a role.')}
            </p>
            <Link to="/login">
              <Button className="mt-4 w-full" variant="outline">
                {t('العودة إلى تسجيل الدخول', 'Return to Login')}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md animate-fade-in">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
            <Stethoscope className="h-7 w-7 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-semibold">{t('إنشاء حساب', 'Create Account')}</CardTitle>
          <CardDescription>
            {t('سجّل حسابًا جديدًا في نظام إدارة العيادة', 'Register for clinic management system')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">{t('الاسم الكامل', 'Full Name')}</Label>
              <Input
                id="fullName"
                type="text"
                placeholder={t('د. أحمد محمد', 'Dr. John Smith')}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t('البريد الإلكتروني', 'Email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder="doctor@clinic.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('كلمة المرور', 'Password')}</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  {t('جاري إنشاء الحساب...', 'Creating Account...')}
                </>
              ) : (
                t('إنشاء الحساب', 'Create Account')
              )}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t('لديك حساب بالفعل؟', 'Already have an account?')}{' '}
            <Link to="/login" className="font-medium text-primary hover:underline">
              {t('تسجيل الدخول', 'Sign In')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
