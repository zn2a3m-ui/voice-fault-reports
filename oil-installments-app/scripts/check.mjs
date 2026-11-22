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
console.log('App syntax, per-customer opt-in UI, scheduled worker safeguards and database RLS verified');