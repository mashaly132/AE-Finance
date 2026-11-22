import 'dart:async';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';

import 'local_db.dart';

/// Single shared instance, created in main().
late Repo repo;

const defaultLogoPath = 'branding/ae_logo.png';

class Repo extends ChangeNotifier {
  Repo(this.local, this.prefs);
  final LocalDb local;
  final SharedPreferences prefs;
  SupabaseClient get sb => Supabase.instance.client;

  bool syncing = false;
  bool online = true;
  String? lastError;
  int pending = 0;
  File? logoFile;
  int logoVersion = 0;
  StreamSubscription<List<ConnectivityResult>>? _conn;
  StreamSubscription<AuthState>? _auth;
  static const _uuid = Uuid();

  DateTime? get lastSync {
    final s = prefs.getString('last_sync');
    return s == null ? null : DateTime.tryParse(s);
  }

  Future<void> init() async {
    final dir = await getApplicationDocumentsDirectory();
    final f = File('${dir.path}/brand_logo.img');
    if (await f.exists()) logoFile = f;
    pending = await local.pendingCount();
    final first = await Connectivity().checkConnectivity();
    online = first.any((e) => e != ConnectivityResult.none);
    _conn = Connectivity().onConnectivityChanged.listen((r) {
      online = r.any((e) => e != ConnectivityResult.none);
      notifyListeners();
      if (online) syncNow();
    });
    _auth = sb.auth.onAuthStateChange.listen((s) {
      if (s.event == AuthChangeEvent.signedIn) syncNow();
    });
    syncNow();
  }

  @override
  void dispose() {
    _conn?.cancel();
    _auth?.cancel();
    super.dispose();
  }

  String get userEmail => sb.auth.currentUser?.email ?? '';

  // ---------------- local writes (offline-first) ----------------
  Future<void> _afterWrite() async {
    pending = await local.pendingCount();
    notifyListeners();
    unawaited(syncNow());
  }

  Future<void> addClient({required String name, String? project, String? phone, required String engineerId}) async {
    await local.insertClient({
      'id': _uuid.v4(), 'name': name, 'project_name': project, 'phone': phone,
      'active': 1, 'modified_by': engineerId, 'synced': 0,
    });
    await _afterWrite();
  }

  Future<void> addTransaction({
    required String clientId,
    required bool isDeposit,
    required int cents,
    required String date,
    required String description,
    String? notes,
    String? categoryId,
    String? expenseKind,
    String? paymentMethod,
    String? receivedById,
    required String engineerId,
  }) async {
    await local.insertTx({
      'id': _uuid.v4(), 'client_id': clientId, 'type': isDeposit ? 'deposit' : 'expense',
      'amount_cents': cents, 'tx_date': date, 'description': description, 'notes': notes,
      'category_id': isDeposit ? null : categoryId, 'expense_kind': isDeposit ? null : expenseKind,
      'payment_method': isDeposit ? paymentMethod : null, 'received_by_id': isDeposit ? receivedById : null,
      'recorded_by_id': engineerId, 'modified_by': engineerId, 'deleted': 0, 'synced': 0,
      'created_at': DateTime.now().toUtc().toIso8601String(),
    });
    await _afterWrite();
  }

  Future<void> deleteTransaction(String id, String engineerId) async {
    await local.markTxDeleted(id, engineerId);
    await _afterWrite();
  }

  // ---------------- sync ----------------
  Future<void> syncNow() async {
    if (syncing || sb.auth.currentSession == null) return;
    if (!online) {
      lastError = null;
      notifyListeners();
      return;
    }
    syncing = true;
    lastError = null;
    notifyListeners();
    try {
      await _push();
      await _pull();
      await _syncLogo();
      await prefs.setString('last_sync', DateTime.now().toIso8601String());
    } catch (e) {
      lastError = _friendly(e);
    }
    pending = await local.pendingCount();
    syncing = false;
    notifyListeners();
  }

  String _friendly(Object e) {
    if (e is PostgrestException) return e.message;
    if (e is AuthException) return e.message;
    final s = e.toString();
    return s.length > 160 ? s.substring(0, 160) : s;
  }

  Future<void> _push() async {
    final cs = await local.unsyncedClients();
    if (cs.isNotEmpty) {
      await sb.from('clients').upsert(cs
          .map((c) => {
                'id': c['id'], 'name': c['name'], 'project_name': c['project_name'], 'phone': c['phone'],
                'notes': c['notes'], 'active': c['active'] == 1, 'modified_by_engineer_id': c['modified_by'],
              })
          .toList());
      await local.markSynced('clients', cs.map((c) => c['id'] as String).toList());
    }
    final ts = await local.unsyncedTx();
    if (ts.isNotEmpty) {
      final nowIso = DateTime.now().toUtc().toIso8601String();
      await sb.from('transactions').upsert(ts
          .map((t) => {
                'id': t['id'], 'client_id': t['client_id'], 'transaction_type': t['type'],
                'amount': (t['amount_cents'] as int) / 100, 'transaction_date': t['tx_date'],
                'description': t['description'], 'notes': t['notes'],
                'expense_category_id': t['category_id'], 'expense_kind': t['expense_kind'],
                'payment_method': t['payment_method'], 'received_by_engineer_id': t['received_by_id'],
                'recorded_by_engineer_id': t['recorded_by_id'], 'modified_by_engineer_id': t['modified_by'],
                'idempotency_key': t['id'], 'deleted_at': t['deleted'] == 1 ? nowIso : null,
              })
          .toList());
      await local.markSynced('transactions', ts.map((t) => t['id'] as String).toList());
    }
  }

  Future<List<Map<String, dynamic>>> _all(String table, String cols) async {
    final out = <Map<String, dynamic>>[];
    var from = 0;
    while (true) {
      final r = await sb.from(table).select(cols).order('id').range(from, from + 999);
      out.addAll(List<Map<String, dynamic>>.from(r));
      if (r.length < 1000) break;
      from += 1000;
    }
    return out;
  }

  Future<void> _pullLookups() async {
    await local.replaceEngineers(await _all('engineers', 'id, display_name, active'));
    await local.replaceCategories(await _all('expense_categories', 'id, name, sort_order, active'));
  }

  Future<void> _pull() async {
    await _pullLookups();
    await local.mergeClients(await _all('clients', 'id, name, project_name, phone, notes, active'));
    await local.mergeTx(await _all('transactions',
        'id, client_id, transaction_type, amount, transaction_date, description, notes, expense_category_id, '
        'expense_kind, payment_method, received_by_engineer_id, recorded_by_engineer_id, deleted_at, created_at'));
  }

  // ---------------- settings (need internet) ----------------
  Future<void> addLookup(String table, String column, String name, {int? sortOrder}) async {
    await sb.from(table).insert({column: name, if (sortOrder != null) 'sort_order': sortOrder});
    await _pullLookups();
    notifyListeners();
  }

  Future<void> setLookupActive(String table, String id, bool active) async {
    await sb.from(table).update({'active': active}).eq('id', id);
    await _pullLookups();
    notifyListeners();
  }

  Future<void> _syncLogo() async {
    final r = await sb.from('app_settings').select('setting_value').eq('setting_key', 'brand_logo_path').maybeSingle();
    final path = (r?['setting_value'] as Map?)?['path'] as String?;
    if (path == null || path == defaultLogoPath || path == prefs.getString('logo_path')) return;
    final bytes = await sb.storage.from('ae-branding').download(path);
    await _cacheLogo(bytes, path);
  }

  Future<void> _cacheLogo(Uint8List bytes, String path) async {
    final dir = await getApplicationDocumentsDirectory();
    final f = File('${dir.path}/brand_logo.img');
    await f.writeAsBytes(bytes, flush: true);
    await prefs.setString('logo_path', path);
    imageCache.clear();
    imageCache.clearLiveImages();
    logoFile = f;
    logoVersion++;
    notifyListeners();
  }

  Future<void> uploadLogo(File file, String engineerId) async {
    final ext = file.path.contains('.') ? file.path.split('.').last.toLowerCase() : 'png';
    final path = 'branding/logo_${DateTime.now().millisecondsSinceEpoch}.$ext';
    await sb.storage.from('ae-branding').upload(path, file);
    await sb.from('app_settings').upsert({
      'setting_key': 'brand_logo_path', 'setting_value': {'path': path},
      'updated_by': engineerId, 'updated_at': DateTime.now().toUtc().toIso8601String(),
    });
    await _cacheLogo(await file.readAsBytes(), path);
  }

  // ---------------- account ----------------
  Future<void> signIn(String email, String password) async {
    await sb.auth.signInWithPassword(email: email, password: password);
  }

  /// Returns false (and does nothing) if there is unsynced data.
  Future<bool> signOutAndWipe() async {
    pending = await local.pendingCount();
    if (pending > 0) return false;
    await sb.auth.signOut();
    await local.clearAll();
    await prefs.remove('engineer_id');
    notifyListeners();
    return true;
  }
}
