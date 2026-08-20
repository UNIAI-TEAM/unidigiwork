import { createClient } from "@supabase/supabase-js";
const a=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const {data:u}=await a.auth.admin.listUsers({page:1,perPage:200});
const usr=u.users.find(x=>x.email===process.env.EM);
console.log("user",usr?.id);
const {data:t}=await a.from("tasks").select("id,title,tenant_id,workspace_id,ai_worker_id,expected_deliverable").eq("created_by",usr.id).limit(5);
console.log("tasks",JSON.stringify(t));
for (const fn of ["get_ai_task_brief","start_ai_task_execution","finish_ai_task_execution","ensure_default_ai_workers","assign_task_to_ai","request_ai_execution_changes","accept_ai_task_execution"]) {
  const {data}=await a.rpc("exec_sql_probe").catch(()=>({data:null}));
}
const {data:fns}=await a.from("pg_proc_probe").select("*").limit(1).then(r=>r,()=>({data:"n/a"}));
console.log("LOVABLE_API_KEY set:", !!process.env.LOVABLE_API_KEY);
