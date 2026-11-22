import 'package:flutter/material.dart';

import '../data/local_db.dart';
import '../data/repository.dart';
import 'common.dart';

/// Add / enable / disable engineers or expense categories (requires internet).
class ManageListPage extends StatelessWidget {
  final String title, table, column;
  const ManageListPage({super.key, required this.title, required this.table, required this.column});

  bool get _isEngineers => table == 'engineers';

  Future<List<Lookup>> _load() async => _isEngineers
      ? (await repo.local.engineers(onlyActive: false)).map((e) => Lookup(e.id, e.name, e.active)).toList()
      : repo.local.categories(onlyActive: false);

  Future<void> _guard(BuildContext context, Future<void> Function() fn) async {
    if (!repo.online) { snack(context, 'التعديل ده محتاج نت'); return; }
    try {
      await fn();
    } catch (e) {
      if (context.mounted) snack(context, 'فشل: $e');
    }
  }

  Future<void> _add(BuildContext context) async {
    final c = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('إضافة - $title'),
        content: TextField(controller: c, decoration: const InputDecoration(labelText: 'الاسم')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('إضافة')),
        ],
      ),
    );
    final name = c.text.trim();
    if (ok != true || name.isEmpty || !context.mounted) return;
    await _guard(context, () async => repo.addLookup(table, column, name, sortOrder: _isEngineers ? null : (await repo.local.maxCategorySort()) + 1));
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(title)),
        floatingActionButton: FloatingActionButton(onPressed: () => _add(context), child: const Icon(Icons.add)),
        body: ListenableBuilder(
          listenable: repo,
          builder: (context, _) => FutureBuilder<List<Lookup>>(
            future: _load(),
            builder: (context, snap) {
              final list = snap.data ?? [];
              return ListView(children: [
                for (final e in list)
                  SwitchListTile(
                    title: Text(e.name),
                    subtitle: Text(e.active ? 'مفعّل' : 'موقوف'),
                    value: e.active,
                    onChanged: (v) => _guard(context, () => repo.setLookupActive(table, e.id, v)),
                  ),
              ]);
            },
          ),
        ),
      );
}
