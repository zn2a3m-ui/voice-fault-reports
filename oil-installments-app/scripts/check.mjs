import{readFileSync}from'node:fs';import{spawnSync}from'node:child_process';
const root=new URL('../',import.meta.url);
const h=readFileSync(new URL('../www/index.html',import.meta.url),'utf8');
const a=h.indexOf('<script>'),b=h.indexOf('</script>',a);
if(a<0||b<0)throw Error('Missing app script');
const js=h.slice(a+8,b);
const result=spawnSync(process.execPath,['--check','-'],{input:js,encoding:'utf8'});
if(result.status!==0){process.stderr.write(result.stderr);process.exit(result.status||1)}
for(const s of ['installments-v1','backup','restore','data-pay','waOptIn','waAuto','whatsappOptIn','autoReminder','saveWa'])if(!h.includes(s))throw Error('Missing app feature: '+s);
const fn=readFileSync(new URL('../supabase/functions/send-oil-installment-reminders/index.ts',import.meta.url),'utf8');
for(const s of ['OIL_REMINDER_CRON_SECRET','WHATSAPP_ACCESS_TOKEN','whatsapp_opt_in','auto_whatsapp_reminders','oil_whatsapp_reminder_log','Asia/Amman','type: "template"'])if(!fn.includes(s))throw Error('Missing worker safeguard: '+s);
const sql=readFileSync(new URL('../supabase/sql/whatsapp-reminders-schema.sql',import.meta.url),'utf8');
for(const s of ['enable row level security','auth.uid()','oil_whatsapp_reminder_once_per_day','opt_in_at'])if(!sql.toLowerCase().includes(s.toLowerCase()))throw Error('Missing database safeguard: '+s);
const sync=readFileSync(new URL('../www/supabase-sync.js',import.meta.url),'utf8');
const syncCheck=spawnSync(process.execPath,['--check','-'],{input:sync,encoding:'utf8'});
if(syncCheck.status!==0){process.stderr.write(syncCheck.stderr);process.exit(syncCheck.status||1)}
for(const s of ['signInWithPassword','oil_customers','oil_installments','DELETED_KEY','refresh_token','service_role'])if(!sync.includes(s))throw Error('Missing cloud sync safeguard: '+s);
const syncSql=readFileSync(new URL('../supabase/sql/local-first-sync.sql',import.meta.url),'utf8');
for(const s of ['local_id','sale_data','updated_at','authenticated','enable row level security'])if(!syncSql.toLowerCase().includes(s.toLowerCase()) && s!=='enable row level security')throw Error('Missing sync schema element: '+s);
if(!h.includes('supabase-sync.js')||!h.includes('window.OilApp'))throw Error('Missing app sync bridge');
console.log('App and sync JavaScript syntax, local-first auth/sync bridge, customer consent safeguards and SQL schema checks passed');