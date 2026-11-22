import 'package:flutter/material.dart';

import '../data/local_db.dart';
import '../data/repository.dart';
import 'common.dart';
import 'transaction_form.dart';

class ClientDetailPage extends StatelessWidget {
  final ClientRow client;
  final Engineer engineer;
  const ClientDetailPage({super.key, required this.client, required this.engineer});

  void _add(BuildContext context, bool deposit) => Navigator.push(
      context, MaterialPageRoute(builder: (_) => TransactionForm(clientId: client.id, clientName: client.name, engineer: engineer, isDeposit: deposit)));

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(client.name)),
        floatingActionButton: FloatingActionButton.extended(
          icon: const Icon(Icons.add),
          label: const Text('معاملة جديدة'),
          onPressed: () => showModalBottomSheet(
            context: context,
            builder: (ctx) => SafeArea(
              child: Wrap(children: [
                ListTile(
                  leading: const Icon(Icons.remove_circle_outline, color: red),
                  title: const Text('صرف'),
                  onTap: () { Navigator.pop(ctx); _add(context, false); },
                ),
                ListTile(
                  leading: const Icon(Icons.add_circle_outline, color: green),
                  title: const Text('إيداع'),
                  onTap: () { Navigator.pop(ctx); _add(context, true); },
                ),
              ]),
            ),
          ),
        ),
        body: ListenableBuilder(
          listenable: repo,
          builder: (context, _) => FutureBuilder<List<Tx>>(
            future: repo.local.allTx(clientId: client.id),
            builder: (context, snap) {
              final list = snap.data;
              if (list == null) return const Center(child: CircularProgressIndicator());
              var dep = 0, exp = 0;
              for (final t in list) {
                if (t.isDeposit) { dep += t.cents; } else { exp += t.cents; }
              }
              return Column(children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
                  child: Row(children: [
                    Stat('الإيداعات', dep, color: green),
                    Stat('المصروفات', exp, color: red),
                    Stat('الرصيد', dep - exp, color: dep - exp < 0 ? red : navy),
                  ]),
                ),
                Expanded(
                  child: list.isEmpty
                      ? const Center(child: Text('مفيش معاملات لسه'))
                      : ListView.builder(
                          padding: const EdgeInsets.only(bottom: 90),
                          itemCount: list.length,
                          itemBuilder: (_, i) {
                            final t = list[i];
                            final sub = t.isDeposit
                                ? '${methodLabels[t.method] ?? ''} • استلم: ${t.receivedBy ?? '-'}'
                                : '${t.category ?? ''} • ${kindLabels[t.kind] ?? ''}';
                            return Card(
                              margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                              child: ListTile(
                                leading: Icon(t.isDeposit ? Icons.arrow_circle_down : Icons.arrow_circle_up, color: t.isDeposit ? green : red),
                                title: Text(t.description),
                                subtitle: Text('${fmtDate(t.date)} • $sub${t.synced ? '' : '  ☁︎ لم تُزامن'}'),
                                trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                                  Text(money(t.cents), style: TextStyle(fontWeight: FontWeight.bold, color: t.isDeposit ? green : red)),
                                  IconButton(
                                    icon: const Icon(Icons.delete_outline),
                                    onPressed: () async {
                                      if (await confirm(context, 'حذف المعاملة', 'هتتحذف "${t.description}" بمبلغ ${money(t.cents)}. متأكد؟', ok: 'احذف')) {
                                        await repo.deleteTransaction(t.id, engineer.id);
                                      }
                                    },
                                  ),
                                ]),
                              ),
                            );
                          },
                        ),
                ),
              ]);
            },
          ),
        ),
      );
}
