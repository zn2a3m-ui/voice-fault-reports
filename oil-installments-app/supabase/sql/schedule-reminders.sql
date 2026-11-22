-- Run only after deploying the Edge Function and creating these Vault secrets:
-- oil_project_url      = https://<dedicated-project-ref>.supabase.co
-- oil_reminder_cron_secret = same random value as OIL_REMINDER_CRON_SECRET
--
-- This schedule runs at 06:00 UTC (09:00 in Amman, UTC+3).
-- Do not put the cron secret or Meta token directly in this SQL file.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'oil-installment-whatsapp-reminders',
  '0 6 * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'oil_project_url')
        || '/functions/v1/send-oil-installment-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'oil_reminder_cron_secret')
      ),
      body := jsonb_build_object('source', 'pg_cron'),
      timeout_milliseconds := 10000
    );
  $job$
);
