import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../data/repository.dart';
import 'common.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final email = TextEditingController(), password = TextEditingController();
  bool busy = false;
  String? error;

  Future<void> submit() async {
    setState(() { busy = true; error = null; });
    try {
      await repo.signIn(email.text.trim(), password.text);
    } on AuthException catch (e) {
      error = e.message.toLowerCase().contains('invalid') ? 'الإيميل أو الباسورد غلط' : e.message;
    } catch (_) {
      error = 'مفيش اتصال بالنت. أول تسجيل دخول لازم يكون أونلاين.';
    }
    if (mounted) setState(() => busy = false);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(children: [
                const BrandLogo(height: 170),
                const SizedBox(height: 24),
                const Text('تسجيل دخول المكتب', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: navy)),
                const SizedBox(height: 20),
                TextField(controller: email, keyboardType: TextInputType.emailAddress, textDirection: TextDirection.ltr,
                    decoration: const InputDecoration(labelText: 'الإيميل')),
                const SizedBox(height: 12),
                TextField(controller: password, obscureText: true, textDirection: TextDirection.ltr,
                    decoration: const InputDecoration(labelText: 'الباسورد'), onSubmitted: (_) => busy ? null : submit()),
                if (error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error!, style: const TextStyle(color: red))),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: busy ? null : submit,
                    child: Padding(padding: const EdgeInsets.all(13), child: Text(busy ? 'لحظة...' : 'دخول')),
                  ),
                ),
              ]),
            ),
          ),
        ),
      );
}
