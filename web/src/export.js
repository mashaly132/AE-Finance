import { dateAr, formatMoney, isoToday } from './data';
import { loadOfficeLogo } from './brand';
const kinds = { materials: 'خامات', labor: 'مصنعية' };
const methods = { cash: 'نقدي', instapay: 'InstaPay', vodafone_cash: 'Vodafone Cash' };
const sum = (rows, type) => rows.filter(x => x.transaction_type === type).reduce((n, t) => n + Number(t.amount || 0), 0);
const money = amount => Math.round(Number(amount || 0) * 100) / 100;
export function groupExpenses(rows) {
  // Keep calculations in integer piastres to avoid rounding drift.
  // Preserve the existing "amount" field for dashboard charts.
  const byCategory = new Map();
  for (const row of rows) {
    if (row.transaction_type !== 'expense') continue;
    const name = row.categoryName || 'بدون بند';
    const key = row.expense_category_id || name;
    const item = byCategory.get(key) || { name, materialsCents: 0, laborCents: 0 };
    const cents = Math.round(Number(row.amount || 0) * 100);
    if (row.expense_kind === 'materials') item.materialsCents += cents;
    else if (row.expense_kind === 'labor') item.laborCents += cents;
    byCategory.set(key, item);
  }
  return Array.from(byCategory.values(), ({name, materialsCents, laborCents}) => ({
    name,
    materials: materialsCents / 100,
    labor: laborCents / 100,
    amount: (materialsCents + laborCents) / 100
  })).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'ar'));
}
export function groupDeposits(rows) {
  return Object.entries(rows.filter(t => t.transaction_type === 'deposit').reduce((map, row) => {
    const name = methods[row.payment_method] || 'أخرى';
    map[name] = (map[name] || 0) + money(row.amount);
    return map;
  }, {})).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
}
export const reportMetrics = rows => ({ dep: Math.round(sum(rows, 'deposit') * 100), exp: Math.round(sum(rows, 'expense') * 100), sup: Math.round(sum(rows.filter(x=>!x.supervision_source_deposit_id), 'supervision') * 100) });
const baseColumns = ['التاريخ', 'العميل', 'النوع', 'البند', 'نوع الصرف', 'طريقة الإيداع', 'المهندس المستلم', 'المهندس المسجل', 'البيان', 'المبلغ (ج.م)', 'ملاحظات'];
const columnsFor = t => [dateAr(t.transaction_date), t.clientName, t.transaction_type === 'deposit' ? 'إيداع' : t.transaction_type === 'supervision' ? 'نسبة إشراف' : 'صرف',
  t.categoryName, kinds[t.expense_kind] || '', methods[t.payment_method] || '', t.receivedName,
  t.recordedName, t.description, Number(t.amount || 0), t.notes || ''];
export async function exportExcel(rows, subtitle = 'كل العملاء', clients = []) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AE Finance';
  workbook.created = new Date();
  // ExcelJS embeds PNG/JPEG. The actual office logo is identical to the one in
  // login, engineer PIN, navigation and PDF.
  let logoImageId = null;
  try {
    let imageData = await loadOfficeLogo({force:true});
    let extension = imageData.startsWith('data:image/jpeg;') ? 'jpeg' : 'png';
    if (imageData.startsWith('data:image/webp;')) {
      // WebP is rendered losslessly to PNG for Excel's supported image formats.
      const image = new Image();
      image.src = imageData;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image,0,0);
      imageData = canvas.toDataURL('image/png');
      extension = 'png';
    }
    if (/^data:image\/(?:png|jpeg);base64,/.test(imageData))
      logoImageId = workbook.addImage({base64:imageData,extension});
  } catch (error) {
    console.warn('Report Excel logo could not be embedded; exporting the financial figures.',error);
  }
  const makeSheet = (name, cols) => {
    const sh = workbook.addWorksheet(name, { views: [{ rightToLeft: true, state: 'frozen', ySplit: 4 }], properties: { defaultRowHeight: 22 } });
    sh.mergeCells(1, 1, 1, cols.length);
    sh.getCell(1, 1).value = 'AE FINANCE  |  تقرير حسابات المكتب';
    sh.getCell(1, 1).font = { name: 'Arial', size: 17, bold: true, color: { argb: 'FFFFFFFF' } };
    sh.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF142D3B' } };
    sh.getCell(1, 1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    sh.getRow(1).height = logoImageId === null ? 36 : 62;
    if (logoImageId !== null) {
      // Office identity, shown on every worksheet without changing image content.
      sh.addImage(logoImageId, {
        tl: { col: 0.08, row: 0.10 },
        ext: { width: 100, height: 75 },
        editAs: 'oneCell'
      });
    }
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
  const feeBalances = clients.map(c => {
    const related = rows.filter(t=>t.client_id===c.id);
    const spentCents = related.filter(t=>t.transaction_type==='expense').reduce((total,t)=>total+Math.round(Number(t.amount||0)*100),0);
    const paidCents = related.filter(t=>t.transaction_type==='supervision'&&!t.supervision_source_deposit_id).reduce((total,t)=>total+Math.round(Number(t.amount||0)*100),0);
    const dueCents = Math.round(spentCents*(Number(c.supervision_percent)||0)/100);
    return { client:c.name, rate:Number(c.supervision_percent)||0,spent:spentCents/100,due:dueCents/100,paid:paidCents/100,remaining:Math.max(0,dueCents-paidCents)/100 };
  });
  const totalDue = feeBalances.reduce((n,x)=>n+x.due,0);
  for (const values of [
    ['إجمالي الإيداعات', m.dep / 100],
    ['إجمالي المصروفات', m.exp / 100],
    ['الإشراف المستحق على المصروفات', totalDue],
    ['الإشراف المحصّل يدويًا', m.sup / 100],
    ['الإشراف المتبقي', Math.max(0,totalDue-m.sup/100)],
    ['الرصيد بعد التحصيل', (m.dep - m.exp - m.sup) / 100],
    ['عدد المعاملات', rows.length]
  ]) overview.addRow(values);
  const dueSheet = makeSheet('الإشراف المستحق', ['العميل', 'نسبة الإشراف %', 'المصروفات (ج.م)', 'المستحق (ج.م)', 'المحصّل يدويًا (ج.م)', 'المتبقي (ج.م)']);
  for (const row of feeBalances) dueSheet.addRow([row.client,row.rate,row.spent,row.due,row.paid,row.remaining]);
  const expSheet = makeSheet('بنود المصروفات', ['بند المصروف', 'خامات (ج.م)', 'مصنعية (ج.م)', 'إجمالي البند (ج.م)']);
  const expenseGroups = groupExpenses(rows);
  for (const g of expenseGroups) expSheet.addRow([g.name, g.materials, g.labor, g.amount]);
  const expenseTotals = expenseGroups.reduce((totals, g) => ({
    materials: totals.materials + Math.round(g.materials * 100),
    labor: totals.labor + Math.round(g.labor * 100)
  }), { materials: 0, labor: 0 });
  const totalsRow = expSheet.addRow([
    'الإجمالي', expenseTotals.materials / 100, expenseTotals.labor / 100,
    (expenseTotals.materials + expenseTotals.labor) / 100
  ]);
  totalsRow.font = { bold: true, color: { argb: 'FF142D3B' } };
  totalsRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1E8DA' } };
  const depSheet = makeSheet('طرق الإيداع', ['طريقة الإيداع', 'الإجمالي (ج.م)']);
  for (const g of groupDeposits(rows)) depSheet.addRow([g.name, g.amount]);
  const feeSheet = makeSheet('نسبة الإشراف', ['التاريخ','العميل','نوع التسجيل','المبلغ (ج.م)']);
  for (const t of rows.filter(t => t.transaction_type === 'supervision'))
    feeSheet.addRow([dateAr(t.transaction_date),t.clientName,'تحصيل يدوي',Number(t.amount)]);
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