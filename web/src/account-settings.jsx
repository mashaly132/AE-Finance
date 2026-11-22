import React,{useEffect,useState} from 'react';
import {KeyRound,UserPlus,Users,ShieldCheck,ChevronLeft,Eye,EyeOff,LockKeyhole,RefreshCw} from 'lucide-react';
import {supabase} from './data';
import {Modal,Button,Field} from './components';

const cleanError=e=>e?.message||String(e||'حصل خطأ غير متوقع');
const validUsername=u=>/^[a-z][a-z0-9_]{2,31}$/.test(u);
const passOk=p=>p.length>=10&&p.length<=128;

export function AccountSettings({session}){
  const [role,setRole]=useState('');
  const [modal,setModal]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [current,setCurrent]=useState(''),[next,setNext]=useState(''),[confirm,setConfirm]=useState('');
  const [username,setUsername]=useState(''),[newPass,setNewPass]=useState(''),[showNew,setShowNew]=useState(false);
  const [accounts,setAccounts]=useState([]),[resetUser,setResetUser]=useState(null),[resetPass,setResetPass]=useState('');

  useEffect(()=>{
    let active=true;
    if(!session?.user?.id)return;
    supabase.from('office_accounts').select('role').eq('user_id',session.user.id).maybeSingle().then(({data})=>{
      if(active)setRole(data?.role||'staff');
    });
    return()=>{active=false;};
  },[session?.user?.id]);

  function close(){if(busy)return;setModal('');setError('');setCurrent('');setNext('');setConfirm('');setNewPass('');setResetUser(null);setResetPass('');}
  async function listAccounts(){
    const {data,error:err}=await supabase.functions.invoke('office-admin',{body:{action:'list'}});
    if(err)throw err;if(data?.error)throw Error(data.error);
    setAccounts(data.accounts??[]);
  }
  async function request(action,payload={}){
    const {data,error:err}=await supabase.functions.invoke('office-admin',{body:{action,...payload}});
    if(err)throw err;if(data?.error)throw Error(data.error);return data;
  }
  async function showAccounts(){
    setModal('accounts');setMessage('');setError('');setBusy(true);
    try{await listAccounts();}catch(e){setError(cleanError(e));}finally{setBusy(false);}
  }
  async function changePassword(e){
    e.preventDefault();setError('');setMessage('');
    if(!passOk(next)||next!==confirm){setError('كلمة المرور الجديدة لازم تكون 10 أحرف على الأقل ومتطابقة في الخانتين');return;}
    if(!current){setError('اكتب كلمة المرور الحالية للتأكيد');return;}
    setBusy(true);
    try{
      const check=await supabase.auth.signInWithPassword({email:session.user.email,password:current});
      if(check.error)throw Error('كلمة المرور الحالية غير صحيحة');
      const {error:err}=await supabase.auth.updateUser({password:next});
      if(err)throw err;
      closeAfterSave();setMessage('تم تغيير كلمة المرور بنجاح');
    }catch(err){setError(cleanError(err));}finally{setBusy(false);}
  }
  function closeAfterSave(){setModal('');setCurrent('');setNext('');setConfirm('');setNewPass('');setResetUser(null);setResetPass('');setError('');}
  async function createAccount(e){
    e.preventDefault();setError('');setMessage('');
    const u=username.trim().toLowerCase();
    if(!validUsername(u)){setError('اليوزر لازم يبدأ بحرف إنجليزي ويكون 3–32 حرفًا أو رقمًا أو _');return;}
    if(!passOk(newPass)){setError('كلمة المرور لازم تكون 10 أحرف على الأقل');return;}
    setBusy(true);
    try{
      await request('create',{username:u,password:newPass});
      setUsername('');setNewPass('');await listAccounts();setMessage('تم إنشاء حساب '+u+' للمكتب');
    }catch(err){setError(cleanError(err));}finally{setBusy(false);}
  }
  async function setActive(user){
    setBusy(true);setError('');setMessage('');
    try{await request('set_active',{user_id:user.user_id,active:!user.active});await listAccounts();setMessage('تم تحديث حالة الحساب');}
    catch(e){setError(cleanError(e));}finally{setBusy(false);}
  }
  async function resetPassword(e){
    e.preventDefault();setBusy(true);setError('');setMessage('');
    try{
      if(!passOk(resetPass))throw Error('كلمة المرور الجديدة لازم تكون 10 أحرف على الأقل');
      await request('reset_password',{user_id:resetUser.user_id,password:resetPass});
      setResetUser(null);setResetPass('');setMessage('تم تعيين كلمة مرور جديدة للحساب');
    }catch(e){setError(cleanError(e));}finally{setBusy(false);}
  }

  return <>
    <div className="settings-stack">
      <button className="setting-item" type="button" onClick={()=>{setModal('password');setError('');setMessage('');}}>
        <span className="setting-icon"><KeyRound size={21}/></span>
        <span className="setting-copy"><b>تغيير كلمة المرور</b><small>غيّر كلمة مرور حسابك الحالي بأمان</small></span>
        <ChevronLeft size={17}/>
      </button>
      {role==='admin'&&<button className="setting-item" type="button" onClick={showAccounts}>
        <span className="setting-icon"><UserPlus size={21}/></span>
        <span className="setting-copy"><b>حسابات المكتب</b><small>إنشاء حساب جديد أو إيقافه أو إعادة تعيين كلمة مروره</small></span>
        <ChevronLeft size={17}/>
      </button>}
      {message&&!modal&&<p role="status" className="account-notice">{message}</p>}
    </div>

    {modal==='password'&&<Modal title="تغيير كلمة المرور" onClose={close}>
      <form className="account-form" onSubmit={changePassword}>
        <p className="account-tip"><ShieldCheck size={16}/> أكّد كلمة المرور الحالية قبل اختيار كلمة جديدة.</p>
        <Field label="كلمة المرور الحالية" type="password" value={current} onChange={setCurrent} autoComplete="current-password" required/>
        <Field label="كلمة المرور الجديدة (10 أحرف على الأقل)" type="password" value={next} onChange={setNext} autoComplete="new-password" required/>
        <Field label="تأكيد كلمة المرور الجديدة" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" required/>
        {error&&<p role="alert" className="account-error">{error}</p>}
        <Button type="submit" disabled={busy}>{busy?'بيتم الحفظ...':'حفظ كلمة المرور'}</Button>
      </form>
    </Modal>}

    {modal==='accounts'&&<Modal title="إدارة حسابات المكتب" onClose={close} subtitle="حسابات داخلية فقط، لا يوجد تسجيل عام للزوار">
      <div className="account-form">
        <form className="account-form account-create" onSubmit={createAccount}>
          <h4><UserPlus size={18}/> إنشاء حساب جديد</h4>
          <Field label="اسم المستخدم (English)" value={username} onChange={setUsername} autoComplete="off" placeholder="engineer_ahmed" required/>
          <label className="form-field"><span>كلمة المرور الأولى (10 أحرف على الأقل)</span>
            <div className="account-password">
              <input type={showNew?'text':'password'} value={newPass} onChange={e=>setNewPass(e.target.value)} autoComplete="new-password" minLength={10} maxLength={128} required/>
              <button type="button" title={showNew?'إخفاء':'إظهار'} aria-label={showNew?'إخفاء كلمة المرور':'إظهار كلمة المرور'} onClick={()=>setShowNew(v=>!v)}>{showNew?<EyeOff size={18}/>:<Eye size={18}/>}</button>
            </div>
          </label>
          <Button type="submit" disabled={busy}><UserPlus size={17}/> {busy?'جاري المعالجة...':'إنشاء حساب المكتب'}</Button>
        </form>
        {message&&<p role="status" className="account-notice">{message}</p>}
        {error&&<p role="alert" className="account-error">{error}</p>}
        <div className="account-list">
          <h4><Users size={18}/> الحسابات المعتمدة</h4>
          {accounts.map(user=><div className="account-list-row" key={user.user_id}>
            <div><strong dir="ltr">{user.username}</strong><small>{user.role==='admin'?'مسؤول المكتب':user.active?'مفعّل':'موقوف'}</small></div>
            {user.role!=='admin'&&<div className="account-row-buttons">
              <button type="button" disabled={busy} onClick={()=>{setResetUser(user);setError('');}} aria-label={'إعادة تعيين كلمة مرور '+user.username}><KeyRound size={15}/> إعادة كلمة المرور</button>
              <button type="button" disabled={busy} onClick={()=>setActive(user)}>{user.active?'إيقاف':'تفعيل'}</button>
            </div>}
          </div>)}
          {!accounts.length&&!busy&&<p>لا توجد حسابات للعرض</p>}
        </div>
      </div>
    </Modal>}

    {modal==='accounts'&&resetUser&&<Modal title={'تعيين كلمة مرور: '+resetUser.username} onClose={()=>{if(!busy){setResetUser(null);setError('');}}}>
      <form className="account-form" onSubmit={resetPassword}>
        <Field label="كلمة المرور الجديدة" value={resetPass} onChange={setResetPass} type="password" autoComplete="new-password" required/>
        {error&&<p role="alert" className="account-error">{error}</p>}
        <Button type="submit" disabled={busy}><LockKeyhole size={17}/> تأكيد التغيير</Button>
      </form>
    </Modal>}
  </>;
}
