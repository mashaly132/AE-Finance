import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../data/local_db.dart';
import '../data/repository.dart';
import 'common.dart';

class ReportsPage extends StatefulWidget {
  const ReportsPage({super.key});
  @override
  State<ReportsPage> createState() => _ReportsPageState();
}

class _ReportsPageState extends State<ReportsPage> {
  String? clientId; // null = all
  DateTime? from, to;

  String _csv(List<Tx> list) {
    String q(String? s) => '"${(s ?? '').replaceAll('"', '""')}"';
    final b = StringBuffer('\uFEFF');
    b.writeln('التاريخ,العميل,النوع,البند,نوع الصرف,طريقة الإيداع,المستلم,سجّله,البيان,المبلغ,ملاحظات');
    for (final t in list.reversed) {
      b.writeln([
        t.date, q(t.clientName), t.isDeposit ? 'إيداع' : 'صرف', q(t.category), kindLabels[t.kind] ?? '',
        methodLabels[t.method] ?? '', q(t.receivedBy), q(t.recordedBy), q(t.description),
        (t.cents / 100).toStringAsFixed(2), q(t.notes),
      ].join(','));
    }
    return b.toString();
  }

  Future<void> _export(List<Tx> list) async {
    final dir = await getTemporaryDirectory();
    final f = File('${dir.path}/ae_finance_report_${isoDate(DateTime.now())}.csv');
    await f.writeAsString(_csv(list), flush: true);
    await Share.shareXFiles([XFile(f.path, mimeType: 'text/csv')], subject: 'تقرير AE Finance');
  }

  Future<void> _pickDate(bool isFrom) async {
    final d = await showDatePicker(context: context, initialDate: (isFrom ? from : to) ?? DateTime.now(), firstDate: DateTime(2020), lastDate: DateTime(2100));
    if (d != null) setState(() => isFrom ? from = d : to = d);
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: repo,
        builder: (context, _) => FutureBuilder<List<dynamic>>(
          future: Future.wait([
            repo.local.clientsWithTotals(),
            repo.local.allTx(clientId: clientId, from: from == null ? null : isoDate(from!), to: to == null ? null : isoDate(to!)),
          ]),
          builder: (context, snap) {
            final data = snap.data;
            if (data == null) return const Center(child: CircularProgressIndicator());
            final clients = data[0] as List<ClientRow>;
            final list = data[1] as List<Tx>;
            var dep = 0, exp = 0;
            final byCat = <String, int>{};
            for (final t in list) {
              if (t.isDeposit) {
                dep += t.cents;
              } else {
                exp += t.cents;
                final k = '${t.category ?? '-'} (${kindLabels[t.kind] ?? ''})';
                byCat[k] = (byCat[k] ?? 0) + t.cents;
              }
            }
            final cats = byCat.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
            return ListView(padding: const EdgeInsets.all(12), children: [
              const Padding(padding: EdgeInsets.all(4), child: Text('التقارير', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold))),
              PickerField<String>(
                label: 'العميل',
                value: clientId ?? '_all',
                options: [('_all', 'كل العملاء'), for (final c in clients) (c.id, c.name)],
                onChanged: (v) => setState(() => clientId = v == '_all' ? null : v),
              ),
              const SizedBox(height: 8),
              Row(children: [
                Expanded(child: OutlinedButton(onPressed: () => _pickDate(true), child: Text(from == null ? 'من تاريخ' : 'من ${fmtDate(isoDate(from!))}'))),
                const SizedBox(width: 8),
                Expanded(child: OutlinedButton(onPressed: () => _pickDate(false), child: Text(to == null ? 'إلى تاريخ' : 'إلى ${fmtDate(isoDate(to!))}'))),
                if (from != null || to != null) IconButton(onPressed: () => setState(() { from = null; to = null; }), icon: const Icon(Icons.clear)),
              ]),
              Row(children: [
                Stat('الإيداعات', dep, color: green),
                Stat('المصروفات', exp, color: red),
                Stat('الرصيد', dep - exp, color: dep - exp < 0 ? red : navy),
              ]),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('المصروفات حسب البند', style: TextStyle(fontWeight: FontWeight.bold)),
                    const Divider(),
                    if (cats.isEmpty) const Text('لا يوجد'),
                    for (final e in cats)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 3),
                        child: Row(children: [Expanded(child: Text(e.key)), Text(money(e.value), style: const TextStyle(fontWeight: FontWeight.bold))]),
                      ),
                  ]),
                ),
              ),
              FilledButton.icon(
                onPressed: list.isEmpty ? null : () => _export(list),
                icon: const Icon(Icons.ios_share),
                label: Text('تصدير ${list.length} معاملة (Excel / CSV)'),
              ),
            ]);
          },
        ),
      );
}
