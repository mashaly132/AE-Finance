import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const url = Deno.env.get("SUPABASE_URL")!;
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(url,service,{ auth:{ persistSession:false, autoRefreshToken:false }});
const cors={ "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods":"POST, OPTIONS" };
const reply=(payload:unknown,status=200)=>new Response(JSON.stringify(payload),{status,headers:{...cors,"Content-Type":"application/json"}});
const USER_RE=/^[a-z][a-z0-9_]{2,31}$/;
const accountEmail=(username:string)=>username+"@accounts.aefinance.invalid";
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("",{headers:cors});
 if(req.method!=="POST")return reply({error:"Method not allowed"},405);
 const header=req.headers.get("Authorization")??"";
 if(!header.startsWith("Bearer "))return reply({error:"Authentication required"},401);
 try{
  const jwt=header.slice(7);
  const {data:auth,error:authError}=await supabase.auth.getUser(jwt);
  if(authError||!auth.user)return reply({error:"Authentication required"},401);
  const uid=auth.user.id;
  const [owner,member]=await Promise.all([
   supabase.from("office_accounts").select("role").eq("user_id",uid).maybeSingle(),
   supabase.from("office_members").select("active").eq("user_id",uid).maybeSingle()
  ]);
  if(owner.error||member.error)return reply({error:"Unable to verify permissions"},500);
  if(owner.data?.role!=="admin"||!member.data?.active)return reply({error:"Admin access required"},403);
  const input=await req.json().catch(()=>({}));
  if(input.action==="list"){
    const [a,m]=await Promise.all([
      supabase.from("office_accounts").select("user_id,username,role,created_at").order("created_at"),
      supabase.from("office_members").select("user_id,active")
    ]);
    if(a.error||m.error)throw a.error??m.error;
    const statuses=new Map((m.data??[]).map(x=>[x.user_id,x.active]));
    return reply({accounts:(a.data??[]).map(x=>({...x,active:statuses.get(x.user_id)??false}))});
  }
  if(input.action==="create"){
    const username=String(input.username??"").trim().toLowerCase();
    const password=String(input.password??"");
    if(!USER_RE.test(username)||password.length<10||password.length>128)return reply({error:"اسم المستخدم 3–32 حرفًا إنجليزيًا/رقمًا، وكلمة المرور 10 أحرف على الأقل"},400);
    const existing=await supabase.from("office_accounts").select("user_id").eq("username",username).maybeSingle();
    if(existing.error)return reply({error:"Database error"},500);
    if(existing.data)return reply({error:"اسم المستخدم مستخدم بالفعل"},409);
    const {data:created,error:createError}=await supabase.auth.admin.createUser({email:accountEmail(username),password,email_confirm:true});
    if(createError||!created.user)return reply({error:createError?.message??"Creation failed"},400);
    const newId=created.user.id;
    const [acc,memberAdd]=await Promise.all([
      supabase.from("office_accounts").insert({user_id:newId,username,role:"staff"}),
      supabase.from("office_members").insert({user_id:newId,active:true})
    ]);
    if(acc.error||memberAdd.error){await supabase.auth.admin.deleteUser(newId);return reply({error:"فشل إنشاء المستخدم، ولم يتم اعتماد الحساب"},500)}
    return reply({ok:true,username});
  }
  if(input.action==="set_active"){
    const userId=String(input.user_id??"");
    if(!/^[0-9a-f-]{36}$/i.test(userId)||userId===uid)return reply({error:"Invalid account"},400);
    const exists=await supabase.from("office_accounts").select("role").eq("user_id",userId).maybeSingle();
    if(exists.error||!exists.data||exists.data.role!=="staff")return reply({error:"Invalid staff account"},400);
    const {error}=await supabase.from("office_members").update({active:input.active===true}).eq("user_id",userId);
    if(error)throw error;
    return reply({ok:true});
  }
  if(input.action==="reset_password"){
    const userId=String(input.user_id??"");
    const password=String(input.password??"");
    if(!/^[0-9a-f-]{36}$/i.test(userId)||userId===uid||password.length<10||password.length>128)return reply({error:"Invalid account or password"},400);
    const account=await supabase.from("office_accounts").select("role").eq("user_id",userId).maybeSingle();
    if(account.error||account.data?.role!=="staff")return reply({error:"Invalid staff account"},403);
    const {error}=await supabase.auth.admin.updateUserById(userId,{password});
    if(error)throw error;
    return reply({ok:true});
  }
  return reply({error:"Unknown action"},400);
 }catch(e){return reply({error:e instanceof Error?e.message:"Unexpected error"},500)}
});