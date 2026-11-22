/* Local-first Supabase Auth + sync bridge for دفتر الزيت.
 * Only a publishable/legacy anon key belongs here. Never put service_role or Meta tokens in the app.
 */
(() => {
  "use strict";
  const CONFIG_KEY = "oil-supabase-config-v1";
  const SESSION_KEY = "oil-supabase-session-v1";
  const DELETED_KEY = "installments-deleted-v1";
  const $ = (id) => document.getElementById(id);
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; } };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const DEFAULT_CONFIG = { url: "https://ebhdliuohsadcantszcf.supabase.co", key: "sb_publishable_y2oVragqvRT9UEI0EwfQCw_bOH9BItn" };
  const config = () => { const saved = read(CONFIG_KEY, {}); return { url: saved.url || DEFAULT_CONFIG.url, key: saved.key || DEFAULT_CONFIG.key }; };
  const session = () => read(SESSION_KEY, null);
  const baseUrl = () => config().url.replace(/\/+$/, "");
  const headers = (token) => ({ apikey: config().key, Authorization: "Bearer " + token, "Content-Type": "application/json" });
  const status = (message, error = false) => {
    const el = $("cloudStatus");
    if (el) { el.textContent = message; el.style.color = error ? "var(--red)" : "var(--muted)"; }
  };
  const configured = () => /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(baseUrl()) && /^sb_publishable_[A-Za-z0-9_-]+$/.test(config().key) || /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(baseUrl()) && config().key.length > 20;
  function handleAuthCallback(rawUrl) {
    try {
      const url = new URL(rawUrl);
      const params = new URLSearchParams(url.hash.replace(/^#/, ""));
      const access = params.get("access_token");
      const refresh = params.get("refresh_token");
      if (access && refresh) {
        const expiresIn = Number(params.get("expires_in") || 3600);
        saveSession({ access_token: access, refresh_token: refresh, expires_in: expiresIn, expires_at: Math.floor(Date.now()/1000) + expiresIn });
        status("تم تأكيد البريد وتفعيل الحساب. يمكنك الآن تسجيل الدخول أو المزامنة.");
        paint();
        return true;
      }
      const error = params.get("error_description") || url.searchParams.get("error_description");
      if (error) status("تعذر تأكيد البريد: " + decodeURIComponent(error), true);
    } catch (_) {}
    return false;
  }
  async function authRequest(path, body) {
    const c = config();
    const res = await fetch(baseUrl() + "/auth/v1/" + path, { method: "POST", headers: { apikey: c.key, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.msg || out.message || out.error_description || out.error || "تعذر الاتصال بخدمة الحسابات");
    return out;
  }
  function saveSession(s) {
    if (!s || !s.access_token || !s.refresh_token) return;
    write(SESSION_KEY, { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at || Math.floor(Date.now()/1000) + (s.expires_in || 3600), user: s.user || null });
  }
  async function validSession() {
    let s = session();
    if (!s) throw new Error("سجّل الدخول أولاً");
    if (s.expires_at > Math.floor(Date.now()/1000) + 60) return s;
    const next = await authRequest("token?grant_type=refresh_token", { refresh_token: s.refresh_token });
    saveSession(next);
    s = session();
    return s;
  }
  async function rest(path, options = {}) {
    const s = await validSession();
    const res = await fetch(baseUrl() + "/rest/v1/" + path, { ...options, headers: { ...headers(s.access_token), Prefer: "resolution=merge-duplicates,return=minimal", ...(options.headers || {}) } });
    if (!res.ok) {
      const out = await res.json().catch(() => ({}));
      throw new Error(out.message || out.details || out.hint || "فشلت المزامنة مع قاعدة البيانات");
    }
    if (res.status === 204 || res.headers.get("content-length") === "0") return null;
    return res.json().catch(() => null);
  }
  const e164 = (phone) => {
    let digits = String(phone || "").replace(/\D/g, "");
    if (digits.startsWith("00")) digits = digits.slice(2);
    if (digits.startsWith("0")) digits = "962" + digits.slice(1);
    return /^\+[1-9][0-9]{7,14}$/.test("+" + digits) ? "+" + digits : null;
  };
  async function syncNow() {
    if (!configured()) throw new Error("أدخل رابط مشروع دفتر الزيت ومفتاحه العام أولاً");
    const s = await validSession(), owner = s.user?.id;
    if (!owner) throw new Error("انتهت جلسة الحساب؛ سجّل الدخول مجدداً");
    const deleted = read(DELETED_KEY, []);
    for (const id of deleted) {
      await rest("oil_customers?owner_id=eq." + encodeURIComponent(owner) + "&local_id=eq." + encodeURIComponent(id), { method: "DELETE" });
    }
    const local = window.OilApp.getData();
    for (const customer of local) {
      const phone = e164(customer.phone);
      const consent = !!customer.whatsappOptIn;
      const localUpdated = customer.updatedAt || "1970-01-01T00:00:00.000Z";
      const lookup = await rest("oil_customers?select=id,local_id,updated_at&owner_id=eq." + encodeURIComponent(owner) + "&local_id=eq." + encodeURIComponent(String(customer.id)));
      const existing = lookup && lookup[0];
      const remoteIsNewer = !!(existing?.updated_at && Date.parse(existing.updated_at) > Date.parse(localUpdated));
      const row = {
        owner_id: owner, local_id: String(customer.id), name: customer.name,
        phone_e164: phone, whatsapp_opt_in: consent,
        opt_in_at: consent ? (customer.whatsappPreferenceUpdatedAt || new Date().toISOString()) : null,
        auto_whatsapp_reminders: !!customer.autoReminder && consent && !!phone,
        sale_data: { phone: customer.phone || "", item: customer.item || "زيت", qty: customer.qty, tank: customer.tank, price: customer.price, down: customer.down, whatsappOptIn: consent, autoReminder: !!customer.autoReminder, whatsappPreferenceUpdatedAt: customer.whatsappPreferenceUpdatedAt || null, updatedAt: localUpdated },
        updated_at: localUpdated
      };
      if (!remoteIsNewer) await rest("oil_customers?on_conflict=owner_id,local_id", { method: "POST", body: JSON.stringify(row) });
      const found = await rest("oil_customers?select=id,local_id&owner_id=eq." + encodeURIComponent(owner) + "&local_id=eq." + encodeURIComponent(String(customer.id)));
      const remote = found && found[0];
      if (!remote) throw new Error("تعذر تأكيد حفظ بيانات أحد الزبائن");
      if (!remoteIsNewer) {
        const installments = (customer.inst || []).map((item, index) => ({
          owner_id: owner, customer_id: remote.id, installment_number: index + 1,
          due_date: item.date, amount: item.amt, paid: !!item.paid,
          paid_at: item.paid ? (item.paidAt || new Date().toISOString()) : null,
          updated_at: localUpdated
        }));
        if (installments.length) await rest("oil_installments?on_conflict=customer_id,installment_number", { method: "POST", body: JSON.stringify(installments) });
      }
    }
    const [customers, installments] = await Promise.all([
      rest("oil_customers?select=id,local_id,name,phone_e164,whatsapp_opt_in,opt_in_at,auto_whatsapp_reminders,sale_data&owner_id=eq." + encodeURIComponent(owner)),
      rest("oil_installments?select=customer_id,installment_number,due_date,amount,paid,paid_at&owner_id=eq." + encodeURIComponent(owner) + "&order=installment_number.asc")
    ]);
    const byCustomer = new Map();
    for (const i of (installments || [])) {
      const list = byCustomer.get(i.customer_id) || [];
      list.push({ date: i.due_date, amt: Number(i.amount), paid: !!i.paid, ...(i.paid_at ? { paidAt: i.paid_at } : {}) });
      byCustomer.set(i.customer_id, list);
    }
    const merged = new Map(window.OilApp.getData().map(x => [String(x.id), x]));
    for (const c of (customers || [])) {
      if (!c.local_id || deleted.includes(String(c.local_id))) continue;
      const meta = c.sale_data || {};
      const remoteData = {
        id: String(c.local_id), name: c.name, phone: meta.phone || c.phone_e164 || "",
        item: meta.item || "زيت", qty: Number(meta.qty || 1), tank: Number(meta.tank || 130),
        price: Number(meta.price || 0), down: Number(meta.down || 0), updatedAt: c.updated_at || meta.updatedAt || null,
        whatsappOptIn: !!c.whatsapp_opt_in, autoReminder: !!c.auto_whatsapp_reminders,
        whatsappPreferenceUpdatedAt: c.opt_in_at || null,
        inst: (byCustomer.get(c.id) || []).sort((a,b) => a.date.localeCompare(b.date))
      };
      const current = merged.get(remoteData.id);
      if (!current || (remoteData.updatedAt ? Date.parse(remoteData.updatedAt) : 0) > (current.updatedAt ? Date.parse(current.updatedAt) : 0)) merged.set(remoteData.id, remoteData);
    }
    window.OilApp.setData(Array.from(merged.values()));
    write(DELETED_KEY, []);
    status("اكتملت المزامنة. بيانات الجهاز والسحابة متوافقة.");
    return { customers: (customers || []).length };
  }
  function paint() {
    const c = config(), s = session();
    if ($("cloudUrl")) $("cloudUrl").value = c.url;
    if ($("cloudKey")) $("cloudKey").value = c.key;
    if ($("cloudAccount")) $("cloudAccount").textContent = s?.user?.email ? "الحساب: " + s.user.email : "غير مسجّل الدخول";
    if ($("cloudLogout")) $("cloudLogout").classList.toggle("hidden", !s);
    if ($("cloudSync")) $("cloudSync").disabled = !s;
  }
  async function run(action) {
    try { status("جارٍ التنفيذ…"); await action(); }
    catch (e) { status(e.message || "حدث خطأ غير متوقع", true); }
    paint();
  }
  window.OilCloud = {
    markDeleted(id) { const ids = read(DELETED_KEY, []); if (!ids.includes(String(id))) ids.push(String(id)); write(DELETED_KEY, ids); }
  };
  document.addEventListener("DOMContentLoaded", () => {
    paint();
    $("cloudSave")?.addEventListener("click", () => run(async () => {
      const url = $("cloudUrl").value.trim(), key = $("cloudKey").value.trim();
      if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || key.length < 20) throw new Error("تحقق من رابط Supabase والمفتاح العام");
      const previous = config(); if (previous.url !== url || previous.key !== key) localStorage.removeItem(SESSION_KEY); write(CONFIG_KEY, { url, key }); status("تم حفظ إعداد الاتصال على هذا الجهاز.");
    }));
    $("cloudSignup")?.addEventListener("click", () => run(async () => {
      if (!configured()) throw new Error("احفظ إعداد الاتصال أولاً");
      const email = $("cloudEmail").value.trim(), password = $("cloudPassword").value;
      if (!email || password.length < 8) throw new Error("أدخل البريد وكلمة مرور من 8 أحرف على الأقل");
      const out = await authRequest("signup", { email, password, options: { emailRedirectTo: "daftaralzait://auth/callback" } });
      if (out.access_token) saveSession(out);
      else status("تم إنشاء الطلب. افحص بريدك لتأكيد الحساب، ثم سجّل الدخول.");
    }));
    $("cloudLogin")?.addEventListener("click", () => run(async () => {
      if (!configured()) throw new Error("احفظ إعداد الاتصال أولاً");
      const email = $("cloudEmail").value.trim(), password = $("cloudPassword").value;
      const out = await authRequest("token?grant_type=password", { email, password });
      saveSession(out); status("تم تسجيل الدخول.");
    }));
    $("cloudSync")?.addEventListener("click", () => run(async () => {
      const result = await syncNow();
      status("اكتملت المزامنة بنجاح · " + result.customers + " زبوناً في السحابة.");
      if (window.OilApp?.render) window.OilApp.render();
    }));
    $("cloudLogout")?.addEventListener("click", () => run(async () => {
      const s = await validSession();
      await fetch(baseUrl() + "/auth/v1/logout", { method: "POST", headers: headers(s.access_token) });
      localStorage.removeItem(SESSION_KEY);
      status("تم تسجيل الخروج. بيانات الجهاز بقيت محفوظة.");
    }));
  });
})();
