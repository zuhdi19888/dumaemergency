import { useEffect, useState } from 'react';
import { Bell, Languages, Save, Palette, UserRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';

type NotificationSettingsState = {
  inAppNotifications: boolean;
  emailNotifications: boolean;
  notificationSound: boolean;
  externalMedicineAlerts: boolean;
  lowStockAlerts: boolean;
  prescriptionUpdates: boolean;
};

const NOTIFICATION_SETTINGS_KEY = 'duma_notification_settings_v1';

const defaultNotificationSettings: NotificationSettingsState = {
  inAppNotifications: true,
  emailNotifications: false,
  notificationSound: true,
  externalMedicineAlerts: true,
  lowStockAlerts: true,
  prescriptionUpdates: true,
};

const safeLoadNotificationSettings = (): NotificationSettingsState => {
  try {
    const raw = localStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    if (!raw) return defaultNotificationSettings;

    const parsed = JSON.parse(raw) as Partial<NotificationSettingsState>;

    return {
      inAppNotifications:
        typeof parsed.inAppNotifications === 'boolean'
          ? parsed.inAppNotifications
          : defaultNotificationSettings.inAppNotifications,
      emailNotifications:
        typeof parsed.emailNotifications === 'boolean'
          ? parsed.emailNotifications
          : defaultNotificationSettings.emailNotifications,
      notificationSound:
        typeof parsed.notificationSound === 'boolean'
          ? parsed.notificationSound
          : defaultNotificationSettings.notificationSound,
      externalMedicineAlerts:
        typeof parsed.externalMedicineAlerts === 'boolean'
          ? parsed.externalMedicineAlerts
          : defaultNotificationSettings.externalMedicineAlerts,
      lowStockAlerts:
        typeof parsed.lowStockAlerts === 'boolean'
          ? parsed.lowStockAlerts
          : defaultNotificationSettings.lowStockAlerts,
      prescriptionUpdates:
        typeof parsed.prescriptionUpdates === 'boolean'
          ? parsed.prescriptionUpdates
          : defaultNotificationSettings.prescriptionUpdates,
    };
  } catch {
    return defaultNotificationSettings;
  }
};

export default function Settings() {
  const { user, profile, role } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { toast } = useToast();

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettingsState>(
    defaultNotificationSettings,
  );
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);

  useEffect(() => {
    setFullName(profile?.full_name ?? '');
  }, [profile?.full_name]);

  useEffect(() => {
    setNotificationSettings(safeLoadNotificationSettings());
  }, []);

  const getRoleLabel = (currentRole: string | null) => {
    if (currentRole === 'admin') return t('Admin', 'Admin');
    if (currentRole === 'doctor') return t('Doctor', 'Doctor');
    if (currentRole === 'pharmacist') return t('Pharmacist', 'Pharmacist');
    if (currentRole === 'receptionist') return t('Receptionist', 'Receptionist');
    return t('Unknown', 'Unknown');
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setIsSavingProfile(true);

    const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', user.id);

    setIsSavingProfile(false);

    if (error) {
      toast({ variant: 'destructive', title: t('Error', 'Error'), description: error.message });
      return;
    }

    toast({
      title: t('Saved', 'Saved'),
      description: t(
        'Profile updated. Refresh the page to reload the sidebar user name.',
        'Profile updated. Refresh the page to reload the sidebar user name.',
      ),
    });
  };

  const handleLanguageChange = (value: 'ar' | 'en') => {
    setLanguage(value);
    toast({
      title: t('Language updated', 'Language updated'),
      description: t(
        'Language and UI direction preference were saved.',
        'Language and UI direction preference were saved.',
      ),
    });
  };

  const updateNotificationSetting = <K extends keyof NotificationSettingsState>(key: K, value: NotificationSettingsState[K]) => {
    setNotificationSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveNotificationSettings = () => {
    setIsSavingNotifications(true);
    localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(notificationSettings));
    setIsSavingNotifications(false);

    toast({
      title: t('Saved', 'Saved'),
      description: t('Notification settings saved successfully.', 'Notification settings saved successfully.'),
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={t('Settings', 'Settings')}
        subtitle={t('Manage profile, language, and notifications', 'Manage profile, language, and notifications')}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserRound className="h-5 w-5 text-primary" />
              {t('Profile', 'Profile')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('Email', 'Email')}</Label>
              <Input id="email" value={profile?.email ?? ''} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fullName">{t('Full Name', 'Full Name')}</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t('Your full name', 'Your full name')}
              />
            </div>
            <div className="rounded-xl bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
              {t('Role', 'Role')}: <span className="font-medium text-foreground">{getRoleLabel(role)}</span>
            </div>
            <Button onClick={handleSaveProfile} disabled={isSavingProfile}>
              <Save className="mr-2 h-4 w-4" />
              {isSavingProfile ? t('Saving...', 'Saving...') : t('Save Profile', 'Save Profile')}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Palette className="h-5 w-5 text-primary" />
              {t('Appearance & Language', 'Appearance & Language')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t('Language', 'Language')}</Label>
              <Select value={language} onValueChange={(value: 'ar' | 'en') => handleLanguageChange(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ar">Arabic</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-xl bg-muted/25 p-3 text-sm text-muted-foreground">
              <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
                <Languages className="h-4 w-4 text-primary" />
                {t('Current UI Direction', 'Current UI Direction')}
              </div>
              <p>{language === 'ar' ? 'Right-to-left (RTL)' : 'Left-to-right (LTR)'}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bell className="h-5 w-5 text-primary" />
              {t('General Notification Settings', 'General Notification Settings')}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t('Control how you receive notifications', 'Control how you receive notifications')}
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/20 p-4">
                <div>
                  <p className="font-medium text-foreground">{t('In-App Notifications', 'In-App Notifications')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('Receive notifications within the app', 'Receive notifications within the app')}
                  </p>
                </div>
                <Switch
                  checked={notificationSettings.inAppNotifications}
                  onCheckedChange={(checked) => updateNotificationSetting('inAppNotifications', checked)}
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/20 p-4">
                <div>
                  <p className="font-medium text-foreground">{t('Email Notifications', 'Email Notifications')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('Receive notifications via email', 'Receive notifications via email')}
                  </p>
                </div>
                <Switch
                  checked={notificationSettings.emailNotifications}
                  onCheckedChange={(checked) => updateNotificationSetting('emailNotifications', checked)}
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/20 p-4">
                <div>
                  <p className="font-medium text-foreground">{t('Notification Sound', 'Notification Sound')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('Play sound when a new notification arrives', 'Play sound when a new notification arrives')}
                  </p>
                </div>
                <Switch
                  checked={notificationSettings.notificationSound}
                  onCheckedChange={(checked) => updateNotificationSetting('notificationSound', checked)}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="font-medium text-foreground">{t('Notification Types', 'Notification Types')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('Choose which notifications you want to receive', 'Choose which notifications you want to receive')}
                </p>
              </div>

              <div className="space-y-3 rounded-xl border border-border/50 bg-muted/20 p-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="externalMedicineAlerts"
                    checked={notificationSettings.externalMedicineAlerts}
                    onCheckedChange={(checked) =>
                      updateNotificationSetting('externalMedicineAlerts', checked === true)
                    }
                  />
                  <div>
                    <Label htmlFor="externalMedicineAlerts" className="cursor-pointer font-medium">
                      {t('External Medicine Alerts', 'External Medicine Alerts')}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t(
                        'Alert when a prescription contains external medicines',
                        'Alert when a prescription contains external medicines',
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Checkbox
                    id="lowStockAlerts"
                    checked={notificationSettings.lowStockAlerts}
                    onCheckedChange={(checked) => updateNotificationSetting('lowStockAlerts', checked === true)}
                  />
                  <div>
                    <Label htmlFor="lowStockAlerts" className="cursor-pointer font-medium">
                      {t('Low Stock Alerts', 'Low Stock Alerts')}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t('Alert when medicine stock is low', 'Alert when medicine stock is low')}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Checkbox
                    id="prescriptionUpdates"
                    checked={notificationSettings.prescriptionUpdates}
                    onCheckedChange={(checked) => updateNotificationSetting('prescriptionUpdates', checked === true)}
                  />
                  <div>
                    <Label htmlFor="prescriptionUpdates" className="cursor-pointer font-medium">
                      {t('Prescription Updates', 'Prescription Updates')}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t('Alert when prescription status changes', 'Alert when prescription status changes')}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSaveNotificationSettings} disabled={isSavingNotifications} className="btn-gradient-teal">
                <Save className="mr-2 h-4 w-4" />
                {isSavingNotifications ? t('Saving...', 'Saving...') : t('Save Settings', 'Save Settings')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
