import { dateAr, formatMoney, isoToday } from './data';
const kinds = { materials: 'خامات', labor: 'مصنعية' };
const methods = { cash: 'نقدي', instapay: 'InstaPay', vodafone_cash: 'Vodafone Cash' };
const sum = (rows, type) => rows.filter(x => x.transaction_type === type).reduce((n, t) => n + Number(t.amount || 0), 0);
const money = amount => Math.round(Number(amount || 0) * 100) / 100;
export function groupExpenses(rows) {
  return Object.entries(rows.filter(t => t.transaction_type === 'expense').reduce((map, row) => {
    const name = row.categoryName || 'بدون بند';
    map[name] = (map[name] || 0) + money(row.amount);
    return map;
  }, {})).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
}
export function groupDeposits(rows) {
  return Object.entries(rows.filter(t => t.transaction_type === 'deposit').reduce((map, row) => {
    const name = methods[row.payment_method] || 'أخرى';
    map[name] = (map[name] || 0) + money(row.amount);
    return map;
  }, {})).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
}
export const reportMetrics = rows => ({ dep: Math.round(sum(rows, 'deposit') * 100), exp: Math.round(sum(rows, 'expense') * 100) });
const baseColumns = ['التاريخ', 'العميل', 'النوع', 'البند', 'نوع الصرف', 'طريقة الإيداع', 'المهندس المستلم', 'المهندس المسجل', 'البيان', 'المبلغ (ج.م)', 'ملاحظات'];
const columnsFor = t => [dateAr(t.transaction_date), t.clientName, t.transaction_type === 'deposit' ? 'إيداع' : 'صرف',
  t.categoryName, kinds[t.expense_kind] || '', methods[t.payment_method] || '', t.receivedName,
  t.recordedName, t.description, Number(t.amount || 0), t.notes || ''];
export async function exportExcel(rows, subtitle = 'كل العملاء') {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AE Finance';
  workbook.created = new Date();
  const makeSheet = (name, cols) => {
    const sh = workbook.addWorksheet(name, { views: [{ rightToLeft: true, state: 'frozen', ySplit: 4 }], properties: { defaultRowHeight: 22 } });
    sh.mergeCells(1, 1, 1, cols.length);
    sh.getCell(1, 1).value = 'AE FINANCE  |  تقرير حسابات المكتب';
    sh.getCell(1, 1).font = { name: 'Arial', size: 17, bold: true, color: { argb: 'FFFFFFFF' } };
    sh.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF142D3B' } };
    sh.getRow(1).height = 36;
    sh.mergeCells(2, 1, 2, cols.length);
    sh.getCell(2, 1).value = `${subtitle} • تاريخ التصدير ${dateAr(isoToday())}`;
    sh.getCell(2, 1).font = { name: 'Arial', size: 12, color: { argb: 'FF142D3B' } };
    sh.getRow(2).height = 28;
    sh.getRow(4).values = cols;
    sh.getRow(4).height = 28;
    sh.getRow(4).eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB89562' } }; c.alignment = { horizontal: 'center', vertical: 'middle' }; });
    sh.columns = cols.map((_, i) => ({ width: i === 8 ? 36 : i === 1 || i === 3 ? 25 : 18 }));
    sh.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: cols.length } };
    return sh;
  };
  const overview = makeSheet('الملخص', ['المؤشر', 'القيمة (ج.م)']);
  const m = reportMetrics(rows);
  for (const values of [['إجمالي الإيداعات', m.dep / 100], ['إجمالي المصروفات', m.exp / 100], ['الرصيد', (m.dep - m.exp) / 100], ['عدد المعاملات', rows.length]]) overview.addRow(values);
  const expSheet = makeSheet('بنود المصروفات', ['بند المصروف', 'الإجمالي (ج.م)']);
  for (const g of groupExpenses(rows)) expSheet.addRow([g.name, g.amount]);
  const depSheet = makeSheet('طرق الإيداع', ['طريقة الإيداع', 'الإجمالي (ج.م)']);
  for (const g of groupDeposits(rows)) depSheet.addRow([g.name, g.amount]);
  const details = makeSheet('كل المعاملات', baseColumns);
  for (const t of [...rows].reverse()) details.addRow(columnsFor(t));
  for (const sheet of workbook.worksheets) {
    sheet.eachRow((row, num) => {
      if (num < 5) return;
      row.eachCell(cell => {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5EAF0' } } };
        if (num % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F8FA' } };
        if (typeof cell.value === 'number') cell.numFmt = '#,##0.00;[Red](#,##0.00)';
      });
    });
  }
  const bytes = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `AE-Finance-Report-${isoToday()}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export { formatMoney };

/** Arabic-safe, print-quality PDF snapshot of the styled report. */
export async function exportPdf(element, filename = `AE-Finance-Report-${isoToday()}.pdf`) {
  if (!element) throw new Error('قالب التقرير غير متاح');
  const module = await import('html2pdf.js');
  const html2pdf = module.default || module;
  const report = element.querySelector('.report-document') || element;
  await html2pdf().set({
    margin: [10, 9, 10, 9],
    filename,
    image: { type: 'jpeg', quality: .985 },
    html2canvas: { scale: 2.1, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.doc-kpis'] }
  }).from(report).save();
}