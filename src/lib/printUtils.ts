import clinicLogo from '@/assets/clinic-logo.jpeg';

type PrintRow = {
  label: string;
  value: string;
};

type PrintSection = {
  title: string;
  rows: PrintRow[];
};

type PrintReportOptions = {
  reportTitle: string;
  reportSubTitle?: string;
  rows: PrintRow[];
  sections?: PrintSection[];
  generatedAt?: string;
  doctorSignatureName?: string;
};

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const renderRows = (rows: PrintRow[]) =>
  rows
    .map(
      (row) => `
        <div class="row">
          <div class="label">${escapeHtml(row.label)}</div>
          <div class="value">${escapeHtml(row.value)}</div>
        </div>
      `,
    )
    .join('');

export function printStructuredReport(options: PrintReportOptions) {
  const printWindow = window.open('', '_blank', 'width=980,height=800');
  if (!printWindow) return false;

  const generatedAt = options.generatedAt ?? new Date().toLocaleString('ar-PS');
  const doctorSignatureName = options.doctorSignatureName?.trim() ?? '';

  const sectionsHtml = (options.sections ?? [])
    .map(
      (section) => `
        <section class="section">
          <h3>${escapeHtml(section.title)}</h3>
          ${renderRows(section.rows)}
        </section>
      `,
    )
    .join('');

  const signatureHtml = doctorSignatureName
    ? `
      <footer class="print-footer">
        <div class="doctor-signature">
          <p class="sign-label">توقيع الطبيب</p>
          <div class="line"></div>
          <div class="name">اسم الطبيب: ${escapeHtml(doctorSignatureName)}</div>
        </div>
      </footer>
    `
    : '';

  const html = `
    <!doctype html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(options.reportTitle)}</title>
        <style>
          body {
            margin: 0;
            padding: 24px;
            font-family: 'Noto Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif;
            color: #0f172a;
            background: #fff;
          }
          .paper {
            max-width: 860px;
            margin: 0 auto;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            padding: 20px;
          }
          .header {
            border-bottom: 2px solid #0ea5a5;
            padding-bottom: 12px;
            margin-bottom: 16px;
          }
          .brand-row {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
          }
          .logo {
            width: 62px;
            height: 62px;
            object-fit: contain;
            border-radius: 10px;
            border: 1px solid #e2e8f0;
            background: #fff;
            flex-shrink: 0;
          }
          .center-name {
            font-size: 21px;
            font-weight: 800;
            color: #0f766e;
            margin: 0;
            line-height: 1.2;
          }
          .header-details {
            margin-top: 10px;
            text-align: center;
          }
          .title {
            font-size: 18px;
            font-weight: 700;
            margin: 0;
          }
          .subtitle {
            margin-top: 4px;
            color: #475569;
            font-size: 13px;
          }
          .meta {
            margin-top: 6px;
            color: #64748b;
            font-size: 12px;
          }
          .section {
            margin-top: 14px;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            overflow: hidden;
          }
          .section h3 {
            margin: 0;
            padding: 10px 12px;
            background: #f0fdfa;
            color: #0f766e;
            font-size: 14px;
          }
          .row {
            display: grid;
            grid-template-columns: 180px 1fr;
            border-top: 1px solid #f1f5f9;
          }
          .row:first-of-type {
            border-top: 0;
          }
          .label {
            background: #f8fafc;
            padding: 10px 12px;
            font-weight: 700;
            color: #334155;
            border-left: 1px solid #f1f5f9;
          }
          .value {
            padding: 10px 12px;
            color: #0f172a;
            word-break: break-word;
          }
          .print-footer {
            margin-top: 24px;
          }
          .doctor-signature {
            width: 280px;
            margin-right: auto;
            margin-left: 0;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 12px;
            text-align: center;
            background: #fff;
          }
          .doctor-signature .sign-label {
            border: 0;
            background: transparent;
            padding: 0;
            margin: 0 0 8px 0;
            font-size: 13px;
            color: #334155;
            font-weight: 700;
          }
          .doctor-signature .line {
            border-bottom: 1px solid #94a3b8;
            height: 28px;
            margin-bottom: 8px;
          }
          .doctor-signature .name {
            font-size: 13px;
            color: #0f172a;
            font-weight: 700;
            word-break: break-word;
          }
          @media print {
            body { padding: 0; }
            .paper {
              border: 0;
              border-radius: 0;
              max-width: 100%;
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        <main class="paper">
          <header class="header">
            <div class="brand-row">
              <img class="logo" src="${clinicLogo}" alt="Clinic Logo" />
              <h1 class="center-name">مركز طوارئ دوما</h1>
            </div>
            <div class="header-details">
              <h2 class="title">${escapeHtml(options.reportTitle)}</h2>
              ${options.reportSubTitle ? `<p class="subtitle">${escapeHtml(options.reportSubTitle)}</p>` : ''}
              <div class="meta">تاريخ الطباعة: ${escapeHtml(generatedAt)}</div>
            </div>
          </header>

          <section class="section">
            <h3>البيانات الأساسية</h3>
            ${renderRows(options.rows)}
          </section>

          ${sectionsHtml}
          ${signatureHtml}
        </main>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 250);
  return true;
}
