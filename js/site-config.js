// ConcenMate · site-config.js
// ------------------------------------------------------------
// v1.244.0：由 admin-panel.js 拆出嚟、所有用戶都需要嘅部分——管理員身份判斷、
// 網站設定讀取（扭蛋、等級、功能圖示、Landing page、計分、溫習室、防掛機、公告、
// 科目／地區／學校清單、條款）。管理後台本身（admin-panel.js，約 260KB）改為
// 確認係管理員先由 ensureAdminPanelLoaded() 下載，一般學生唔使再下載。
// 兩個檔案都係普通 <script>（非 module），共用全域 scope：admin-panel.js 可以直接
// 用返呢度宣告嘅變數（例如 adminGachaDraft、currentAdminTab）。

window.ensureAdminPanelLoaded = function () {
  if (window.adminPanelLoaded) return Promise.resolve();
  if (window._adminPanelLoading) return window._adminPanelLoading;
  var ver = String(window.APP_VERSION || '').replace(/^v/, '');
  function load(src) {
    return new Promise(function (resolve, reject) {
      var el = document.createElement('script');
      el.src = src + '?v=' + ver;
      el.onload = resolve;
      el.onerror = function () { reject(new Error(src + ' load failed')); };
      document.body.appendChild(el);
    });
  }
  // v1.245.0：先載入後台專用翻譯（i18n-admin.js），再載入管理後台程式
  window._adminPanelLoading = load('js/i18n-admin.js')
    .then(function () { return load('js/admin-panel.js'); })
    .then(function () { window.adminPanelLoaded = true; })
    .catch(function (e) { window._adminPanelLoading = null; throw e; });
  return window._adminPanelLoading;
};

// ConcenMate · admin-panel.js
// ------------------------------------------------------------
// Phase 5（程式碼結構化）第四步（呢個 phase 最後一步）：呢個檔案原
// 本係 index.html 入面一個普通（非 module）嘅 <script>…</script> 區
// 塊，而家搬咗出嚟做獨立檔案，用 <script src="admin-panel.js"> 載
// 入。同 app-features.js／room-video.js 一樣，唔係 ES module，同其
// 他普通 <script> 區塊共用全域 scope，搬檔案純粹係物理位置搬走，執
// 行時機同全域可見度完全冇變。
//
// 內容包括：成個管理後台（Admin Panel）——管理員身份判斷、扭蛋機獎
// 品／扭蛋機外觀圖片設定、等級／經驗值設定、QA 管理、問題回報處理、
// 房間管理、用戶管理（停權／改分）等所有後台分頁邏輯。
//
// 載入次序好緊要：呢個檔案要留喺 index.html 原本嘅位置（app-core.js
// ／room-video.js 之後），因為前面已經載入好嘅 db／fs／storage 等
// 物件，同後面其他區塊都會用到呢度定義嘅函式。
//
// 【Phase 5 完成標記】至此，index.html 由原本 11,047 行拆走咗四個獨
// 立模組（app-core.js／app-features.js／room-video.js／
// admin-panel.js），主檔淨返低約 2,800 行，主要係 HTML 結構同少量
// 未拆嘅小型 <script> 區塊。如果之後想再進一步拆（例如將主檔 HTML
// 都模組化），可以參考呢四次做法嘅原則：搵一段完整、相對獨立嘅
// <script> 區塊，確認佢係咪 module，跟住原辦法搬走。

    // ===================== 管理後台（Admin Panel）=====================

    // 邊個帳號 ID 先算係管理員：呢個名單而家由 Firestore 嘅
    // admin_config/adminIds 文件（欄位 ids，一個字串陣列）話事，唔再係
    // 寫死喺呢個檔案入面——想加/減管理員，淨係去 Firebase Console 度
    // 改嗰份文件就得，唔使再逐次改 index.html + firestore.rules 兩邊
    // （見下面 loadAdminIdsFromFirestore()；firestore.rules 嘅
    // isAdmin() 亦已經改成讀返同一份文件）。
    //
    // ADMIN_LOGIN_IDS_FALLBACK 純粹係「岩岩開網站、Firestore 仲未讀
    // 完」嗰一兩秒嘅保險網，唔會影響真正權限判斷（真正判斷永遠以
    // Firestore 安全規則嗰邊為準，前端呢個陣列淨係控制「顯唔顯示管理
    // 後台入口」）。
    // v1.241.0 安全修補：唔再喺公開程式碼寫死管理員帳號 ID；admin_config/adminIds
    // 亦改為只限管理員讀取——讀得到就代表自己係管理員，讀唔到就當一般用戶。
    const ADMIN_LOGIN_IDS_FALLBACK = [];
    window.ADMIN_LOGIN_IDS = ADMIN_LOGIN_IDS_FALLBACK.slice();
    // 管理員權限分級（第四階段第9項）：loginId -> 'super' | 'support'。
    // 冇出現喺呢個map嘅管理員（包括呢個功能推出之前已經存在嘅帳戶）
    // 一律當『super』處理——咁樣先唔會因為加咗呢個新機制，就令舊有
    // 管理員帳戶突然喺Admin後台見少咗分頁、打亂佢哋原本慣用嘅工作
    // 流程。『super』見到全部分頁；『support』淨係見到日常客服／巡查
    // 用得著嗰幾個（數據總覽、房間管理、疑難解答區、用戶管理、舉報
    // 處理、導師申請、用戶支援），唔見網站設定類（扭蛋機／等級系統／
    // Landing page文案／計分規則／房間設定／防掛機參數／全站公告）
    // 同管治類（管理員名單、操作紀錄）嗰幾頁。
    //
    // ✅ 呢個分級而家唔淨係「UI入口限制」：firestore.rules已經加咗
    // isSuperAdmin()，所有『support』喺畫面見唔到嗰啲設定文件
    // （admin_config/gacha、levelSystem、navIcons、landingContent、
    // scoringRules、roomSettings、antiIdleRules、announcement、
    // adminIds）喺資料庫層一樣鎖死淨係super先寫得入——就算『support』
    // 帳戶刻意開瀏覽器開發者工具、直接用Firestore SDK嘅語法去寫，都
    // 一樣會被伺服器拒絕（唔再淨係靠前端唔顯示嗰粒掣）。操作紀錄
    // （adminAuditLog）嘅讀取都同樣鎖返淨係super先睇得到，但寫入
    // （create）保持任何管理員都得——因為『support』帳戶做嘅操作
    // （例如停權用戶）都要寫得入呢份紀錄先追蹤得到。
    window.ADMIN_ROLES = {};

    async function loadAdminIdsFromFirestore() {
      try {
        const snap = await window.fs.getDoc(window.fs.doc(window.db, 'admin_config', 'adminIds'));
        if (snap.exists() && Array.isArray(snap.data().ids) && snap.data().ids.length > 0) {
          window.ADMIN_LOGIN_IDS = snap.data().ids;
        }
        if (snap.exists() && snap.data().roles && typeof snap.data().roles === 'object') {
          window.ADMIN_ROLES = snap.data().roles;
        }
      } catch (e) {
        // 一般用戶冇權讀取（正常情況），當作非管理員
        window.ADMIN_LOGIN_IDS = [];
        window.ADMIN_ROLES = {};
      }
      // 名單啱啱先攞到／有更新，要重新評估一次而家個用戶算唔算管理員
      // （例如岩岩登入嗰陣名單仲未攞到，管理後台入口掣冇顯示，攞到之後
      // 要補顯示返）。
      // v1.242.2：標記管理員身份已確認，並通知其他模組（例如 Study with me 功能表按鈕）重新判斷
      window.adminIdsLoaded = true;
      // v1.244.0：確認係管理員就喺背景預先下載管理後台程式
      if (isCurrentUserAdmin()) window.ensureAdminPanelLoaded().catch(() => {});
      if (typeof window.onAdminStatusKnown === 'function') window.onAdminStatusKnown();
      if (typeof window.updateAdminEntryButton === 'function') window.updateAdminEntryButton();
      // v1.241.0：管理員名單改為登入後先讀到；如果管理員之前被「驗證電郵」畫面擋住，讀到名單後重新整理介面
      const vs = document.getElementById('verify-email-screen');
      if (isCurrentUserAdmin() && vs && vs.style.display !== 'none' && typeof window.updateUserAuthUI === 'function') window.updateUserAuthUI();
      if (typeof window.checkAdminHashRoute === 'function') window.checkAdminHashRoute();
      // 管理員身份啱啱確認咗，重新套用功能表顯示（管理員見到已關閉嘅項目）
      if (typeof window.applyNavVisibility === 'function') window.applyNavVisibility();
      // 管理員名單啱啱攞到／更新，順便刷新一次大廳標題，等「🛠️ 查看
      // 邊個池」嗰個管理員專用選單可以喺呢一刻先顯示出嚟（見
      // window.updateRoomLobbyTitle，定義喺 app-core.js）。
      if (typeof window.updateRoomLobbyTitle === 'function') window.updateRoomLobbyTitle();
    }
    window.loadAdminIdsFromFirestore = loadAdminIdsFromFirestore;

    function isCurrentUserAdmin() {
      return !!(window.currentUser && window.currentUser.loginId && window.ADMIN_LOGIN_IDS.includes(window.currentUser.loginId));
    }
    window.isCurrentUserAdmin = isCurrentUserAdmin;

    // 而家呢個管理員帳戶嘅權限等級——冇記錄過就當『super』（見上面
    // window.ADMIN_ROLES 嗰段解釋，為咗向下兼容舊帳戶）。
    function getCurrentAdminRole() {
      if (!window.currentUser || !window.currentUser.loginId) return null;
      return window.ADMIN_ROLES[window.currentUser.loginId] || 'super';
    }
    window.getCurrentAdminRole = getCurrentAdminRole;

    function isCurrentUserSuperAdmin() {
      return isCurrentUserAdmin() && getCurrentAdminRole() === 'super';
    }
    window.isCurrentUserSuperAdmin = isCurrentUserSuperAdmin;

    // 淨係『super』先睇得到／用得到嘅分頁——網站設定類同治理類。
    const SUPER_ADMIN_ONLY_TABS = [
      'gacha', 'level', 'icons', 'landing', 'scoring', 'roomsettings',
      'antiidle', 'announcement', 'adminlist', 'auditlog',
      'subjects', 'districts', 'schools', 'legal', 'snapshotbg', 'navmenu', 'turn', 'streaming',
      'costs', 'lists', 'mobileapp'
    ];
    // v1.228.0：合併顯示的分頁——撳一個分頁掣，會依次顯示多個原有的分頁內容
    const ADMIN_TAB_GROUPS = {
      roomsettings: ['roomsettings', 'antiidle'],
      navmenu: ['navmenu', 'icons'],
      // v1.229.3：用戶支援（搜尋＋詳情）併入用戶管理（上：搜尋及詳情；下：全部用戶表格）
      users: ['support', 'users'],
      lists: ['subjects', 'districts', 'schools'],
    };
    // 某個原有分頁的內容而家是否顯示緊（合併分頁後，不可以再只比較 currentAdminTab）
    function adminTabShowing(name) {
      const el = document.getElementById('admin-tab-' + name);
      return !!(el && el.style.display === 'block');
    }

    // 更新 header 度嗰粒「⚙️ 管理後台」入口掣顯唔顯示（淨係俾管理員睇到）
    function updateAdminEntryButton() {
      const btn = document.getElementById('header-admin-btn');
      if (btn) btn.style.display = isCurrentUserAdmin() ? 'inline-flex' : 'none';
    }
    window.updateAdminEntryButton = updateAdminEntryButton;

    let adminAuthCheckTimer = null;
    let adminRoomsUnsubscribe = null;
    let adminQaUnsubscribe = null;
    let adminUsersUnsubscribe = null;
    let adminReportsUnsubscribe = null;
    let adminReportsBadgeUnsubscribe = null;
    let currentAdminTab = null; // v1.228.0：超級管理員預設打開「營運開支」，其他管理員打開「數據總覽」

    // 網址 hash 路由：#admin 先顯示管理後台，離開就切返正常介面。
    // 未登入／auth 仲未 resolve 之前 window.currentUser 係 undefined，
    // 呢度會短時間輪詢等一等，避免一入嚟就即刻誤判做「冇權限」。
    // 頭部「⚙️ 管理後台」按鈕：喺管理後台入面就變成「🏠 返回主頁」，唔使再靠
    // 後台入面嗰粒獨立返回鍵（已移除），減少畫面重複嘅按鈕。
    function setHeaderAdminBtnMode(isOnAdminPage) {
      const btn = document.getElementById('header-admin-btn');
      if (!btn) return;
      if (isOnAdminPage) {
        btn.setAttribute('onclick', "window.location.hash=''");
        btn.innerHTML = `<svg class="header-admin-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg><span class="header-admin-text">${window.t('html.s58', '返回主頁')}</span>`;
        btn.setAttribute('aria-label', window.t('html.s58', '返回主頁'));
      } else {
        btn.setAttribute('onclick', "window.location.hash='admin'");
        btn.innerHTML = `<svg class="header-admin-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg><span class="header-admin-text">${window.t('html.s1', '管理後台')}</span>`;
        btn.setAttribute('aria-label', window.t('html.s1', '管理後台'));
      }
    }
    window.setHeaderAdminBtnMode = setHeaderAdminBtnMode;

    function checkAdminHashRoute() {
      const wantsAdmin = window.location.hash === '#admin';
      const appEl = document.querySelector('.app-container');
      const adminEl = document.getElementById('admin-panel-container');
      const deniedEl = document.getElementById('admin-denied-container');

      if (!wantsAdmin) {
        if (appEl) appEl.style.display = '';
        if (adminEl) adminEl.style.display = 'none';
        if (deniedEl) deniedEl.style.display = 'none';
        if (adminRoomsUnsubscribe) { adminRoomsUnsubscribe(); adminRoomsUnsubscribe = null; }
        if (adminQaUnsubscribe) { adminQaUnsubscribe(); adminQaUnsubscribe = null; }
        if (adminUsersUnsubscribe) { adminUsersUnsubscribe(); adminUsersUnsubscribe = null; }
        if (adminReportsUnsubscribe) { adminReportsUnsubscribe(); adminReportsUnsubscribe = null; }
        if (adminReportsBadgeUnsubscribe) { adminReportsBadgeUnsubscribe(); adminReportsBadgeUnsubscribe = null; }
        setHeaderAdminBtnMode(false);
        return;
      }

      if (typeof window.currentUser === 'undefined') {
        clearTimeout(adminAuthCheckTimer);
        adminAuthCheckTimer = setTimeout(checkAdminHashRoute, 200);
        return;
      }

      if (!isCurrentUserAdmin()) {
        if (appEl) appEl.style.display = 'none';
        if (adminEl) adminEl.style.display = 'none';
        if (deniedEl) deniedEl.style.display = 'block';
        return;
      }
      // v1.244.0：管理後台程式（admin-panel.js）改為管理員先下載；未載入就先載入再繼續
      if (!window.adminPanelLoaded) {
        window.ensureAdminPanelLoaded().then(checkAdminHashRoute).catch(() => {
          window.showToast && window.showToast(window.t('admin.loadFailed', '管理後台載入失敗，請重新整理頁面'), '');
        });
        return;
      }

      if (appEl) appEl.style.display = 'none';
      if (deniedEl) deniedEl.style.display = 'none';
      if (adminEl) adminEl.style.display = 'block';
      setHeaderAdminBtnMode(true);

      const emailTag = document.getElementById('admin-panel-user-email');
      if (emailTag) emailTag.innerText = `${window.t('admin.s1', '登入身份：')}${window.currentUser.email}`;
      // 版本資訊（正式網站已收起右下角除錯面板，改為喺呢度顯示）
      const versionTag = document.getElementById('admin-panel-version');
      if (versionTag) {
        const loadEl = document.getElementById('load-timestamp');
        const loadTime = loadEl ? loadEl.innerText : '';
        versionTag.innerText = `${window.t('admin.s3', '網站版本：')}${window.APP_VERSION || window.t('admin.s2', '未知')}` +
          (loadTime ? `　${window.t('admin.s4', '載入時間：')}${loadTime}` : '') +
          `　${window.t('admin.s7', '環境：')}${window.IS_PROD_SITE ? window.t('admin.s5', '正式網站') : window.t('admin.s6', '測試環境')}`;
      }

      // 「🚩 舉報處理」個紅點徽章唔理管理員而家揀緊邊個分頁都要見到，
      // 所以一入管理後台就開始聽，唔使等真係撳入嗰個分頁先識更新
      if (typeof window.startAdminReportsBadgeListener === 'function') window.startAdminReportsBadgeListener();
      // 「🎓 導師申請」個紅點徽章同上，唔理揀緊邊個分頁都要見到
      if (typeof window.startAdminTutorsBadgeListener === 'function') window.startAdminTutorsBadgeListener();
      if (typeof window.startAdminSchoolDomainsBadge === 'function') window.startAdminSchoolDomainsBadge();

      // 管理員權限分級：『support』帳戶見唔到網站設定／治理類分頁嘅
      // 按鈕（見上面 SUPER_ADMIN_ONLY_TABS）。
      const isSuper = isCurrentUserSuperAdmin();
      document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        const tabName = btn.getAttribute('data-tab');
        if (SUPER_ADMIN_ONLY_TABS.includes(tabName)) {
          btn.style.display = isSuper ? '' : 'none';
        }
      });
      // 分頁掣而家分咗三組顯示（日常營運／網站設定／管治）——「網站
      // 設定」「管治」呢兩組入面嘅掣全部都係super限定，『support』
      // 帳戶見唔到任何一粒，咁連個組嘅小標題都一齊隱藏埋，唔會見到
      // 得個「網站設定」四個字、下面乜掣都冇咁奇怪。
      ['admin-tab-group-settings', 'admin-tab-group-governance', 'admin-tab-group-rewards', 'admin-tab-group-content', 'admin-tab-group-lists'].forEach((groupId) => {
        const groupEl = document.getElementById(groupId);
        if (groupEl) groupEl.dataset.allowed = isSuper ? '1' : '0';
      });
      buildAdminCategoryBar();
      // 如果而家記住嘅分頁係『support』見唔到嗰啲，就退返去「數據總覽」，
      // 避免見到一個冇按鈕對應、又撳唔返嘅空白分頁。
      let startTab = currentAdminTab || (isSuper ? 'costs' : 'dashboard');
      if (!isSuper && SUPER_ADMIN_ONLY_TABS.includes(startTab)) startTab = 'dashboard';

      switchAdminTab(startTab);
    }
    window.checkAdminHashRoute = checkAdminHashRoute;
    window.addEventListener('hashchange', checkAdminHashRoute);

    // v1.228.1：後台分頁改為兩層 tab——上排是類別（總覽、日常營運……），
    // 下排只顯示所選類別入面的分頁，唔再一路向下排晒所有分頁
    const adminLastTabByGroup = {};
    function adminTabGroups() {
      return Array.from(document.querySelectorAll('#admin-tab-nav > [id^="admin-tab-group-"]'));
    }
    function buildAdminCategoryBar() {
      const nav = document.getElementById('admin-tab-nav');
      if (!nav) return;
      let bar = document.getElementById('admin-cat-bar');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'admin-cat-bar';
        bar.setAttribute('role', 'tablist');
        nav.insertBefore(bar, nav.firstChild);
      }
      bar.innerHTML = adminTabGroups().map(g => {
        const labelEl = g.querySelector('.admin-tab-group-label');
        if (labelEl) labelEl.style.display = 'none';
        const label = labelEl ? labelEl.textContent.trim() : g.id;
        const hidden = g.dataset.allowed === '0' ? ' style="display:none;"' : '';
        return `<button type="button" class="admin-cat-btn" role="tab" data-group="${g.id}"${hidden} onclick="window.switchAdminCategory('${g.id}')">${label}</button>`;
      }).join('');
      updateAdminCategoryUI(currentAdminTab || 'dashboard');
      syncAdminCategoryBadges();
    }
    // 「舉報處理」「導師申請」有待處理項目時，喺「日常營運」類別旁邊顯示紅點，
    // 即使管理員停留喺其他類別都會見到
    function syncAdminCategoryBadges() {
      const badges = ['admin-reports-badge', 'admin-tutors-badge', 'admin-schooldomains-badge'].map(id => document.getElementById(id)).filter(Boolean);
      const update = () => {
        adminTabGroups().forEach(g => {
          const catBtn = document.querySelector(`#admin-cat-bar .admin-cat-btn[data-group="${g.id}"]`);
          if (!catBtn) return;
          const pending = Array.from(g.querySelectorAll('[id$="-badge"]')).some(el => el.style.display !== 'none' && el.textContent.trim() !== '0');
          let dot = catBtn.querySelector('.admin-cat-dot');
          if (pending && !dot) {
            dot = document.createElement('span');
            dot.className = 'admin-cat-dot';
            dot.style.cssText = 'display:inline-block; width:8px; height:8px; border-radius:50%; background:#C0524A; margin-left:5px; vertical-align:middle;';
            catBtn.appendChild(dot);
          } else if (!pending && dot) dot.remove();
        });
      };
      if (!window._adminCatBadgeObserver && window.MutationObserver) {
        window._adminCatBadgeObserver = new MutationObserver(update);
        badges.forEach(el => window._adminCatBadgeObserver.observe(el, { attributes: true, childList: true, characterData: true, subtree: true }));
      }
      update();
    }
    function updateAdminCategoryUI(tab) {
      const btn = document.querySelector(`.admin-tab-btn[data-tab="${tab}"]`);
      const activeGroup = btn ? btn.closest('[id^="admin-tab-group-"]') : null;
      if (activeGroup) adminLastTabByGroup[activeGroup.id] = tab;
      adminTabGroups().forEach(g => {
        g.style.display = (g === activeGroup && g.dataset.allowed !== '0') ? '' : 'none';
      });
      document.querySelectorAll('#admin-cat-bar .admin-cat-btn').forEach(b => {
        const on = !!activeGroup && b.dataset.group === activeGroup.id;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }
    window.switchAdminCategory = function(groupId) {
      const g = document.getElementById(groupId);
      if (!g) return;
      const visibleBtns = Array.from(g.querySelectorAll('.admin-tab-btn')).filter(b => b.style.display !== 'none');
      const remembered = adminLastTabByGroup[groupId];
      const target = (remembered && visibleBtns.some(b => b.dataset.tab === remembered)) ? remembered : (visibleBtns[0] && visibleBtns[0].dataset.tab);
      if (target) window.switchAdminTab(target);
    };

    // ---------- 扭蛋機貼紙管理 ----------
    // 扭蛋機貼紙／收費而家改為由 Firestore（admin_config/gacha 文件）讀取，
    // 管理員喺呢度改完撳「儲存」，全站用戶即時生效，唔使再改碼、推 GitHub。
    // 扭蛋獎品已由舊有嘅實物獎（普通/幸運兩個獎池）完全取代做單一嘅
    // Ottiee 貼紙收集池——每格代表一隻貼紙（id 由 1 開始編號，唔可以喺
    // 呢度改，靠佢嚟同用戶端嘅 ownedStickers 對應），可以自行新增／刪除
    // 貼紙格去增減收集圖鑑嘅總數。
    let adminGachaDraft = null;

    // Firestore 個 onSnapshot 監聽係非同步嘅，一入嚟 #admin 嗰刻（尤其係
    // 重新整理成頁之後）好可能仲未攞到最新資料返嚟。如果呢個時候就即刻用
    // 「當下嗰吓」嘅 GACHA_STICKERS/GACHA_COST 去起草稿，就會執到程式碼入面
    // 寫死嘅預設值，唔係你之前儲存低嗰份——睇落好似「撳完儲存但冇儲到」，
    // 其實係讀返嗰下捉錯咗時機。用呢個 flag 確保一定要等 Firestore 真係
    // 讀完一次先起草稿。
    let gachaConfigLoaded = false;
    window.adminUpdateGachaSeries = function(idx, field, value) {
      if (!adminGachaDraft || !adminGachaDraft.series[idx]) return;
      adminGachaDraft.series[idx][field] = value;
    };

    window.adminUpdateGachaField = function(idx, field, value) {
      if (!adminGachaDraft || !adminGachaDraft.stickers[idx]) return;
      adminGachaDraft.stickers[idx][field] = value;
    };

    // v1.230.7：伺服器把現有扭蛋圖片壓縮成 WebP
    window.adminCompressGachaImages = async function () {
      if (!(await window.appConfirm(window.t('admin.s115', '把現有的貼圖、扭蛋機圖及背景圖壓縮為 WebP？未儲存的改動將會被還原。')))) return;
      const btn = document.getElementById('btn-admin-compress-gacha');
      if (btn) { btn.disabled = true; btn.innerText = window.t('admin.s116', '壓縮中，約需一分鐘…'); }
      try {
        const r = await window.callCloudFunction('compressGachaImages', {});
        adminGachaDraft = null;
        window.showToast(`${window.t('admin.s119', '完成：已壓縮')} ${r.done} ${window.t('admin.s120', '張，略過')} ${r.skipped} ${window.t('admin.s118', '張')}${r.failed ? `${window.t('admin.s117', '，失敗')} ${r.failed} ${window.t('admin.s118', '張')}` : ''}${window.t('admin.s121', '，節省約')} ${r.savedMB} MB`, '✅');
      } catch (e) {
        window.showToast(window.t('admin.s122', '壓縮失敗：') + ((e && e.message) || e), '❌');
      } finally {
        if (btn) { btn.disabled = false; btn.innerText = window.t('admin.s101', '壓縮現有圖片（加快載入）'); }
      }
    };

    window.adminSaveGachaConfig = async function() {
      if (!adminGachaDraft || !window.db || !window.fs) return;
      if (adminGachaDraft.stickers.length === 0) {
        window.showToast(window.t('admin.s132', '最少要有一張貼圖才可以儲存'), '⚠️');
        return;
      }
      const openSeries = adminGachaDraft.series.filter(se => se.enabled !== false &&
        adminGachaDraft.stickers.some(st => String(st.seriesId) === String(se.id) && (parseFloat(st.weight) || 0) > 0));
      if (adminGachaDraft.series.length && !openSeries.length) {
        window.showToast(window.t('admin.s133', '最少要有一個「開放扭蛋」並且有貼圖的系列'), '⚠️');
        return;
      }
      const payload = {
        stickers: adminGachaDraft.stickers,
        series: adminGachaDraft.series.map((se, i) => ({ id: String(se.id), name: se.name || '', nameEn: se.nameEn || '', enabled: se.enabled !== false, order: i + 1, cover: se.cover || null, machineImage: se.machineImage || null, bgImage: se.bgImage || null })),
        costNormal: adminGachaDraft.costNormal,
        costLucky: adminGachaDraft.costLucky,
        machineImageUrl: adminGachaDraft.machineImageUrl || null,
        fragmentGain: adminGachaDraft.fragmentGain || { common: 1, rare: 3, limited: 6 },
        fragmentCost: adminGachaDraft.fragmentCost || { common: 3, rare: 9, limited: 18 },
        updatedAt: Date.now(),
        updatedBy: window.currentUser ? window.currentUser.email : null
      };

      // Firestore 單一文件上限係 1MiB（呢個係 Firestore 硬性規定，冇得經設定
      // 提高），而全部貼紙（連圖片）而家都儲存喺同一份文件度。上傳圖片嗰陣
      // 已經自動壓縮到好細，但 50 隻貼紙如果幫大部分都上傳晒相片，加埋都
      // 可能踩線，所以呢度先計一計成份文件大約幾大，太大就即刻話俾你知，
      // 好過真係俾 Firestore 拒絕先發現。如果之後貼紙數量／相片再增加令
      // 呢個文件經常踩線，建議改用「每隻貼紙一份 Firestore 文件」嘅設計
      // （例如 stickers/{id} collection）嚟徹底解決呢個大小上限問題。
      const approxBytes = new Blob([JSON.stringify(payload)]).size;
      if (approxBytes > 900000) {
        window.showToast(`${window.t('admin.s134', '資料太大（約')} ${(approxBytes / 1024).toFixed(0)}${window.t('admin.s135', 'KB，Firestore 單一文件上限是 1024KB），請為較少貼紙更換圖片，或選擇較小的圖片')}`, '⚠️');
        return;
      }

      const btn = document.getElementById('btn-admin-save-gacha');
      if (btn) { btn.disabled = true; btn.innerText = window.t('admin.s136', '儲存中…'); }
      try {
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'gacha'), payload);
        window.showToast(window.t('admin.s137', '扭蛋機設定已儲存，即時對所有用戶生效！'), '🎉');
      } catch (err) {
        window.showToast(window.t('admin.s138', '儲存失敗：') + (err.message || err), '❌');
      } finally {
        if (btn) { btn.disabled = false; btn.innerText = window.t('admin.s100', '儲存全部改動'); }
      }
    };

    // 讀取 Firestore 度嘅扭蛋機設定，覆蓋返 GACHA_STICKERS／GACHA_COST（如果未曾
    // 由管理員儲存過任何設定，就繼續用返程式碼入面寫死嘅預設值）。呢個要喺
    // 登入之後（有 window.db／window.fs）先可以叫，一開始 Firebase 未初始化
    // 之前無得讀。
    let gachaConfigUnsubscribe = null;
    function loadGachaConfigFromFirestore() {
      if (!window.db || !window.fs) return;
      if (gachaConfigUnsubscribe) gachaConfigUnsubscribe();
      const ref = window.fs.doc(window.db, 'admin_config', 'gacha');
      gachaConfigUnsubscribe = window.fs.onSnapshot(ref, (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data.stickers) && data.stickers.length) {
            GACHA_STICKERS.length = 0;
            GACHA_STICKERS.push(...data.stickers);
          }
          if (window.GACHA_SERIES) {
            window.GACHA_SERIES.length = 0;
            if (Array.isArray(data.series)) window.GACHA_SERIES.push(...data.series);
          }
          if (typeof data.costNormal === 'number') GACHA_COST.normal = data.costNormal;
          if (typeof data.costLucky === 'number') GACHA_COST.lucky = data.costLucky;
          // v1.217.0：貼圖碎片數值
          if (data.fragmentGain && typeof data.fragmentGain === 'object') window.GACHA_FRAGMENT_GAIN = Object.assign({ common: 1, rare: 3, limited: 6 }, data.fragmentGain);
          if (data.fragmentCost && typeof data.fragmentCost === 'object') window.GACHA_FRAGMENT_COST = Object.assign({ common: 3, rare: 9, limited: 18 }, data.fragmentCost);
          if (typeof window.gachaRenderFragmentCount === 'function') window.gachaRenderFragmentCount();
          // 扭蛋機外殼圖片：如果管理員上傳咗自訂圖，用返嗰張；冇嘅話
          // window.GACHA_MACHINE_IMAGE_URL 保持 null，畫面繼續用返
          // <img> tag 原本寫死嘅 assets/images/gacha-machine.png 預設圖。
          window.GACHA_MACHINE_IMAGE_URL = (typeof data.machineImageUrl === 'string' && data.machineImageUrl) ? data.machineImageUrl : null;
          if (typeof window.gachaApplyMachineImage === 'function') window.gachaApplyMachineImage();
          else {
            const machineImgEl = document.getElementById('gacha-machine-img');
            if (machineImgEl) machineImgEl.src = window.GACHA_MACHINE_IMAGE_URL || 'assets/images/gacha-machine.png';
          }
        }
        gachaConfigLoaded = true;
        window.GACHA_CONFIG_LOADED = true;
        applyGachaCostToUI();
        if (typeof window.gachaApplyMachineImage === 'function') window.gachaApplyMachineImage(); // v1.232.1
        setTimeout(() => { if (typeof window.gachaPreloadAll === 'function') window.gachaPreloadAll(); }, 3000); // v1.232.3
        if (typeof updateStickerProgressUI === 'function') updateStickerProgressUI();
        // 貼紙資料（相片）依家先攞齊，如果用家揀咗貼紙做水獺頭像，要
        // 喺呢度補叫多一次先會顯示到啱嘅相（登入嗰陣呢份資料仲未到）
        if (typeof updateOtterDisplay === 'function') updateOtterDisplay();
        if (typeof window.updateOtterStatsCard === 'function') window.updateOtterStatsCard(); // v1.230.6：補回圖鑑完成度
        // 如果管理員岩岩好打開緊「扭蛋機獎品」呢個分頁、又仲未開始編輯
        // （adminGachaDraft 仲係 null，即係岩岩好卡喺「載入中...」嗰個畫面），
        // 而家攞到資料喇，即刻幫佢用返最新（剛儲存低嗰份）資料重新 render 一次，
        // 唔使佢自己撳一撳個分頁先會刷新
        if (adminTabShowing('gacha') && !adminGachaDraft) {
          const adminPanelEl = document.getElementById('admin-panel-container');
          if (adminPanelEl && adminPanelEl.style.display !== 'none') {
            (window.renderAdminGachaTab && window.renderAdminGachaTab());
          }
        }
      }, (err) => {
        console.error('讀取扭蛋機設定失敗:', err);
        gachaConfigLoaded = true; // 唔好卡死喺「載入中...」畫面，起碼俾程式碼入面嘅預設值可以用
        window.GACHA_CONFIG_LOADED = true;
        if (typeof window.updateOtterDisplay === 'function') window.updateOtterDisplay();
        if (typeof window.gachaApplyMachineImage === 'function') window.gachaApplyMachineImage();
        if (typeof window.isCurrentUserAdmin === 'function' && window.isCurrentUserAdmin()) {
          window.showToast(window.t('admin.s139', '讀取扭蛋機設定失敗（可能是 Firestore 規則未生效）：') + (err.message || err), '⚠️');
        }
      });
    }
    window.loadGachaConfigFromFirestore = loadGachaConfigFromFirestore;

    // ---------- 等級系統設定 ----------
    // EXP 賺取速度／升級難度／段位稱號而家改為由 Firestore（admin_config/levelSystem 文件）讀取，
    // 管理員喺呢度改完撳「儲存」，全站用戶即時生效，唔使再改碼、推 GitHub。
    let adminLevelDraft = null;
    let levelConfigLoaded = false;
    let levelConfigUnsubscribe = null;

    window.adminRefreshLevelPreview = function() {
      const el = document.getElementById('admin-level-preview');
      if (!el || !adminLevelDraft) return;
      const f = adminLevelDraft.levelCurveFactor || 10;
      const perMin = adminLevelDraft.expPerMinute || 0;
      // 關鍵等級：每個段位門檻，加埋 2、5、10、15、20、30、40、50、60、80、100
      const rankLevels = (adminLevelDraft.ranks || []).map(r => parseInt(r.minLevel) || 1);
      const keyLevels = Array.from(new Set([2, 5, 10, 15, 20, 30, 40, 50, 60, 80, 100].concat(rankLevels)))
        .filter(L => L >= 2).sort((a, b) => a - b);
      const rankAt = (L) => {
        const r = (adminLevelDraft.ranks || []).find(x => (parseInt(x.minLevel) || 1) === L);
        return r ? (r.title || '') : '';
      };
      const hoursFor = (L) => perMin > 0 ? (f * L * (L - 1)) / perMin / 60 : Infinity;
      const fmtH = (h) => {
        if (!isFinite(h)) return '—';
        if (h < 1) return `${Math.round(h * 60)} ${window.t('unit.minutes', '分鐘')}`;
        return `${h < 10 ? h.toFixed(1) : Math.round(h)} ${window.t('unit.hours', '小時')}`;
      };
      const fmtDays = (h, perDay) => isFinite(h) ? `${window.t('admin.s169', '約')} ${Math.max(1, Math.ceil(h / perDay))} ${window.t('cal.dow0', '日')}` : '—';
      (adminLevelDraft.ranks || []).forEach((r, idx) => {
        const L = parseInt(r.minLevel) || 1;
        const h = L <= 1 ? 0 : hoursFor(L);
        const set = (id, v) => { const c = document.getElementById(id); if (c) c.innerText = v; };
        set('admin-rank-time-' + idx, L <= 1 ? window.t('admin.s170', '起點') : fmtH(h));
        set('admin-rank-d1-' + idx, L <= 1 ? '—' : fmtDays(h, 3));
        set('admin-rank-d3-' + idx, L <= 1 ? '—' : fmtDays(h, 5));
      });
      let prevH = 0;
      const rows = keyLevels.map(L => {
        const h = hoursFor(L);
        const gap = isFinite(h) ? h - prevH : Infinity;
        prevH = isFinite(h) ? h : prevH;
        const nextLvH = isFinite(h) ? (f * 2 * L) / perMin / 60 : Infinity; // 由 L 升到 L+1 要幾耐
        const rk = rankAt(L);
        return `<tr${rk ? ' style="background:var(--brand-50);"' : ''}>
          <td style="padding:6px 8px; font-weight:700; white-space:nowrap;">Lv.${L}${rk ? ` <span style="font-size:12px; color:var(--brand-600);">${escapeHtml(rk)}</span>` : ''}</td>
          <td style="padding:6px 8px; text-align:right; white-space:nowrap;">${(f * L * (L - 1)).toLocaleString()}</td>
          <td style="padding:6px 8px; text-align:right; white-space:nowrap; font-weight:700;">${fmtH(h)}</td>
          <td style="padding:6px 8px; text-align:right; white-space:nowrap;">+${fmtH(gap)}</td>
          <td style="padding:6px 8px; text-align:right; white-space:nowrap;">${fmtH(nextLvH)}</td>
          <td style="padding:6px 8px; text-align:right; white-space:nowrap;">${fmtDays(h, 3)}</td>
          <td style="padding:6px 8px; text-align:right; white-space:nowrap;">${fmtDays(h, 5)}</td>
        </tr>`;
      }).join('');
      el.innerHTML = `

        <div style="overflow-x:auto;">
          <table style="border-collapse:collapse; font-size:13px; font-weight:normal; color:var(--brand-800); min-width:560px;">
            <thead><tr style="border-bottom:1px solid var(--brand-200); color:#6B7894;">
              <th style="padding:6px 8px; text-align:left;">${window.t('otter.stat.level', '等級')}</th>
              <th style="padding:6px 8px; text-align:right;">${window.t('admin.s171', '累積 EXP')}</th>
              <th style="padding:6px 8px; text-align:right;">${window.t('admin.s172', '累積溫習時間')}</th>
              <th style="padding:6px 8px; text-align:right;">${window.t('admin.s173', '比上一行多')}</th>
              <th style="padding:6px 8px; text-align:right;">${window.t('admin.s174', '再升一級要')}</th>
              <th style="padding:6px 8px; text-align:right;">${window.t('admin.s153', '每日溫 3 小時')}</th>
              <th style="padding:6px 8px; text-align:right;">${window.t('admin.s154', '每日溫 5 小時')}</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    };

    window.adminSaveLevelConfig = async function() {
      if (!adminLevelDraft || !window.db || !window.fs) return;
      if (!adminLevelDraft.ranks.length) { window.showToast(window.t('admin.s178', '最少要有一個段位'), '❌'); return; }
      const payload = {
        expPerMinute: adminLevelDraft.expPerMinute,
        levelCurveFactor: adminLevelDraft.levelCurveFactor,
        levelUpTickets: Math.max(0, Math.min(10, Math.floor(adminLevelDraft.levelUpTickets ?? 1))),
        milestoneEvery: Math.max(1, Math.min(100, Math.floor(adminLevelDraft.milestoneEvery ?? 5))),
        milestoneFragments: Math.max(0, Math.min(1000, Math.floor(adminLevelDraft.milestoneFragments ?? 5))),
        goldenHour: (() => {
          const g = adminLevelDraft.goldenHour || {};
          const okT = (t) => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
          const m = (v) => Math.max(1, Math.min(5, Math.round((v || 1) * 10) / 10));
          return { enabled: g.enabled === true, title: String(g.title || '').slice(0, 20), start: okT(g.start) ? g.start : '19:00', end: okT(g.end) ? g.end : '23:00', expMultiplier: m(g.expMultiplier), stoneMultiplier: m(g.stoneMultiplier) };
        })(),
        // 段位相片已停用：儲存時順手清走舊相片，減細設定文件
        ranks: adminLevelDraft.ranks.map(r => ({ minLevel: parseInt(r.minLevel) || 1, title: r.title || '', titleEn: r.titleEn || '', desc: r.desc || '', ...(parseInt(r.stone) >= 1 && parseInt(r.stone) <= 5 ? { stone: parseInt(r.stone) } : {}) }))
      };
      const approxBytes = new Blob([JSON.stringify(payload)]).size;
      if (approxBytes > 900000) {
        window.showToast(`${window.t('admin.s134', '資料太大（約')} ${(approxBytes / 1024).toFixed(0)}${window.t('admin.s179', 'KB，Firestore 單一文件上限是 1024KB），請為較少段位更換圖片，或選擇較小的圖片')}`, '⚠️');
        return;
      }
      try {
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'levelSystem'), payload);
        window.showToast(window.t('admin.s180', '已儲存等級系統設定'), '✅');
      } catch (err) {
        window.showToast(window.t('admin.s138', '儲存失敗：') + (err.message || err), '❌');
      }
    };

    function loadLevelConfigFromFirestore() {
      if (!window.db || !window.fs) return;
      if (levelConfigUnsubscribe) levelConfigUnsubscribe();
      const ref = window.fs.doc(window.db, 'admin_config', 'levelSystem');
      levelConfigUnsubscribe = window.fs.onSnapshot(ref, (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (typeof data.expPerMinute === 'number') LEVEL_CONFIG.expPerMinute = data.expPerMinute;
          if (typeof data.levelCurveFactor === 'number') LEVEL_CONFIG.levelCurveFactor = data.levelCurveFactor;
          ['levelUpTickets', 'milestoneEvery', 'milestoneFragments'].forEach(k => { if (typeof data[k] === 'number') LEVEL_CONFIG[k] = data[k]; });
          if (Array.isArray(data.ranks) && data.ranks.length) LEVEL_CONFIG.ranks = data.ranks;
          if (data.goldenHour && typeof data.goldenHour === 'object') LEVEL_CONFIG.goldenHour = data.goldenHour;
        }
        levelConfigLoaded = true;
        if (typeof window.refreshGoldenHourBar === 'function') window.refreshGoldenHourBar();
        if (window.currentUser) {
          updateLevelDisplay();
          // 段位嘅水獺相片就係喺呢個設定入面，一齊刷新，唔使等5分鐘嗰個定時器先見到
          updateOtterDisplay();
        }
        if (adminTabShowing('level') && !adminLevelDraft) {
          const adminPanelEl = document.getElementById('admin-panel-container');
          if (adminPanelEl && adminPanelEl.style.display !== 'none') {
            (window.renderAdminLevelTab && window.renderAdminLevelTab());
          }
        }
      }, (err) => {
        console.error('讀取等級系統設定失敗:', err);
        levelConfigLoaded = true;
        if (typeof window.isCurrentUserAdmin === 'function' && window.isCurrentUserAdmin()) {
          window.showToast(window.t('admin.s181', '讀取等級系統設定失敗（可能是 Firestore 規則未生效）：') + (err.message || err), '⚠️');
        }
      });
    }
    window.loadLevelConfigFromFirestore = loadLevelConfigFromFirestore;

    function applyGachaCostToUI() {
      const setText = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
      setText('gacha-cost-normal-btn', GACHA_COST.normal);
      setText('gacha-cost-lucky-btn', GACHA_COST.lucky);
    }
    window.applyGachaCostToUI = applyGachaCostToUI;

    // ---------- 用戶管理 ----------
    // 「最後上線時間」欄用嘅格式化函數：lastLoginAt 由 app-core.js 嘅
    // onAuthStateChanged() 每次登入成功就寫一次（Date.now() 嘅 epoch
    // ms，同呢個 app 其他 createdAt／updatedAt 欄位一致，冇用 Firestore
    // serverTimestamp）。呢個功能推出之前註冊嘅舊帳號，喺佢哋下次登入
    // 之前都會冇呢個欄位，顯示「從未登入」（實際意思係「呢個功能推出
    // 之後仲未登入過」，唔係真係話個帳戶未用過）。
    function formatLastLoginDisplay(ts) {
      if (!ts) return ('<span style="color:#bbb; font-size:13px;">' + window.t('admin.s201', '從未登入') + '</span>');
      const d = new Date(ts);
      if (isNaN(d.getTime())) return ('<span style="color:#bbb; font-size:13px;">' + window.t('admin.s201', '從未登入') + '</span>');
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    // ===================== 舉報處理（Admin） =====================
    // 呢個 badge listener 一入管理後台就開始聽（唔理而家揀緊邊個分頁），
    // 淨係計緊 pending 嘅舉報數量，用嚟喺分頁按鈕度提示有未處理嘅舉報。
    window.startAdminReportsBadgeListener = function() {
      if (!window.db || !window.fs) return;
      if (adminReportsBadgeUnsubscribe) return; // 已經聽緊，唔使再聽多次
      try {
        const q = window.fs.query(
          window.fs.collection(window.db, 'reports'),
          window.fs.where('status', '==', 'pending')
        );
        adminReportsBadgeUnsubscribe = window.fs.onSnapshot(q, (snapshot) => {
          const badge = document.getElementById('admin-reports-badge');
          if (!badge) return;
          const count = snapshot.size;
          badge.innerText = String(count);
          badge.style.display = count > 0 ? 'inline-block' : 'none';
        }, (err) => {
          console.error('監聽舉報數量失敗：', err);
        });
      } catch (e) {
        console.error('啟動舉報 badge listener 失敗：', e);
      }
    };

    // ---------- 側邊功能表圖示管理 ----------
    // 側邊欄「主頁／視訊溫習室／疑難解答區」等分頁掣，原本淨係
    // 寫死一個 emoji 做圖示。而家改為由 Firestore（admin_config/navIcons
    // 文件）讀取，管理員可以喺呢個分頁上傳自訂圖片取代個 emoji，冇上傳
    // 過（或者撳咗「還原做預設圖示」）嘅掣就繼續顯示返原本嘅 emoji。
    // 做法完全仿照上面「扭蛋機外觀圖片」嗰個 pattern：圖片本身上傳去
    // Firebase Storage（nav_icons/ 路徑），Firestore 淨係存返個下載連結。
    //
    // 呢個清單而家唔淨係側邊欄用：'roomLock' 呢個 key 對應嘅係視訊溫習室
    // 工具列入面嗰粒「🔒 查看房間密碼」掣（見 index.html 嘅
    // #nav-icon-roomLock），並唔喺側邊欄度。因為 applyNavIconsToSidebar()
    // 純粹用 `#nav-icon-{key}` 呢個 id pattern 去搵元素套用圖示／emoji，
    // 唔理個元素實際擺喺頁面邊度，所以直接加落嚟呢個清單就會自動生效，
    // 唔使額外寫套邏輯——文件名 admin_config/navIcons 因為歷史原因冇改
    // 名，但已經涵蓋所有「可自訂圖示」，唔止側邊欄。
    const NAV_ICON_ITEMS = [
      // v1.210.0：預設圖示改為線條 SVG（見 index.html 嘅 window.cmNavSvg），唔再用 emoji
      { key: 'home', label: window.t('nav.home', '主頁') },
      { key: 'room', label: window.t('nav.room', '視訊溫習室') },
      { key: 'qa', label: window.t('nav.qa', '疑難解答區') },
      { key: 'vip', label: window.t('nav.vip', '教材中心') },
      { key: 'store', label: window.t('nav.store', '時數扭蛋機') },
      { key: 'leaderboard', label: window.t('nav.leaderboard', '溫習排行榜') },
      { key: 'social', label: window.t('nav.social', '書伴廣場') },
      { key: 'diary', label: window.t('nav.diary', '溫習日記') },
      { key: 'verification', label: window.t('nav.verification', '學生身份驗證') },
      { key: 'tutorMaterials', label: window.t('admin.s307', '管理教材（導師）') },
      { key: 'roomLock', label: window.t('admin.s308', '房間密碼鎖（房內查看密碼按鈕）') }
    ];

    // 全站共用嘅「目前生效緊嘅圖示連結」——冇自訂圖嘅 key 就唔會出現喺
    // 呢個物件入面，UI 判斷「有冇自訂圖」淨係睇呢度有冇嗰個 key。
    window.NAV_ICON_URLS = window.NAV_ICON_URLS || {};

    // 將 window.NAV_ICON_URLS 目前嘅內容，實際反映去側邊欄嘅 8 個
    // <span class="nav-icon" id="nav-icon-{key}"> 度——有自訂圖就換做
    // <img>，冇就還原返做原本嘅 emoji 文字。
    function applyNavIconsToSidebar() {
      NAV_ICON_ITEMS.forEach(item => {
        const el = document.getElementById('nav-icon-' + item.key);
        if (!el) return; // 未登入（側邊欄未 render）嗰陣搵唔到係正常
        const url = window.NAV_ICON_URLS[item.key];
        el.innerHTML = url
          ? `<img src="${url}" alt="${escapeHtml(item.label)}">`
          : (typeof window.cmNavSvg === 'function' ? window.cmNavSvg(item.key) : '');
      });
    }
    window.applyNavIconsToSidebar = applyNavIconsToSidebar;

    let adminNavIconsDraft = null;
    let navIconsConfigLoaded = false;

    window.adminSaveNavIconsConfig = async function() {
      if (!adminNavIconsDraft) return;
      try {
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'navIcons'), adminNavIconsDraft);
        window.showToast(window.t('admin.s314', '圖示設定已儲存，全站即時生效'), '🎉');
      } catch (err) {
        window.showToast(window.t('admin.s138', '儲存失敗：') + (err.message || err), '❌');
      }
    };

    let navIconsUnsubscribe = null;
    function loadNavIconsFromFirestore() {
      if (!window.db || !window.fs) return;
      if (navIconsUnsubscribe) navIconsUnsubscribe();
      const ref = window.fs.doc(window.db, 'admin_config', 'navIcons');
      navIconsUnsubscribe = window.fs.onSnapshot(ref, (snap) => {
        window.NAV_ICON_URLS = {};
        if (snap.exists()) {
          const data = snap.data();
          NAV_ICON_ITEMS.forEach(item => {
            if (typeof data[item.key] === 'string' && data[item.key]) {
              window.NAV_ICON_URLS[item.key] = data[item.key];
            }
          });
        }
        navIconsConfigLoaded = true;
        applyNavIconsToSidebar();
        // 如果管理員岩岩好打開緊「功能圖示」呢個分頁、又仲未開始編輯，
        // 而家攞到資料喇，即刻幫佢重新 render 一次，唔使自己撳一撳個分頁
        if (adminTabShowing('icons') && !adminNavIconsDraft) {
          const adminPanelEl = document.getElementById('admin-panel-container');
          if (adminPanelEl && adminPanelEl.style.display !== 'none') {
            (window.renderAdminNavIconsTab && window.renderAdminNavIconsTab());
          }
        }
      }, (err) => {
        console.error('讀取側邊欄圖示設定失敗:', err);
        navIconsConfigLoaded = true; // 唔好卡死喺「載入中...」畫面
      });
    }
    window.loadNavIconsFromFirestore = loadNavIconsFromFirestore;

    let adminLandingDraft = null;
    let landingConfigLoaded = false;

    window.adminUpdateLandingText = function(key, lang, value) {
      if (!adminLandingDraft || !adminLandingDraft.texts[key]) return;
      adminLandingDraft.texts[key][lang] = value;
    };

    window.adminSaveLandingContent = async function() {
      if (!adminLandingDraft) return;
      const payload = {
        texts: adminLandingDraft.texts,
        images: adminLandingDraft.images,
        updatedAt: Date.now(),
        updatedBy: window.currentUser ? window.currentUser.email : null
      };
      const btn = document.getElementById('btn-admin-save-landing');
      if (btn) { btn.disabled = true; btn.innerText = window.t('admin.s136', '儲存中…'); }
      try {
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'landingContent'), payload);
        window.showToast(window.t('admin.s375', 'Landing page 設定已儲存，即時對所有訪客生效！'), '🎉');
      } catch (err) {
        window.showToast(window.t('admin.s138', '儲存失敗：') + (err.message || err), '❌');
      } finally {
        if (btn) { btn.disabled = false; btn.innerText = window.t('admin.s100', '儲存全部改動'); }
      }
    };

    // 讀取 Firestore 度嘅 Landing page 設定，覆蓋返 window.I18N_DICT 入面
    // 'landing.*' 嗰幾組字、同埋 Nav Logo／主橫幅吉祥物圖嘅顯示。呢個
    // 特登唔經 onAuthStateChanged 嗰邊叫（同 loadGachaConfigFromFirestore
    // 等幾個唔同），而係一有 window.db／window.fs 就即刻叫（見
    // app-core.js），因為 Landing page 係畀未登入嘅訪客睇，唔可以等
    // 用戶登入咗先至套用翻譯／圖片。
    //
    // 合併規則：管理員喺某個語言留空＝「冇改動」，唔會用空字串覆蓋走
    // 原本寫死喺 i18n.js 嘅預設翻譯（唔係咁嘅話，萬一得意管理員淨係
    // 填咗中文、冚晒英文／廣東話留空，English／廣東話版就會由「冇翻
    // 譯、自動退返用中文」變成「真係顯示緊一舊空白」，用戶體驗反而變差）。
    let landingConfigUnsubscribe = null;
    function loadLandingContentFromFirestore() {
      if (!window.db || !window.fs) return;
      if (landingConfigUnsubscribe) landingConfigUnsubscribe();
      const ref = window.fs.doc(window.db, 'admin_config', 'landingContent');
      landingConfigUnsubscribe = window.fs.onSnapshot(ref, (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.texts && typeof data.texts === 'object' && window.I18N_DICT) {
            Object.keys(data.texts).forEach((key) => {
              if (!window.I18N_DICT[key]) return;
              const override = data.texts[key];
              ['zh-Hant', 'en', 'yue'].forEach((lang) => {
                if (override && typeof override[lang] === 'string' && override[lang]) {
                  window.I18N_DICT[key][lang] = override[lang];
                }
              });
            });
          }
          window.LANDING_IMAGE_OVERRIDES = data.images || {};
          const navLogoEl = document.getElementById('landing-nav-logo-img');
          if (navLogoEl) navLogoEl.src = (data.images && data.images.navLogoUrl) ? data.images.navLogoUrl : 'assets/images/logo-hero.png';
          const heroImgEl = document.getElementById('landing-hero-mascot-img');
          if (heroImgEl) heroImgEl.src = (data.images && data.images.heroImageUrl) ? data.images.heroImageUrl : 'assets/images/ottie-wave.png';
        }
        landingConfigLoaded = true;
        if (typeof window.applyAppLanguage === 'function') window.applyAppLanguage();
        // 如果管理員岩岩好打開緊「Landing page文案」呢個分頁、又仲未開始
        // 編輯（adminLandingDraft 仲係 null，卡喺「載入中...」畫面），
        // 而家攞到資料喇，即刻幫佢重新 render 一次。
        if (adminTabShowing('landing') && !adminLandingDraft) {
          const adminPanelEl = document.getElementById('admin-panel-container');
          if (adminPanelEl && adminPanelEl.style.display !== 'none') {
            (window.renderAdminLandingTab && window.renderAdminLandingTab());
          }
        }
      }, (err) => {
        console.error('讀取 Landing page 設定失敗:', err);
        landingConfigLoaded = true; // 唔好卡死喺「載入中...」畫面，起碼俾程式碼入面寫死嘅預設值可以用
        if (typeof window.isCurrentUserAdmin === 'function' && window.isCurrentUserAdmin()) {
          window.showToast(window.t('admin.s376', '讀取 Landing page 設定失敗（可能是 Firestore 規則未生效）：') + (err.message || err), '⚠️');
        }
      });
    }
    window.loadLandingContentFromFirestore = loadLandingContentFromFirestore;

    // ---------- 計分規則設定 ----------
    // 每分鐘PTS、確認仍在學習嘅獎勵PTS——做法同其他幾個分頁一致，存喺
    // Firestore（admin_config/scoringRules 文件），管理員喺呢度改完撳
    // 「儲存」，全站即時生效。
    //
    // ⚠️ 同扭蛋／等級系統/Landing page嗰幾個分頁唯一唔同嘅地方：呢組
    // 設定除咗前端讀（room-video.js 嘅 window.SCORING_RULES，用嚟顯示
    // 畫面同決定要畀幾多分），仲有伺服器端（functions/index.js 嘅
    // awardStudyPoints Cloud Function）會讀同一份文件做「呢個分數啱唔
    // 啱」嘅安全驗證——如果淨係改前端、伺服器嗰邊個白名單對唔上，
    // 寫入會被拒絕（學生會見到「無效的積分數量」錯誤）。前端呢度已經
    // 自動跟返Firestore入面嘅最新數值，唔使擔心手動同步問題。
    let adminScoringDraft = null;
    let scoringConfigLoaded = false;

    window.adminUpdateScoringDraft = function(key, value) {
      if (!adminScoringDraft) return;
      const n = parseInt(value, 10);
      adminScoringDraft[key] = (Number.isFinite(n) && n > 0) ? n : adminScoringDraft[key];
    };

    window.adminSaveScoringRules = async function() {
      if (!adminScoringDraft) return;
      if (!(adminScoringDraft.ptsPerMinute > 0) || !(adminScoringDraft.presenceCheckBonus > 0)) {
        window.showToast(window.t('admin.s383', '兩個數值都要大於 0'), '⚠️');
        return;
      }
      const payload = {
        ptsPerMinute: adminScoringDraft.ptsPerMinute,
        presenceCheckBonus: adminScoringDraft.presenceCheckBonus,
        updatedAt: Date.now(),
        updatedBy: window.currentUser ? window.currentUser.email : null
      };
      const btn = document.getElementById('btn-admin-save-scoring');
      if (btn) { btn.disabled = true; btn.innerText = window.t('admin.s136', '儲存中…'); }
      try {
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'scoringRules'), payload);
        window.showToast(window.t('admin.s384', '計分規則已儲存，即時對所有用戶生效！（伺服器端最多需要30秒追上最新設定）'), '🎉');
      } catch (err) {
        window.showToast(window.t('admin.s138', '儲存失敗：') + (err.message || err), '❌');
      } finally {
        if (btn) { btn.disabled = false; btn.innerText = window.t('admin.s382', '儲存計分規則'); }
      }
    };

    let scoringConfigUnsubscribe = null;
    function loadScoringRulesFromFirestore() {
      if (!window.db || !window.fs) return;
      if (scoringConfigUnsubscribe) scoringConfigUnsubscribe();
      const ref = window.fs.doc(window.db, 'admin_config', 'scoringRules');
      scoringConfigUnsubscribe = window.fs.onSnapshot(ref, (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (typeof data.ptsPerMinute === 'number' && data.ptsPerMinute > 0) window.SCORING_RULES.ptsPerMinute = data.ptsPerMinute;
          if (typeof data.presenceCheckBonus === 'number' && data.presenceCheckBonus > 0) window.SCORING_RULES.presenceCheckBonus = data.presenceCheckBonus;
        }
        scoringConfigLoaded = true;
        if ((adminTabShowing('scoring') || adminTabShowing('roomsettings')) && !adminScoringDraft) {
          const adminPanelEl = document.getElementById('admin-panel-container');
          if (adminPanelEl && adminPanelEl.style.display !== 'none') {
            (window.renderAdminScoringTab && window.renderAdminScoringTab());
          }
        }
      }, (err) => {
        console.error('讀取計分規則設定失敗:', err);
        scoringConfigLoaded = true;
        if (typeof window.isCurrentUserAdmin === 'function' && window.isCurrentUserAdmin()) {
          window.showToast(window.t('admin.s385', '讀取計分規則設定失敗（可能是 Firestore 規則未生效）：') + (err.message || err), '⚠️');
        }
      });
    }
    window.loadScoringRulesFromFirestore = loadScoringRulesFromFirestore;

    // ---------- 房間設定（建立溫習房表格嘅人數上限／預計溫習時間選項）----------
    // 做法同「計分規則」分頁一致，存喺 Firestore（admin_config/roomSettings
    // 文件），管理員喺呢度改完撳「儲存」，全站「建立溫習房」表格即時跟
    // 住變（見 room-video.js 嘅 window.ROOM_SETTINGS／window.renderRoomCreateOptions）。
    //
    // ⚠️ 人數上限刻意淨係畀管理員喺「2 人房」「4 人房」呢兩個選項度開
    // 關同揀預設值，唔可以自訂其他數字——因為視訊格位版面寫死咗淨係
    // 支援呢兩種排法（2 格或 2x2 四格），加其他人數會整壞版面。預計
    // 溫習時間就純粹係畀學生參考嘅顯示文字，房間唔會因為時間到而自
    // 動結束，所以呢項可以自由加／減／改分鐘數選項。
    let adminRoomSettingsDraft = null;
    let roomSettingsConfigLoaded = false;

    window.adminSaveRoomSettings = async function() {
      if (!adminRoomSettingsDraft) return;
      const d = adminRoomSettingsDraft;

      if (!d.capacity2Enabled && !d.capacity4Enabled) {
        window.showToast(window.t('admin.s399', '「2 人房」和「4 人房」不可以同時關閉，最少要開放一個'), '⚠️');
        return;
      }

      // 解析「分鐘數選項」文字輸入：逗號分隔、去重、過濾唔合法嘅值、
      // 由細到大排序，確保存落 Firestore 嘅係乾淨嘅正整數陣列。
      const durationOptions = Array.from(new Set(
        d.durationOptionsText.split(',')
          .map(s => parseInt(s.trim(), 10))
          .filter(n => Number.isFinite(n) && n > 0)
      )).sort((a, b) => a - b);

      if (durationOptions.length === 0) {
        window.showToast(window.t('admin.s400', '最少要有一個有效的溫習時間選項（正整數分鐘數）'), '⚠️');
        return;
      }

      const defaultCapacity = (d.defaultCapacity === 2 && d.capacity2Enabled) ? 2
        : (d.defaultCapacity === 4 && d.capacity4Enabled) ? 4
        : (d.capacity4Enabled ? 4 : 2);

      const defaultDuration = durationOptions.includes(d.defaultDuration) ? d.defaultDuration : durationOptions[0];

      const payload = {
        capacity2Enabled: d.capacity2Enabled,
        capacity4Enabled: d.capacity4Enabled,
        defaultCapacity: defaultCapacity,
        durationOptions: durationOptions,
        defaultDuration: defaultDuration,
        updatedAt: Date.now(),
        updatedBy: window.currentUser ? window.currentUser.email : null
      };
      const btn = document.getElementById('btn-admin-save-roomsettings');
      if (btn) { btn.disabled = true; btn.innerText = window.t('admin.s136', '儲存中…'); }
      try {
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'roomSettings'), payload);
        window.showToast(window.t('admin.s401', '房間設定已儲存，即時對所有用戶生效！'), '🎉');
      } catch (err) {
        window.showToast(window.t('admin.s138', '儲存失敗：') + (err.message || err), '❌');
      } finally {
        if (btn) { btn.disabled = false; btn.innerText = window.t('admin.s100', '儲存全部改動'); }
      }
    };

    let roomSettingsConfigUnsubscribe = null;
    function loadRoomSettingsFromFirestore() {
      if (!window.db || !window.fs) return;
      if (roomSettingsConfigUnsubscribe) roomSettingsConfigUnsubscribe();
      const ref = window.fs.doc(window.db, 'admin_config', 'roomSettings');
      roomSettingsConfigUnsubscribe = window.fs.onSnapshot(ref, (snap) => {
        if (snap.exists() && window.ROOM_SETTINGS) {
          const data = snap.data();
          if (typeof data.capacity2Enabled === 'boolean') window.ROOM_SETTINGS.capacity2Enabled = data.capacity2Enabled;
          if (typeof data.capacity4Enabled === 'boolean') window.ROOM_SETTINGS.capacity4Enabled = data.capacity4Enabled;
          if (data.defaultCapacity === 2 || data.defaultCapacity === 4) window.ROOM_SETTINGS.defaultCapacity = data.defaultCapacity;
          if (Array.isArray(data.durationOptions) && data.durationOptions.length > 0) window.ROOM_SETTINGS.durationOptions = data.durationOptions;
          if (typeof data.defaultDuration === 'number' && data.defaultDuration > 0) window.ROOM_SETTINGS.defaultDuration = data.defaultDuration;
        }
        roomSettingsConfigLoaded = true;
        if (adminTabShowing('roomsettings') && !adminRoomSettingsDraft) {
          const adminPanelEl = document.getElementById('admin-panel-container');
          if (adminPanelEl && adminPanelEl.style.display !== 'none') {
            (window.renderAdminRoomSettingsTab && window.renderAdminRoomSettingsTab());
          }
        }
      }, (err) => {
        console.error('讀取房間設定失敗:', err);
        roomSettingsConfigLoaded = true;
        if (typeof window.isCurrentUserAdmin === 'function' && window.isCurrentUserAdmin()) {
          window.showToast(window.t('admin.s402', '讀取房間設定失敗（可能是 Firestore 規則未生效）：') + (err.message || err), '⚠️');
        }
      });
    }
    window.loadRoomSettingsFromFirestore = loadRoomSettingsFromFirestore;

    // ---------- 防掛機參數（開咪時限、確認間隔等）----------
    // 做法同「計分規則」「房間設定」一致，存喺 Firestore
    // （admin_config/antiIdleRules 文件），管理員改完撳「儲存」，全站
    // 即時跟住變（見 room-video.js 嘅 window.applyAntiIdleRules）。
    //
    // ⚠️ 呢幾個參數純粹前端生效，冇牽涉 Cloud Function（同「房間設定」
    // 一樣），因為伺服器端淨係驗證每次送嚟嘅分數數值啱唔啱（見計分
    // 規則嗰項），唔理會送分頻密程度。但「已經開始緊嘅計時器」（例如
    // 學生已經喺房入面）唔會即時被打斷重設，新數值要等下一次相關計
    // 時器重新開始（下次入房、下次開咪）先生效。
    let adminAntiIdleDraft = null;
    let antiIdleConfigLoaded = false;

    window.adminUpdateAntiIdleDraft = function(key, value) {
      if (!adminAntiIdleDraft) return;
      const n = parseInt(value, 10);
      adminAntiIdleDraft[key] = (Number.isFinite(n) && n > 0) ? n : adminAntiIdleDraft[key];
    };

    let antiIdleConfigUnsubscribe = null;
    function loadAntiIdleRulesFromFirestore() {
      if (!window.db || !window.fs) return;
      if (antiIdleConfigUnsubscribe) antiIdleConfigUnsubscribe();
      const ref = window.fs.doc(window.db, 'admin_config', 'antiIdleRules');
      antiIdleConfigUnsubscribe = window.fs.onSnapshot(ref, (snap) => {
        if (snap.exists() && typeof window.applyAntiIdleRules === 'function') {
          window.applyAntiIdleRules(snap.data());
        }
        antiIdleConfigLoaded = true;
        if (adminTabShowing('antiidle') && !adminAntiIdleDraft) {
          const adminPanelEl = document.getElementById('admin-panel-container');
          if (adminPanelEl && adminPanelEl.style.display !== 'none') {
            (window.renderAdminAntiIdleTab && window.renderAdminAntiIdleTab());
          }
        }
      }, (err) => {
        console.error('讀取防掛機參數設定失敗:', err);
        antiIdleConfigLoaded = true;
        if (typeof window.isCurrentUserAdmin === 'function' && window.isCurrentUserAdmin()) {
          window.showToast(window.t('admin.s413', '讀取防掛機參數設定失敗（可能是 Firestore 規則未生效）：') + (err.message || err), '⚠️');
        }
      });
    }
    window.loadAntiIdleRulesFromFirestore = loadAntiIdleRulesFromFirestore;

    // ---------- 全站公告橫幅 ----------
    // 第三階段（運營工具）第二項：Admin後台可以隨時開關／編輯一則顯示
    // 喺成個網站最頂嘅公告橫幅（例如「今晚12點系統維護」「XX活動開
    // 跑喇」），**登入前Landing page同登入後主應用都會見到**，同
    // 「Landing page文案」一樣，存喺Firestore（admin_config/announcement
    // 文件），要額外開放俾未登入用戶讀取（見firestore.rules）。
    //
    // 三種語言分開輸入（同Landing page文案呢度做法一致），顯示嗰陣跟
    // 訪客而家揀緊嗰種語言。訪客撳橫幅嗰粒 ✕ 可以收埋，記喺呢部裝置
    // 嘅localStorage——下次改咗公告內容（即係updatedAt變咗）先會再
    // 跳出嚟，改返同一個內容唔會死纏爛打逼訪客睇。
    let adminAnnouncementDraft = null;
    let announcementConfigLoaded = false;

    window.adminUpdateAnnouncementDraft = function(key, value) {
      if (!adminAnnouncementDraft) return;
      adminAnnouncementDraft[key] = value;
    };

    window.adminUpdateAnnouncementMessage = function(lang, value) {
      if (!adminAnnouncementDraft) return;
      adminAnnouncementDraft.message[lang] = value;
    };

    window.adminSaveAnnouncement = async function() {
      if (!adminAnnouncementDraft) return;
      const d = adminAnnouncementDraft;
      if (d.enabled && !d.message['zh-Hant'].trim()) {
        window.showToast(window.t('admin.s449', '開啟公告橫幅之前，最少要填寫繁體中文版本的內容'), '⚠️');
        return;
      }
      const payload = {
        enabled: d.enabled,
        type: d.type,
        message: {
          'zh-Hant': d.message['zh-Hant'].trim(),
          'en': d.message['en'].trim(),
          'yue': d.message['yue'].trim()
        },
        updatedAt: Date.now(),
        updatedBy: window.currentUser ? window.currentUser.email : null
      };
      const btn = document.getElementById('btn-admin-save-announcement');
      if (btn) { btn.disabled = true; btn.innerText = window.t('admin.s136', '儲存中…'); }
      try {
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'announcement'), payload);
        window.showToast(window.t('admin.s450', '全站公告已儲存，即時對所有訪客生效！'), '🎉');
      } catch (err) {
        window.showToast(window.t('admin.s138', '儲存失敗：') + (err.message || err), '❌');
      } finally {
        if (btn) { btn.disabled = false; btn.innerText = window.t('admin.s100', '儲存全部改動'); }
      }
    };

    let announcementConfigUnsubscribe = null;
    function loadSiteAnnouncementFromFirestore() {
      if (!window.db || !window.fs) return;
      if (announcementConfigUnsubscribe) announcementConfigUnsubscribe();
      const ref = window.fs.doc(window.db, 'admin_config', 'announcement');
      announcementConfigUnsubscribe = window.fs.onSnapshot(ref, (snap) => {
        const data = snap.exists() ? snap.data() : null;
        window.SITE_ANNOUNCEMENT_RAW = data;
        renderSiteAnnouncementBanner(data);
        announcementConfigLoaded = true;
        if (adminTabShowing('announcement') && !adminAnnouncementDraft) {
          const adminPanelEl = document.getElementById('admin-panel-container');
          if (adminPanelEl && adminPanelEl.style.display !== 'none') {
            (window.renderAdminAnnouncementTab && window.renderAdminAnnouncementTab());
          }
        }
      }, (err) => {
        console.error('讀取全站公告設定失敗:', err);
        announcementConfigLoaded = true;
      });
    }
    window.loadSiteAnnouncementFromFirestore = loadSiteAnnouncementFromFirestore;

    const SITE_ANNOUNCEMENT_DISMISS_KEY = 'concenmate_announcement_dismissed_at';

    // 將Firestore讀到嘅公告設定，實際畫落頁面最頂嘅橫幅。冇開啟、或者
    // 訪客之前已經撳過 ✕ 收埋咗「同一個版本」（updatedAt冇變）嘅話就
    // 唔顯示。
    function renderSiteAnnouncementBanner(data) {
      const banner = document.getElementById('site-announcement-banner');
      const textEl = document.getElementById('site-announcement-text');
      if (!banner || !textEl) return;

      if (!data || !data.enabled) {
        banner.style.display = 'none';
        return;
      }

      let dismissedAt = null;
      try { dismissedAt = localStorage.getItem(SITE_ANNOUNCEMENT_DISMISS_KEY); } catch (e) { /* 私隱模式等場合讀唔到，忽略 */ }
      if (dismissedAt && String(data.updatedAt) === dismissedAt) {
        banner.style.display = 'none';
        return;
      }

      const lang = (typeof window.getAppLanguage === 'function') ? window.getAppLanguage() : 'zh-Hant';
      const msgObj = data.message || {};
      const text = (msgObj[lang] && msgObj[lang].trim()) || (msgObj['zh-Hant'] && msgObj['zh-Hant'].trim()) || '';
      if (!text) {
        banner.style.display = 'none';
        return;
      }

      textEl.innerText = text;
      banner.className = 'type-' + (['info', 'warning', 'urgent'].includes(data.type) ? data.type : 'info');
      banner.style.display = 'block';
    }
    window.renderSiteAnnouncementBanner = renderSiteAnnouncementBanner;

    window.dismissSiteAnnouncement = function() {
      const banner = document.getElementById('site-announcement-banner');
      if (banner) banner.style.display = 'none';
      try {
        const data = window.SITE_ANNOUNCEMENT_RAW;
        if (data && typeof data.updatedAt !== 'undefined') {
          localStorage.setItem(SITE_ANNOUNCEMENT_DISMISS_KEY, String(data.updatedAt));
        }
      } catch (e) { /* 私隱模式等場合寫唔到，忽略——今次單純收埋返，下次重新整理可能又會跳返出嚟 */ }
    };

    // 切換語言之後，公告橫幅嘅文字都要跟住切返（唔使等下次Firestore
    // 有更新先變語言）
    window.refreshSiteAnnouncementLanguage = function() {
      if (typeof window.SITE_ANNOUNCEMENT_RAW !== 'undefined') {
        renderSiteAnnouncementBanner(window.SITE_ANNOUNCEMENT_RAW);
      }
    };

    // ---------- 科目清單管理（低優先第11項，改用「淨係新增」模式）----------
    // 背景：HKDSE科目清單（window.TUTOR_DSE_SUBJECTS，tutor-panel.js
    // 定義）喺好多地方都用嚟做「篩選用嘅資料值」（qa_posts.subject、
    // buddyPosts.subjects、導師申請嘅subjectsIntended等），如果開放
    // 畀管理員自由改名／刪除，舊資料入面已經用緊舊名嘅紀錄就會即刻
    // 「對唔返」（搵唔到英文翻譯、分組篩選唔到）。所以呢頁淨係開放
    // 「新增」，新科目會追加喺內建清單之後（「其他（自行輸入）」
    // 之前），唔支援改名／刪除。新增嘅科目會即時喺導師「想教嘅科目」
    // 揀選器、教材管理「新增科目」下拉選單出現。
    let subjectListConfigLoaded = false;
    let subjectListConfigUnsubscribe = null;

    function applySubjectListAdditions(data) {
      if (!data || !Array.isArray(data.subjects) || !window.TUTOR_DSE_SUBJECTS) return;
      data.subjects.forEach((s) => {
        if (!s || !s.name) return;
        if (!window.TUTOR_DSE_SUBJECTS.includes(s.name)) {
          const otherIdx = window.TUTOR_DSE_SUBJECTS.indexOf('其他（自行輸入）');
          if (otherIdx >= 0) window.TUTOR_DSE_SUBJECTS.splice(otherIdx, 0, s.name);
          else window.TUTOR_DSE_SUBJECTS.push(s.name);
        }
        if (s.nameEn && window.DSE_SUBJECT_EN_NAMES) window.DSE_SUBJECT_EN_NAMES[s.name] = s.nameEn;
      });
      // 同步加入「建立公開溫習房」彈窗嘅科目下拉選單（index.html嘅
      // #modal-room-subject），呢個select本身係寫死嘅HTML option清單，
      // 冇讀window.TUTOR_DSE_SUBJECTS，所以後台新增科目之前完全搵唔到。
      // 新option插入喺「其他」選項之前，data-subject屬性交畀i18n.js嘅
      // 共用科目翻譯系統處理（同其他內建option做法一致）。
      const roomSubjectSelect = document.getElementById('modal-room-subject');
      if (roomSubjectSelect) {
        data.subjects.forEach((s) => {
          if (!s || !s.name) return;
          const alreadyExists = Array.from(roomSubjectSelect.options).some((opt) => opt.value === s.name);
          if (alreadyExists) return;
          const opt = document.createElement('option');
          opt.value = s.name;
          opt.setAttribute('data-subject', s.name);
          opt.textContent = s.name;
          const otherOpt = Array.from(roomSubjectSelect.options).find((o) => o.getAttribute('data-i18n') === 'room.subjectOther');
          if (otherOpt) roomSubjectSelect.insertBefore(opt, otherOpt);
          else roomSubjectSelect.appendChild(opt);
        });
      }
    }

    function loadSubjectListFromFirestore() {
      if (!window.db || !window.fs) return;
      if (subjectListConfigUnsubscribe) subjectListConfigUnsubscribe();
      const ref = window.fs.doc(window.db, 'admin_config', 'subjectList');
      subjectListConfigUnsubscribe = window.fs.onSnapshot(ref, (snap) => {
        const data = snap.exists() ? snap.data() : null;
        window.ADMIN_SUBJECT_LIST_RAW = data;
        applySubjectListAdditions(data);
        subjectListConfigLoaded = true;
        if (adminTabShowing('subjects')) {
          const panelEl = document.getElementById('admin-panel-container');
          if (panelEl && panelEl.style.display !== 'none') (window.renderAdminSubjectsTab && window.renderAdminSubjectsTab());
        }
      }, (err) => {
        console.error('讀取科目清單失敗:', err);
        subjectListConfigLoaded = true;
      });
    }
    window.loadSubjectListFromFirestore = loadSubjectListFromFirestore;

    // ---------- 地區清單管理（低優先第12項，同科目清單一樣「淨係新增」）----------
    // 背景：香港十八區清單（window.HK_DISTRICT_REGION_GROUPS，app-core.js
    // 定義）用戶註冊表格揀學校地區、分區溫習排行榜都會用到，district
    // 一樣係存做「資料值」（users.district、leaderboardEntries.district），
    // 唔開放改名／刪除，淨係追加新地區落去指定分區（香港島／九龍／
    // 新界）之下。
    let districtListConfigLoaded = false;
    let districtListConfigUnsubscribe = null;

    function applyDistrictListAdditions(data) {
      if (!data || !Array.isArray(data.districts) || !window.HK_DISTRICT_REGION_GROUPS) return;
      data.districts.forEach((d) => {
        if (!d || !d.name || !d.region) return;
        let group = window.HK_DISTRICT_REGION_GROUPS.find((g) => g.region === d.region);
        if (!group) {
          group = { region: d.region, districts: [] };
          window.HK_DISTRICT_REGION_GROUPS.push(group);
        }
        if (!group.districts.includes(d.name)) group.districts.push(d.name);
        if (d.nameEn && window.HK_DISTRICT_EN_NAMES) window.HK_DISTRICT_EN_NAMES[d.name] = d.nameEn;
      });
    }

    function loadDistrictListFromFirestore() {
      if (!window.db || !window.fs) return;
      if (districtListConfigUnsubscribe) districtListConfigUnsubscribe();
      const ref = window.fs.doc(window.db, 'admin_config', 'districtList');
      districtListConfigUnsubscribe = window.fs.onSnapshot(ref, (snap) => {
        const data = snap.exists() ? snap.data() : null;
        window.ADMIN_DISTRICT_LIST_RAW = data;
        applyDistrictListAdditions(data);
        districtListConfigLoaded = true;
        if (adminTabShowing('districts')) {
          const panelEl = document.getElementById('admin-panel-container');
          if (panelEl && panelEl.style.display !== 'none') (window.renderAdminDistrictsTab && window.renderAdminDistrictsTab());
        }
      }, (err) => {
        console.error('讀取地區清單失敗:', err);
        districtListConfigLoaded = true;
      });
    }
    window.loadDistrictListFromFirestore = loadDistrictListFromFirestore;

    // ---------- 學校名單管理（Alvis主動要求，同科目／地區清單一樣
    // 「淨係新增」模式）----------
    // 背景：中學名單（window.HK_SECONDARY_SCHOOLS_BY_DISTRICT）、大專
    // ／大學名單（window.HK_TERTIARY_INSTITUTIONS_BY_DISTRICT／
    // window.HK_TERTIARY_INSTITUTIONS_COMMON，全部app-core.js定義）
    // 一樣會存落users.school、schoolLeaderboard等地方做資料值，唔開放
    // 改名／刪除。中學一定要揀返所屬地區（用返「地區清單」嗰份分區
    // 清單，等新增咗嘅地區都可以即刻揀），大專院校可以唔揀地區（跟
    // 現有做法，加入「常見院校」清單，唔分地區）。呢頁淨係顯示你後台
    // 新增嗰啲學校——內建嗰成千幾間學校唔會喺度逐間列出嚟，唔係漏咗，
    // 係特登咁做避免成頁好長，想睇內建完整清單可以直接去網站註冊表格
    // 揀地區睇。
    let schoolListConfigLoaded = false;
    let schoolListConfigUnsubscribe = null;

    function applySchoolListAdditions(data) {
      if (!data) return;
      if (Array.isArray(data.secondary) && window.HK_SECONDARY_SCHOOLS_BY_DISTRICT) {
        data.secondary.forEach((s) => {
          if (!s || !s.name || !s.district) return;
          if (!window.HK_SECONDARY_SCHOOLS_BY_DISTRICT[s.district]) window.HK_SECONDARY_SCHOOLS_BY_DISTRICT[s.district] = [];
          if (!window.HK_SECONDARY_SCHOOLS_BY_DISTRICT[s.district].includes(s.name)) {
            window.HK_SECONDARY_SCHOOLS_BY_DISTRICT[s.district].push(s.name);
          }
        });
      }
      if (Array.isArray(data.tertiary)) {
        data.tertiary.forEach((t) => {
          if (!t || !t.name) return;
          if (t.district && window.HK_TERTIARY_INSTITUTIONS_BY_DISTRICT) {
            if (!window.HK_TERTIARY_INSTITUTIONS_BY_DISTRICT[t.district]) window.HK_TERTIARY_INSTITUTIONS_BY_DISTRICT[t.district] = [];
            if (!window.HK_TERTIARY_INSTITUTIONS_BY_DISTRICT[t.district].includes(t.name)) {
              window.HK_TERTIARY_INSTITUTIONS_BY_DISTRICT[t.district].push(t.name);
            }
          } else if (window.HK_TERTIARY_INSTITUTIONS_COMMON && !window.HK_TERTIARY_INSTITUTIONS_COMMON.includes(t.name)) {
            window.HK_TERTIARY_INSTITUTIONS_COMMON.push(t.name);
          }
        });
      }
    }

    function loadSchoolListFromFirestore() {
      if (!window.db || !window.fs) return;
      if (schoolListConfigUnsubscribe) schoolListConfigUnsubscribe();
      const ref = window.fs.doc(window.db, 'admin_config', 'schoolList');
      schoolListConfigUnsubscribe = window.fs.onSnapshot(ref, (snap) => {
        const data = snap.exists() ? snap.data() : null;
        window.ADMIN_SCHOOL_LIST_RAW = data;
        applySchoolListAdditions(data);
        schoolListConfigLoaded = true;
        if (adminTabShowing('schools')) {
          const panelEl = document.getElementById('admin-panel-container');
          if (panelEl && panelEl.style.display !== 'none') (window.renderAdminSchoolsTab && window.renderAdminSchoolsTab());
        }
      }, (err) => {
        console.error('讀取學校名單失敗:', err);
        schoolListConfigLoaded = true;
      });
    }
    window.loadSchoolListFromFirestore = loadSchoolListFromFirestore;

    let legalContentConfigLoaded = false;
    let legalContentConfigUnsubscribe = null;
    let adminLegalDraft = null;

    function renderLegalContentParagraphs(text) {
      return text.split(/\n\s*\n/).map((para) => {
        const trimmed = para.trim();
        if (!trimmed) return '';
        if (trimmed.startsWith('#')) {
          const heading = trimmed.replace(/^#+\s*/, '');
          return `<p style="font-weight:bold; margin-top:14px;">${escapeHtml(heading)}</p>`;
        }
        return `<p>${escapeHtml(trimmed).replace(/\n/g, '<br>')}</p>`;
      }).join('');
    }

    function renderLegalContentBody() {
      const data = window.LEGAL_CONTENT_RAW;
      const lang = (typeof window.getAppLanguage === 'function') ? window.getAppLanguage() : 'zh-Hant';
      [['terms', 'terms-content-body'], ['privacy', 'privacy-content-body']].forEach(([docKey, elId]) => {
        const el = document.getElementById(elId);
        if (!el) return;
        const docData = data && data[docKey];
        if (!docData) return; // 未有Firestore內容，保持顯示番index.html原本寫死嗰份
        let text = docData[lang];
        if (!text && lang !== 'zh-Hant') text = docData['zh-Hant']; // 冇對應語言就退返繁體中文
        if (!text) return; // 連繁體中文都未填，保持顯示番原本寫死嗰份
        el.innerHTML = renderLegalContentParagraphs(text);
      });
    }
    window.refreshLegalContentLanguage = renderLegalContentBody;

    function loadLegalContentFromFirestore() {
      if (!window.db || !window.fs) return;
      if (legalContentConfigUnsubscribe) legalContentConfigUnsubscribe();
      const ref = window.fs.doc(window.db, 'admin_config', 'legalContent');
      legalContentConfigUnsubscribe = window.fs.onSnapshot(ref, (snap) => {
        window.LEGAL_CONTENT_RAW = snap.exists() ? snap.data() : null;
        renderLegalContentBody();
        legalContentConfigLoaded = true;
        if (adminTabShowing('legal') && !adminLegalDraft) {
          const panelEl = document.getElementById('admin-panel-container');
          if (panelEl && panelEl.style.display !== 'none') (window.renderAdminLegalTab && window.renderAdminLegalTab());
        }
      }, (err) => {
        console.error('讀取服務條款／私隱政策內容失敗:', err);
        legalContentConfigLoaded = true;
      });
    }
    window.loadLegalContentFromFirestore = loadLegalContentFromFirestore;

    // 頁面一載入就檢查一次（處理直接開 #admin 網址嘅情況）
    checkAdminHashRoute();
