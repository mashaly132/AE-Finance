import 'package:flutter/material.dart';

import '../data/local_db.dart';
import '../data/repository.dart';
import 'common.dart';

class TreasuryPage extends StatelessWidget {
  const TreasuryPage({super.key});

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: repo,
        builder: (context, _) => FutureBuilder<List<Tx>>(
          future: repo.local.allTx(),
          builder: (context, snap) {
            final list = snap.data;
            if (list == null) return const Center(child: CircularProgressIndicator());
            var dep = 0, exp = 0;
            final byMethod = <String, int>{}, byEngineer = <String, int>{};
            for (final t in list) {
              if (t.isDeposit) {
                dep += t.cents;
                byMethod[methodLabels[t.method] ?? '-'] = (byMethod[methodLabels[t.method] ?? '-'] ?? 0) + t.cents;
                byEngineer[t.receivedBy ?? '-'] = (byEngineer[t.receivedBy ?? '-'] ?? 0) + t.cents;
              } else {
                exp += t.cents;
              }
            }
            Widget section(String title, Map<String, int> m) => Card(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
                      const Divider(),
                      if (m.isEmpty) const Text('لا يوجد'),
                      for (final e in m.entries) Padding(
                        padding: const EdgeInsets.symmetric(vertical: 3),
                        child: Row(children: [Expanded(child: Text(e.key)), Text(money(e.value), style: const TextStyle(fontWeight: FontWeight.bold))]),
                      ),
                    ]),
                  ),
                );
            return ListView(padding: const EdgeInsets.all(12), children: [
              const Padding(padding: EdgeInsets.all(4), child: Text('الخزينة', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold))),
              Row(children: [
                Stat('إجمالي الإيداعات', dep, color: green),
                Stat('إجمالي المصروفات', exp, color: red),
                Stat('المتبقي', dep - exp, color: dep - exp < 0 ? red : navy),
              ]),
              section('الإيداعات حسب الطريقة', byMethod),
              section('المبالغ المستلمة حسب المهندس', byEngineer),
            ]);
          },
        ),
      );
}
