/* Home dashboard layout: visual-only rearrangement; existing data/actions remain intact. */
(()=>{
 const $=id=>document.getElementById(id);
 const home=$('home'),auth=$('authPanel'),settings=$('settings'),stats=document.querySelector('.stats');
 if(!home||!auth||!settings||!stats)return;
 // Put sign-in controls in Settings so the landing screen stays focused on daily work.
 const settingsPanel=settings.querySelector('.panel');
 if(settingsPanel)settingsPanel.insertBefore(auth,settingsPanel.firstChild);
 // Keep all existing counters and their IDs, but display them inside the dashboard.
 const dash=document.createElement('div');
 dash.className='home-stats';
 dash.append(...Array.from(stats.children));
 stats.remove();
 const recent=$('recentList');
 home.innerHTML=`
  <section class="home-welcome">
   <div class="welcome-kicker">لوحة متابعة الصيانة</div>
   <h2>أهلاً بك في مساحة العمل</h2>
   <p>سجّل البلاغ، تابع الأعمال، وجهّز تسليم الشفت من مكان واحد.</p>
   <div class="home-actions">
    <button type="button" class="home-main-cta" id="homeNewFault">＋ تسجيل بلاغ صيانة</button>
    <button type="button" class="home-secondary-cta" id="homePlant">🏭 أقسام المصنع</button>
    <button type="button" class="home-secondary-cta" id="homeQuickNetafa">⚡ بلاغ النتافات السريع</button>
   </div>
  </section>
  <div class="home-section-title"><h2>ملخص العمل</h2><span>السجلات المحفوظة</span></div>
  <div id="homeStatsMount"></div>
  <div class="home-section-title"><h2>الوصول السريع</h2><span>اختر المهمة</span></div>
  <div class="home-shortcuts">
   <button type="button" class="home-shortcut" data-home-go="faults"><span class="shortcut-icon">⚙️</span><span><b>سجل الأعطال</b><small>تسجيل ومتابعة الملاحظات</small></span></button>
   <button type="button" class="home-shortcut" data-home-go="shift"><span class="shortcut-icon">🧾</span><span><b>تقرير الشفت</b><small>الأعمال المنجزة والمتبقية</small></span></button>
   <button type="button" class="home-shortcut" data-home-go="handover"><span class="shortcut-icon">🔁</span><span><b>التسليم والاستلام</b><small>متابعة ما لم يكتمل</small></span></button>
   <button type="button" class="home-shortcut" data-home-go="parts"><span class="shortcut-icon">🧰</span><span><b>قطع الغيار</b><small>تسجيل الاحتياجات</small></span></button>
   <button type="button" class="home-shortcut" data-home-go="plant"><span class="shortcut-icon">🏭</span><span><b>المعدات والأقسام</b><small>خطوط الإنتاج ومعداتها</small></span></button>
   <button type="button" class="home-shortcut" data-home-go="settings"><span class="shortcut-icon">☁️</span><span><b>الحساب والمزامنة</b><small>الدخول وإعدادات التطبيق</small></span></button>
  </div>
  <div class="home-section-title"><h2>آخر الأعمال</h2><span>أحدث ما تم تسجيله</span></div>
  <div class="home-recent" id="homeRecentMount"></div>
 `;
 $('homeStatsMount').append(dash);
 $('homeRecentMount').append(recent);
 $('homeNewFault').onclick=()=>document.querySelector('[data-tab="faults"]')?.click();
 $('homePlant').onclick=()=>document.querySelector('[data-tab="plant"]')?.click();
 $('homeQuickNetafa').onclick=()=>document.querySelector('[data-tab="plant"]')?.click();
 home.querySelectorAll('[data-home-go]').forEach(b=>b.addEventListener('click',()=>document.querySelector('[data-tab="'+b.dataset.homeGo+'"]')?.click()));
})();
