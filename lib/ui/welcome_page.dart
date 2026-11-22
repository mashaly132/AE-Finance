import 'package:flutter/material.dart';

import '../data/local_db.dart';
import '../data/repository.dart';
import 'common.dart';
import 'home_page.dart';

class WelcomePage extends StatefulWidget {
  const WelcomePage({super.key});
  @override
  State<WelcomePage> createState() => _WelcomePageState();
}

class _WelcomePageState extends State<WelcomePage> {
  String? selectedId = repo.prefs.getString('engineer_id');

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ListenableBuilder(
                listenable: repo,
                builder: (context, _) => FutureBuilder<List<Engineer>>(
                  future: repo.local.engineers(),
                  builder: (context, snap) {
                    final list = snap.data ?? [];
                    Engineer? sel;
                    for (final e in list) {
                      if (e.id == selectedId) sel = e;
                    }
                    return Column(children: [
                      const BrandLogo(height: 170),
                      const SizedBox(height: 24),
                      const Text('أزيك يا هندسة 👋', style: TextStyle(fontSize: 27, fontWeight: FontWeight.bold, color: navy)),
                      const SizedBox(height: 8),
                      const Text('اختار أنت مين عشان نبدأ شغلنا'),
                      const SizedBox(height: 20),
                      if (list.isEmpty) ...[
                        Text(repo.syncing ? 'بنحمّل البيانات...' : (repo.lastError ?? 'محتاجين نتصل بالنت أول مرة لتحميل البيانات')),
                        const SizedBox(height: 12),
                        OutlinedButton.icon(onPressed: repo.syncing ? null : repo.syncNow, icon: const Icon(Icons.refresh), label: const Text('إعادة المحاولة')),
                      ] else
                        for (final e in list)
                          Card(
                            color: e.id == selectedId ? gold.withAlpha(60) : null,
                            child: ListTile(
                              leading: const Icon(Icons.engineering_outlined),
                              title: Text(e.name),
                              trailing: e.id == selectedId ? const Icon(Icons.check_circle, color: green) : null,
                              onTap: () => setState(() => selectedId = e.id),
                            ),
                          ),
                      const SizedBox(height: 16),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton(
                          onPressed: sel == null
                              ? null
                              : () async {
                                  final chosen = sel!;
                                  await repo.prefs.setString('engineer_id', chosen.id);
                                  if (!context.mounted) return;
                                  Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => HomePage(engineer: chosen)));
                                },
                          child: const Padding(padding: EdgeInsets.all(13), child: Text('دخول إلى البرنامج')),
                        ),
                      ),
                    ]);
                  },
                ),
              ),
            ),
          ),
        ),
      );
}
