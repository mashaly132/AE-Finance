import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'data/local_db.dart';
import 'data/repository.dart';
import 'supabase_config.dart';
import 'ui/common.dart';
import 'ui/login_page.dart';
import 'ui/welcome_page.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (supabaseConfigured) {
    await Supabase.initialize(url: supabaseUrl, anonKey: supabaseAnonKey);
    repo = Repo(await LocalDb.open(), await SharedPreferences.getInstance());
    await repo.init();
  }
  runApp(const AEFinanceApp());
}

class AEFinanceApp extends StatelessWidget {
  const AEFinanceApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'AE Finance',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(seedColor: navy, primary: navy, secondary: gold),
          scaffoldBackgroundColor: const Color(0xFFF6F7F8),
          appBarTheme: const AppBarTheme(backgroundColor: navy, foregroundColor: Colors.white),
          inputDecorationTheme: InputDecorationTheme(
            filled: true,
            fillColor: Colors.white,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
          ),
        ),
        builder: (context, child) => Directionality(textDirection: TextDirection.rtl, child: child ?? const SizedBox.shrink()),
        home: supabaseConfigured ? const AuthGate() : const MissingConfigPage(),
      );
}

class AuthGate extends StatelessWidget {
  const AuthGate({super.key});
  @override
  Widget build(BuildContext context) => StreamBuilder<AuthState>(
        stream: Supabase.instance.client.auth.onAuthStateChange,
        builder: (context, _) =>
            Supabase.instance.client.auth.currentSession == null ? const LoginPage() : const WelcomePage(),
      );
}

class MissingConfigPage extends StatelessWidget {
  const MissingConfigPage({super.key});
  @override
  Widget build(BuildContext context) => const Scaffold(
        body: Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Text(
              'إعدادات Supabase ناقصة.\nابنِ التطبيق مع:\n--dart-define=SUPABASE_URL=...\n--dart-define=SUPABASE_ANON_KEY=...',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      );
}
