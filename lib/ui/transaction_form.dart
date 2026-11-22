import 'package:flutter/material.dart';

import '../data/local_db.dart';
import '../data/repository.dart';
import 'common.dart';

class TransactionForm extends StatefulWidget {
  final String clientId, clientName;
  final Engineer engineer;
  final bool isDeposit;
  const TransactionForm({super.key, required this.clientId, required this.clientName, required this.engineer, required this.isDeposit});
  @override
  State<TransactionForm> createState() => _TransactionFormState();
}

class _TransactionFormState extends State<TransactionForm> {
  final description = TextEditingController(), amount = TextEditingController(), notes = TextEditingController();
  String? categoryId, kind, method, recipientId;
  DateTime date = DateTime.now();
  bool saving = false;
  List<Lookup> categories = [];
  List<Engineer> engineers = [];

  @override
  void initState() {
    super.initState();
    () async {
      final c = await repo.local.categories();
      final e = await repo.local.engineers();
      if (mounted) setState(() { categories = c; engineers = e; });
    }();
  }

  Future<void> save() async {
    final cents = parseCents(amount.text);
    final desc = description.text.trim();
    final dep = widget.isDeposit;
    final valid = cents != null &&
        (dep ? method != null && recipientId != null : categoryId != null && kind != null && desc.isNotEmpty);
    if (!valid) {
      snack(context, 'راجع الحقول المطلوبة والمبلغ');
      return;
    }
    setState(() => saving = true);
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    await repo.addTransaction(
      clientId: widget.clientId,
      isDeposit: dep,
      cents: cents,
      date: isoDate(date),
      description: desc.isEmpty ? 'إيداع' : desc,
      notes: notes.text.trim().isEmpty ? null : notes.text.trim(),
      categoryId: categoryId,
      expenseKind: kind,
      paymentMethod: method,
      receivedById: recipientId,
      engineerId: widget.engineer.id,
    );
    navigator.pop();
    messenger.showSnackBar(SnackBar(content: Text(repo.online ? 'تم الحفظ' : 'تم الحفظ على الموبايل وهيتزامن لما النت يرجع')));
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(widget.isDeposit ? 'إضافة إيداع' : 'إضافة مصروف')),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          Text('العميل: ${widget.clientName}', style: const TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 16),
          if (!widget.isDeposit) ...[
            PickerField<String>(label: 'البند *', value: categoryId, options: [for (final c in categories) (c.id, c.name)], onChanged: (v) => setState(() => categoryId = v)),
            const SizedBox(height: 12),
            PickerField<String>(label: 'نوع الصرف *', value: kind, options: [for (final e in kindLabels.entries) (e.key, e.value)], onChanged: (v) => setState(() => kind = v)),
          ] else ...[
            PickerField<String>(label: 'طريقة الإيداع *', value: method, options: [for (final e in methodLabels.entries) (e.key, e.value)], onChanged: (v) => setState(() => method = v)),
            const SizedBox(height: 12),
            PickerField<String>(label: 'المهندس المستلم *', value: recipientId, options: [for (final e in engineers) (e.id, e.name)], onChanged: (v) => setState(() => recipientId = v)),
          ],
          const SizedBox(height: 12),
          TextField(controller: description, decoration: InputDecoration(labelText: widget.isDeposit ? 'بيان الإيداع' : 'وصف المصروف *')),
          const SizedBox(height: 12),
          TextField(controller: amount, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'المبلغ بالجنيه *')),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () async {
              final d = await showDatePicker(context: context, initialDate: date, firstDate: DateTime(2020), lastDate: DateTime(2100));
              if (d != null) setState(() => date = d);
            },
            icon: const Icon(Icons.calendar_month),
            label: Text('التاريخ: ${fmtDate(isoDate(date))}'),
          ),
          const SizedBox(height: 12),
          TextField(controller: notes, decoration: const InputDecoration(labelText: 'ملاحظات (اختياري)')),
          const SizedBox(height: 20),
          FilledButton(onPressed: saving ? null : save, child: Padding(padding: const EdgeInsets.all(12), child: Text(saving ? 'بيتحفظ...' : 'حفظ'))),
        ]),
      );
}
