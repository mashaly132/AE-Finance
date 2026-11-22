import 'package:flutter/material.dart';

import '../data/repository.dart';

const navy = Color(0xFF142D3B);
const gold = Color(0xFFB89562);
const green = Color(0xFF2E7D32);
const red = Color(0xFFC62828);

const kindLabels = {'materials': 'خامات', 'labor': 'مصنعية'};
const methodLabels = {'cash': 'نقدي', 'instapay': 'InstaPay', 'vodafone_cash': 'Vodafone Cash'};

String money(int cents) {
  final neg = cents < 0;
  final c = cents.abs();
  final whole = (c ~/ 100).toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (m) => ',');
  final frac = c % 100;
  return '${neg ? '-' : ''}$whole${frac == 0 ? '' : '.${frac.toString().padLeft(2, '0')}'} ج.م';
}

String isoDate(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

String fmtDate(String iso) {
  final p = iso.split('-');
  return '${int.parse(p[2])}/${int.parse(p[1])}/${p[0]}';
}

/// Accepts Arabic-Indic digits and Arabic decimal separator. Returns piasters or null.
int? parseCents(String input) {
  final b = StringBuffer();
  for (final r in input.trim().runes) {
    if (r >= 0x0660 && r <= 0x0669) {
      b.writeCharCode(0x30 + r - 0x0660);
    } else if (r >= 0x06F0 && r <= 0x06F9) {
      b.writeCharCode(0x30 + r - 0x06F0);
    } else if (r == 0x066B) {
      b.write('.');
    } else if (r == 0x2C || r == 0x066C || r == 0x20) {
      continue; // thousands separators / spaces
    } else {
      b.writeCharCode(r);
    }
  }
  final v = double.tryParse(b.toString());
  if (v == null || v <= 0 || v > 1000000000) return null;
  return (v * 100).round();
}

void snack(BuildContext context, String msg) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));

class BrandLogo extends StatelessWidget {
  final double height;
  const BrandLogo({super.key, this.height = 120});
  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: repo,
        builder: (_, __) {
          final f = repo.logoFile;
          if (f != null && f.existsSync()) {
            return Image.file(f, key: ValueKey(repo.logoVersion), height: height, fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => Image.asset('assets/branding/ae_logo.png', height: height, fit: BoxFit.contain));
          }
          return Image.asset('assets/branding/ae_logo.png', height: height, fit: BoxFit.contain);
        },
      );
}

/// Tap-to-choose field (bottom sheet). Avoids Dropdown API differences between Flutter versions.
class PickerField<T> extends StatelessWidget {
  final String label;
  final T? value;
  final List<(T, String)> options;
  final ValueChanged<T> onChanged;
  const PickerField({super.key, required this.label, required this.value, required this.options, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    String? shown;
    for (final o in options) {
      if (o.$1 == value) shown = o.$2;
    }
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () async {
        final r = await showModalBottomSheet<T>(
          context: context,
          isScrollControlled: true,
          builder: (ctx) => SafeArea(
            child: ConstrainedBox(
              constraints: BoxConstraints(maxHeight: MediaQuery.of(ctx).size.height * 0.7),
              child: ListView(shrinkWrap: true, children: [
                Padding(padding: const EdgeInsets.all(16), child: Text(label, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16))),
                for (final o in options)
                  ListTile(
                    title: Text(o.$2),
                    trailing: o.$1 == value ? const Icon(Icons.check, color: green) : null,
                    onTap: () => Navigator.pop(ctx, o.$1),
                  ),
              ]),
            ),
          ),
        );
        if (r != null) onChanged(r);
      },
      child: InputDecorator(
        decoration: InputDecoration(labelText: label, suffixIcon: const Icon(Icons.arrow_drop_down)),
        child: Text(shown ?? 'اختار', style: TextStyle(color: shown == null ? Colors.grey : null)),
      ),
    );
  }
}

class Stat extends StatelessWidget {
  final String label;
  final int cents;
  final Color? color;
  const Stat(this.label, this.cents, {super.key, this.color});
  @override
  Widget build(BuildContext context) => Expanded(
        child: Card(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
            child: Column(children: [
              Text(label, style: const TextStyle(fontSize: 12, color: Colors.black54)),
              const SizedBox(height: 4),
              FittedBox(child: Text(money(cents), style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: color))),
            ]),
          ),
        ),
      );
}

Future<bool> confirm(BuildContext context, String title, String body, {String ok = 'تأكيد'}) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(body),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')),
        FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(ok)),
      ],
    ),
  );
  return r ?? false;
}
