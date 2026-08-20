import { createClient } from "@supabase/supabase-js";
const anon=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});
const {data}=await anon.auth.signInWithPassword({email:process.env.EM,password:process.env.AUDIT_PASSWORD});
const T=data.session.access_token;
const id=(f,e)=>Buffer.from(JSON.stringify({file:`/src/lib/api/${f}?tss-serverfn-split`,export:`${e}_createServerFn_handler`})).toString("base64url");
async function post(f,e,d,hdr){const r=await fetch(`http://localhost:8080/_serverFn/${id(f,e)}`,{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${T}`,cookie:`uniwork_active_tenant=${process.env.TEN}`,...hdr},body:JSON.stringify(d)});console.log(e,r.status,(await r.text()).slice(0,300));}
async function get(f,e,d){const u=`http://localhost:8080/_serverFn/${id(f,e)}?payload=${encodeURIComponent(JSON.stringify({data:d}))}`;const r=await fetch(u,{headers:{authorization:`Bearer ${T}`,cookie:`uniwork_active_tenant=${process.env.TEN}`}});console.log("GET",e,r.status,(await r.text()).slice(0,300));}
await post("ai-copilot.functions.ts","askUniCopilot",{data:{query:"Tôi có bao nhiêu việc chưa xong?"}});
await post("ai-copilot.functions.ts","askUniCopilot",{query:"Tôi có bao nhiêu việc chưa xong?"});
await get("notifications.functions.ts","listNotifications",{limit:5});
await get("home.functions.ts","getHomeSummary",{});
