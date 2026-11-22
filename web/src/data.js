import { createClient } from '@supabase/supabase-js';

export const officeEmail = import.meta.env.VITE_OFFICE_EMAIL || 'mashalybasha@gmail.com';
export const officeUsername = import.meta.env.VITE_OFFICE_USERNAME || 'AE-Designs';
export const url = import.meta.env.VITE_SUPABASE_URL;
export const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key);
export const supabase = configured ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

const DB = 'ae-finance-local';
const tables = ['clients', 'transactions', 'engineers', 'expense_categories'];
let activeUserId = null;
export function setActiveUser(id) { activeUserId = id ? String(id) : null; }
export function openDB() {
  if (!activeUserId) return Promise.reject(new Error('سجّل الدخول أولاً'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`${DB}-${activeUserId}`, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const table of tables) if (!db.objectStoreNames.contains(table)) db.createObjectStore(table, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function action(table, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(table, mode);
    let result;
    const request = fn(tx.objectStore(table));
    if (request) {
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error);
    }
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
export const all = table => action(table, 'readonly', store => store.getAll());
export const get = (table, id) => action(table, 'readonly', store => store.get(id));
export const put = (table, object) => action(table, 'readwrite', store => store.put(object));
export async function wipe() { for (const table of tables) await action(table, 'readwrite', store => store.clear()); }
export const formatMoney = (cents = 0) => `${(Number(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
export const dateAr = iso => iso ? iso.split('-').reverse().join('/') : '';
export const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export function parseCents(value) {
  const normalized = String(value).replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x6f0)).replace(/٫/g, '.').replace(/[,٬\s]/g, '');
  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric > 0 && numeric <= 1e9 ? Math.round(numeric * 100) : null;
}
const now = () => new Date().toISOString();
export async function makeClient(data, engineerId) {
  const obj = { id: crypto.randomUUID(), name: data.name.trim(), project_name: data.project?.trim() || null,
    phone: data.phone?.trim() || null, notes: null, active: true, modified_by_engineer_id: engineerId, synced: false };
  await put('clients', obj); return obj;
}
export async function makeTransaction(data) {
  const obj = { id: crypto.randomUUID(), client_id: data.clientId, transaction_type: data.type,
    amount: Math.round(data.cents) / 100, transaction_date: data.date,
    description: data.description?.trim() || (data.type === 'deposit' ? 'إيداع' : ''), notes: data.notes || null,
    expense_category_id: data.type === 'expense' ? data.categoryId : null,
    expense_kind: data.type === 'expense' ? data.kind : null,
    payment_method: data.type === 'deposit' ? data.method : null,
    received_by_engineer_id: data.type === 'deposit' ? data.recipientId : null,
    recorded_by_engineer_id: data.engineerId, modified_by_engineer_id: data.engineerId,
    deleted_at: null, created_at: now(), idempotency_key: null, synced: false };
  await put('transactions', obj); return obj;
}
export async function updateTransaction(id, data, engineerId) {
  const previous = await get('transactions', id);
  if (!previous || previous.deleted_at) throw new Error('المعاملة غير موجودة أو محذوفة');
  // Never spread hydrated UI rows into database payloads; keep stable ID, author and creation time.
  const changed = {
    ...previous, transaction_type: data.type, amount: Math.round(data.cents) / 100,
    transaction_date: data.date, description: data.description?.trim() || (data.type === 'deposit' ? 'إيداع' : ''),
    notes: data.notes?.trim() || null,
    expense_category_id: data.type === 'expense' ? data.categoryId : null,
    expense_kind: data.type === 'expense' ? data.kind : null,
    payment_method: data.type === 'deposit' ? data.method : null,
    received_by_engineer_id: data.type === 'deposit' ? data.recipientId : null,
    modified_by_engineer_id: engineerId, synced: false
  };
  await put('transactions', changed); return changed;
}
export async function removeTransaction(row, engineerId) {
  const saved = await get('transactions', row.id);
  if (!saved) throw new Error('المعاملة غير موجودة');
  await put('transactions', { ...saved, deleted_at: now(), modified_by_engineer_id: engineerId, synced: false });
}
export async function pendingCount() {
  const [clients, transactions] = await Promise.all([all('clients'), all('transactions')]);
  return clients.filter(x => !x.synced).length + transactions.filter(x => !x.synced).length;
}
const fields = {
  clients: 'id,name,project_name,phone,notes,active,modified_by_engineer_id',
  transactions: 'id,client_id,transaction_type,amount,transaction_date,description,notes,expense_category_id,expense_kind,payment_method,received_by_engineer_id,recorded_by_engineer_id,modified_by_engineer_id,deleted_at,created_at,idempotency_key',
  engineers: 'id,display_name,active', expense_categories: 'id,name,sort_order,active'
};
async function pullTable(table) {
  const records = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase.from(table).select(fields[table]).order('id').range(start, start + 999);
    if (error) throw error;
    records.push(...data);
    if (data.length < 1000) break;
  }
  return records;
}
export async function sync() {
  if (!supabase || !navigator.onLine) return { offline: true };
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { signedOut: true };
  for (const table of ['clients', 'transactions']) {
    const pending = (await all(table)).filter(x => !x.synced);
    if (pending.length) {
      const remote = pending.map(({ synced, ...row }) => table === 'transactions' ? { ...row, idempotency_key: row.id } : row);
      const { error } = await supabase.from(table).upsert(remote, { onConflict: 'id' });
      if (error) throw error;
      for (const item of pending) await put(table, { ...item, synced: true });
    }
  }
  for (const table of tables) {
    const local = await all(table);
    const pending = new Set(local.filter(x => !x.synced).map(x => x.id));
    const remote = await pullTable(table);
    for (const row of remote) if (!pending.has(row.id)) await put(table, { ...row, synced: true });
  }
  return { ok: true };
}
export function hydrateTransactions(tx, clients, engineers, categories) {
  const c = new Map(clients.map(x => [x.id, x]));
  const e = new Map(engineers.map(x => [x.id, x]));
  const cat = new Map(categories.map(x => [x.id, x]));
  return tx.filter(x => !x.deleted_at).map(t => ({ ...t,
    cents: Math.round(Number(t.amount) * 100), clientName: c.get(t.client_id)?.name || '',
    categoryName: cat.get(t.expense_category_id)?.name || '',
    recordedName: e.get(t.recorded_by_engineer_id)?.display_name || '',
    receivedName: e.get(t.received_by_engineer_id)?.display_name || ''
  })).sort((a, b) => (b.transaction_date || '').localeCompare(a.transaction_date || '') || (b.created_at || '').localeCompare(a.created_at || ''));
}
export function csvReport(tx) {
  const q = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const columns = 'التاريخ,العميل,النوع,البند,نوع الصرف,طريقة الإيداع,المستلم,سجّله,البيان,المبلغ,ملاحظات';
  return '\uFEFF' + [columns, ...[...tx].reverse().map(t => [t.transaction_date, q(t.clientName), t.transaction_type === 'deposit' ? 'إيداع' : 'صرف',
    q(t.categoryName), t.expense_kind === 'materials' ? 'خامات' : t.expense_kind === 'labor' ? 'مصنعية' : '',
    ({ cash: 'نقدي', instapay: 'InstaPay', vodafone_cash: 'Vodafone Cash' })[t.payment_method] || '',
    q(t.receivedName), q(t.recordedName), q(t.description), Number(t.amount).toFixed(2), q(t.notes)].join(','))].join('\r\n');
}

// A PIN is validated server-side. Neither plaintext nor hash is kept by the client.
export async function getPinStatuses() {
  const { data, error } = await supabase.rpc('engineer_pin_status');
  if (error) throw error;
  return data || [];
}
export async function setEngineerPin(engineerId, pin) {
  const { data, error } = await supabase.rpc('set_engineer_pin', { p_engineer_id: engineerId, p_pin: pin });
  if (error) throw error;
  return data === true;
}
export async function verifyEngineerPin(engineerId, pin) {
  const { data, error } = await supabase.rpc('verify_engineer_pin', { p_engineer_id: engineerId, p_pin: pin });
  if (error) throw error;
  return data || { ok: false };
}