import 'package:flutter/material.dart';

import '../data/local_db.dart';
import '../data/repository.dart';
import 'client_detail_page.dart';
import 'common.dart';

class CustomersPage extends StatefulWidget {
  final Engineer engineer;
  const CustomersPage({super.key, required this.engineer});
  @override
  State<CustomersPage> createState() => _CustomersPageState();
}

class _CustomersPageState extends State<CustomersPage> {
  String q = '';

  Future<void> addCustomer() async {
    final name = TextEditingController(), project = TextEditingController(), phone = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('إضافة عميل جديد'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: name, decoration: const InputDecoration(labelText: 'اسم العميل *')),
            const SizedBox(height: 10),
            TextField(controller: project, decoration: const InputDecoration(labelText: 'اسم المشروع (اختياري)')),
            const SizedBox(height: 10),
            TextField(controller: phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'التليفون (اختياري)')),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('إضافة')),
        ],
      ),
    );
    final n = name.text.trim();
    if (ok != true || n.isEmpty) return;
    if (await repo.local.clientNameExists(n)) {
      if (!mounted) return;
      if (!await confirm(context, 'اسم متكرر', 'في عميل بنفس الاسم "$n". تضيفه برضه؟', ok: 'أضف')) return;
    }
    await repo.addClient(
      name: n,
      project: project.text.trim().isEmpty ? null : project.text.trim(),
      phone: phone.text.trim().isEmpty ? null : phone.text.trim(),
      engineerId: widget.engineer.id,
    );
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            const Expanded(child: Text('حسابات العملاء', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold))),
            IconButton.filled(onPressed: addCustomer, icon: const Icon(Icons.person_add_alt_1)),
          ]),
          const SizedBox(height: 12),
          TextField(
            decoration: const InputDecoration(labelText: 'بحث عن عميل', prefixIcon: Icon(Icons.search)),
            onChanged: (v) => setState(() => q = v.trim().toLowerCase()),
          ),
          const SizedBox(height: 12),
          Expanded(
            child: ListenableBuilder(
              listenable: repo,
              builder: (context, _) => FutureBuilder<List<ClientRow>>(
                future: repo.local.clientsWithTotals(),
                builder: (context, snap) {
                  final all = snap.data;
                  if (all == null) return const Center(child: CircularProgressIndicator());
                  final list = all.where((c) => q.isEmpty || c.name.toLowerCase().contains(q) || (c.project ?? '').toLowerCase().contains(q)).toList();
                  if (list.isEmpty) return const Center(child: Text('مفيش عملاء. اضغط + لإضافة عميل جديد'));
                  return ListView.builder(
                    itemCount: list.length,
                    itemBuilder: (_, i) {
                      final c = list[i];
                      return Card(
                        child: ListTile(
                          title: Text(c.name, style: const TextStyle(fontWeight: FontWeight.bold)),
                          subtitle: Text(c.project ?? ''),
                          trailing: Text(money(c.balance), style: TextStyle(fontWeight: FontWeight.bold, color: c.balance < 0 ? red : green)),
                          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ClientDetailPage(client: c, engineer: widget.engineer))),
                        ),
                      );
                    },
                  );
                },
              ),
            ),
          ),
        ]),
      );
}
