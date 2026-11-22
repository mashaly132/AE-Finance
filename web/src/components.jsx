import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  LayoutDashboard, Users, Wallet, ChartNoAxesCombined, Settings, LockKeyhole, UserRound,
  ShieldCheck, ArrowLeft, ArrowRight, ArrowDownLeft, ArrowUpRight, Check, ChevronLeft,
  Cloud, CloudOff, RefreshCw, Plus, Search, Pencil, Trash2, LogOut, Download,
  FileSpreadsheet, FileText, X, CalendarDays, Image as ImageIcon, Tags, Receipt,
  Layers, CreditCard, TrendingUp, Menu, Eye, EyeOff, AlertCircle, CircleHelp, KeyRound
} from 'lucide-react';
import {
  all, dateAr, formatMoney, hydrateTransactions, isoToday, makeClient, makeTransaction,
  parseCents, pendingCount, removeTransaction, updateTransaction, officeEmail,
  officeUsername, supabase, sync, wipe, configured, setActiveUser,
  getPinStatuses, setEngineerPin, verifyEngineerPin
} from './data';
import { exportExcel, exportPdf, groupExpenses, groupDeposits, reportMetrics } from './export';
import { logoAsset } from './logo-data';
import './style.css';

const methods = { cash:'نقدي', instapay:'InstaPay', vodafone_cash:'Vodafone Cash' };
const kinds = { materials:'خامات', labor:'مصنعية' };
const logo = logoAsset;
const tabs = [
  { label:'الرئيسية', Icon:LayoutDashboard }, { label:'العملاء', Icon:Users },
  { label:'الخزينة', Icon:Wallet }, { label:'التقارير', Icon:ChartNoAxesCombined },
  { label:'الإعدادات', Icon:Settings }
];

function Logo({ className='', size='large' }) {
  const [remote, setRemote] = useState('');
  const [original, setOriginal] = useState('');
  useEffect(() => {
    // Preserve the exact original monogram; convert the white canvas to transparency.
    // Canvas processing happens only on the original grayscale asset. An embedded
    // transparent mark remains as a reliable offline fallback.
    let live = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!live) return;
      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 600 / img.naturalWidth);
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < pixels.data.length; i += 4) {
          const alpha = 255 - Math.min(pixels.data[i], pixels.data[i+1], pixels.data[i+2]);
          pixels.data[i] = pixels.data[i+1] = pixels.data[i+2] = 0;
          pixels.data[i+3] = alpha;
        }
        ctx.putImageData(pixels, 0, 0);
        if (live) setOriginal(canvas.toDataURL('image/png'));
      } catch (_) { /* Leave the embedded transparent backup visible. */ }
    };
    img.src = 'https://raw.githubusercontent.com/mashaly132/AE-Finance/master/assets/branding/ae_logo.png';
    return () => { live = false; img.onload = null; };
  }, []);
  useEffect(() => {
    if (!supabase) return;
    let live = true;
    supabase.from('app_settings').select('setting_value').eq('setting_key','brand_logo_path').maybeSingle()
      .then(async ({ data }) => {
        const path = data?.setting_value?.path;
        if (!path || path === 'branding/ae_logo.png') return;
        const {data:blob} = await supabase.storage.from('ae-branding').download(path);
        if (live && blob) setRemote(URL.createObjectURL(blob));
      }).catch(() => {});
    return () => { live = false; };
  }, []);
  return <span className={`brand-frame brand-${size} ${className}`}>
    <img className="brand-logo" src={remote || original || logo} alt="Ahmed Elsera Design Studio" onError={e => { e.currentTarget.src='https://raw.githubusercontent.com/mashaly132/AE-Finance/master/assets/branding/ae_logo.png'; }} />
  </span>;
}
function Button({ children, variant='primary', onClick, type='button', disabled, className='', title }) {
  return <button type={type} title={title} className={`btn btn-${variant} ${className}`} disabled={disabled} onClick={onClick}>{children}</button>;
}
function IconButton({ children, title, onClick, danger=false, disabled=false }) {
  return <button type="button" className={`icon-button ${danger?'danger':''}`} aria-label={title} title={title} onClick={onClick} disabled={disabled}>{children}</button>;
}
function Field({ label, value, onChange, type='text', required=false, placeholder='', autoComplete, inputMode, maxLength, children }) {
  return <label className="form-field"><span>{label}</span>{children || <input value={value ?? ''} onChange={e=>onChange(e.target.value)} type={type} required={required} placeholder={placeholder} autoComplete={autoComplete} inputMode={inputMode} maxLength={maxLength}/>}</label>;
}
function Select({ label, value, onChange, items, blank='اختر', required=false }) {
  return <Field label={label}><select value={value??''} required={required} onChange={e=>onChange(e.target.value)}><option value="">{blank}</option>{items.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>;
}
function Modal({ title, onClose, children, subtitle='' }) {
  useEffect(() => {const handler=e=>e.key==='Escape'&&onClose();document.addEventListener('keydown',handler);return()=>document.removeEventListener('keydown',handler);},[onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><section className="modal-panel" role="dialog" aria-modal="true" aria-label={title}><header className="modal-header"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><IconButton title="إغلاق" onClick={onClose}><X size={20}/></IconButton></header>{children}</section></div>;
}
function MoneyCard({ label, cents, kind='navy', Icon=Wallet, note }) {
  return <div className={`money-card money-${kind}`}><div className="money-top"><span>{label}</span><span className="money-icon"><Icon size={19}/></span></div><strong dir="ltr">{formatMoney(cents)}</strong>{note&&<small>{note}</small>}</div>;
}
function Empty({ message, Icon=Layers }) {return <div className="empty-state"><Icon size={26}/><p>{message}</p></div>}
function ChartRows({ rows, empty='لا توجد بيانات خلال الفترة المحددة' }) {
  const max=Math.max(1,...rows.map(r=>r.amount));
  return rows.length?<div className="bar-list">{rows.map((r,i)=><div className="bar-row" key={r.name}><div className="bar-label"><span>{r.name}</span><b>{formatMoney(Math.round(r.amount*100))}</b></div><div className="bar-track"><div className="bar-fill" style={{width:`${Math.max(2,(r.amount/max)*100)}%`,opacity:Math.max(.45,1-i*.075)}}/></div></div>)}</div>:<Empty message={empty}/>;
}
function AuthLogin({ onLogin, busy }) {
  const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[show,setShow]=useState(false),[error,setError]=useState('');
  return <div className="auth-shell"><div className="auth-art"><div className="auth-art-inner"><span className="eyebrow light">AE FINANCE / STUDIO MANAGEMENT</span><h1>إدارة مالية<br/>أبسط. أذكى.<br/>أوضح.</h1><p>كل حركة مالية للمكتب في مكان واحد، وبنفس الهوية اللي تعرفها.</p><div className="art-graphic"><span></span><span></span><span></span><span></span></div></div></div>
    <main className="auth-main"><div className="auth-panel"><Logo size="auth"/><span className="eyebrow">مساحة عمل خاصة بالمكتب</span><h1>أهلًا بيك من جديد</h1><p className="muted">سجّل دخولك باسم المستخدم وكلمة المرور</p>
      <form onSubmit={async e=>{e.preventDefault();setError('');try{await onLogin(username.trim(),password)}catch(err){setError(err.message||'تعذر تسجيل الدخول');}}}>
        <Field label="اسم المستخدم" placeholder="اسم المستخدم" value={username} onChange={setUsername} autoComplete="username" required/>
        <Field label="كلمة المرور"><div className="password-wrap"><input type={show?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required/><IconButton title={show?'إخفاء كلمة المرور':'إظهار كلمة المرور'} onClick={()=>setShow(v=>!v)}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</IconButton></div></Field>
        {error&&<div className="inline-error" role="alert"><AlertCircle size={16}/>{error}</div>}
        <Button type="submit" disabled={busy} className="auth-submit">{busy?<RefreshCw className="spin" size={18}/>:<ArrowLeft size={18}/>} {busy?'جاري الدخول...':'دخول المكتب'}</Button>
      </form><p className="login-footer"><LockKeyhole size={14}/> الحساب مخصص للمكتب فقط</p>
    </div></main></div>;
}
function PinGate({ engineers, statuses, onVerify, onSetup, onLogout, busy }) {
  const [selected,setSelected]=useState(''),[pin,setPin]=useState(''),[confirmPin,setConfirmPin]=useState(''),[error,setError]=useState('');
  const current=engineers.find(e=>e.id===selected);
  const hasPin=statuses.find(e=>e.engineer_id===selected)?.configured;
  const submit=async e=>{e.preventDefault();setError('');if(!/^\d{4}$/.test(pin)){setError('الـPIN لازم يكون 4 أرقام');return;}
    if(!hasPin&&pin!==confirmPin){setError('الرقمان مش متطابقين');return;}
    try{if(!hasPin){await onSetup(selected,pin);setPin('');setConfirmPin('');setError('اتحفظ الـPIN. اكتب الرقم مرة تانية للدخول.');}else{await onVerify(selected,pin);setPin('');}}
    catch(err){setError(err.message||'تعذر التحقق من الرقم');}};
  return <div className="gate-shell"><div className="gate-card"><Logo size="small"/><span className="pill"><ShieldCheck size={15}/> حماية إضافية</span><h1>مين المهندس اللي داخل؟</h1><p className="muted">اختار اسمك ثم أدخل رقم الـ PIN الخاص بيك</p>
    <div className="engineer-choices">{engineers.filter(x=>x.active).map(e=><button type="button" key={e.id} className={`engineer-option ${selected===e.id?'selected':''}`} onClick={()=>{setSelected(e.id);setPin('');setConfirmPin('');setError('')}}><span className="engineer-avatar"><UserRound size={20}/></span><span>{e.display_name}</span>{selected===e.id?<Check size={17}/>:<ChevronLeft size={16}/>}</button>)}</div>
    {!engineers.length&&<Empty message="بنحمّل قائمة المهندسين، اتأكد من اتصال الإنترنت" Icon={RefreshCw}/>}
    {current&&<form className="pin-form" onSubmit={submit}><h3>{hasPin?'أدخل PIN المهندس':'إعداد PIN لأول مرة'}</h3>{!hasPin&&<p className="helper">حدد رقم جديد مكوّن من 4 أرقام، مش هيتعرض تاني.</p>}
      <input className="pin-input" value={pin} type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{4}" maxLength={4} placeholder="• • • •" aria-label="PIN من 4 أرقام" onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,4))} required/>
      {!hasPin&&<input className="pin-input pin-confirm" value={confirmPin} type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{4}" maxLength={4} placeholder="تأكيد PIN" aria-label="تأكيد PIN" onChange={e=>setConfirmPin(e.target.value.replace(/\D/g,'').slice(0,4))} required/>}
      {error&&<p className={error.startsWith('اتحفظ')?'inline-ok':'inline-error'} role="status">{error}</p>}
      <Button type="submit" disabled={busy||pin.length!==4}>{busy?<RefreshCw size={17} className="spin"/>:<LockKeyhole size={17}/>} {hasPin?'فتح حساب المهندس':'حفظ الرقم'}</Button>
    </form>}
    <button className="text-link" onClick={onLogout}><LogOut size={15}/> تسجيل خروج المكتب</button>
  </div></div>;
}
function TransactionForm({ client, type, item, categories, engineers, onClose, onSave, saving }) {
  const editing=!!item;
  const [categoryId,setCategoryId]=useState(item?.expense_category_id||'');
  const [kind,setKind]=useState(item?.expense_kind||'');
  const [method,setMethod]=useState(item?.payment_method||'');
  const [recipientId,setRecipientId]=useState(item?.received_by_engineer_id||'');
  const [description,setDescription]=useState(item?.description||'');
  const [amount,setAmount]=useState(item?.amount!=null?String(item.amount):'');
  const [date,setDate]=useState(item?.transaction_date||isoToday());
  const [notes,setNotes]=useState(item?.notes||'');
  return <Modal title={editing?'تعديل المعاملة':type==='deposit'?'إضافة إيداع':'إضافة مصروف'} subtitle={client?.name||''} onClose={onClose}><form className="form-stack" onSubmit={e=>{e.preventDefault();onSave({type,categoryId,kind,method,recipientId,description,amount,date,notes},item?.id);}}>
    <span className={`type-caption ${type}`}>{type==='deposit'?<ArrowDownLeft size={17}/>:<ArrowUpRight size={17}/>} {type==='deposit'?'إيداع مالي':'مصروف مالي'}</span>
    {type==='expense'?<div className="form-grid"><Select label="بند المصروف *" value={categoryId} onChange={setCategoryId} required items={categories.map(c=>({id:c.id,label:c.name}))}/><Select label="نوع الصرف *" value={kind} onChange={setKind} required items={Object.entries(kinds).map(([id,label])=>({id,label}))}/></div>:<div className="form-grid"><Select label="طريقة الإيداع *" value={method} onChange={setMethod} required items={Object.entries(methods).map(([id,label])=>({id,label}))}/><Select label="المهندس المستلم *" value={recipientId} onChange={setRecipientId} required items={engineers.map(e=>({id:e.id,label:e.display_name}))}/></div>}
    <Field label={type==='deposit'?'بيان الإيداع':'وصف المصروف *'} value={description} onChange={setDescription} required={type==='expense'} placeholder="تفاصيل العملية"/>
    <div className="form-grid"><Field label="المبلغ (ج.م) *" value={amount} onChange={setAmount} required inputMode="decimal" placeholder="0.00"/><Field label="التاريخ" value={date} type="date" onChange={setDate} required/></div>
    <Field label="ملاحظات (اختياري)" value={notes} onChange={setNotes} placeholder="أضف ملاحظة..."/>
    <div className="modal-actions"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button type="submit" disabled={saving}>{saving?'جاري الحفظ...':editing?'حفظ التعديل':'حفظ المعاملة'}</Button></div>
  </form></Modal>;
}
function ClientForm({ onClose, onSave }) {
  const [name,setName]=useState(''),[project,setProject]=useState(''),[phone,setPhone]=useState('');
  return <Modal title="إضافة عميل جديد" onClose={onClose}><form className="form-stack" onSubmit={e=>{e.preventDefault();onSave({name,project,phone});}}><Field label="اسم العميل *" value={name} onChange={setName} required/><Field label="اسم المشروع" value={project} onChange={setProject}/><Field label="رقم الهاتف" value={phone} onChange={setPhone} inputMode="tel"/><div className="modal-actions"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button type="submit">إضافة عميل</Button></div></form></Modal>;
}
function ManageList({ title, rows, isEngineer, onClose, onAdd, onToggle, loading }) {
  const [name,setName]=useState('');
  return <Modal title={title} onClose={onClose}><form className="inline-add" onSubmit={e=>{e.preventDefault();onAdd(name).then(()=>setName(''));}}><input placeholder={isEngineer?'اسم المهندس':'اسم البند'} value={name} onChange={e=>setName(e.target.value)} required/><Button type="submit" disabled={loading}><Plus size={17}/> إضافة</Button></form><div className="manage-list">{rows.map(r=><label className="manage-item" key={r.id}><span><b>{isEngineer?r.display_name:r.name}</b><small>{r.active?'مفعّل':'موقوف'}</small></span><input type="checkbox" checked={r.active} onChange={e=>onToggle(r.id,e.target.checked)}/></label>)}</div></Modal>;
}
function ReportDocument({ rows, clientLabel, from, to }) {
  const m=reportMetrics(rows),expenses=groupExpenses(rows),deposits=groupDeposits(rows);
  return <div className="report-document" dir="rtl"><div className="doc-head"><div><strong>AE FINANCE</strong><span>تقرير حسابات المكتب</span></div><div className="doc-date">{dateAr(isoToday())}</div></div><div className="doc-meta">{clientLabel} {from?` | من ${dateAr(from)}`:''} {to?` | حتى ${dateAr(to)}`:''}</div>
    <div className="doc-kpis"><div><span>الإيداعات</span><b>{formatMoney(m.dep)}</b></div><div><span>المصروفات</span><b>{formatMoney(m.exp)}</b></div><div><span>الرصيد</span><b>{formatMoney(m.dep-m.exp)}</b></div></div>
    <h3>بنود المصروفات</h3><table><thead><tr><th>البند</th><th>الإجمالي</th></tr></thead><tbody>{expenses.map(r=><tr key={r.name}><td>{r.name}</td><td>{formatMoney(Math.round(r.amount*100))}</td></tr>)}{!expenses.length&&<tr><td colSpan="2">لا يوجد</td></tr>}</tbody></table>
    <h3>طرق الإيداع</h3><table><thead><tr><th>الطريقة</th><th>الإجمالي</th></tr></thead><tbody>{deposits.map(r=><tr key={r.name}><td>{r.name}</td><td>{formatMoney(Math.round(r.amount*100))}</td></tr>)}{!deposits.length&&<tr><td colSpan="2">لا يوجد</td></tr>}</tbody></table>
    <h3>تفاصيل المعاملات ({rows.length})</h3><table className="details-table"><thead><tr><th>التاريخ</th><th>العميل</th><th>النوع</th><th>البيان / البند</th><th>المبلغ</th></tr></thead><tbody>{rows.map(t=><tr key={t.id}><td>{dateAr(t.transaction_date)}</td><td>{t.clientName}</td><td>{t.transaction_type==='deposit'?'إيداع':'صرف'}</td><td>{t.description}{t.categoryName?` - ${t.categoryName}`:''}</td><td>{formatMoney(t.cents)}</td></tr>)}{!rows.length&&<tr><td colSpan="5">لا توجد معاملات</td></tr>}</tbody></table>
    <footer>AE Finance • تقرير مُنشأ من نظام إدارة حسابات المكتب</footer>
  </div>;
}

export { Logo, Button, IconButton, Field, Select, Modal, MoneyCard, Empty, ChartRows, AuthLogin, PinGate, TransactionForm, ClientForm, ManageList, ReportDocument };