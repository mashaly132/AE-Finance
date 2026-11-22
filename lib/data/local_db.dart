import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

class Engineer {
  final String id, name;
  final bool active;
  Engineer(this.id, this.name, this.active);
}

class Lookup {
  final String id, name;
  final bool active;
  Lookup(this.id, this.name, this.active);
}

class ClientRow {
  final String id, name;
  final String? project, phone;
  final int deposits, expenses;
  ClientRow(this.id, this.name, this.project, this.phone, this.deposits, this.expenses);
  int get balance => deposits - expenses;
}

class Tx {
  final String id, clientId, clientName, type, date, description;
  final String? notes, category, kind, method, receivedBy, recordedBy;
  final int cents;
  final bool synced;
  Tx(Map<String, Object?> m)
      : id = m['id'] as String,
        clientId = m['client_id'] as String,
        clientName = (m['client_name'] as String?) ?? '',
        type = m['type'] as String,
        date = m['tx_date'] as String,
        description = (m['description'] as String?) ?? '',
        notes = m['notes'] as String?,
        category = m['category_name'] as String?,
        kind = m['expense_kind'] as String?,
        method = m['payment_method'] as String?,
        receivedBy = m['received_name'] as String?,
        recordedBy = m['recorded_name'] as String?,
        cents = m['amount_cents'] as int,
        synced = (m['synced'] as int) == 1;
  bool get isDeposit => type == 'deposit';
}

class LocalDb {
  final Database db;
  LocalDb(this.db);

  static Future<LocalDb> open() async {
    final dir = await getDatabasesPath();
    final db = await openDatabase(p.join(dir, 'ae_finance.db'), version: 1, onCreate: (d, v) async {
      await d.execute('CREATE TABLE engineers(id TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1)');
      await d.execute('CREATE TABLE categories(id TEXT PRIMARY KEY, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1)');
      await d.execute('CREATE TABLE clients(id TEXT PRIMARY KEY, name TEXT NOT NULL, project_name TEXT, phone TEXT, notes TEXT, active INTEGER NOT NULL DEFAULT 1, modified_by TEXT, synced INTEGER NOT NULL DEFAULT 0)');
      await d.execute('''CREATE TABLE transactions(
        id TEXT PRIMARY KEY, client_id TEXT NOT NULL, type TEXT NOT NULL, amount_cents INTEGER NOT NULL,
        tx_date TEXT NOT NULL, description TEXT NOT NULL, notes TEXT, category_id TEXT, expense_kind TEXT,
        payment_method TEXT, received_by_id TEXT, recorded_by_id TEXT NOT NULL, modified_by TEXT,
        deleted INTEGER NOT NULL DEFAULT 0, synced INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)''');
      await d.execute('CREATE INDEX idx_tx_client ON transactions(client_id, tx_date)');
    });
    return LocalDb(db);
  }

  // ---------- lookups ----------
  Future<List<Engineer>> engineers({bool onlyActive = true}) async {
    final r = await db.query('engineers', where: onlyActive ? 'active=1' : null, orderBy: 'name');
    return r.map((m) => Engineer(m['id'] as String, m['name'] as String, m['active'] == 1)).toList();
  }

  Future<List<Lookup>> categories({bool onlyActive = true}) async {
    final r = await db.query('categories', where: onlyActive ? 'active=1' : null, orderBy: 'sort_order, name');
    return r.map((m) => Lookup(m['id'] as String, m['name'] as String, m['active'] == 1)).toList();
  }

  Future<int> maxCategorySort() async {
    final r = await db.rawQuery('SELECT COALESCE(MAX(sort_order),0) AS m FROM categories');
    return r.first['m'] as int;
  }

  Future<void> replaceEngineers(List<Map<String, dynamic>> rows) async {
    await db.transaction((t) async {
      await t.delete('engineers');
      for (final r in rows) {
        await t.insert('engineers', {'id': r['id'], 'name': r['display_name'], 'active': r['active'] == true ? 1 : 0});
      }
    });
  }

  Future<void> replaceCategories(List<Map<String, dynamic>> rows) async {
    await db.transaction((t) async {
      await t.delete('categories');
      for (final r in rows) {
        await t.insert('categories', {
          'id': r['id'], 'name': r['name'], 'sort_order': r['sort_order'] ?? 0, 'active': r['active'] == true ? 1 : 0,
        });
      }
    });
  }

  // ---------- clients ----------
  Future<List<ClientRow>> clientsWithTotals() async {
    final r = await db.rawQuery('''
      SELECT c.id, c.name, c.project_name, c.phone,
        COALESCE(SUM(CASE WHEN t.type='deposit' THEN t.amount_cents END),0) AS dep,
        COALESCE(SUM(CASE WHEN t.type='expense' THEN t.amount_cents END),0) AS exp
      FROM clients c LEFT JOIN transactions t ON t.client_id=c.id AND t.deleted=0
      WHERE c.active=1 GROUP BY c.id ORDER BY c.name''');
    return r
        .map((m) => ClientRow(m['id'] as String, m['name'] as String, m['project_name'] as String?,
            m['phone'] as String?, m['dep'] as int, m['exp'] as int))
        .toList();
  }

  Future<bool> clientNameExists(String name) async {
    final r = await db.query('clients', where: 'LOWER(name)=LOWER(?) AND active=1', whereArgs: [name]);
    return r.isNotEmpty;
  }

  Future<void> insertClient(Map<String, Object?> row) => db.insert('clients', row, conflictAlgorithm: ConflictAlgorithm.replace);

  // ---------- transactions ----------
  Future<void> insertTx(Map<String, Object?> row) => db.insert('transactions', row, conflictAlgorithm: ConflictAlgorithm.replace);

  Future<void> markTxDeleted(String id, String engineerId) => db.update(
      'transactions', {'deleted': 1, 'synced': 0, 'modified_by': engineerId}, where: 'id=?', whereArgs: [id]);

  Future<List<Tx>> allTx({String? clientId, String? from, String? to}) async {
    final where = <String>['t.deleted=0'];
    final args = <Object?>[];
    if (clientId != null) { where.add('t.client_id=?'); args.add(clientId); }
    if (from != null) { where.add('t.tx_date>=?'); args.add(from); }
    if (to != null) { where.add('t.tx_date<=?'); args.add(to); }
    final r = await db.rawQuery('''
      SELECT t.*, c.name AS client_name, cat.name AS category_name, r.name AS received_name, w.name AS recorded_name
      FROM transactions t JOIN clients c ON c.id=t.client_id
      LEFT JOIN categories cat ON cat.id=t.category_id
      LEFT JOIN engineers r ON r.id=t.received_by_id
      LEFT JOIN engineers w ON w.id=t.recorded_by_id
      WHERE ${where.join(' AND ')}
      ORDER BY t.tx_date DESC, t.created_at DESC''', args);
    return r.map(Tx.new).toList();
  }

  // ---------- sync ----------
  Future<int> pendingCount() async {
    final a = Sqflite.firstIntValue(await db.rawQuery('SELECT COUNT(*) FROM clients WHERE synced=0')) ?? 0;
    final b = Sqflite.firstIntValue(await db.rawQuery('SELECT COUNT(*) FROM transactions WHERE synced=0')) ?? 0;
    return a + b;
  }

  Future<List<Map<String, Object?>>> unsyncedClients() => db.query('clients', where: 'synced=0');
  Future<List<Map<String, Object?>>> unsyncedTx() => db.query('transactions', where: 'synced=0');

  Future<void> markSynced(String table, List<String> ids) async {
    final b = db.batch();
    for (final id in ids) { b.update(table, {'synced': 1}, where: 'id=?', whereArgs: [id]); }
    await b.commit(noResult: true);
  }

  Future<Set<String>> _unsyncedIds(DatabaseExecutor e, String table) async {
    final r = await e.query(table, columns: ['id'], where: 'synced=0');
    return r.map((m) => m['id'] as String).toSet();
  }

  Future<void> mergeClients(List<Map<String, dynamic>> rows) async {
    await db.transaction((t) async {
      final skip = await _unsyncedIds(t, 'clients');
      for (final r in rows) {
        if (skip.contains(r['id'])) continue;
        await t.insert('clients', {
          'id': r['id'], 'name': r['name'], 'project_name': r['project_name'], 'phone': r['phone'],
          'notes': r['notes'], 'active': r['active'] == true ? 1 : 0, 'synced': 1,
        }, conflictAlgorithm: ConflictAlgorithm.replace);
      }
    });
  }

  Future<void> mergeTx(List<Map<String, dynamic>> rows) async {
    await db.transaction((t) async {
      final skip = await _unsyncedIds(t, 'transactions');
      for (final r in rows) {
        if (skip.contains(r['id'])) continue;
        await t.insert('transactions', {
          'id': r['id'], 'client_id': r['client_id'], 'type': r['transaction_type'],
          'amount_cents': ((r['amount'] as num) * 100).round(), 'tx_date': r['transaction_date'],
          'description': r['description'], 'notes': r['notes'], 'category_id': r['expense_category_id'],
          'expense_kind': r['expense_kind'], 'payment_method': r['payment_method'],
          'received_by_id': r['received_by_engineer_id'], 'recorded_by_id': r['recorded_by_engineer_id'],
          'deleted': r['deleted_at'] == null ? 0 : 1, 'synced': 1, 'created_at': r['created_at'],
        }, conflictAlgorithm: ConflictAlgorithm.replace);
      }
    });
  }

  Future<void> clearAll() async {
    for (final t in ['transactions', 'clients', 'categories', 'engineers']) {
      await db.delete(t);
    }
  }
}
