import 'package:flutter/material.dart';

import '../data/local_db.dart';
import '../data/repository.dart';
import 'common.dart';
import 'customers_page.dart';
import 'reports_page.dart';
import 'settings_page.dart';
import 'treasury_page.dart';
import 'welcome_page.dart';

class HomePage extends StatefulWidget {
  final Engineer engineer;
  const HomePage({super.key, required this.engineer});
  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  int index = 0;

  @override
  Widget build(BuildContext context) {
    final pages = [
      CustomersPage(engineer: widget.engineer),
      const TreasuryPage(),
      const ReportsPage(),
      SettingsPage(engineer: widget.engineer),
    ];
    return Scaffold(
      appBar: AppBar(
        title: const Text('AE Finance'),
        actions: [
          ListenableBuilder(
            listenable: repo,
            builder: (context, _) {
              final IconData icon = repo.syncing
                  ? Icons.sync
                  : !repo.online
                      ? Icons.cloud_off
                      : repo.lastError != null
                          ? Icons.error_outline
                          : repo.pending > 0
                              ? Icons.cloud_upload_outlined
                              : Icons.cloud_done_outlined;
              return IconButton(
                tooltip: 'مزامنة',
                icon: Badge(label: Text('${repo.pending}'), isLabelVisible: repo.pending > 0, child: Icon(icon)),
                onPressed: () async {
                  await repo.syncNow();
                  if (!context.mounted) return;
                  snack(context, !repo.online ? 'مفيش نت. العمليات محفوظة على الموبايل.' : (repo.lastError ?? 'تمت المزامنة'));
                },
              );
            },
          ),
          TextButton.icon(
            style: TextButton.styleFrom(foregroundColor: Colors.white),
            onPressed: () => Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const WelcomePage())),
            icon: const Icon(Icons.swap_horiz, size: 18),
            label: Text(widget.engineer.name, style: const TextStyle(fontSize: 12)),
          ),
        ],
      ),
      body: pages[index],
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (v) => setState(() => index = v),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.people_alt_outlined), label: 'العملاء'),
          NavigationDestination(icon: Icon(Icons.account_balance_wallet_outlined), label: 'الخزينة'),
          NavigationDestination(icon: Icon(Icons.analytics_outlined), label: 'التقارير'),
          NavigationDestination(icon: Icon(Icons.settings_outlined), label: 'الإعدادات'),
        ],
      ),
    );
  }
}
