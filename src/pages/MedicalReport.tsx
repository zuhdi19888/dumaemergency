import { useEffect, useMemo, useState } from 'react';
import { FileText, Printer, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { calculateAge } from '@/lib/patientAge';
import { printStructuredReport } from '@/lib/printUtils';

type PatientLookupRow = {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  phone: string | null;
};

type VisitLookupRow = {
  id: string;
  visit_date: string;
  chief_complaint: string | null;
  diagnosis: string | null;
  status: string;
};

const NO_VISIT_VALUE = '__no_visit__';

const normalizeMultiline = (value: string) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' | ');

export default function MedicalReport() {
  const { user, profile } = useAuth();
  const { language, t } = useLanguage();
  const { toast } = useToast();

  const [patients, setPatients] = useState<PatientLookupRow[]>([]);
  const [visits, setVisits] = useState<VisitLookupRow[]>([]);
  const [isLoadingPatients, setIsLoadingPatients] = useState(true);
  const [isLoadingVisits, setIsLoadingVisits] = useState(false);

  const [formData, setFormData] = useState({
    patient_id: '',
    visit_id: '',
    report_title: '',
    report_body: '',
    recommendations: '',
  });

  useEffect(() => {
    const fetchPatients = async () => {
      setIsLoadingPatients(true);
      const { data, error } = await supabase
        .from('patients')
        .select('id, first_name, last_name, date_of_birth, phone')
        .order('created_at', { ascending: false });

      if (error) {
        toast({ variant: 'destructive', title: t('خطأ', 'Error'), description: error.message });
        setPatients([]);
      } else {
        setPatients((data ?? []) as PatientLookupRow[]);
      }
      setIsLoadingPatients(false);
    };

    void fetchPatients();
  }, [t, toast]);

  useEffect(() => {
    if (!formData.patient_id) {
      setVisits([]);
      setFormData((prev) => ({ ...prev, visit_id: '' }));
      return;
    }

    const fetchPatientVisits = async () => {
      setIsLoadingVisits(true);
      const { data, error } = await supabase
        .from('visits')
        .select('id, visit_date, chief_complaint, diagnosis, status')
        .eq('patient_id', formData.patient_id)
        .order('visit_date', { ascending: false })
        .limit(50);

      if (error) {
        toast({ variant: 'destructive', title: t('خطأ', 'Error'), description: error.message });
        setVisits([]);
      } else {
        setVisits((data ?? []) as VisitLookupRow[]);
      }
      setIsLoadingVisits(false);
    };

    void fetchPatientVisits();
  }, [formData.patient_id, t, toast]);

  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.id === formData.patient_id) ?? null,
    [patients, formData.patient_id],
  );

  const selectedVisit = useMemo(
    () => visits.find((visit) => visit.id === formData.visit_id) ?? null,
    [visits, formData.visit_id],
  );

  const resetForm = () => {
    setFormData({
      patient_id: '',
      visit_id: '',
      report_title: '',
      report_body: '',
      recommendations: '',
    });
    setVisits([]);
  };

  const handlePrint = () => {
    if (!formData.patient_id) {
      toast({
        variant: 'destructive',
        title: t('تنبيه', 'Notice'),
        description: t('يرجى اختيار المريض أولاً.', 'Please select a patient first.'),
      });
      return;
    }

    if (!formData.report_body.trim()) {
      toast({
        variant: 'destructive',
        title: t('تنبيه', 'Notice'),
        description: t('يرجى كتابة محتوى التقرير الطبي.', 'Please write the medical report content.'),
      });
      return;
    }

    const patientName = `${selectedPatient?.first_name ?? ''} ${selectedPatient?.last_name ?? ''}`.trim() || '-';
    const patientAge = calculateAge(selectedPatient?.date_of_birth);
    const doctorName =
      profile?.full_name ||
      (typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '') ||
      user?.email ||
      t('غير معروف', 'Unknown');
    const locale = language === 'ar' ? 'ar-PS' : 'en-US';

    const rows: Array<{ label: string; value: string }> = [
      { label: t('المريض', 'Patient'), value: patientName },
      {
        label: t('العمر', 'Age'),
        value: patientAge !== null && patientAge !== undefined ? String(patientAge) : '-',
      },
      { label: t('رقم الهاتف', 'Phone'), value: selectedPatient?.phone || '-' },
      {
        label: t('تاريخ التقرير', 'Report Date'),
        value: new Date().toLocaleString(locale),
      },
    ];

    if (selectedVisit) {
      rows.push(
        {
          label: t('تاريخ الزيارة', 'Visit Date'),
          value: new Date(selectedVisit.visit_date).toLocaleString(locale),
        },
        {
          label: t('الشكوى الرئيسية', 'Chief Complaint'),
          value: selectedVisit.chief_complaint || '-',
        },
        {
          label: t('التشخيص', 'Diagnosis'),
          value: selectedVisit.diagnosis || '-',
        },
      );
    }

    const printed = printStructuredReport({
      reportTitle: t('تقرير طبي', 'Medical Report'),
      reportSubTitle: formData.report_title.trim() || patientName,
      doctorSignatureName: doctorName,
      rows,
      sections: [
        {
          title: t('محتوى التقرير', 'Report Content'),
          rows: [
            {
              label: t('التفاصيل', 'Details'),
              value: normalizeMultiline(formData.report_body) || '-',
            },
          ],
        },
        {
          title: t('التوصيات', 'Recommendations'),
          rows: [
            {
              label: t('التوصيات', 'Recommendations'),
              value: normalizeMultiline(formData.recommendations) || '-',
            },
          ],
        },
      ],
    });

    if (!printed) {
      toast({
        variant: 'destructive',
        title: t('خطأ', 'Error'),
        description: t('تعذر فتح نافذة الطباعة. تحقق من حظر النوافذ المنبثقة.', 'Could not open print window. Check popup blocker.'),
      });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={t('كتابة تقرير طبي', 'Medical Report')}
        subtitle={t('اكتب تقريرًا طبيًا واطبعه مباشرة للمريض', 'Write and print a medical report for the patient')}
      />

      <Card className="border-white/40 bg-white/85 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base md:text-lg">
            <FileText className="h-5 w-5 text-primary" />
            {t('نموذج التقرير الطبي', 'Medical Report Form')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('المريض *', 'Patient *')}</Label>
              <Select
                value={formData.patient_id}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, patient_id: value, visit_id: '' }))
                }
                disabled={isLoadingPatients}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('اختر المريض', 'Select patient')} />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((patient) => (
                    <SelectItem key={patient.id} value={patient.id}>
                      {patient.first_name} {patient.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('زيارة مرتبطة (اختياري)', 'Linked Visit (Optional)')}</Label>
              <Select
                value={formData.visit_id || NO_VISIT_VALUE}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, visit_id: value === NO_VISIT_VALUE ? '' : value }))
                }
                disabled={!formData.patient_id || isLoadingVisits}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('اختر زيارة', 'Select visit')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_VISIT_VALUE}>{t('بدون زيارة', 'No linked visit')}</SelectItem>
                  {visits.map((visit) => (
                    <SelectItem key={visit.id} value={visit.id}>
                      {new Date(visit.visit_date).toLocaleString(language === 'ar' ? 'ar-PS' : 'en-US')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="report_title">{t('عنوان التقرير', 'Report Title')}</Label>
            <Input
              id="report_title"
              value={formData.report_title}
              onChange={(e) => setFormData((prev) => ({ ...prev, report_title: e.target.value }))}
              placeholder={t('مثال: تقرير حالة طبية', 'Example: Medical Case Report')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="report_body">{t('محتوى التقرير *', 'Report Content *')}</Label>
            <Textarea
              id="report_body"
              value={formData.report_body}
              onChange={(e) => setFormData((prev) => ({ ...prev, report_body: e.target.value }))}
              placeholder={t('اكتب تفاصيل التقرير الطبي هنا...', 'Write the medical report details here...')}
              className="min-h-40"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="recommendations">{t('التوصيات', 'Recommendations')}</Label>
            <Textarea
              id="recommendations"
              value={formData.recommendations}
              onChange={(e) => setFormData((prev) => ({ ...prev, recommendations: e.target.value }))}
              placeholder={t('أي توصيات إضافية للمريض...', 'Any additional recommendations for the patient...')}
              className="min-h-28"
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={resetForm}>
              <RotateCcw className="h-4 w-4" />
              {t('إعادة ضبط', 'Reset')}
            </Button>
            <Button type="button" onClick={handlePrint}>
              <Printer className="h-4 w-4" />
              {t('طباعة التقرير', 'Print Report')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
