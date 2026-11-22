// Internal scheduled worker. Configure verify_jwt=false and protect with OIL_REMINDER_CRON_SECRET.
// WhatsApp credentials and Supabase secret keys must be configured as Edge Function secrets.
// Never place these values in the Android app or source control.

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

function required(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server secret: ${name}`);
  return value;
}

function supabaseCredentials(): { url: string; key: string; legacyJwt: boolean } {
  const url = required("SUPABASE_URL");
  const keysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keysRaw) {
    const keys = JSON.parse(keysRaw);
    const key = keys.default;
    if (typeof key === "string" && key.length > 10) {
      return { url, key, legacyJwt: false };
    }
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (legacy) return { url, key: legacy, legacyJwt: true };
  throw new Error("Missing Supabase server secret key");
}

function todayInAmman(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Amman",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function amountText(value: unknown): string {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid installment amount");
  return amount.toFixed(2).replace(/\\.00$/, "");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const cronSecret = required("OIL_REMINDER_CRON_SECRET");
    if (req.headers.get("x-cron-secret") !== cronSecret) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { url, key, legacyJwt } = supabaseCredentials();
    const metaToken = required("WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = required("WHATSAPP_PHONE_NUMBER_ID");
    const apiVersion = required("WHATSAPP_API_VERSION");
    const templateName = required("WHATSAPP_TEMPLATE_NAME");
    const templateLanguage = required("WHATSAPP_TEMPLATE_LANGUAGE");
    const base = url.replace(/\\/$/, "");
    const headers: Record<string, string> = {
      apikey: key,
      "Content-Type": "application/json",
    };
    if (legacyJwt) headers.Authorization = `Bearer ${key}`;

    const date = todayInAmman();
    const query = new URLSearchParams({
      select: "id,installment_number,due_date,amount,customer:oil_customers!inner(id,name,phone_e164,whatsapp_opt_in,opt_in_at,auto_whatsapp_reminders)",
      due_date: `eq.${date}`,
      paid: "eq.false",
      "customer.whatsapp_opt_in": "eq.true",
      "customer.auto_whatsapp_reminders": "eq.true",
      "customer.opt_in_at": "not.is.null",
      "customer.phone_e164": "not.is.null",
    });

    const dueResponse = await fetch(`${base}/rest/v1/oil_installments?${query}`, {
      headers,
    });
    if (!dueResponse.ok) {
      return json({ error: "Could not load due installments", detail: await dueResponse.text() }, 502);
    }

    const due = await dueResponse.json();
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const installment of due) {
      const customer = Array.isArray(installment.customer)
        ? installment.customer[0]
        : installment.customer;
      const phone = String(customer?.phone_e164 ?? "");
      if (!customer || !/^\\+[1-9][0-9]{7,14}$/.test(phone) ||
          customer.whatsapp_opt_in !== true || customer.auto_whatsapp_reminders !== true ||
          !customer.opt_in_at) {
        skipped++;
        continue;
      }

      const logQuery = new URLSearchParams({
        on_conflict: "installment_id,reminder_date",
        select: "id,status,created_at",
      });
      const logResponse = await fetch(
        `${base}/rest/v1/oil_whatsapp_reminder_log?${logQuery}`,
        {
          method: "POST",
          headers: { ...headers, Prefer: "resolution=ignore-duplicates,return=representation" },
          body: JSON.stringify({
            installment_id: installment.id,
            reminder_date: date,
            status: "processing",
            attempt_count: 1,
          }),
        },
      );
      if (!logResponse.ok) {
        failed++;
        continue;
      }

      const inserted = await logResponse.json();
      let log = inserted[0];
      if (!log) {
        const existingQuery = new URLSearchParams({
          select: "id,status,created_at,attempt_count",
          installment_id: `eq.${installment.id}`,
          reminder_date: `eq.${date}`,
          limit: "1",
        });
        const existingResponse = await fetch(
          `${base}/rest/v1/oil_whatsapp_reminder_log?${existingQuery}`,
          { headers },
        );
        const existing = existingResponse.ok ? await existingResponse.json() : [];
        log = existing[0];
        if (!log || log.status === "sent" || log.status === "processing") {
          skipped++;
          continue;
        }
        const retryResponse = await fetch(
          `${base}/rest/v1/oil_whatsapp_reminder_log?id=eq.${log.id}`,
          {
            method: "PATCH",
            headers: { ...headers, Prefer: "return=minimal" },
            body: JSON.stringify({
              status: "processing",
              attempt_count: Number(log.attempt_count ?? 1) + 1,
              error_message: null,
            }),
          },
        );
        if (!retryResponse.ok) {
          failed++;
          continue;
        }
      }

      try {
        // The approved utility template must contain three body parameters:
        // {{1}} customer name, {{2}} installment amount, {{3}} due date.
        const metaResponse = await fetch(
          `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${metaToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              recipient_type: "individual",
              to: phone.slice(1),
              type: "template",
              template: {
                name: templateName,
                language: { code: templateLanguage },
                components: [{
                  type: "body",
                  parameters: [
                    { type: "text", text: String(customer.name).slice(0, 80) },
                    { type: "text", text: amountText(installment.amount) },
                    { type: "text", text: String(installment.due_date) },
                  ],
                }],
              },
            }),
          },
        );
        const metaBody = await metaResponse.json();
        if (!metaResponse.ok) throw new Error(JSON.stringify(metaBody).slice(0, 1000));

        const update = await fetch(
          `${base}/rest/v1/oil_whatsapp_reminder_log?id=eq.${log.id}`,
          {
            method: "PATCH",
            headers: { ...headers, Prefer: "return=minimal" },
            body: JSON.stringify({
              status: "sent",
              meta_message_id: metaBody.messages?.[0]?.id ?? null,
              error_message: null,
              sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }),
          },
        );
        if (!update.ok) throw new Error("Message sent but reminder log update failed");
        sent++;
      } catch (error) {
        await fetch(`${base}/rest/v1/oil_whatsapp_reminder_log?id=eq.${log.id}`, {
          method: "PATCH",
          headers: { ...headers, Prefer: "return=minimal" },
          body: JSON.stringify({
            status: "failed",
            error_message: String(error).slice(0, 1000),
            updated_at: new Date().toISOString(),
          }),
        });
        failed++;
      }
    }

    return json({ date, checked: due.length, sent, skipped, failed });
  } catch (error) {
    return json({ error: String(error) }, 500);
  }
});
