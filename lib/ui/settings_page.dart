import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../data/local_db.dart';
import '../data/repository.dart';
import 'common.dart';
import 'manage_list_page.dart';

class SettingsPage extends StatelessWidget {
  final Engineer engineer;
  const SettingsPage({super.key, required this.engineer});

  Future<void> _logo(BuildContext context) async {
    if (!repo.online) { snack(context, 'تغيير اللوجو محتاج نت'); return; }
    final x = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 2048);
    if (x == null) return;
    try {
      await repo.uploadLogo(File(x.path), engineer.id);
      if (context.mounted) snack(context, 'تم تغيير اللوجو. أيقونة التطبيق بتتغير بإصدار جديد بس.');
    } catch (e) {
      if (context.mounted) snack(context, 'فشل رفع اللوجو: $e');
    }
  }

  Future<void> _signOut(BuildContext context) async {
    if (!await confirm(context, 'تسجيل الخروج', 'هيتمسح اللي متخزن على الموبايل ده. متأكد؟', ok: 'خروج')) return;
    final done = await repo.signOutAndWipe();
    if (!done && context.mounted) snack(context, 'فيه ${repo.pending} عملية لسه متزامنتش. اتصل بالنت وزامن الأول.');
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: repo,
        builder: (context, _) => ListView(padding: const EdgeInsets.all(16), children: [
          const Text('إعدادات المكتب', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          Card(
            child: ListTile(
              leading: const Icon(Icons.image_outlined),
              title: const Text('هوية المكتب واللوجو'),
              subtitle: const Padding(padding: EdgeInsets.only(top: 6), child: Align(alignment: AlignmentDirectional.centerStart, child: BrandLogo(height: 50))),
              trailing: const Icon(Icons.chevron_left),
              onTap: () => _logo(context),
            ),
          ),
          Card(
            child: ListTile(
              leading: const Icon(Icons.people_outline),
              title: const Text('المهندسون'),
              subtitle: const Text('إضافة أو إيقاف مهندس'),
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ManageListPage(title: 'المهندسون', table: 'engineers', column: 'display_name'))),
            ),
          ),
          Card(
            child: ListTile(
              leading: const Icon(Icons.category_outlined),
              title: const Text('بنود المصروفات'),
              subtitle: const Text('إضافة أو إيقاف البنود'),
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ManageListPage(title: 'بنود المصروفات', table: 'expense_categories', column: 'name'))),
            ),
          ),
          Card(
            child: ListTile(
              leading: const Icon(Icons.sync),
              title: const Text('المزامنة والنسخ الاحتياطي'),
              subtitle: Text([
                repo.online ? 'متصل' : 'أوفلاين',
                'عمليات معلقة: ${repo.pending}',
                if (repo.lastSync != null) 'آخر مزامنة: ${fmtDate(isoDate(repo.lastSync!))} ${repo.lastSync!.hour.toString().padLeft(2, '0')}:${repo.lastSync!.minute.toString().padLeft(2, '0')}',
                if (repo.lastError != null) 'خطأ: ${repo.lastError}',
              ].join('\n')),
              isThreeLine: true,
              trailing: repo.syncing ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.refresh),
              onTap: repo.syncing ? null : repo.syncNow,
            ),
          ),
          Card(
            child: ListTile(
              leading: const Icon(Icons.logout),
              title: const Text('تسجيل الخروج'),
              subtitle: Text(repo.userEmail),
              onTap: () => _signOut(context),
            ),
          ),
        ]),
      );
}
