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
  parseCents, pendingCount, removeTransaction, updateTransaction, updateClientSupervision, officeEmail,
  officeUsername, supabase, sync, wipe, configured, setActiveUser,
  getPinStatuses, setEngineerPin, verifyEngineerPin
} from './data';
import { exportExcel, exportPdf, groupExpenses, groupDeposits, reportMetrics } from './export';
import { AccountSettings } from './account-settings';
import './style.css';

const methods = { cash:'نقدي', instapay:'InstaPay', vodafone_cash:'Vodafone Cash' };
const kinds = { materials:'خامات', labor:'مصنعية' };
const tabs = [
  { label:'الرئيسية', Icon:LayoutDashboard }, { label:'العملاء', Icon:Users },
  { label:'الخزينة', Icon:Wallet }, { label:'التقارير', Icon:ChartNoAxesCombined },
  { label:'الإعدادات', Icon:Settings }
];

import { Logo, Button, IconButton, Field, Select, Modal, MoneyCard, Empty, ChartRows, AuthLogin, PinGate, TransactionForm, ClientForm, SupervisionPercentForm, ManageList, ReportDocument } from './components';
function App() {
  const [session,setSession]=useState(undefined),[approved,setApproved]=useState(undefined);
  const [engineer,setEngineer]=useState(null),[engineers,setEngineers]=useState([]),[pinStatuses,setPinStatuses]=useState([]);
  const [clients,setClients]=useState([]),[transactions,setTransactions]=useState([]),[categories,setCategories]=useState([]);
  const [tab,setTab]=useState(0),[selectedClient,setSelectedClient]=useState(null),[modal,setModal]=useState(null);
  const [query,setQuery]=useState(''),[reportClient,setReportClient]=useState(''),[reportView,setReportView]=useState('expenses');
  const [from,setFrom]=useState(''),[to,setTo]=useState(''),[busy,setBusy]=useState(false),[pinBusy,setPinBusy]=useState(false);
  const [error,setError]=useState(''),[online,setOnline]=useState(navigator.onLine),[pending,setPending]=useState(0),[lastSync,setLastSync]=useState('');
  const [sidebarOpen,setSidebarOpen]=useState(false),[exporting,setExporting]=useState(false);
  const [logoUploading,setLogoUploading]=useState(false),[logoMessage,setLogoMessage]=useState('');
  const notify=message=>setError(message);
  const loadEngineers=useCallback(async()=>{
    if(!supabase)return;
    try{const [people,pins]=await Promise.all([supabase.from('engineers').select('id,display_name,active').order('display_name'),getPinStatuses()]);if(people.error)throw people.error;setEngineers(people.data||[]);setPinStatuses(pins);}catch(e){notify(e.message);}
  },[]);
  const refresh=useCallback(async()=>{
    try{const [c,t,e,cat,p]=await Promise.all([all('clients'),all('transactions'),all('engineers'),all('expense_categories'),pendingCount()]);setClients(c);setTransactions(t);setEngineers(e);setCategories(cat.sort((a,b)=>a.sort_order-b.sort_order));setPending(p);}catch(e){notify(e.message);}
  },[]);
  const doSync=useCallback(async()=>{
    if(!supabase||!navigator.onLine)return;
    setBusy(true);try{await sync();await refresh();setLastSync(new Date().toLocaleString('ar-EG'));setError('');}catch(e){notify(e.message);}finally{setBusy(false);}
  },[refresh]);
  useEffect(()=>{
    if(!supabase){setSession(null);return;}
    let live=true;
    supabase.auth.getSession().then(({data,error})=>{if(live)setSession(error?null:data.session);}).catch(()=>{if(live)setSession(null);});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_ev,s)=>{if(live)setSession(s);});
    const onOnline=()=>setOnline(true),onOffline=()=>setOnline(false);
    window.addEventListener('online',onOnline);window.addEventListener('offline',onOffline);
    return()=>{live=false;subscription.unsubscribe();window.removeEventListener('online',onOnline);window.removeEventListener('offline',onOffline);};
  },[]);
  useEffect(()=>{
    let live=true;const userId=session?.user?.id;
    if(!userId){setApproved(undefined);setActiveUser(null);setEngineer(null);return;}
    setActiveUser(userId);setApproved(undefined);setEngineer(null);
    (async()=>{try{
      if(!navigator.onLine)throw new Error('لازم تكون متصل بالإنترنت للتأكد من صلاحية حساب المكتب');
      const {data,error}=await supabase.from('office_members').select('user_id').eq('user_id',userId).eq('active',true).maybeSingle();if(error)throw error;
      if(live){setApproved(!!data);if(data)await loadEngineers();}
    }catch(e){if(live){notify(e.message);setApproved(false);}}})();return()=>{live=false;};
  },[session?.user?.id,loadEngineers]);
  useEffect(()=>{if(engineer){refresh();doSync();}},[engineer?.id,refresh,doSync]);
  useEffect(()=>{if(!engineer)return;const callback=()=>doSync();window.addEventListener('online',callback);return()=>window.removeEventListener('online',callback);},[engineer?.id,doSync]);
  const rows=useMemo(()=>hydrateTransactions(transactions,clients,engineers,categories),[transactions,clients,engineers,categories]);
  const customerBalances=useMemo(()=>clients.filter(c=>c.active).map(c=>{
    const entries=rows.filter(t=>t.client_id===c.id);
    const deposits=entries.filter(t=>t.transaction_type==='deposit');
    const dep=deposits.reduce((sum,t)=>sum+t.cents,0);
    const exp=entries.filter(t=>t.transaction_type==='expense').reduce((sum,t)=>sum+t.cents,0);
    const supPaid=entries.filter(t=>t.transaction_type==='supervision').reduce((sum,t)=>sum+t.cents,0);
    const rate=Number(c.supervision_percent)||0;
    const supDue=deposits.reduce((sum,t)=>sum+Math.round(t.cents*rate/100),0);
    return {...c,dep,exp,supPaid,supDue,supRemaining:Math.max(0,supDue-supPaid),balance:dep-exp-supPaid};
  }).sort((a,b)=>a.name.localeCompare(b.name,'ar')),[clients,rows]);
  const summary=reportMetrics(rows);
  const filteredReport=useMemo(()=>rows.filter(t=>(!reportClient||t.client_id===reportClient)&&(!from||t.transaction_date>=from)&&(!to||t.transaction_date<=to)),[rows,reportClient,from,to]);
  const report=reportMetrics(filteredReport),expenseGroups=groupExpenses(filteredReport),depositGroups=groupDeposits(filteredReport);
  const clientLabel=reportClient?clients.find(c=>c.id===reportClient)?.name||'عميل':'كل العملاء';
  const activeCategories=categories.filter(c=>c.active),activeEngineers=engineers.filter(e=>e.active);
  const latestRows=rows.slice(0,6);
  const activeClient=selectedClient&&customerBalances.find(c=>c.id===selectedClient.id);
  const clientRows=rows.filter(t=>t.client_id===selectedClient?.id);
  const clientMetrics=reportMetrics(clientRows);
  async function saveSupervisionPercent(value){
    if(!activeClient)throw new Error('اختار عميل الأول');
    setBusy(true);
    try{
      const newRate=await updateClientSupervision(activeClient.id,value,engineer.id);
      setModal(null);await refresh();
      if(navigator.onLine){await sync();await refresh();}
      else notify('نسبة الإشراف اتسجلت محليًا، والإيداعات السابقة هيتعاد حسابها بعد المزامنة');
      return newRate;
    }finally{setBusy(false);}
  }
  async function onLogin(username,password){
    const accountName=username.trim().toLowerCase();
    if(accountName!==officeUsername.toLowerCase()&&!/^[a-z][a-z0-9_]{2,31}$/.test(accountName))throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة');
    const signInEmail=accountName===officeUsername.toLowerCase()?officeEmail:`${accountName}@accounts.aefinance.invalid`;
    const {error:authError}=await supabase.auth.signInWithPassword({email:signInEmail,password});
    if(authError)throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة');
  }
  async function onPinVerify(engineerId,pin){setPinBusy(true);try{
    if(!navigator.onLine)throw new Error('التحقق من الـPIN يحتاج إنترنت');
    const result=await verifyEngineerPin(engineerId,pin);
    if(!result?.ok){if(result?.reason==='locked')throw new Error('تم إيقاف المحاولات 15 دقيقة بسبب الرقم الخاطئ');throw new Error(`PIN غير صحيح${result?.remaining!=null?`، باقي ${result.remaining} محاولات`:''}`);}
    setEngineer(engineers.find(e=>e.id===engineerId));setTab(0);
  }finally{setPinBusy(false);}}
  async function onPinSetup(engineerId,pin){setPinBusy(true);try{
    if(!navigator.onLine)throw new Error('إعداد الـPIN يحتاج إنترنت');
    await setEngineerPin(engineerId,pin);await loadEngineers();
  }finally{setPinBusy(false);}}
  async function signOut(){const n=await pendingCount().catch(()=>0);if(n){alert(`فيه ${n} عملية لسه مش متزامنة. زامن الأول`);return;}if(!window.confirm('تسجيل خروج من حساب المكتب؟'))return;await wipe();await supabase.auth.signOut();setEngineer(null);}
  async function saveClient(d){if(!d.name.trim())return;try{
    if(clients.some(c=>c.active&&c.name.toLowerCase()===d.name.trim().toLowerCase())&&!window.confirm('فيه عميل بنفس الاسم. تضيفه؟'))return;
    await makeClient(d,engineer.id);setModal(null);await refresh();doSync();
  }catch(e){alert(e.message);}}
  async function saveTx(data,id){const cents=parseCents(data.amount);if(!cents||data.type==='expense'&&(!data.categoryId||!data.kind||!data.description.trim())||data.type==='deposit'&&(!data.method||!data.recipientId)){alert('راجع الحقول المطلوبة والمبلغ');return;}
    setBusy(true);try{
      if(id)await updateTransaction(id,{...data,cents},engineer.id);
      else await makeTransaction({...data,cents,clientId:selectedClient.id,engineerId:engineer.id});
      setModal(null);await refresh();doSync();
    }catch(e){alert(e.message)}finally{setBusy(false);}}
  async function deleteTx(t){if(t.supervision_source_deposit_id){alert('رسوم الإشراف دي محسوبة تلقائيًا من إيداع. عدّل الإيداع أو نسبة الإشراف بدل حذفها.');return;}if(!window.confirm(`متأكد من حذف العملية «${t.description}» بمبلغ ${formatMoney(t.cents)}؟`))return;
    try{await removeTransaction(t,engineer.id);await refresh();doSync();}catch(e){alert(e.message);}}
  async function saveLookup(table,name){if(!name.trim())return;
    const payload=table==='engineers'?{display_name:name.trim()}:{name:name.trim(),sort_order:Math.max(0,...categories.map(c=>c.sort_order))+1};
    const {error:e}=await supabase.from(table).insert(payload);if(e)throw e;await doSync();}
  async function toggleLookup(table,id,active){const {error:e}=await supabase.from(table).update({active}).eq('id',id);if(e)alert(e.message);else await doSync();}
  async function uploadLogo(file){
    if(!file)return;
    const extensions={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
    const ext=extensions[file.type];
    if(!ext){setLogoMessage('اختار صورة PNG أو JPG أو WEBP');return;}
    if(file.size>3*1024*1024){setLogoMessage('حجم اللوجو لازم ما يزيدش عن 3 ميجابايت');return;}
    setLogoUploading(true);setLogoMessage('');
    try {
      if(!navigator.onLine)throw new Error('لازم الإنترنت يكون متصل عشان نحفظ اللوجو');
      const path=`branding/logo_${Date.now()}_${Math.random().toString(36).slice(2,10)}.${ext}`;
      const {error:uploadError}=await supabase.storage.from('ae-branding').upload(path,file,{contentType:file.type,upsert:false});
      if(uploadError)throw uploadError;
      const {error:saveError}=await supabase.from('app_settings').upsert({setting_key:'brand_logo_path',setting_value:{path},updated_by:engineer.id});
      if(saveError)throw saveError;
      const {data:confirmed,error:readError}=await supabase.from('app_settings').select('setting_value').eq('setting_key','brand_logo_path').maybeSingle();
      if(readError||confirmed?.setting_value?.path!==path)throw new Error('لم نتمكن من التأكد من حفظ اللوجو. جرّب مرة تانية');
      window.dispatchEvent(new Event('ae-finance:brand-logo-updated'));
      setLogoMessage('تم حفظ اللوجو الجديد. هيتحدث في النظام بدون إعادة تسجيل الدخول.');
    }catch(e){setLogoMessage('حصل خطأ أثناء تغيير اللوجو: '+(e?.message||'راجع الاتصال والصلاحيات'));}
    finally{setLogoUploading(false);}
  }
  async function downloadReport(format){if(!filteredReport.length)return;setExporting(true);try{
    if(format==='xlsx')await exportExcel(filteredReport,clientLabel);
    else await exportPdf(document.getElementById('print-report'),`AE-Finance-Report-${isoToday()}.pdf`);
  }catch(e){alert('حصل خطأ أثناء تجهيز التقرير: '+e.message);}finally{setExporting(false);}}
  const txnList=(list)=><div className="transactions-list">{list.length?list.map(t=><article className="tx-card" key={t.id}><span className={`tx-bubble ${t.transaction_type}`}>
    {t.transaction_type==='deposit'?<ArrowDownLeft size={20}/>:<ArrowUpRight size={20}/>}</span>
    <div className="tx-content"><strong>{t.description||'إيداع'}</strong><small>{dateAr(t.transaction_date)} • {t.clientName} {t.categoryName?`• ${t.categoryName}`:''}</small><span className={`tx-type ${t.transaction_type}`}>{t.transaction_type==='deposit'?'إيداع':t.transaction_type==='supervision'?'نسبة إشراف':'مصروف'}{t.supervision_source_deposit_id?' · احتساب تلقائي':''}{!t.synced?' · لم تتم المزامنة':''}</span></div>
    <div className="tx-end"><strong className={t.transaction_type==='deposit'?'positive':'negative'} dir="ltr">{t.transaction_type==='deposit'?'+':'-'}{formatMoney(t.cents)}</strong><div className="tx-actions">{!t.supervision_source_deposit_id&&<><IconButton title="تعديل" onClick={()=>{setSelectedClient(clients.find(c=>c.id===t.client_id));setModal({type:'tx',txType:t.transaction_type,item:t});}}><Pencil size={17}/></IconButton><IconButton title="حذف" danger onClick={()=>deleteTx(t)}><Trash2 size={17}/></IconButton></>}</div></div>
  </article>):<Empty message="مفيش معاملات في الجزء ده" Icon={Receipt}/>}</div>;
  if(!configured)return <div className="config-error"><AlertCircle size={30}/><h2>بيانات اتصال Supabase ناقصة</h2><p>راجع إعدادات Vercel الخاصة بالمشروع.</p></div>;
  if(session===undefined)return <div className="splash"><Logo size="small"/><RefreshCw className="spin" size={23}/></div>;
  if(!session)return <AuthLogin onLogin={onLogin} busy={busy}/>;
  if(approved===undefined)return <div className="splash"><Logo size="small"/><p>بنتأكد من صلاحية المكتب...</p><RefreshCw className="spin" size={21}/></div>;
  if(!approved)return <div className="denied"><ShieldCheck size={30}/><h2>الحساب غير معتمد</h2><p>{error||'حسابك مش موجود ضمن أعضاء المكتب المسموح لهم.'}</p><Button onClick={()=>supabase.auth.signOut()}>تسجيل خروج</Button></div>;
  if(!engineer)return <PinGate engineers={engineers} statuses={pinStatuses} onVerify={onPinVerify} onSetup={onPinSetup} onLogout={()=>supabase.auth.signOut()} busy={pinBusy}/>;
  const titles=['نظرة عامة','حسابات العملاء','الخزينة','التقارير المالية','إعدادات المكتب'];
  return <div className="shell">
    <aside className={`sidebar ${sidebarOpen?'open':''}`}><div className="sidebar-brand"><span className="brand-monogram">AE</span><div><b>AE FINANCE</b><small>Design Studio</small></div></div><nav aria-label="التنقل الرئيسي">{tabs.map(({label,Icon},i)=><button key={i} title={label} className={`nav-item ${tab===i?'active':''}`} onClick={()=>{setTab(i);setSelectedClient(null);setSidebarOpen(false);}}><Icon size={20}/>{label}</button>)}</nav><div className="sidebar-bottom"><div className="engineer-pill"><UserRound size={18}/><span><strong>{engineer.display_name}</strong><small>حساب المكتب</small></span></div><button className="side-signout" onClick={()=>{setEngineer(null);setSelectedClient(null);}}><KeyRound size={18}/> قفل دخول المهندس</button></div></aside>
    <div className="workarea"><header className="app-header"><div className="header-main"><IconButton title="القائمة" onClick={()=>setSidebarOpen(o=>!o)}><Menu size={21}/></IconButton><div><small>AE FINANCE / WORKSPACE</small><h1>{selectedClient?'تفاصيل العميل':titles[tab]}</h1></div></div><div className="header-actions"><span className={`network-pill ${online?'online':'offline'}`} title={online?'متصل بالإنترنت':'لا يوجد اتصال'}>{online?<Cloud size={15}/>:<CloudOff size={15}/>}<span>{online?'متصل':'أوفلاين'}</span></span><IconButton title="مزامنة البيانات" onClick={doSync} disabled={busy}><RefreshCw className={busy?'spin':''} size={19}/></IconButton><span className="header-avatar" title={engineer.display_name}><UserRound size={18}/></span></div></header>
    {error&&<div className="app-alert"><AlertCircle size={17}/><span>{error}</span><IconButton title="إغلاق التنبيه" onClick={()=>setError('')}><X size={16}/></IconButton></div>}
    <main className="main-content">
      {selectedClient&&activeClient?<><div className="section-heading"><button className="backlink" onClick={()=>setSelectedClient(null)}><ArrowRight size={17}/> العملاء</button><div><h2>{activeClient.name}</h2><p>{activeClient.project_name||'حساب العميل'}</p></div><Button className="desktop-inline" onClick={()=>setModal({type:'chooseTx'})}><Plus size={18}/> معاملة جديدة</Button></div>
        <div className="metrics-grid"><MoneyCard label="الإيداعات" cents={clientMetrics.dep} kind="green" Icon={ArrowDownLeft}/><MoneyCard label="المصروفات" cents={clientMetrics.exp} kind="red" Icon={ArrowUpRight}/><MoneyCard label="نسبة الإشراف المحصلة" cents={activeClient.supPaid} Icon={Wallet}/><MoneyCard label="الرصيد بعد الإشراف" cents={activeClient.balance} Icon={Wallet}/></div>
        <section className="panel supervision-panel" aria-label="ملخص نسبة الإشراف">
          <div className="panel-head"><div><h3>نسبة الإشراف — {Number(activeClient.supervision_percent||0).toLocaleString('en-US')}%</h3><small>بتتحسب على إجمالي إيداعات العميل</small></div><Button variant="outline" onClick={()=>setModal({type:'supervisionRate'})}><Pencil size={16}/> تعديل النسبة</Button></div>
          <div className="supervision-summary">
            <div><span>الإشراف المستحق حتى الآن</span><strong>{formatMoney(activeClient.supDue)}</strong></div>
            <div><span>الإشراف المحصّل بالفعل</span><strong>{formatMoney(activeClient.supPaid)}</strong></div>
            <div><span>المتبقي من الإشراف</span><strong>{formatMoney(activeClient.supRemaining)}</strong></div>
          </div>
          <p className="supervision-note">كل إيداع جديد بيتحسب عليه إشراف تلقائيًا، وينزل في حركة حساب العميل ويتخصم من رصيده مرة واحدة.</p>
        </section>
        <div className="panel"><div className="panel-head"><h3>حركة حساب العميل</h3><span>{clientRows.length} معاملة</span></div>{txnList(clientRows)}</div><Button className="mobile-add" onClick={()=>setModal({type:'chooseTx'})}><Plus size={17}/> معاملة جديدة</Button>
      </>:tab===0?<><div className="welcome-block"><div><span className="eyebrow light">نظرة عامة</span><h2>أهلًا يا {engineer.display_name.split(' ').pop()} 👋</h2><p>كل حسابات المكتب، في صورة واضحة.</p></div><div className="welcome-decoration"><TrendingUp size={54}/></div></div>
        <div className="metrics-grid"><MoneyCard label="إجمالي الإيداعات" cents={summary.dep} kind="green" Icon={ArrowDownLeft}/><MoneyCard label="إجمالي المصروفات" cents={summary.exp} kind="red" Icon={ArrowUpRight}/><MoneyCard label="صافي الرصيد بعد الإشراف" cents={summary.dep-summary.exp-summary.sup} Icon={Wallet}/></div>
        <div className="quick-stats"><div><Users size={21}/><span><b>{customerBalances.length}</b><small>عميل نشط</small></span></div><div><Receipt size={21}/><span><b>{rows.length}</b><small>معاملة</small></span></div><div><Cloud size={21}/><span><b>{pending}</b><small>بانتظار المزامنة</small></span></div></div>
        <div className="dashboard-grid"><section className="panel"><div className="panel-head"><h3>أحدث المعاملات</h3><button className="link-button" onClick={()=>setTab(2)}>عرض الخزينة <ChevronLeft size={15}/></button></div>{txnList(latestRows)}</section>
          <section className="panel"><div className="panel-head"><h3>أكبر بنود المصروفات</h3><button className="link-button" onClick={()=>{setTab(3);setReportView('expenses');}}>التقرير <ChevronLeft size={15}/></button></div><ChartRows rows={groupExpenses(rows).slice(0,6)}/></section></div>
      </>:tab===1?<><div className="section-heading"><div><h2>العملاء</h2><p>تابع أرصدة ومشروعات العملاء</p></div><Button className="desktop-inline" onClick={()=>setModal({type:'client'})}><Plus size={17}/> إضافة عميل</Button></div>
        <div className="search-box"><Search size={20}/><input aria-label="بحث في العملاء" value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث باسم العميل أو المشروع..."/></div>
        <div className="customer-grid">{customerBalances.filter(c=>c.name.toLowerCase().includes(query.toLowerCase())||(c.project_name||'').toLowerCase().includes(query.toLowerCase())).map(c=><button className="customer-card" key={c.id} onClick={()=>setSelectedClient(c)}><span className="customer-avatar"><UserRound size={22}/></span><div className="customer-body"><strong>{c.name}</strong><small>{c.project_name||'بدون مشروع'}</small></div><span className={`customer-balance ${c.balance<0?'negative':'positive'}`} dir="ltr">{formatMoney(c.balance)}</span><ChevronLeft size={17}/></button>)}</div>{customerBalances.length===0&&<Empty message="أضف أول عميل عشان تبدأ" Icon={Users}/>}<Button className="mobile-add" onClick={()=>setModal({type:'client'})}><Plus size={17}/> إضافة عميل</Button>
      </>:tab===2?<><div className="section-heading"><div><h2>الخزينة</h2><p>متابعة حركة النقد والإيداعات</p></div><span className="subdued-pill"><Receipt size={16}/>{rows.length} معاملة</span></div>
        <div className="metrics-grid"><MoneyCard label="الإيداعات" cents={summary.dep} kind="green" Icon={ArrowDownLeft}/><MoneyCard label="المصروفات" cents={summary.exp} kind="red" Icon={ArrowUpRight}/><MoneyCard label="المتبقي بعد الإشراف" cents={summary.dep-summary.exp-summary.sup} Icon={Wallet}/></div>
        <div className="dashboard-grid"><section className="panel"><div className="panel-head"><h3>الإيداعات حسب الطريقة</h3></div><ChartRows rows={groupDeposits(rows)}/></section><section className="panel"><div className="panel-head"><h3>المبالغ المستلمة حسب المهندس</h3></div><ChartRows rows={engineers.map(e=>({name:e.display_name,amount:rows.filter(t=>t.transaction_type==='deposit'&&t.received_by_engineer_id===e.id).reduce((s,t)=>s+t.amount,0)})).filter(x=>x.amount>0)}/></section></div><section className="panel"><div className="panel-head"><h3>جميع المعاملات</h3></div>{txnList(rows)}</section>
      </>:tab===3?<><div className="section-heading"><div><h2>التقارير المالية</h2><p>لوحة تحليل كاملة بالتفاصيل والبنود</p></div><span className="subdued-pill"><CalendarDays size={16}/>{filteredReport.length} معاملة</span></div>
        <div className="panel filters-panel"><Select label="العميل" value={reportClient} onChange={setReportClient} blank="كل العملاء" items={customerBalances.map(c=>({id:c.id,label:c.name}))}/><Field label="من تاريخ" value={from} onChange={setFrom} type="date"/><Field label="إلى تاريخ" value={to} onChange={setTo} type="date"/><Button variant="ghost" onClick={()=>{setReportClient('');setFrom('');setTo('');}}>مسح الفلاتر</Button></div>
        <div className="metrics-grid"><MoneyCard label="إجمالي الإيداعات" cents={report.dep} kind="green" Icon={ArrowDownLeft}/><MoneyCard label="إجمالي المصروفات" cents={report.exp} kind="red" Icon={ArrowUpRight}/><MoneyCard label="صافي الرصيد بعد الإشراف" cents={report.dep-report.exp-report.sup} Icon={Wallet}/></div>
        <div className="report-tabs" role="tablist" aria-label="أقسام التقارير">{[['expenses','بنود المصروفات'],['deposits','طرق الإيداع'],['clients','حسب العملاء'],['supervision','نسبة الإشراف'],['transactions','المعاملات']].map(([id,label])=><button type="button" role="tab" aria-selected={reportView===id} className={reportView===id?'selected':''} key={id} onClick={()=>setReportView(id)}>{label}</button>)}</div>
        <section className="panel report-panel"><div className="panel-head"><h3>{{expenses:'المصروفات حسب البند',deposits:'الإيداعات حسب الطريقة',clients:'الملخص حسب العميل',supervision:'معاملات نسبة الإشراف',transactions:'جميع المعاملات'}[reportView]}</h3></div>
          {reportView==='expenses'?<ChartRows rows={expenseGroups}/>:reportView==='deposits'?<ChartRows rows={depositGroups}/>:reportView==='clients'?<div className="client-report-list">{customerBalances.map(c=>{const r=filteredReport.filter(t=>t.client_id===c.id),m=reportMetrics(r);return r.length?<div key={c.id}><span>{c.name}</span><b dir="ltr">{formatMoney(m.dep-m.exp-m.sup)}</b></div>:null})}</div>:txnList(reportView==='supervision'?filteredReport.filter(t=>t.transaction_type==='supervision'):filteredReport)}
        </section><div className="export-row"><Button onClick={()=>downloadReport('xlsx')} disabled={exporting||!filteredReport.length}><FileSpreadsheet size={19}/> {exporting?'بنجّهز التقرير...':'تحميل Excel'}</Button><Button variant="outline" onClick={()=>downloadReport('pdf')} disabled={exporting||!filteredReport.length}><FileText size={19}/> تصدير PDF</Button></div>
      </>:<><div className="section-heading"><div><h2>الإعدادات</h2><p>الهوية وبيانات المكتب والمزامنة</p></div></div><AccountSettings session={session}/><div className="settings-stack"><label className="setting-item" title="رفع لوجو جديد"><span className="setting-icon"><ImageIcon size={21}/></span><span className="setting-copy"><b>لوجو وهوية المكتب</b><small>{logoUploading?'بنحفظ اللوجو...':'اختار صورة PNG أو JPG أو WEBP (حد أقصى 3MB)'}</small></span><Logo size="mini"/><input type="file" accept="image/png,image/jpeg,image/webp" disabled={logoUploading} hidden onChange={e=>{const file=e.target.files?.[0];e.target.value='';uploadLogo(file);}}/><ChevronLeft size={17}/></label>{logoMessage&&<p className="setting-feedback" role="status">{logoMessage}</p>}
        <button className="setting-item" onClick={()=>setModal({type:'manage',table:'engineers'})}><span className="setting-icon"><Users size={21}/></span><span className="setting-copy"><b>إدارة المهندسين</b><small>إضافة وتفعيل أو إيقاف</small></span><ChevronLeft size={17}/></button>
        <button className="setting-item" onClick={()=>setModal({type:'manage',table:'expense_categories'})}><span className="setting-icon"><Tags size={21}/></span><span className="setting-copy"><b>بنود المصروفات</b><small>تعديل حالة البنود وإضافة الجديد</small></span><ChevronLeft size={17}/></button>
        <button className="setting-item" onClick={doSync}><span className="setting-icon"><RefreshCw size={21}/></span><span className="setting-copy"><b>المزامنة والنسخ الاحتياطي</b><small>{online?'متصل':'غير متصل'} • {pending} معلّقة {lastSync&&`• آخر مزامنة ${lastSync}`}</small></span><ChevronLeft size={17}/></button>
        <button className="setting-item" onClick={()=>{setEngineer(null);setSelectedClient(null);}}><span className="setting-icon"><KeyRound size={21}/></span><span className="setting-copy"><b>قفل دخول المهندس</b><small>الرجوع إلى شاشة PIN</small></span><ChevronLeft size={17}/></button>
        <button className="setting-item danger-setting" onClick={signOut}><span className="setting-icon"><LogOut size={21}/></span><span className="setting-copy"><b>تسجيل خروج المكتب</b><small>{officeUsername}</small></span><ChevronLeft size={17}/></button>
        </div></>}
    </main><nav className="bottom-nav" aria-label="تنقل الموبايل">{tabs.map(({label,Icon},i)=><button type="button" key={label} className={tab===i?'selected':''} onClick={()=>{setTab(i);setSelectedClient(null);}}><Icon size={21}/><span>{label}</span></button>)}</nav></div>
    {modal?.type==='client'&&<ClientForm onClose={()=>setModal(null)} onSave={saveClient}/>}
    {modal?.type==='supervisionRate'&&activeClient&&<SupervisionPercentForm client={activeClient} onClose={()=>setModal(null)} onSave={saveSupervisionPercent} saving={busy}/>}
    {modal?.type==='chooseTx'&&<Modal title="اختار نوع المعاملة" onClose={()=>setModal(null)}><div className="tx-choices"><button onClick={()=>setModal({type:'tx',txType:'expense'})}><ArrowUpRight size={26}/> صرف</button><button onClick={()=>setModal({type:'tx',txType:'deposit'})}><ArrowDownLeft size={26}/> إيداع</button><button onClick={()=>setModal({type:'tx',txType:'supervision'})}><Wallet size={26}/> نسبة إشراف</button></div></Modal>}
    {modal?.type==='tx'&&<TransactionForm key={modal.item?.id||modal.txType} client={selectedClient||clients.find(c=>c.id===modal.item?.client_id)} type={modal.txType} item={modal.item} categories={activeCategories} engineers={activeEngineers} onClose={()=>setModal(null)} onSave={saveTx} saving={busy}/>}
    {modal?.type==='manage'&&<ManageList title={modal.table==='engineers'?'إدارة المهندسين':'بنود المصروفات'} rows={modal.table==='engineers'?engineers:categories} isEngineer={modal.table==='engineers'} onClose={()=>setModal(null)} onAdd={async name=>saveLookup(modal.table,name)} onToggle={(id,active)=>toggleLookup(modal.table,id,active)} loading={busy}/>}
    <div className="print-container" id="print-report"><ReportDocument rows={filteredReport} clientLabel={clientLabel} from={from} to={to}/></div>
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);