// ConcenMate · admin-panel.js（管理後台）
// ------------------------------------------------------------
// v1.244.0：只有管理員先會載入（由 site-config.js 的 ensureAdminPanelLoaded() 動態載入）。
// 所有用戶都需要的部分（管理員身份判斷、網站設定讀取）已搬到 site-config.js；
// 呢度直接用返嗰邊宣告的全域變數，唔好喺呢度重複宣告同名變數。

    // 舊分頁名稱 → 合併後的分頁（網址 hash 或其他地方仍然可以用舊名稱）
    const ADMIN_TAB_ALIASES = { support: 'users', antiidle: 'roomsettings', scoring: 'roomsettings', icons: 'navmenu', subjects: 'lists', districts: 'lists', schools: 'lists' };

    // 操作紀錄（第四階段第10項）：將重要嘅管治／高風險操作（停權、
    // 補發分數／貼紙、強制關房、審批導師、管理員名單異動等）寫一筆
    // 落 adminAuditLog collection，畀日後有爭議或者想追查「邊個管理員
    // 做咗咩」嗰陣有紀錄可以查。純粹盡力而為（fire-and-forget）：寫入
    // 失敗唔應該阻住主要操作本身完成，所以呢度淨係 console.warn，唔
    // 會再彈 toast 打擾管理員。
    async function logAdminAction(action, details) {
      if (!window.db || !window.fs || !window.currentUser) return;
      try {
        await window.fs.addDoc(window.fs.collection(window.db, 'adminAuditLog'), {
          action,
          details: (typeof details === 'undefined') ? null : details,
          adminEmail: window.currentUser.email || null,
          adminLoginId: window.currentUser.loginId || null,
          createdAt: Date.now()
        });
      } catch (err) {
        console.warn('寫入操作紀錄失敗（唔影響主要操作本身）:', err);
      }
    }
    window.logAdminAction = logAdminAction;

    window.switchAdminTab = function(tab) {
      if (ADMIN_TAB_ALIASES[tab]) tab = ADMIN_TAB_ALIASES[tab];
      // 防止『support』帳戶用網址hash或者其他方式直接跳去冇按鈕對應
      // 嘅super限定分頁——退返去「數據總覽」並提示一下。
      if (SUPER_ADMIN_ONLY_TABS.includes(tab) && !isCurrentUserSuperAdmin()) {
        window.showToast(window.t('admin.s8', '此分頁只限「超級管理員」使用'), '🔒');
        tab = 'dashboard';
      }
      currentAdminTab = tab;
      updateAdminCategoryUI(tab);
      document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        const active = btn.getAttribute('data-tab') === tab;
        btn.className = 'btn admin-tab-btn ' + (active ? 'btn-primary active' : 'btn-outline');
      });
      const showPanels = ADMIN_TAB_GROUPS[tab] || [tab];
      document.querySelectorAll('.admin-tab-panel').forEach(panel => {
        panel.style.display = showPanels.some(n => panel.id === 'admin-tab-' + n) ? 'block' : 'none';
      });
      if (ADMIN_TAB_GROUPS[tab]) {
        // 按指定次序排列合併分頁的內容，並逐個渲染
        showPanels.forEach(n => {
          const el = document.getElementById('admin-tab-' + n);
          if (el && el.parentNode) el.parentNode.appendChild(el);
        });
        showPanels.forEach(n => renderSingleAdminTab(n));
        return;
      }
      renderSingleAdminTab(tab);
    };

    function renderSingleAdminTab(tab) {
      if (tab === 'costs') window.renderAdminCostsTab();
      else if (tab === 'dashboard') renderAdminDashboardTab();
      else if (tab === 'gacha') renderAdminGachaTab();
      else if (tab === 'rooms') renderAdminRoomsTab();
      else if (tab === 'qa') renderAdminQaTab();
      else if (tab === 'users') renderAdminUsersTab();
      else if (tab === 'level') renderAdminLevelTab();
      else if (tab === 'reports') renderAdminReportsTab();
      else if (tab === 'icons') renderAdminNavIconsTab();
      else if (tab === 'tutors') renderAdminTutorsTab();
      else if (tab === 'landing') renderAdminLandingTab();
      else if (tab === 'scoring') renderAdminScoringTab();
      else if (tab === 'roomsettings') renderAdminRoomSettingsTab(); // 已包括計分規則
      else if (tab === 'antiidle') renderAdminAntiIdleTab();
      else if (tab === 'announcement') renderAdminAnnouncementTab();
      else if (tab === 'support') renderAdminSupportTab();
      else if (tab === 'adminlist') renderAdminAdminListTab();
      else if (tab === 'auditlog') renderAdminAuditLogTab();
      else if (tab === 'subjects') renderAdminSubjectsTab();
      else if (tab === 'districts') renderAdminDistrictsTab();
      else if (tab === 'schools') renderAdminSchoolsTab();
      else if (tab === 'legal') renderAdminLegalTab();
      else if (tab === 'snapshotbg') renderAdminSnapshotBgTab();
      else if (tab === 'navmenu') renderAdminNavMenuTab();
      else if (tab === 'turn') renderAdminTurnTab();
      else if (tab === 'streaming') renderAdminStreamingTab();
      else if (tab === 'schooldomains') window.renderAdminSchoolDomainsTab();
      else if (tab === 'mobileapp') window.renderAdminMobileAppTab();
    }

    function renderAdminGachaTab() {
      const container = document.getElementById('admin-tab-gacha');
      if (!container) return;

      if (!adminGachaDraft) {
        if (!gachaConfigLoaded) {
          container.innerHTML = ('<p style="text-align:center; color:#999; padding:20px;">' + window.t('admin.s9', '載入中扭蛋機設定...') + '</p>');
          return; // Firestore 資料一到，loadGachaConfigFromFirestore() 會自動再 render 多次
        }
        adminGachaDraft = {
          stickers: JSON.parse(JSON.stringify(GACHA_STICKERS)),
          series: JSON.parse(JSON.stringify(window.GACHA_SERIES || [])),
          costNormal: GACHA_COST.normal,
          costLucky: GACHA_COST.lucky,
          machineImageUrl: window.GACHA_MACHINE_IMAGE_URL || null,
          fragmentGain: Object.assign({ common: 1, rare: 3, limited: 6 }, window.GACHA_FRAGMENT_GAIN || {}),
          fragmentCost: Object.assign({ common: 3, rare: 9, limited: 18 }, window.GACHA_FRAGMENT_COST || {})
        };
        adminGachaMigrateDraft(adminGachaDraft);
      }

      function renderMachineImageCard() {
        const url = adminGachaDraft.machineImageUrl;
        const previewInner = url
          ? `<img src="${url}" style="width:100%; height:100%; object-fit:contain;">`
          : `<img src="assets/images/gacha-machine.png" style="width:100%; height:100%; object-fit:contain;">`;
        return `
          <div class="admin-card">
            <h3 style="font-size:15px; font-weight:bold; color:var(--brand-800); margin-bottom:10px;">${window.t('admin.s11', '預設扭蛋機圖片')}</h3>
            <p style="font-size:13px; color:#888; margin-bottom:10px;">${window.t('admin.s12', '這張是預設的扭蛋機外觀圖（不是貼圖）。未在下方「扭蛋系列」表格設定專屬「扭蛋機圖」的系列，會使用這張圖；不上傳則使用網站內建的預設圖。')}</p>
            <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
              <div id="admin-gacha-machine-thumb" onclick="document.getElementById('admin-gacha-machine-input').click()" title="${window.t('admin.s13', '點擊這裡上傳圖片')}" style="width:80px; height:80px; border-radius:10px; background:#F6F7FB; border:1px dashed #D2D9E9; display:flex; align-items:center; justify-content:center; cursor:pointer; overflow:hidden;">${previewInner}</div>
              <input type="file" accept="image/*" id="admin-gacha-machine-input" style="display:none;" onchange="adminUploadGachaMachineImage(this)">
              <div style="display:flex; flex-direction:column; gap:6px;">
                <button type="button" class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="document.getElementById('admin-gacha-machine-input').click()">${window.t('admin.s14', '上傳新圖片')}</button>
                ${url ? `<button type="button" class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="adminRemoveGachaMachineImage()">${window.t('admin.s10', '還原做預設圖')}</button>` : ''}
              </div>
            </div>
          </div>
        `;
      }

      // 圖片規格說明（只供管理人員參考，唔影響任何設定）
      function renderGachaImageSpecCard() {
        const row = (k, v) => `<tr><td style="white-space:nowrap; font-weight:700; color:var(--brand-800); vertical-align:top; padding:6px 10px 6px 0;">${k}</td><td style="padding:6px 0; line-height:1.7;">${v}</td></tr>`;
        const sec = (title, rows) => `
          <div style="margin-top:12px;">
            <div style="font-size:14px; font-weight:800; color:var(--brand-800); border-left:4px solid var(--brand-500); padding-left:8px; margin-bottom:4px;">${title}</div>
            <table style="width:100%; font-size:13px; color:#475F92; border-collapse:collapse;">${rows}</table>
          </div>`;
        return `
          <div class="admin-card">
            <details>
              <summary style="cursor:pointer; font-size:15px; font-weight:bold; color:var(--brand-800);">${window.t('admin.s54', '圖片規格說明（製作或更換圖片前請先閱讀）')}</summary>
              <p style="font-size:13px; color:#888; margin:8px 0 0;">${window.t('admin.s55', '以下為扭蛋相關圖片的建議規格。所有圖片均使用 Ottie 的統一畫風：中灰藍色柔和描邊、平塗上色，不可含任何文字、字母或數字。')}</p>
              ${sec(window.t('admin.s15', '一、貼圖圖（每件扭蛋貼圖）'),
                row(window.t('admin.s16', '尺寸'), window.t('admin.s17', '正方形 1:1，建議 1024 × 1024 像素')) +
                row(window.t('admin.s18', '格式'), 'PNG') +
                row(window.t('gacha.rarity.common', '普通'), window.t('admin.s19', '透明背景，只有 Ottie 及道具，四周留少量空位')) +
                row(window.t('gacha.rarity.rare', '稀有'), window.t('admin.s20', '簡單場景背景（牆壁、地面、一至兩件小物件，淡色），剪裁為圓角正方形，圓角以外為透明')) +
                row(window.t('gacha.rarity.limited', '限定'), window.t('admin.s21', '豐富完整的場景背景（多件道具、燈光效果、顏色較濃），剪裁為圓角正方形，圓角以外為透明')) +
                row(window.t('admin.s22', '上傳處理'), window.t('admin.s23', '系統會自動壓縮至最闊 600 像素')))}
              ${sec(window.t('admin.s24', '二、扭蛋機圖（每個系列可各自設定）'),
                row(window.t('admin.s16', '尺寸'), window.t('admin.s25', '橫向長方形，闊高比 6:5，建議 960 × 800 像素')) +
                row(window.t('admin.s18', '格式'), window.t('admin.s26', 'PNG，透明背景')) +
                row(window.t('admin.s27', '置中'), ('<b>' + window.t('admin.s28', '扭蛋機機身的正中必須位於圖片的正中') + '</b>' + window.t('admin.s29', '。如旁邊有 Ottie 等角色，須在另一邊加上相同闊度的透明空位，令機身置中'))) +
                row(window.t('admin.s30', '高度'), window.t('admin.s31', '扭蛋機（連角色）高度約佔圖片高度 94%，底部貼近圖片下緣')) +
                row(window.t('admin.s32', '網站顯示'), window.t('admin.s33', '闊 360 像素（手機畫面較窄時自動縮小）；系列選擇按鈕的縮圖亦會使用此圖')) +
                row(window.t('admin.s22', '上傳處理'), window.t('admin.s34', '系統會自動壓縮至最闊 800 像素')))}
              ${sec(window.t('admin.s35', '三、背景圖（每個系列可各自設定）'),
                row(window.t('admin.s16', '尺寸'), window.t('admin.s36', '橫向 16:9，建議 1376 × 768 或 1920 × 1080 像素')) +
                row(window.t('admin.s18', '格式'), 'JPG') +
                row(window.t('admin.s37', '構圖'), (window.t('admin.s38', '畫面正中約 40% 闊度須') + '<b>' + window.t('admin.s39', '完全留空') + '</b>' + window.t('admin.s40', '（扭蛋機放在此處）；裝飾物件放在左右兩邊'))) +
                row(window.t('admin.s41', '地平線'), window.t('admin.s42', '地面與牆壁或天空的分界線約在圖片高度 65% 至 75% 的位置，令扭蛋機看起來站在地上')) +
                row(window.t('admin.s43', '底部'), window.t('admin.s44', '圖片底部約 15% 保持淺色及簡單，以免遮擋「抽一次」「連續抽十次」按鈕')) +
                row(window.t('admin.s32', '網站顯示'), window.t('admin.s45', '電腦版：填滿整個框並貼底顯示，頂部可能被裁走少許。手機版：放大至框高的 140% 並貼底顯示，左右兩邊會被裁走較多，重要物件須放近中間')) +
                row(window.t('admin.s46', '未上傳時'), window.t('admin.s47', '使用網站內建的預設背景（assets/images/gacha-bg.jpg）')) +
                row(window.t('admin.s22', '上傳處理'), window.t('admin.s48', '系統會自動壓縮至最闊 1600 像素')))}
              ${sec(window.t('admin.s49', '四、原始檔存放位置'),
                row(window.t('admin.s50', '貼圖'), window.t('admin.s51', 'Desktop/concenmate-app/Ottie Pic/（每個系列一個資料夾，例如「動物連身衣」「書伴日常」）')) +
                row(window.t('admin.s52', '扭蛋機及背景'), window.t('admin.s53', 'Desktop/concenmate-app/Ottie Pic/扭蛋機/')))}
            </details>
          </div>`;
      }

      function renderSeriesCard() {
        const list = adminGachaDraft.series;
        const rows = list.map((se, idx) => {
          const n = adminGachaDraft.stickers.filter(st => String(st.seriesId) === String(se.id)).length;
          return `
          <tr>
            <td style="white-space:nowrap;">
              <button type="button" class="btn btn-outline" style="padding:1px 7px; font-size:13px;" onclick="adminMoveGachaSeries(${idx},-1)" ${idx === 0 ? 'disabled' : ''}>${window.t('admin.s58', '上移')}</button>
              <button type="button" class="btn btn-outline" style="padding:1px 7px; font-size:13px;" onclick="adminMoveGachaSeries(${idx},1)" ${idx === list.length - 1 ? 'disabled' : ''}>${window.t('admin.s59', '下移')}</button>
            </td>
            <td><input class="admin-input-sm" value="${escapeHtml(se.name || '')}" onchange="adminUpdateGachaSeries(${idx},'name',this.value)"></td>
            <td><input class="admin-input-sm" value="${escapeHtml(se.nameEn || '')}" placeholder="English name" onchange="adminUpdateGachaSeries(${idx},'nameEn',this.value)"></td>
            <td style="text-align:center;"><input type="checkbox" ${se.enabled !== false ? 'checked' : ''} onchange="adminUpdateGachaSeries(${idx},'enabled',this.checked)"></td>
            <td style="text-align:center; color:#555;">${n}</td>
            <td style="white-space:nowrap;">
              <div onclick="document.getElementById('admin-series-machine-input-${idx}').click()" title="${window.t('admin.s60', '點擊上傳此系列的扭蛋機圖')}" style="display:inline-flex; width:48px; height:48px; border-radius:8px; background:#F6F7FB; border:1px dashed #D2D9E9; align-items:center; justify-content:center; cursor:pointer; overflow:hidden; vertical-align:middle; font-size:11px; color:#999;">${se.machineImage ? `<img src="${se.machineImage}" style="width:100%; height:100%; object-fit:contain;">` : window.t('admin.s56', '上傳')}</div>
              <input type="file" accept="image/*" id="admin-series-machine-input-${idx}" style="display:none;" onchange="adminUploadSeriesMachineImage(${idx}, this)">
              ${se.machineImage ? `<button type="button" class="btn btn-outline" style="padding:1px 6px; font-size:12px; vertical-align:middle;" onclick="adminRemoveSeriesMachineImage(${idx})">${window.t('admin.s57', '移除')}</button>` : ''}
            </td>
            <td style="white-space:nowrap;">
              <div onclick="document.getElementById('admin-series-bg-input-${idx}').click()" title="${window.t('admin.s61', '點擊上傳此系列的背景圖')}" style="display:inline-flex; width:80px; height:45px; border-radius:8px; background:#F6F7FB; border:1px dashed #D2D9E9; align-items:center; justify-content:center; cursor:pointer; overflow:hidden; vertical-align:middle; font-size:11px; color:#999;">${se.bgImage ? `<img src="${se.bgImage}" style="width:100%; height:100%; object-fit:cover;">` : window.t('admin.s56', '上傳')}</div>
              <input type="file" accept="image/*" id="admin-series-bg-input-${idx}" style="display:none;" onchange="adminUploadSeriesBgImage(${idx}, this)">
              ${se.bgImage ? `<button type="button" class="btn btn-outline" style="padding:1px 6px; font-size:12px; vertical-align:middle;" onclick="adminRemoveSeriesBgImage(${idx})">${window.t('admin.s57', '移除')}</button>` : ''}
            </td>
            <td><button type="button" class="btn btn-red" style="padding:3px 8px; font-size:13px;" onclick="adminRemoveGachaSeries(${idx})">${window.t('qa.delete', '刪除')}</button></td>
          </tr>`;
        }).join('');
        return `
          <div class="admin-card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
              <h3 style="font-size:15px; font-weight:bold; color:var(--brand-800);">${window.t('admin.s63', '扭蛋系列（共')} ${list.length} ${window.t('admin.s64', '個）')}</h3>
              <button class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="adminAddGachaSeries()">${window.t('admin.s65', '新增系列')}</button>
            </div>
            <p style="font-size:13px; color:#888; margin-bottom:8px;">${window.t('admin.s66', '學生在扭蛋頁面先選擇系列，再抽該系列的貼圖；每個系列有獨立的收集進度。取消「開放扭蛋」後，學生不能再抽該系列，但已收集的貼圖會保留，圖鑑顯示為「已停售」。系列的排列次序即扭蛋頁面的顯示次序。英文名稱留空時，英文介面會顯示中文名稱。「扭蛋機圖」可為每個系列設定專屬的扭蛋機外觀（建議使用透明背景 PNG）；未上傳時使用下方的預設扭蛋機圖。「背景圖」是扭蛋機後面的場景（建議 16:9 橫向圖，中間留空），未上傳時使用網站內建的預設背景。')}</p>
            <div style="overflow-x:auto;">
              <table class="admin-table">
                <thead><tr><th>${window.t('admin.s67', '次序')}</th><th>${window.t('admin.s68', '中文名稱')}</th><th>${window.t('admin.s69', '英文名稱')}</th><th>${window.t('admin.s70', '開放扭蛋')}</th><th>${window.t('admin.s71', '貼圖數量')}</th><th>${window.t('admin.s72', '扭蛋機圖')}</th><th>${window.t('admin.s73', '背景圖')}</th><th></th></tr></thead>
                <tbody>${rows || ('<tr><td colspan="8" style="text-align:center; color:#999; padding:16px;">' + window.t('admin.s62', '未有系列，請點擊「新增系列」') + '</td></tr>')}</tbody>
              </table>
            </div>
          </div>`;
      }

      function renderStickerTable() {
        const allPool = adminGachaDraft.stickers;
        const filter = adminGachaSeriesFilter;
        const pool = allPool;
        const seriesTotals = {};
        allPool.forEach(p => { const k = String(p.seriesId || ''); seriesTotals[k] = (seriesTotals[k] || 0) + (parseFloat(p.weight) || 0); });
        const totalWeight = filter ? (seriesTotals[filter] || 0) : allPool.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0);
        const seriesOptions = (sel) => `<option value="" ${!sel ? 'selected' : ''}>${window.t('admin.s74', '（未分類）')}</option>` +
          adminGachaDraft.series.map(se => `<option value="${escapeHtml(String(se.id))}" ${String(sel) === String(se.id) ? 'selected' : ''}>${escapeHtml(se.name || se.id)}</option>`).join('');
        const rarityOptions = (sel) => [['common', window.t('gacha.rarity.common', '普通')], ['rare', window.t('gacha.rarity.rare', '稀有')], ['limited', window.t('gacha.rarity.limited', '限定')]]
          .map(([v, l]) => `<option value="${v}" ${(sel || 'common') === v ? 'selected' : ''}>${l}</option>`).join('');

        const rows = pool.map((p, idx) => {
          if (filter && String(p.seriesId || '') !== filter) return '';
          const sTotal = seriesTotals[String(p.seriesId || '')] || 0;
          const pct = sTotal > 0 ? ((parseFloat(p.weight) || 0) / sTotal * 100).toFixed(1) : '0.0';
          const thumbId = `admin-gacha-thumb-${idx}`;
          const inputId = `admin-gacha-photo-input-${idx}`;
          const thumbInner = p.photo
            ? `<img src="${p.photo}" style="width:44px; height:44px; object-fit:cover; border-radius:8px;">`
            : `<span style="font-size:20px;">${escapeHtml(p.emoji || '🦦')}</span>`;
          return `
          <tr>
            <td style="text-align:center; color:#888; font-size:13px;">#${p.id}</td>
            <td>
              <div style="display:flex; flex-direction:column; align-items:center; gap:3px;">
                <div id="${thumbId}" onclick="document.getElementById('${inputId}').click()" title="${window.t('admin.s13', '點擊這裡上傳圖片')}" style="width:44px; height:44px; border-radius:8px; background:#F6F7FB; border:1px dashed #D2D9E9; display:flex; align-items:center; justify-content:center; cursor:pointer; overflow:hidden;">${thumbInner}</div>
                <input type="file" accept="image/*" id="${inputId}" style="display:none;" onchange="adminUploadGachaPhoto(${idx},this)">
                ${p.photo ? `<button type="button" class="btn btn-outline" style="font-size:13px; padding:1px 6px;" onclick="adminRemoveGachaPhoto(${idx})">${window.t('admin.s75', '移除圖片')}</button>` : ''}
              </div>
            </td>
            <td><input class="admin-input-sm" value="${escapeHtml(p.name || '')}" onchange="adminUpdateGachaField(${idx},'name',this.value)"></td>
            <td><input class="admin-input-sm" value="${escapeHtml(p.nameEn || '')}" placeholder="English name" onchange="adminUpdateGachaField(${idx},'nameEn',this.value)"></td>
            <td><select class="admin-input-sm" onchange="adminUpdateGachaField(${idx},'seriesId',this.value); renderAdminGachaTab();">${seriesOptions(p.seriesId)}</select></td>
            <td><select class="admin-input-sm" onchange="adminUpdateGachaField(${idx},'rarity',this.value)">${rarityOptions(p.rarity)}</select></td>
            <td>
              <input class="admin-input-sm" type="number" min="0" style="width:70px;" value="${p.weight || 0}" oninput="adminUpdateGachaWeightLive(${idx},this.value)">
              <div id="admin-gacha-pct-${idx}" style="font-size:13px; color:#888; margin-top:2px; white-space:nowrap;">≈ ${pct}%</div>
            </td>
            <td><button class="btn btn-red" style="padding:3px 8px; font-size:13px;" onclick="adminRemoveGachaPrize(${idx})">🗑️</button></td>
          </tr>
        `;
        }).join('');

        return `
          <div class="admin-card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
              <h3 style="font-size:15px; font-weight:bold; color:var(--brand-800);">${window.t('admin.s78', '貼圖（共')} ${allPool.length} ${window.t('admin.s79', '件）')}</h3>
              <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
                <select class="admin-input-sm" onchange="adminSetGachaSeriesFilter(this.value)" title="${window.t('admin.s80', '只顯示某個系列')}">
                  <option value="" ${!filter ? 'selected' : ''}>${window.t('admin.s81', '顯示全部系列')}</option>
                  ${adminGachaDraft.series.map(se => `<option value="${escapeHtml(String(se.id))}" ${filter === String(se.id) ? 'selected' : ''}>${escapeHtml(se.name || se.id)}</option>`).join('')}
                </select>
                <button class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="adminNormalizeGachaWeights()">${window.t('admin.s82', '調整為剛好 100')}</button>
                <button class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="adminRenumberGachaStickers()">${window.t('admin.s83', '重新排序編號')}</button>
                <button class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="adminAddGachaPrize()">${window.t('admin.s84', '新增貼圖')}</button>
              </div>
            </div>
            <p style="font-size:13px; color:#888; margin-bottom:8px;">${window.t('admin.s85', '貼圖編號（#id）對應用戶收集圖鑑的位置，刪除貼圖之後編號會留下缺口（例如刪除 #13~#17 之後就由 #12 跳到 #18），這不影響扭蛋／收集功能，純粹是畫面上不美觀。如果想整理，點擊「重新排序編號」會將現存貼圖由上到下重新編為 1、2、3...連續號碼——但要留意：如果已經有真實學生扭過蛋、收藏了某幾張貼圖，重新編號會令他們原有的收藏對應不上新編號（貼圖會「變成另一件」），所以這個按鈕只適合在未有學生正式使用過、或者您願意接受重整所有人收藏記錄的情況下才點擊。')}</p>
            <div style="overflow-x:auto;">
              <table class="admin-table">
                <thead><tr><th>#</th><th>${window.t('admin.s86', '圖片')}</th><th>${window.t('admin.s68', '中文名稱')}</th><th>${window.t('admin.s69', '英文名稱')}</th><th>${window.t('admin.s87', '系列')}</th><th>${window.t('admin.s88', '稀有度')}</th><th>${window.t('admin.s89', '機率權重')}</th><th></th></tr></thead>
                <tbody>${rows || ('<tr><td colspan="8" style="text-align:center; color:#999; padding:16px;">' + window.t('admin.s76', '未有貼圖，請點擊「新增貼圖」開始') + '</td></tr>')}</tbody>
              </table>
            </div>
            <p style="font-size:13px; color:#888; margin-top:8px;">${filter ? window.t('admin.s77', '此系列') : window.t('room.filterAll', '全部')}${window.t('admin.s90', '總權重：')}<span id="admin-gacha-total">${totalWeight}</span>${window.t('admin.s91', '。學生每次只會在所選系列之內抽，所以「≈ %」是該張貼圖在')}<b>${window.t('admin.s92', '同一系列內')}</b>${window.t('admin.s93', '的機率。點擊「調整為剛好 100」會將每個系列各自的權重縮放到合計 100。稀有度只影響標籤及抽中時的提示，實際機率由權重決定。')}</p>
          </div>
        `;
      }

      container.innerHTML = `
        <div class="admin-card">
          <h3 style="font-size:15px; font-weight:bold; color:var(--brand-800); margin-bottom:10px;">${window.t('admin.s94', '扭蛋收費')}</h3>
          <div style="display:flex; gap:16px; flex-wrap:wrap; align-items:center;">
            <label style="font-size:13px; color:#555; display:flex; align-items:center; gap:6px;">抽一次 (PTS)：<input class="admin-input-sm" type="number" min="0" style="width:80px;" value="${adminGachaDraft.costNormal}" onchange="adminGachaDraft.costNormal = parseInt(this.value)||0"></label>
            <label style="font-size:13px; color:#555; display:flex; align-items:center; gap:6px;">連續抽十次 (PTS，一次過 10 抽的總費用)：<input class="admin-input-sm" type="number" min="0" style="width:80px;" value="${adminGachaDraft.costLucky}" onchange="adminGachaDraft.costLucky = parseInt(this.value)||0"></label>
          </div>
        </div>


        <div class="admin-card">
          <h3 style="font-size:15px; font-weight:bold; color:var(--brand-800); margin-bottom:6px;">${window.t('admin.s95', '貼圖碎片')}</h3>
          <p style="font-size:13px; color:#888; margin:0 0 10px;">${window.t('admin.s96', '學生扭到已擁有的貼圖會自動轉為碎片；碎片可兌換未擁有的貼圖（只限開放中的系列）。')}</p>
          <table class="admin-table" style="max-width:420px;">
            <thead><tr><th>${window.t('admin.s88', '稀有度')}</th><th>${window.t('admin.s97', '重複時得到碎片')}</th><th>${window.t('admin.s98', '兌換所需碎片')}</th></tr></thead>
            <tbody>
              ${[['common',window.t('gacha.rarity.common', '普通')],['rare',window.t('gacha.rarity.rare', '稀有')],['limited',window.t('gacha.rarity.limited', '限定')]].map(([k, label]) => `<tr>
                <td>${label}</td>
                <td><input class="admin-input-sm" type="number" min="0" max="1000" style="width:70px;" value="${adminGachaDraft.fragmentGain[k]}" onchange="adminGachaDraft.fragmentGain['${k}'] = Math.max(0, parseInt(this.value)||0)"></td>
                <td><input class="admin-input-sm" type="number" min="1" max="10000" style="width:70px;" value="${adminGachaDraft.fragmentCost[k]}" onchange="adminGachaDraft.fragmentCost['${k}'] = Math.max(1, parseInt(this.value)||1)"></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>

        ${renderGachaImageSpecCard()}

        ${renderMachineImageCard()}

        ${renderSeriesCard()}

        ${renderStickerTable()}

        <div style="display:flex; gap:8px; justify-content:flex-end;">
          <button class="btn btn-outline" type="button" onclick="adminResetGachaDraft()">${window.t('admin.s99', '還原未儲存的改動')}</button>
          <button class="btn btn-primary" type="button" id="btn-admin-save-gacha" onclick="adminSaveGachaConfig()">${window.t('admin.s100', '儲存全部改動')}</button>
        </div>
        <div style="margin-top:14px; padding-top:12px; border-top:1px solid var(--brand-200); display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <button class="btn btn-outline" type="button" id="btn-admin-compress-gacha" onclick="adminCompressGachaImages()">${window.t('admin.s101', '壓縮現有圖片（加快載入）')}</button>
          <span style="font-size:12px; color:#8A94A8;">${window.t('admin.s102', '把已上傳的貼圖、扭蛋機圖及背景圖轉為 WebP 格式，檔案細約九成。執行前請先儲存改動。可重複執行，已壓縮的會略過。')}</span>
        </div>
      `;
    }
    window.renderAdminGachaTab = renderAdminGachaTab;

    // ---------- v1.214.0：系列管理 ----------
    let adminGachaSeriesFilter = '';
    window.adminSetGachaSeriesFilter = function(v) { adminGachaSeriesFilter = v || ''; renderAdminGachaTab(); };

    // 第一次有系列功能時，自動將現有貼圖歸入「動物連身衣」，並按名稱
    // 預填英文名同稀有度（管理員仍然可以喺表格度改，撳儲存先生效）
    const ADMIN_GACHA_KNOWN = {
      '熊仔連身衣': ['Bear Onesie', 'common'], '黃貓連身衣': ['Tabby Cat Onesie', 'common'],
      '貓貓連身衣': ['Tabby Cat Onesie', 'common'], '青蛙連身衣': ['Frog Onesie', 'common'],
      '樹熊連身衣': ['Koala Onesie', 'common'], '柴犬連身衣': ['Shiba Inu Onesie', 'common'],
      '企鵝連身衣': ['Penguin Onesie', 'common'], '獅子連身衣': ['Lion Onesie', 'rare'],
      '中華白海豚連身衣': ['Chinese White Dolphin Onesie', 'rare'], '恐龍連身衣': ['Dinosaur Onesie', 'limited'],
      '獨角獸連身衣': ['Unicorn Onesie', 'limited']
    };
    function adminGachaMigrateDraft(d) {
      if (!Array.isArray(d.series)) d.series = [];
      if (!d.series.length) {
        d.series.push({ id: 'animal', name: '動物連身衣', nameEn: 'Animal Onesies', enabled: true, order: 1 });
        d.stickers.forEach(st => { if (!st.seriesId) st.seriesId = 'animal'; });
      }
      // 舊預設收費 30／270 → 新建議 60／540（溫習 1 小時＝扭 1 次）
      if (d.costNormal === 30 && d.costLucky === 270) { d.costNormal = 60; d.costLucky = 540; }
      d.stickers.forEach(st => {
        const k = ADMIN_GACHA_KNOWN[(st.name || '').trim()];
        if (k) {
          if (!st.nameEn) st.nameEn = k[0];
          if (!st.rarity) st.rarity = k[1];
        }
        if (!st.rarity) st.rarity = 'common';
      });
    }
    window.adminAddGachaSeries = function() {
      if (!adminGachaDraft) return;
      const used = new Set(adminGachaDraft.series.map(se => String(se.id)));
      let n = adminGachaDraft.series.length + 1, id = 's' + n;
      while (used.has(id)) { n++; id = 's' + n; }
      adminGachaDraft.series.push({ id, name: '新系列', nameEn: '', enabled: false, order: adminGachaDraft.series.length + 1 });
      renderAdminGachaTab();
      window.showToast(window.t('admin.s105', '已新增系列（預設未開放扭蛋），請點擊「儲存全部改動」'), '📦');
    };
    window.adminRemoveGachaSeries = async function(idx) {
      if (!adminGachaDraft || !adminGachaDraft.series[idx]) return;
      const se = adminGachaDraft.series[idx];
      const n = adminGachaDraft.stickers.filter(st => String(st.seriesId) === String(se.id)).length;
      if (n > 0) { window.showToast(`${window.t('admin.s106', '此系列仍有')} ${n} ${window.t('admin.s107', '張貼圖，請先將貼圖移到其他系列或刪除')}`, '⚠️'); return; }
      if (!(await window.appConfirm(`${window.t('admin.s108', '確定刪除系列「')}${se.name || se.id}」？`))) return;
      adminGachaDraft.series.splice(idx, 1);
      adminGachaDraft.series.forEach((x, i) => { x.order = i + 1; });
      if (adminGachaSeriesFilter === String(se.id)) adminGachaSeriesFilter = '';
      renderAdminGachaTab();
    };
    window.adminMoveGachaSeries = function(idx, dir) {
      if (!adminGachaDraft) return;
      const list = adminGachaDraft.series; const j = idx + dir;
      if (j < 0 || j >= list.length) return;
      [list[idx], list[j]] = [list[j], list[idx]];
      list.forEach((x, i) => { x.order = i + 1; });
      renderAdminGachaTab();
    };

    // 權重輸入格用 oninput（打緊字每一下都觸發，唔使等 blur 先算），
    // 即時更新草稿數值，再直接用 DOM 改返每一行嘅「≈ %」同「總權重」
    // 文字——特登唔用重新 render 成個表格嘅方式，否則打緊字嗰陣個輸入格
    // 會因為 innerHTML 被重寫而失去焦點／游標位置。
    window.adminUpdateGachaWeightLive = function(idx, rawValue) {
      if (!adminGachaDraft || !adminGachaDraft.stickers[idx]) return;
      adminGachaDraft.stickers[idx].weight = parseFloat(rawValue) || 0;

      const pool = adminGachaDraft.stickers;
      const totals = {};
      pool.forEach(p => { const k = String(p.seriesId || ''); totals[k] = (totals[k] || 0) + (parseFloat(p.weight) || 0); });

      pool.forEach((p, i) => {
        const pctEl = document.getElementById(`admin-gacha-pct-${i}`);
        if (pctEl) {
          const t = totals[String(p.seriesId || '')] || 0;
          const pct = t > 0 ? ((parseFloat(p.weight) || 0) / t * 100).toFixed(1) : '0.0';
          pctEl.innerText = `≈ ${pct}%`;
        }
      });

      const totalEl = document.getElementById('admin-gacha-total');
      if (totalEl) totalEl.innerText = adminGachaSeriesFilter ? (totals[adminGachaSeriesFilter] || 0) : pool.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0);
    };

    // 讀取圖片檔案 → 縮圖 → 壓縮做一個 Blob（用嚟上傳去 Firebase Storage）。
    // PNG／GIF／WebP 呢啲支援透明背景嘅格式會保留做 PNG 輸出（保住透明），
    // 其他（例如相機影嘅 JPEG）先會壓縮做 JPEG 減檔案大小。
    // Phase 4：呢張圖而家上傳去 Storage（見 storage.rules 嘅 gacha_stickers/
    // 路徑），Firestore 度嘅 admin_config/gacha 文件淨係存返個下載連結
    // （字串），唔再直接塞成張圖嘅 base64 落 Firestore——一嚟避免撞 Firestore
    // 單一文件 1MiB 上限，二嚟每個用戶登入嗰陣經 onSnapshot 攞呢份設定時，
    // 唔使個個都下載晒全部貼紙嘅完整圖片資料，流量同讀取速度都會好啲。
    function compressImageFileToBlob(file, maxWidth, quality) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        const keepTransparency = /^image\/(png|gif|webp|svg\+xml)$/.test(file.type);
        // v1.230.7：瀏覽器支援時一律輸出 WebP（保留透明背景，檔案細好多）；不支援（舊 Safari）則沿用 PNG／JPEG
        img.onload = () => {
          const scale = Math.min(1, maxWidth / img.width);
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          const fallbackType = keepTransparency ? 'image/png' : 'image/jpeg';
          canvas.toBlob((webp) => {
            if (webp && webp.type === 'image/webp') { resolve({ blob: webp, mimeType: 'image/webp' }); return; }
            canvas.toBlob((blob) => {
              if (blob) resolve({ blob, mimeType: fallbackType });
              else reject(new Error(window.t('admin.s109', '圖片轉換失敗')));
            }, fallbackType, quality);
          }, 'image/webp', 0.82);
        };
        img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
        img.src = url;
      });
    }

    // 如果舊相片係一個 Storage 下載連結（即係 Phase 4 之後上傳嘅新相），
    // 就順手刪走 Storage 度嘅舊檔案，避免留低用唔到嘅殘留檔案浪費空間。
    // 用 best-effort（失敗都唔阻住主流程）——舊資料如果仲係 base64 格式
    // （Phase 4 之前上傳嘅），呢度會自動跳過，唔會嘗試刪。
    async function tryDeleteOldGachaStoragePhoto(oldPhotoUrl) {
      if (!oldPhotoUrl || typeof oldPhotoUrl !== 'string') return;
      if (!oldPhotoUrl.includes('firebasestorage')) return; // 唔係 Storage 連結（例如舊 base64），跳過
      if (!window.storage || !window.storageApi) return;
      try {
        await window.storageApi.deleteObject(window.storageApi.ref(window.storage, oldPhotoUrl));
      } catch (e) {
        console.warn('刪除舊貼紙相片失敗（唔影響新相片上傳）:', e);
      }
    }

    window.adminUploadGachaPhoto = async function(idx, inputEl) {
      if (!adminGachaDraft || !adminGachaDraft.stickers[idx]) return;
      const file = inputEl.files && inputEl.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        window.showToast(window.t('admin.s110', '請選擇圖片檔案'), '⚠️');
        return;
      }
      if (!window.storage || !window.storageApi) {
        window.showToast(window.t('admin.s111', 'Storage 未初始化，請重新整理頁面再試'), '⚠️');
        return;
      }
      const sticker = adminGachaDraft.stickers[idx];
      const oldPhoto = sticker.photo;
      window.showToast(window.t('admin.s112', '上傳中相片…'), '📤');
      try {
        const { blob, mimeType } = await compressImageFileToBlob(file, 600, 0.85);
        const ext = mimeType === 'image/webp' ? 'webp' : (mimeType === 'image/png' ? 'png' : 'jpg');
        const path = `gacha_stickers/sticker_${sticker.id}_${Date.now()}.${ext}`;
        const fileRef = window.storageApi.ref(window.storage, path);
        await window.storageApi.uploadBytes(fileRef, blob, { contentType: mimeType });
        const downloadUrl = await window.storageApi.getDownloadURL(fileRef);
        adminGachaDraft.stickers[idx].photo = downloadUrl;
        renderAdminGachaTab();
        window.showToast(window.t('admin.s113', '相片上傳成功，請點擊「儲存全部改動」才會正式生效'), '🎉');
        tryDeleteOldGachaStoragePhoto(oldPhoto); // best-effort，唔使等佢完成
      } catch (err) {
        window.showToast(window.t('admin.s114', '圖片上傳失敗：') + (err.message || err), '❌');
      }
    };

    window.adminRemoveGachaPhoto = function(idx) {
      if (!adminGachaDraft || !adminGachaDraft.stickers[idx]) return;
      const oldPhoto = adminGachaDraft.stickers[idx].photo;
      tryDeleteOldGachaStoragePhoto(oldPhoto); // best-effort
      delete adminGachaDraft.stickers[idx].photo;
      renderAdminGachaTab();
    };

    // 扭蛋機外殼圖片（唔係貼紙，係機身本身嗰張圖）——用返同貼紙相片
    // 一樣嘅 gacha_stickers/ Storage 路徑（storage.rules 已經俾呢個路徑
    // 底下任何檔名都通過，唔使再加多條規則），淨係換個檔名前綴分開嚟。
    window.adminUploadGachaMachineImage = async function(inputEl) {
      if (!adminGachaDraft) return;
      const file = inputEl.files && inputEl.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        window.showToast(window.t('admin.s110', '請選擇圖片檔案'), '⚠️');
        return;
      }
      if (!window.storage || !window.storageApi) {
        window.showToast(window.t('admin.s111', 'Storage 未初始化，請重新整理頁面再試'), '⚠️');
        return;
      }
      const oldUrl = adminGachaDraft.machineImageUrl;
      window.showToast(window.t('admin.s123', '上傳中圖片…'), '📤');
      try {
        const { blob, mimeType } = await compressImageFileToBlob(file, 800, 0.85);
        const ext = mimeType === 'image/webp' ? 'webp' : (mimeType === 'image/png' ? 'png' : 'jpg');
        const path = `gacha_stickers/machine_image_${Date.now()}.${ext}`;
        const fileRef = window.storageApi.ref(window.storage, path);
        await window.storageApi.uploadBytes(fileRef, blob, { contentType: mimeType });
        const downloadUrl = await window.storageApi.getDownloadURL(fileRef);
        adminGachaDraft.machineImageUrl = downloadUrl;
        renderAdminGachaTab();
        window.showToast(window.t('admin.s124', '圖片上傳成功，請點擊「儲存全部改動」才會正式生效'), '🎉');
        tryDeleteOldGachaStoragePhoto(oldUrl); // best-effort，唔使等佢完成
      } catch (err) {
        window.showToast(window.t('admin.s114', '圖片上傳失敗：') + (err.message || err), '❌');
      }
    };

    // 個別系列專屬嘅扭蛋機圖，用同一個 Storage 路徑
    window.adminUploadSeriesMachineImage = async function(idx, inputEl) {
      if (!adminGachaDraft || !adminGachaDraft.series[idx]) return;
      const file = inputEl.files && inputEl.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) { window.showToast(window.t('admin.s110', '請選擇圖片檔案'), '⚠️'); return; }
      if (!window.storage || !window.storageApi) { window.showToast(window.t('admin.s111', 'Storage 未初始化，請重新整理頁面再試'), '⚠️'); return; }
      const se = adminGachaDraft.series[idx];
      const oldUrl = se.machineImage;
      window.showToast(window.t('admin.s123', '上傳中圖片…'), '📤');
      try {
        const { blob, mimeType } = await compressImageFileToBlob(file, 800, 0.85);
        const ext = mimeType === 'image/webp' ? 'webp' : (mimeType === 'image/png' ? 'png' : 'jpg');
        const path = `gacha_stickers/machine_series_${String(se.id).replace(/[^A-Za-z0-9_-]/g, '')}_${Date.now()}.${ext}`;
        const fileRef = window.storageApi.ref(window.storage, path);
        await window.storageApi.uploadBytes(fileRef, blob, { contentType: mimeType });
        se.machineImage = await window.storageApi.getDownloadURL(fileRef);
        renderAdminGachaTab();
        window.showToast(window.t('admin.s124', '圖片上傳成功，請點擊「儲存全部改動」才會正式生效'), '🎉');
        tryDeleteOldGachaStoragePhoto(oldUrl);
      } catch (err) {
        window.showToast(window.t('admin.s114', '圖片上傳失敗：') + (err.message || err), '❌');
      }
    };
    // 個別系列專屬嘅扭蛋機背景場景圖
    window.adminUploadSeriesBgImage = async function(idx, inputEl) {
      if (!adminGachaDraft || !adminGachaDraft.series[idx]) return;
      const file = inputEl.files && inputEl.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) { window.showToast(window.t('admin.s110', '請選擇圖片檔案'), '⚠️'); return; }
      if (!window.storage || !window.storageApi) { window.showToast(window.t('admin.s111', 'Storage 未初始化，請重新整理頁面再試'), '⚠️'); return; }
      const se = adminGachaDraft.series[idx];
      const oldUrl = se.bgImage;
      window.showToast(window.t('admin.s123', '上傳中圖片…'), '📤');
      try {
        const { blob, mimeType } = await compressImageFileToBlob(file, 1600, 0.85);
        const ext = mimeType === 'image/webp' ? 'webp' : (mimeType === 'image/png' ? 'png' : 'jpg');
        const path = `gacha_stickers/bg_series_${String(se.id).replace(/[^A-Za-z0-9_-]/g, '')}_${Date.now()}.${ext}`;
        const fileRef = window.storageApi.ref(window.storage, path);
        await window.storageApi.uploadBytes(fileRef, blob, { contentType: mimeType });
        se.bgImage = await window.storageApi.getDownloadURL(fileRef);
        renderAdminGachaTab();
        window.showToast(window.t('admin.s124', '圖片上傳成功，請點擊「儲存全部改動」才會正式生效'), '🎉');
        tryDeleteOldGachaStoragePhoto(oldUrl);
      } catch (err) {
        window.showToast(window.t('admin.s114', '圖片上傳失敗：') + (err.message || err), '❌');
      }
    };
    window.adminRemoveSeriesBgImage = function(idx) {
      if (!adminGachaDraft || !adminGachaDraft.series[idx]) return;
      tryDeleteOldGachaStoragePhoto(adminGachaDraft.series[idx].bgImage);
      adminGachaDraft.series[idx].bgImage = null;
      renderAdminGachaTab();
    };

    window.adminRemoveSeriesMachineImage = function(idx) {
      if (!adminGachaDraft || !adminGachaDraft.series[idx]) return;
      tryDeleteOldGachaStoragePhoto(adminGachaDraft.series[idx].machineImage);
      adminGachaDraft.series[idx].machineImage = null;
      renderAdminGachaTab();
    };

    window.adminRemoveGachaMachineImage = function() {
      if (!adminGachaDraft) return;
      const oldUrl = adminGachaDraft.machineImageUrl;
      tryDeleteOldGachaStoragePhoto(oldUrl); // best-effort
      adminGachaDraft.machineImageUrl = null;
      renderAdminGachaTab();
    };

    // 將所有貼紙嘅權重等比例縮放，令佢哋啱啱好加埋等於 100，
    // 令「權重」同「機率 %」睇落一致，滿足想用 percentage 睇嘅需要，
    // 同時內部繼續用返權重運算，加/減貼紙都唔使手動重新分配其他行。
    window.adminNormalizeGachaWeights = function() {
      if (!adminGachaDraft || !adminGachaDraft.stickers.length) return;
      const groups = {};
      adminGachaDraft.stickers.forEach(p => { const k = String(p.seriesId || ''); (groups[k] = groups[k] || []).push(p); });
      let skipped = 0;
      Object.values(groups).forEach(pool => {
        const total = pool.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0);
        if (total <= 0) { skipped++; return; }
        let runningTotal = 0;
        pool.forEach((p, i) => {
          if (i === pool.length - 1) {
            p.weight = Math.max(0, 100 - runningTotal);
          } else {
            const w = Math.round((parseFloat(p.weight) || 0) / total * 100);
            p.weight = w;
            runningTotal += w;
          }
        });
      });
      renderAdminGachaTab();
      window.showToast(skipped ? window.t('admin.s125', '已調整；部分系列權重全部是 0，未有調整') : window.t('admin.s126', '已將每個系列的權重調整為合計 100'), '⚖️');
    };

    window.adminAddGachaPrize = function() {
      if (!adminGachaDraft) return;
      const pool = adminGachaDraft.stickers;
      const nextId = pool.length ? Math.max(...pool.map(p => p.id || 0)) + 1 : 1;
      const sid = adminGachaSeriesFilter || (adminGachaDraft.series[0] && adminGachaDraft.series[0].id) || '';
      pool.push({ id: nextId, emoji: '🦦', name: `新貼圖 #${String(nextId).padStart(2, '0')}`, nameEn: '', photo: null, weight: 1, seriesId: sid, rarity: 'common' });
      renderAdminGachaTab();
    };

    window.adminRemoveGachaPrize = async function(idx) {
      if (!adminGachaDraft) return;
      if (!(await window.appConfirm(window.t('admin.s128', '確定刪除這張貼圖？若已經有用戶擁有，其收集紀錄會保留，但在圖鑑中將不再顯示。')))) return;
      adminGachaDraft.stickers.splice(idx, 1);
      renderAdminGachaTab();
    };

    // 將現存貼紙（跟返表格而家嘅先後次序）重新編做連續嘅 1、2、3...號碼，
    // 執返因為刪除而留低嘅缺口（例如 #12 跳去 #18）。⚠️ 呢個操作會令
    // 「舊編號」同「新編號」對唔返位——如果已經有真實用戶擁有緊某隻貼紙
    // （即係佢哋 users/{uid}.ownedStickers 入面有嗰個舊 id 嘅紀錄），重新
    // 編號之後嗰個 id 會變成對應緊另一隻貼紙，等於將佢哋原有嘅收藏「亂
    // 掉」，唔係刪走但會變樣。所以特登喺按鈕嗰段文字、同呢度嘅 confirm
    // 入面都講清楚呢個風險，等管理員自己衡量而家係咪安全時機（例如仲
    // 未有學生正式扭過蛋）先撳。
    window.adminRenumberGachaStickers = async function() {
      if (!adminGachaDraft || !adminGachaDraft.stickers.length) return;
      if (!(await window.appConfirm(window.t('admin.s129', '重新排序編號會將貼紙 id 由 1 開始重新連續編號。\n\n如果已經有真實學生使用這個扭蛋機扭過蛋、收藏了某幾隻貼紙，他們原有的收藏會因為編號改變而對應不上（貼紙會「變成另一隻」）。如果尚未有學生正式使用過，或者你願意接受洗牌整批收藏記錄，才繼續。\n\n確定要重新編號？')))) return;
      adminGachaDraft.stickers.forEach((p, i) => { p.id = i + 1; });
      renderAdminGachaTab();
      window.showToast(window.t('admin.s130', '已重新排序編號，請點擊「儲存全部改動」才會正式生效'), '🔢');
    };

    window.adminResetGachaDraft = function() {
      adminGachaDraft = null;
      renderAdminGachaTab();
      window.showToast(window.t('admin.s131', '已還原至上次儲存的版本'), '↩️');
    };

    function renderAdminLevelTab() {
      const container = document.getElementById('admin-tab-level');
      if (!container) return;
      if (!adminLevelDraft) {
        if (!levelConfigLoaded) {
          container.innerHTML = ('<p style="text-align:center; color:#999; padding:20px;">' + window.t('admin.s140', '載入中等級系統設定...') + '</p>');
          return;
        }
        adminLevelDraft = JSON.parse(JSON.stringify(LEVEL_CONFIG));
      }

      // v1.220.2：段位改為一個表格，同「到達需時」放埋一齊睇；
      // 已移除段位相片（主頁 Ottie 而家跟用戶揀嘅貼圖，唔再跟段位轉）
      // v1.224.0 溫習黃金時段（舊設定冇呢個欄位就用預設值）
      adminLevelDraft.goldenHour = Object.assign({ enabled: false, title: '書伴自習時段', start: '19:00', end: '23:00', expMultiplier: 2, stoneMultiplier: 2 }, adminLevelDraft.goldenHour || {});
      const gh = adminLevelDraft.goldenHour;
      const th = 'padding:6px 8px; text-align:left; white-space:nowrap; color:#6B7894; font-weight:700;';
      const td = 'padding:6px 8px; vertical-align:middle;';
      const rankRows = adminLevelDraft.ranks.map((r, idx) => `
        <tr style="border-top:1px solid var(--brand-100);">
          <td style="${td}"><input class="admin-input-sm" type="number" min="1" style="width:60px;" value="${r.minLevel}" oninput="adminLevelDraft.ranks[${idx}].minLevel = parseInt(this.value)||1; adminRefreshLevelPreview();"></td>
          <td style="${td}"><input class="admin-input-sm" style="width:96px;" value="${escapeHtml(r.title || '')}" oninput="adminLevelDraft.ranks[${idx}].title = this.value; adminRefreshLevelPreview();"></td>
          <td style="${td}"><input class="admin-input-sm" style="width:100px;" value="${escapeHtml(r.titleEn || '')}" oninput="adminLevelDraft.ranks[${idx}].titleEn = this.value"></td>
          <td style="${td} white-space:nowrap;">
            <img src="${window.stoneSrcForRank ? window.stoneSrcForRank(r) : 'assets/images/stone-1.png'}" id="admin-rank-stone-img-${idx}" alt="" width="26" height="26" style="vertical-align:middle;">
            <select class="admin-input-sm" style="vertical-align:middle; width:auto; min-width:0; max-width:96px;" onchange="adminLevelDraft.ranks[${idx}].stone = parseInt(this.value)||undefined; document.getElementById('admin-rank-stone-img-${idx}').src = 'assets/images/stone-' + (parseInt(this.value) || ${idx + 1 > 5 ? 5 : idx + 1}) + '.png';">
              <option value="">${window.t('admin.s141', '自動')}</option>
              ${[window.t('gacha.stoneGrey', '灰石'),window.t('gacha.stonePebble', '鵝卵石'),window.t('gacha.stoneMarble', '雲石'),window.t('gacha.stoneCrystal', '水晶'),window.t('gacha.stoneGem', '寶石')].map((nm, k) => `<option value="${k + 1}" ${parseInt(r.stone) === k + 1 ? 'selected' : ''}>${nm}</option>`).join('')}
            </select>
          </td>
          <td style="${td} font-weight:700; white-space:nowrap;" id="admin-rank-time-${idx}"></td>
          <td style="${td} white-space:nowrap;" id="admin-rank-d1-${idx}"></td>
          <td style="${td} white-space:nowrap;" id="admin-rank-d3-${idx}"></td>
          <td style="${td}"><button class="btn btn-red" style="font-size:13px; padding:3px 8px;" onclick="adminRemoveLevelRank(${idx})">${window.t('qa.delete', '刪除')}</button></td>
        </tr>
        <tr>
          <td colspan="8" style="padding:0 8px 10px;">
            <input class="admin-input-sm" style="width:100%; box-sizing:border-box;" placeholder="${window.t('admin.s142', '段位說明（用戶點擊等級時彈出視窗顯示）')}" value="${escapeHtml(r.desc || '')}" oninput="adminLevelDraft.ranks[${idx}].desc = this.value">
          </td>
        </tr>
      `).join('');

      container.innerHTML = `
        <div class="admin-card">
          <h3 style="font-size:14px; font-weight:bold; margin-bottom:8px;">${window.t('admin.s143', '升級速度')}</h3>
          <div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:6px;">
            <label style="font-size:13px; color:#555; display:flex; align-items:center; gap:6px;">
              ${window.t('admin.s144', '每溫習 1 分鐘可得 EXP：')}
              <input class="admin-input-sm" type="number" min="0" step="0.1" style="width:70px;" value="${adminLevelDraft.expPerMinute}" oninput="adminLevelDraft.expPerMinute = parseFloat(this.value)||0; adminRefreshLevelPreview();">
            </label>
            <label style="font-size:13px; color:#555; display:flex; align-items:center; gap:6px;">
              ${window.t('admin.s145', '升級難度係數：')}
              <input class="admin-input-sm" type="number" min="1" step="1" style="width:70px;" value="${adminLevelDraft.levelCurveFactor}" oninput="adminLevelDraft.levelCurveFactor = parseFloat(this.value)||10; adminRefreshLevelPreview();">
            </label>
          </div>
          <p style="font-size:13px; color:#888;">${window.t('admin.s146', '升到第 L 級總共需要的 EXP')} = 難度係數 × L × (L−1)。係數越大，升級越慢。改動後下面的時間會即時更新。</p>
        </div>

        <div class="admin-card" style="margin-top:12px;">
          <h3 style="font-size:14px; font-weight:bold; margin-bottom:4px;">${window.t('admin.s147', '段位（由低到高，第一個段位的等級門檻請設為 1）')}</h3>
          <p style="font-size:13px; color:#888; margin-bottom:8px;">${window.t('admin.s148', '稱號會顯示在視訊溫習室名牌、排行榜及個人資料。石頭是 Ottie 每 15 分鐘磨好的石頭款式，顯示在名牌、主頁及等級詳情（「自動」即按段位次序配）。「到達需時」按上面的升級速度計算。')}</p>
          <div style="overflow-x:auto;">
            <table style="border-collapse:collapse; font-size:13px; color:var(--brand-800); min-width:740px; width:100%;">
              <thead><tr>
                <th style="${th}">${window.t('admin.s149', '等級門檻')}</th><th style="${th}">${window.t('admin.s150', '稱號（中）')}</th><th style="${th}">${window.t('admin.s151', '稱號（英）')}</th><th style="${th}">${window.t('golden.stone', '石頭')}</th>
                <th style="${th}">${window.t('admin.s152', '到達需時')}</th><th style="${th}">${window.t('admin.s153', '每日溫 3 小時')}</th><th style="${th}">${window.t('admin.s154', '每日溫 5 小時')}</th><th style="${th}"></th>
              </tr></thead>
              <tbody>${rankRows}</tbody>
            </table>
          </div>
          <button class="btn btn-outline" style="margin-top:6px; font-size:13px;" onclick="adminAddLevelRank()">${window.t('admin.s155', '新增段位')}</button>
          <details style="margin-top:12px;">
            <summary style="font-size:13px; font-weight:700; color:var(--brand-600); cursor:pointer;">${window.t('admin.s156', '查看其他等級所需時間')}</summary>
            <div id="admin-level-preview" style="font-size:13px; margin-top:8px;"></div>
          </details>
        </div>

        <div class="admin-card" style="margin-top:12px;">
          <h3 style="font-size:14px; font-weight:bold; margin-bottom:8px;">${window.t('level.rewardRuleTitle', '升級獎勵')}</h3>
          <div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:10px;">
            <label style="font-size:13px; color:#555; display:flex; align-items:center; gap:6px;">
              ${window.t('admin.s157', '每升一級送免費扭蛋券：')}
              <input class="admin-input-sm" type="number" min="0" max="10" step="1" style="width:60px;" value="${adminLevelDraft.levelUpTickets ?? 1}" oninput="adminLevelDraft.levelUpTickets = parseInt(this.value)||0"> ${window.t('admin.s118', '張')}
            </label>
            <label style="font-size:13px; color:#555; display:flex; align-items:center; gap:6px;">
              ${window.t('admin.s158', '每')}
              <input class="admin-input-sm" type="number" min="1" max="100" step="1" style="width:60px;" value="${adminLevelDraft.milestoneEvery ?? 5}" oninput="adminLevelDraft.milestoneEvery = parseInt(this.value)||5">
              ${window.t('admin.s159', '級額外送碎片：')}
              <input class="admin-input-sm" type="number" min="0" max="1000" step="1" style="width:60px;" value="${adminLevelDraft.milestoneFragments ?? 5}" oninput="adminLevelDraft.milestoneFragments = parseInt(this.value)||0"> ${window.t('admin.s160', '個')}
            </label>
          </div>
          <p style="font-size:13px; color:#888;">${window.t('admin.s161', '用戶溫習時一升級，伺服器就會自動派發。免費扭蛋券可在扭蛋頁單抽一次，不扣積分。每一級只派一次。')}</p>
        </div>

        <div class="admin-card" style="margin-top:12px;">
          <h3 style="font-size:14px; font-weight:bold; margin-bottom:8px;">${window.t('admin.s162', '溫習黃金時段')}</h3>
          <div style="display:flex; gap:16px; flex-wrap:wrap; align-items:center; margin-bottom:10px; font-size:13px; color:#555;">
            <label style="display:flex; align-items:center; gap:6px;">
              <input type="checkbox" ${gh.enabled ? 'checked' : ''} onchange="adminLevelDraft.goldenHour.enabled = this.checked"> ${window.t('admin.s163', '啟用')}
            </label>
            <label style="display:flex; align-items:center; gap:6px;">${window.t('admin.s164', '名稱：')}
              <input class="admin-input-sm" style="width:130px;" value="${escapeHtml(gh.title || '')}" oninput="adminLevelDraft.goldenHour.title = this.value">
            </label>
            <label style="display:flex; align-items:center; gap:6px;">${window.t('admin.s165', '每日')}
              <input class="admin-input-sm" type="time" style="width:auto;" value="${gh.start}" oninput="adminLevelDraft.goldenHour.start = this.value">
              ${window.t('admin.s166', '至')}
              <input class="admin-input-sm" type="time" style="width:auto;" value="${gh.end}" oninput="adminLevelDraft.goldenHour.end = this.value">
            </label>
            <label style="display:flex; align-items:center; gap:6px;">EXP ×
              <input class="admin-input-sm" type="number" min="1" max="5" step="0.1" style="width:64px;" value="${gh.expMultiplier}" oninput="adminLevelDraft.goldenHour.expMultiplier = parseFloat(this.value)||1">
            </label>
            <label style="display:flex; align-items:center; gap:6px;">${window.t('admin.s167', '石頭 ×')}
              <input class="admin-input-sm" type="number" min="1" max="5" step="0.1" style="width:64px;" value="${gh.stoneMultiplier}" oninput="adminLevelDraft.goldenHour.stoneMultiplier = parseFloat(this.value)||1">
            </label>
          </div>
          <p style="font-size:13px; color:#888;">${window.t('admin.s168', '以香港時間計算；結束時間早於開始時間代表跨過午夜。時段內每分鐘溫習的 EXP 及石頭進度按倍數計算（倍數可設小數，最多一位，例如 1.5；石頭 ×2 即每 7.5 分鐘一粒），由伺服器計算，用戶改不到。時段內所有用戶頁頂會顯示提示。')}</p>
        </div>

        <div style="margin-top:14px; display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="adminSaveLevelConfig()">${window.t('admin.s100', '儲存全部改動')}</button>
          <button class="btn btn-outline" onclick="adminResetLevelDraft()">${window.t('admin.s99', '還原未儲存的改動')}</button>
        </div>
      `;
      adminRefreshLevelPreview();
    }
    window.renderAdminLevelTab = renderAdminLevelTab;

    window.adminAddLevelRank = function() {
      if (!adminLevelDraft) return;
      const maxL = adminLevelDraft.ranks.reduce((m, r) => Math.max(m, parseInt(r.minLevel) || 1), 1);
      adminLevelDraft.ranks.push({ minLevel: maxL + 10, title: '新段位', titleEn: 'New Rank', desc: '' });
      renderAdminLevelTab();
    };

    window.adminRemoveLevelRank = function(idx) {
      if (!adminLevelDraft) return;
      if (adminLevelDraft.ranks.length <= 1) { window.showToast(window.t('admin.s176', '最少需保留一個段位'), '⚠️'); return; }
      adminLevelDraft.ranks.splice(idx, 1);
      renderAdminLevelTab();
    };

    window.adminResetLevelDraft = function() {
      adminLevelDraft = null;
      renderAdminLevelTab();
    };

    window.adminUploadRankPhoto = async function(idx, inputEl) {
      if (!adminLevelDraft || !adminLevelDraft.ranks[idx]) return;
      const file = inputEl.files && inputEl.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        window.showToast(window.t('admin.s110', '請選擇圖片檔案'), '⚠️');
        return;
      }
      try {
        const dataUrl = await compressImageFileToDataURL(file, 300, 0.8);
        adminLevelDraft.ranks[idx].photo = dataUrl;
        renderAdminLevelTab();
      } catch (err) {
        window.showToast(window.t('admin.s177', '圖片讀取失敗，請再試一次'), '❌');
      }
    };

    window.adminRemoveRankPhoto = function(idx) {
      if (!adminLevelDraft || !adminLevelDraft.ranks[idx]) return;
      delete adminLevelDraft.ranks[idx].photo;
      renderAdminLevelTab();
    };

    // ---------- 房間管理 ----------
    function renderAdminRoomsTab() {
      const container = document.getElementById('admin-tab-rooms');
      if (!container || !window.db || !window.fs) return;
      container.innerHTML = ('<p style="text-align:center; color:#999; padding:20px;">' + window.t('admin.s182', '載入中房間資料...') + '</p>');

      if (adminRoomsUnsubscribe) adminRoomsUnsubscribe();
      adminRoomsUnsubscribe = window.fs.onSnapshot(window.fs.collection(window.db, 'rooms'), (snapshot) => {
        if (snapshot.empty) {
          container.innerHTML = ('<div class="admin-card" style="text-align:center; color:#999;">' + window.t('admin.s183', '目前沒有任何溫習房') + '</div>');
          return;
        }
        const rows = snapshot.docs.map(docSnap => {
          const r = docSnap.data();
          const createdMs = typeof r.createdAt === 'number' ? r.createdAt : (r.createdAt ? new Date(r.createdAt).getTime() : 0);
          const created = createdMs ? formatTime(createdMs) : '—';
          return `
            <tr>
              <td>${escapeHtml(r.name || '')}</td>
              <td>${escapeHtml(r.subject || '')}</td>
              <td>${escapeHtml(r.hostName || window.t('qa.anonymous', '匿名'))}</td>
              <td>${r.participantCount || 0}/${(typeof window.resolveRoomCapacity === 'function') ? window.resolveRoomCapacity(r) : (window.ROOM_CAPACITY || 4)}</td>
              <td>${r.duration || 30} ${window.t('unit.minutes', '分鐘')}</td>
              <td>${created}</td>
              <td><button class="btn btn-red" style="font-size:13px; padding:3px 8px;" onclick="adminDeleteRoom('${docSnap.id}', ${window.jsArg(r.name || '')})">${window.t('admin.s184', '強制關閉')}</button></td>
            </tr>
          `;
        }).join('');
        container.innerHTML = `
          <div class="admin-card">
            <div style="overflow-x:auto;">
              <table class="admin-table">
                <thead><tr><th>${window.t('admin.s185', '房間名稱')}</th><th>${window.t('admin.s186', '科目')}</th><th>${window.t('room.hostBadge', '房主')}</th><th>${window.t('admin.s187', '人數')}</th><th>${window.t('admin.s188', '目標時間')}</th><th>${window.t('admin.s189', '建立時間')}</th><th></th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>
        `;
      }, (err) => {
        container.innerHTML = `<div class="admin-card" style="color:#c0392b;">${window.t('admin.s190', '載入失敗：')}${err.message || err}</div>`;
      });
    }
    window.renderAdminRoomsTab = renderAdminRoomsTab;

    window.adminDeleteRoom = async function(roomId, roomName) {
      if (!(await window.appConfirm(`${window.t('admin.s191', '確定要強制關閉房間「')}${roomName}${window.t('admin.s192', '」？裡面的同學會即時被移至大廳。')}`))) return;
      try {
        await window.fs.deleteDoc(window.fs.doc(window.db, 'rooms', roomId));
        await logAdminAction('強制關閉房間', { roomId, roomName });
        window.showToast(window.t('admin.s193', '已強制關閉該房間'), '🗑️');
      } catch (err) {
        window.showToast(window.t('admin.s194', '操作失敗：') + (err.message || err), '❌');
      }
    };

    // ---------- 疑難解答區管理 ----------
    function renderAdminQaTab() {
      const container = document.getElementById('admin-tab-qa');
      if (!container || !window.db || !window.fs) return;
      container.innerHTML = ('<p style="text-align:center; color:#999; padding:20px;">' + window.t('admin.s195', '載入中帖子資料...') + '</p>');

      if (adminQaUnsubscribe) adminQaUnsubscribe();
      adminQaUnsubscribe = window.fs.onSnapshot(window.fs.collection(window.db, 'qa_posts'), (snapshot) => {
        if (snapshot.empty) {
          container.innerHTML = ('<div class="admin-card" style="text-align:center; color:#999;">' + window.t('admin.s196', '目前沒有任何提問') + '</div>');
          return;
        }
        const docs = snapshot.docs.slice().sort((a, b) => (b.data().createdAt || 0) - (a.data().createdAt || 0));
        const rows = docs.map(docSnap => {
          const p = docSnap.data();
          return `
            <tr>
              <td>${escapeHtml(p.subject || '')}</td>
              <td style="max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(p.title || '')}</td>
              <td>${escapeHtml(p.authorName || window.t('qa.anonymous', '匿名'))}</td>
              <td>${formatTime(p.createdAt)}</td>
              <td><button class="btn btn-red" style="font-size:13px; padding:3px 8px;" onclick="adminDeleteQaPost('${docSnap.id}')">${window.t('qa.delete', '刪除')}</button></td>
            </tr>
          `;
        }).join('');
        container.innerHTML = `
          <div class="admin-card">
            <div style="overflow-x:auto;">
              <table class="admin-table">
                <thead><tr><th>${window.t('admin.s186', '科目')}</th><th>${window.t('admin.s197', '標題')}</th><th>${window.t('admin.s198', '作者')}</th><th>${window.t('admin.s199', '發帖時間')}</th><th></th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>
        `;
      }, (err) => {
        container.innerHTML = `<div class="admin-card" style="color:#c0392b;">${window.t('admin.s190', '載入失敗：')}${err.message || err}</div>`;
      });
    }
    window.renderAdminQaTab = renderAdminQaTab;

    window.adminDeleteQaPost = async function(postId) {
      if (!(await window.appConfirm(window.t('admin.s200', '確定刪除這個提問？裡面的留言都會一齊清埋。')))) return;
      try {
        // 先刪晒 comments 呢個 subcollection 入面嘅所有文件，先刪返個 post 本身
        // （Firestore 刪除文件唔會自動連 subcollection 一齊刪，要自己手動清）
        const commentsRef = window.fs.collection(window.db, 'qa_posts', postId, 'comments');
        const commentsSnap = await window.fs.getDocs(commentsRef);
        await Promise.all(commentsSnap.docs.map(c => window.fs.deleteDoc(c.ref)));
        await window.fs.deleteDoc(window.fs.doc(window.db, 'qa_posts', postId));
        window.showToast(window.t('qa.postDeleted', '提問已刪除'), '🗑️');
      } catch (err) {
        window.showToast(window.t('tutor.s15', '刪除失敗：') + (err.message || err), '❌');
      }
    };

    // 「用戶管理」分頁而家分兩個分頁列表：(1) 中學／大專／大學——即
    // grade 唔係「其他自修生」嘅帳戶（包括舊帳戶未設定 grade 嘅情況，
    // 一律歸呢一邊）；(2) 其他／自修生——grade 剛好等於「其他自修生」
    // 嘅帳戶。兩邊各自獨立一個表格，唔使成頁一齊顯示，方便管理員搵人。
    // 第三個分頁「管理員」：loginId 喺 window.ADMIN_LOGIN_IDS 入面嘅帳戶，
    // 唔論 grade 係乜都只會喺呢度出現，唔再混入學生嗰兩個分頁。
    let adminUsersGradeGroup = 'school'; // 'school' | 'other' | 'admin'
    // 最新一次 onSnapshot 返嚟嘅用戶清單，快取喺度，等切換分頁嗰陣可以
    // 即刻用返呢份資料重新畫table，唔使重新監聽一次 collection。
    let adminUsersLastSortedDocs = null;

    window.switchAdminUsersGradeGroup = function(group) {
      adminUsersGradeGroup = (group === 'other' || group === 'admin') ? group : 'school';
      renderAdminUsersTable();
    };

    function renderAdminUsersTable() {
      const container = document.getElementById('admin-tab-users');
      if (!container) return;
      if (!adminUsersLastSortedDocs) return;

      if (adminUsersLastSortedDocs.length === 0) {
        container.innerHTML = ('<div class="admin-card" style="text-align:center; color:#999;">' + window.t('admin.s202', '目前沒有任何用戶') + '</div>');
        return;
      }

      const filteredDocs = adminUsersLastSortedDocs.filter((docSnap) => {
        const u = docSnap.data();
        const adminIds = Array.isArray(window.ADMIN_LOGIN_IDS) ? window.ADMIN_LOGIN_IDS : [];
        const isAdminAcc = !!u.loginId && adminIds.includes(u.loginId);
        if (adminUsersGradeGroup === 'admin') return isAdminAcc;
        if (isAdminAcc) return false;
        const isOther = (u.grade || '') === '其他自修生';
        return adminUsersGradeGroup === 'other' ? isOther : !isOther;
      });

      const rows = filteredDocs.map(docSnap => {
        const u = docSnap.data();
        const uid = docSnap.id;
        const suspended = window.isSuspendedNow ? window.isSuspendedNow(u) : !!u.suspended;
        // Email 欄顯示用戶註冊時真正填嘅聯絡電郵（contactEmail）；呢個先係
        // 佢哋自己打嗰個地址。u.email 其實係內部合成嘅登入用電郵
        // （{帳號ID}@concenmate.local，唔係真實可送達嘅地址），舊帳號冇
        // contactEmail 先 fallback 用返佢
        const displayEmail = u.contactEmail || u.email || '—';
        return `
          <tr style="${suspended ? 'opacity:.55;' : ''}">
            <td><a href="javascript:void(0)" style="color:var(--brand-700); font-weight:700;" onclick="adminSelectSupportUser('${uid}', true)">${escapeHtml(u.username || '—')}</a>${suspensionLabelHtml(u)}</td>
            <td>${u.loginId ? escapeHtml(u.loginId) : ('<span style="color:#c99; font-size:13px;">' + window.t('lb.notSet', '未設定') + '</span>')}</td>
            <td>${escapeHtml(displayEmail)}</td>
            <td>${escapeHtml(u.school || '—')}</td>
            <td>${escapeHtml(u.grade || '—')}</td>
            <td style="white-space:nowrap;">${formatLastLoginDisplay(u.lastLoginAt)}</td>
            <td><input class="admin-input-sm" type="number" style="width:70px;" value="${u.points || 0}" id="admin-user-points-${uid}"></td>
            <td><input class="admin-input-sm" style="width:60px;" value="${(parseFloat(u.hours) || 0).toFixed(1)}" id="admin-user-hours-${uid}"></td>
            <td><input class="admin-input-sm" type="number" style="width:70px;" value="${u.exp || 0}" id="admin-user-exp-${uid}"></td>
            <td style="display:flex; gap:4px; flex-wrap:wrap;">
              <button class="btn btn-outline" style="font-size:13px; padding:3px 8px;" onclick="adminSaveUserStats('${uid}')">${window.t('common.save', '儲存')}</button>
              <button class="btn ${suspended ? 'btn-primary' : 'btn-red'}" style="font-size:13px; padding:3px 8px;" onclick="adminToggleSuspendUser('${uid}', ${!suspended})">${suspended ? window.t('admin.s203', '解除停權') : window.t('admin.s204', '永久停權')}</button>
              ${u.strikeCount > 0 ? `<button class="btn btn-outline" style="font-size:13px; padding:3px 8px;" onclick="adminResetStrikes('${uid}')">${window.t('admin.s205', '重設違規次數')}</button>` : ''}
            </td>
          </tr>
        `;
      }).join('');

      const emptyGroupMsg = ('<tr><td colspan="10" style="text-align:center; color:#999; padding:16px;">' + window.t('admin.s206', '此分類目前沒有用戶') + '</td></tr>');

      container.innerHTML = `
        <div class="admin-card">
          <h3 style="font-size:16px; font-weight:bold; color:var(--brand-800); margin-bottom:6px;">${window.t('admin.s209', '全部用戶')}</h3>
          <p style="font-size:13px; color:#888; margin-bottom:10px;">${window.t('admin.s210', '點擊用戶名可在上方查看詳情及處理（補發、驗證、更正出生年月等）。修改積分／時數／EXP 後，請記得逐行點擊「儲存」；EXP 決定用戶的溫習等級與段位，一般毋須人手修改，只有在特殊情況（例如補發）才使用。「停權」會令該用戶下次登入時被強制登出。')}</p>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
            <button type="button" class="btn ${adminUsersGradeGroup === 'school' ? 'btn-primary' : 'btn-outline'}" style="font-size:13px; padding:5px 12px;" onclick="switchAdminUsersGradeGroup('school')">${window.t('admin.s211', '中學／大專／大學')}</button>
            <button type="button" class="btn ${adminUsersGradeGroup === 'other' ? 'btn-primary' : 'btn-outline'}" style="font-size:13px; padding:5px 12px;" onclick="switchAdminUsersGradeGroup('other')">${window.t('admin.s212', '其他／自修生')}</button>
            <button type="button" class="btn ${adminUsersGradeGroup === 'admin' ? 'btn-primary' : 'btn-outline'}" style="font-size:13px; padding:5px 12px;" onclick="switchAdminUsersGradeGroup('admin')">${window.t('admin.s213', '管理員')}</button>
          </div>
          <div style="overflow-x:auto;">
            <table class="admin-table">
              <thead><tr><th>${window.t('admin.s214', '用戶名')}</th><th>${window.t('auth.accountIdLabel', '帳號 ID')}</th><th>Email</th><th>${window.t('admin.s215', '學校')}</th><th>${window.t('admin.s216', '年級')}</th><th>${window.t('admin.s217', '最後上線')}</th><th>${window.t('home.statPoints', '積分')}</th><th>${window.t('admin.s218', '時數')}</th><th>EXP</th><th></th></tr></thead>
              <tbody>${rows || emptyGroupMsg}</tbody>
            </table>
          </div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:12px; font-size:13px; color:#6B7894;">
            <span>${window.t('admin.s219', '已載入')} ${adminUsersLastSortedDocs.length}${adminUsersTotal != null ? window.t('admin.s207', ' / 共 ') + adminUsersTotal : ''} ${window.t('admin.s220', '位用戶')}</span>
            ${adminUsersAllLoaded ? '' : ('<button type="button" class="btn btn-outline" style="font-size:13px; padding:5px 12px;" onclick="window.adminLoadMoreUsers()">' + window.t('admin.s208', '載入更多') + '</button>')}
            <button type="button" class="btn btn-outline" style="font-size:13px; padding:5px 12px;" onclick="window.adminReloadUsers()">${window.t('admin.s221', '重新整理')}</button>
          </div>
        </div>
      `;
    }

    // v1.230.0：改為分頁載入（每次 50 位），唔再即時監聽全部用戶，用戶多都唔會大量讀取
    const ADMIN_USERS_PAGE = 50;
    let adminUsersCursor = null;
    let adminUsersAllLoaded = false;
    let adminUsersTotal = null;
    let adminUsersLoading = false;
    function sortAdminUsers(arr) {
      return arr.sort((a, b) => {
        const ta = new Date(a.data().createdAt || 0).getTime() || 0;
        const tb = new Date(b.data().createdAt || 0).getTime() || 0;
        return ta - tb;
      });
    }
    function mergeIntoSupportCache(docs) {
      if (!adminSupportUsersCache) adminSupportUsersCache = [];
      docs.forEach(d => {
        const i = adminSupportUsersCache.findIndex(u => u.uid === d.id);
        const item = { uid: d.id, data: d.data() };
        if (i >= 0) adminSupportUsersCache[i] = item; else adminSupportUsersCache.push(item);
      });
    }
    async function loadAdminUsersPage(reset) {
      if (adminUsersLoading) return;
      adminUsersLoading = true;
      try {
        if (reset) { adminUsersCursor = null; adminUsersAllLoaded = false; adminUsersLastSortedDocs = []; }
        const col = window.fs.collection(window.db, 'users');
        const parts = [col, window.fs.orderBy(window.fs.documentId()), window.fs.limit(ADMIN_USERS_PAGE)];
        if (adminUsersCursor) parts.splice(2, 0, window.fs.startAfter(adminUsersCursor));
        const [snap, countSnap] = await Promise.all([
          window.fs.getDocs(window.fs.query(...parts)),
          (reset || adminUsersTotal == null) ? window.fs.getCountFromServer(col).catch(() => null) : Promise.resolve(null),
        ]);
        if (countSnap) adminUsersTotal = countSnap.data().count;
        if (snap.docs.length) adminUsersCursor = snap.docs[snap.docs.length - 1];
        if (snap.docs.length < ADMIN_USERS_PAGE) adminUsersAllLoaded = true;
        adminUsersLastSortedDocs = sortAdminUsers((adminUsersLastSortedDocs || []).concat(snap.docs));
        mergeIntoSupportCache(snap.docs);
        adminSupportUsersCacheLoading = false;
      } catch (err) {
        const container = document.getElementById('admin-tab-users');
        if (container) container.innerHTML = `<div class="admin-card" style="color:#c0392b;">${window.t('admin.s190', '載入失敗：')}${escapeHtml(err.message || err)}</div>`;
        adminUsersLoading = false;
        return;
      }
      adminUsersLoading = false;
      renderAdminUsersTable();
      if (adminTabShowing('support')) renderAdminSupportTab();
    }
    window.adminLoadMoreUsers = function() { loadAdminUsersPage(false); };
    window.adminReloadUsers = function() { loadAdminUsersPage(true); };
    function renderAdminUsersTab() {
      const container = document.getElementById('admin-tab-users');
      if (!container || !window.db || !window.fs) return;
      if (adminUsersUnsubscribe) { adminUsersUnsubscribe(); adminUsersUnsubscribe = null; }
      container.innerHTML = ('<p style="text-align:center; color:#999; padding:20px;">' + window.t('admin.s222', '正在載入用戶資料…') + '</p>');
      loadAdminUsersPage(true);
    }
    window.renderAdminUsersTab = renderAdminUsersTab;

    window.adminSaveUserStats = async function(uid) {
      const ptsEl = document.getElementById('admin-user-points-' + uid);
      const hoursEl = document.getElementById('admin-user-hours-' + uid);
      const expEl = document.getElementById('admin-user-exp-' + uid);
      const points = parseInt(ptsEl && ptsEl.value, 10) || 0;
      // ⚠️ 呢度一定要用 parseFloat 將輸入格嘅文字轉做數字先可以寫入 Firestore；
      // 之前直接攞 .value（永遠係文字）寫落去，會令 hours 呢個欄位由數字變咗
      // 文字，後續 Cloud Function 用 "+" 累加嗰陣就會變成文字併接（例如
      // "0.0" + 0.0166666 = "0.00.0166666..."），排行榜同時數就會永久錯亂。
      const hours = parseFloat(hoursEl && hoursEl.value) || 0;
      const exp = parseInt(expEl && expEl.value, 10) || 0;
      try {
        await window.fs.updateDoc(window.fs.doc(window.db, 'users', uid), { points, hours, exp });
        await logAdminAction('更新用戶資料', { uid, points, hours, exp });
        window.showToast(window.t('admin.s223', '已更新用戶資料'), '✅');
      } catch (err) {
        window.showToast(window.t('tutor.s66', '更新失敗：') + (err.message || err), '❌');
      }
    };

    // v1.225.0：停權改由伺服器（moderateUser）處理，永久停權會同時停用登入帳戶
    window.adminToggleSuspendUser = async function(uid, suspend) {
      if (!(await window.appConfirm(suspend ? window.t('admin.s224', '確定永久停用這個帳戶？用戶會即時被登出，並無法再登入。') : window.t('admin.s225', '確定解除這個帳戶的停權？')))) return;
      try {
        await window.callCloudFunction('moderateUser', { uid, action: suspend ? 'permanent' : 'lift', reason: suspend ? '管理員手動停權' : '' });
        window.showToast(suspend ? window.t('admin.s226', '已永久停用該帳戶') : window.t('admin.s227', '已解除停權'), suspend ? '🚫' : '✅');
      } catch (err) {
        window.showToast(window.t('admin.s194', '操作失敗：') + (window.friendlyErrorText ? window.friendlyErrorText(err) : (err.message || err)), '❌');
      }
    };
    // ===================== 直播設定（Study with me，v1.226.0） =====================
    // admin_config/streaming。第一階段只記錄開通資格；直播本身未上線，總開關預設關閉。
    const STREAMING_DEFAULTS = { enabled: false, requiredDays: 30, minMinutesPerDay: 15, minStreamAge: 16, maxDurationHours: 4, maxConcurrent: 20, monthlyBudgetHkd: 500, hotThreshold: 50, hotMinutes: 3, idleShutdownMinutes: 30, defaultQuality: '480p', hotQuality: '720p' };
    let adminStreamingDraft = null;
    async function renderAdminStreamingTab() {
      const container = document.getElementById('admin-tab-streaming');
      if (!container) return;
      if (!adminStreamingDraft) {
        container.innerHTML = ('<p style="text-align:center; color:#999; padding:20px;">' + window.t('admin.s228', '正在載入直播設定…') + '</p>');
        adminStreamingDraft = Object.assign({}, STREAMING_DEFAULTS);
        try {
          const snap = await window.fs.getDoc(window.fs.doc(window.db, 'admin_config', 'streaming'));
          if (snap.exists()) Object.assign(adminStreamingDraft, snap.data());
        } catch (e) { console.warn('讀取直播設定失敗:', e); }
      }
      const d = adminStreamingDraft;
      const num = (key, label, unit, min, max) => `
        <label style="display:flex; align-items:center; gap:6px; font-size:13px; color:#555;">${label}
          <input class="admin-input-sm" type="number" min="${min}" max="${max}" step="1" style="width:72px;" value="${d[key]}" oninput="window.adminUpdateStreamingDraft('${key}', this.value)"> ${unit}
        </label>`;
      const quality = (key, label) => `
        <label style="display:flex; align-items:center; gap:6px; font-size:13px; color:#555;">${label}
          <select class="admin-input-sm" style="width:auto;" onchange="window.adminUpdateStreamingDraft('${key}', this.value)">
            ${['360p', '480p', '720p'].map(q => `<option value="${q}" ${d[key] === q ? 'selected' : ''}>${q}</option>`).join('')}
          </select>
        </label>`;
      container.innerHTML = `
        <div class="admin-card">
          <h3 style="font-size:16px; font-weight:bold; color:var(--brand-800); margin-bottom:10px;">${window.t('admin.s246', 'Study with me 直播')}</h3>
          <label style="display:flex; align-items:center; gap:8px; font-size:14px; margin-bottom:6px; cursor:pointer;">
            <input type="checkbox" ${d.enabled ? 'checked' : ''} onchange="window.adminUpdateStreamingDraft('enabled', this.checked)"> ${window.t('admin.s247', '開放直播功能（總開關）')}
          </label>
          <p style="font-size:13px; color:#888; margin:0; line-height:1.7;">${window.t('admin.s248', '關閉時，功能表的「Study with me」會顯示為灰色，用戶不能點擊，只有管理員可以開播及觀看（供測試之用）；開啟後，所有登入用戶可以觀看，累積溫習日數達標的用戶可以開播。管理員不受開通日數限制。')}<br>${window.t('admin.s249', '功能表是否顯示「Study with me」，請到「網站內容」→「功能表及圖示」設定。')}</p>
        </div>
        <div class="admin-card" style="margin-top:12px;">
          <h3 style="font-size:14px; font-weight:bold; margin-bottom:10px;">${window.t('admin.s250', '開通資格')}</h3>
          <div style="display:flex; gap:16px; flex-wrap:wrap;">
            ${num('requiredDays', window.t('admin.s229', '需累積溫習'), window.t('cal.dow0', '日'), 0, 365)}
            ${num('minMinutesPerDay', window.t('admin.s230', '每日最少溫習'), window.t('admin.s231', '分鐘才計一日'), 1, 600)}
            ${num('minStreamAge', window.t('admin.s232', '最低開播年齡'), window.t('admin.s233', '歲'), 0, 99)}
          </div>
          <p style="font-size:13px; color:#888; margin:8px 0 0;">${window.t('admin.s251', '由伺服器記錄，用戶無法自行修改。首次記錄時會按溫習日曆補回過往日數。')}<br>${window.t('admin.s252', '年齡按用戶註冊時填寫的出生年月計算（註冊後用戶不能自行修改）；沒有出生年月的帳戶當作未達年齡，可在「日常營運」→「用戶管理」搜尋該用戶代為補填。觀看直播不受年齡限制。設為 0 即不設年齡限制。')}</p>
        </div>
        <div class="admin-card" style="margin-top:12px;">
          <h3 style="font-size:14px; font-weight:bold; margin-bottom:10px;">${window.t('admin.s253', '直播限制及畫質')}</h3>
          <div style="display:flex; gap:16px; flex-wrap:wrap;">
            ${num('maxDurationHours', window.t('admin.s234', '每次直播最長'), window.t('unit.hours', '小時'), 1, 12)}
            ${num('maxConcurrent', window.t('admin.s235', '同一時間最多'), window.t('admin.s236', '個直播'), 1, 500)}
            ${quality('defaultQuality', window.t('admin.s237', '一般直播最高畫質'))}
            ${quality('hotQuality', window.t('admin.s238', '熱門直播最高畫質'))}
          </div>
        </div>
        <div class="admin-card" style="margin-top:12px;">
          <h3 style="font-size:14px; font-weight:bold; margin-bottom:10px;">${window.t('admin.s254', '熱門直播（轉經 R2）')}</h3>
          <div style="display:flex; gap:16px; flex-wrap:wrap;">
            ${num('hotThreshold', window.t('admin.s239', '觀眾超過'), window.t('admin.s240', '人'), 5, 10000)}
            ${num('hotMinutes', window.t('admin.s241', '並持續'), window.t('unit.minutes', '分鐘'), 1, 60)}
            ${num('idleShutdownMinutes', window.t('admin.s242', '沒有熱門直播'), window.t('admin.s243', '分鐘後關閉轉換主機'), 5, 240)}
          </div>
          <p style="font-size:13px; color:#888; margin:8px 0 0;">${window.t('admin.s255', '直播一經轉經 R2，會維持至直播完結，避免人數在門檻附近上落時不斷切換。')}</p>
        </div>
        <div class="admin-card" style="margin-top:12px;">
          <h3 style="font-size:14px; font-weight:bold; margin-bottom:10px;">${window.t('admin.s256', '每月預算')}</h3>
          <div style="display:flex; gap:16px; flex-wrap:wrap;">
            ${num('monthlyBudgetHkd', window.t('admin.s244', '每月上限 HK$'), window.t('admin.s245', '（包括主機月費）'), 0, 1000000)}
          </div>
          <p style="font-size:13px; color:#888; margin:8px 0 0;">${window.t('admin.s257', '用到 80%：所有直播最高畫質降至 360p 並通知管理員；用到 100%：暫停開新直播，進行中的直播可繼續。（預算自動控制將於日後版本啟用）')}</p>
        </div>
        <div class="admin-card" style="margin-top:12px;">
          <h3 style="font-size:14px; font-weight:bold; margin-bottom:8px;">${window.t('admin.s258', '留言額外過濾字詞')}</h3>
          <textarea class="admin-input-sm" rows="4" style="width:100%; font-size:13px;" placeholder="${window.t('admin.s259', '每行一個字詞')}" oninput="window.adminUpdateStreamingDraft('bannedWordsText', this.value)">${escapeHtml((d.bannedWords || []).join('\n'))}</textarea>
          <p style="font-size:13px; color:#888; margin:8px 0 0;">${window.t('admin.s260', '系統已內置常見粗口（中文、粵語、英文）及聯絡資料（電話、網址、IG、WhatsApp 等）過濾；這裏可以額外加入字詞，留言中出現會被遮蓋。')}</p>
        </div>
        <div style="text-align:center; margin-top:16px;">
          <button type="button" class="btn btn-primary" style="padding:12px 32px; font-size:15px;" onclick="window.adminSaveStreamingSettings()">${window.t('admin.s261', '儲存直播設定')}</button>
        </div>`;
    }
    window.adminUpdateStreamingDraft = function(key, value) {
      if (!adminStreamingDraft) return;
      if (key === 'enabled') adminStreamingDraft.enabled = !!value;
      else if (key === 'defaultQuality' || key === 'hotQuality') adminStreamingDraft[key] = value;
      else if (key === 'bannedWordsText') adminStreamingDraft.bannedWords = String(value || '').split('\n').map(w => w.trim()).filter(Boolean).slice(0, 500);
      else { const n = parseInt(value, 10); if (Number.isFinite(n) && n >= 0) adminStreamingDraft[key] = n; }
    };
    window.adminSaveStreamingSettings = async function() {
      if (!adminStreamingDraft) return;
      const d = adminStreamingDraft;
      const clamp = (v, lo, hi, def) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
      const q = (v, def) => ['360p', '480p', '720p'].includes(v) ? v : def;
      const payload = {
        enabled: d.enabled === true,
        requiredDays: clamp(d.requiredDays, 0, 365, 30),
        minMinutesPerDay: clamp(d.minMinutesPerDay, 1, 600, 15),
        minStreamAge: clamp(d.minStreamAge, 0, 99, 16),
        maxDurationHours: clamp(d.maxDurationHours, 1, 12, 4),
        maxConcurrent: clamp(d.maxConcurrent, 1, 500, 20),
        monthlyBudgetHkd: clamp(d.monthlyBudgetHkd, 0, 1000000, 500),
        hotThreshold: clamp(d.hotThreshold, 5, 10000, 50),
        hotMinutes: clamp(d.hotMinutes, 1, 60, 3),
        idleShutdownMinutes: clamp(d.idleShutdownMinutes, 5, 240, 30),
        defaultQuality: q(d.defaultQuality, '480p'),
        hotQuality: q(d.hotQuality, '720p'),
        bannedWords: Array.isArray(d.bannedWords) ? d.bannedWords.map(w => String(w).trim().slice(0, 40)).filter(Boolean).slice(0, 500) : [],
        updatedAt: Date.now()
      };
      try {
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'streaming'), payload);
        Object.assign(adminStreamingDraft, payload);
        await logAdminAction('修改直播設定', payload);
        window.showToast(window.t('admin.s262', '已儲存直播設定（伺服器最多需要 30 秒套用）'), '✅');
      } catch (err) {
        window.showToast(window.t('admin.s138', '儲存失敗：') + (err.message || err), '❌');
      }
    };

    window.adminResetStrikes = async function(uid) {
      if (!(await window.appConfirm(window.t('admin.s263', '確定將這個帳戶的違規次數重設為 0？')))) return;
      try {
        await window.callCloudFunction('moderateUser', { uid, action: 'resetStrikes' });
        window.showToast(window.t('admin.s264', '已重設違規次數'), '✅');
      } catch (err) {
        window.showToast(window.t('admin.s194', '操作失敗：') + (window.friendlyErrorText ? window.friendlyErrorText(err) : (err.message || err)), '❌');
      }
    };
    // 用戶列表顯示的停權標籤
    function suspensionLabelHtml(u) {
      const parts = [];
      if (u.suspended === true) parts.push(window.t('admin.s265', '已永久停權'));
      else if (typeof u.suspendedUntil === 'number' && u.suspendedUntil > Date.now()) parts.push(window.t('admin.s266', '停權至 ') + new Date(u.suspendedUntil).toLocaleString('zh-HK', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }));
      if (typeof u.strikeCount === 'number' && u.strikeCount > 0) parts.push(window.t('admin.s267', '違規 ') + u.strikeCount + window.t('admin.s268', ' 次'));
      return parts.length ? ` <span style="color:#c0392b; font-size:13px;">（${parts.join('，')}）</span>` : '';
    }

    // 效能優化：以前呢個 tab 係冇上限咁監聽成個 reports collection——舉報
    // 隨時間累積得越多（連埋每則入面嗰張截圖），管理員每次打開呢頁都要
    // 一次過下載晒由第一日到而家全部舉報，會越用越重。而家改成分頁：
    // 淨係即時監聽最新嗰 ADMIN_REPORTS_PAGE_SIZE 則（保持「有新舉報即刻
    // 見到」呢個實時性），舊嘅要撳「載入更多」先一次性攞（唔會再持續
    // 監聽,單純減少負擔)。因為排序用嘅 createdAt 一經寫入就唔會再變，
    // 新舉報插入唔會影響已經攞落嚟嗰批舊資料嘅分頁邊界，所以呢種「頭
    // 一頁即時、之後嘅頁靜態」嘅做法唔會有資料錯亂嘅問題。
    const ADMIN_REPORTS_PAGE_SIZE = 30;
    let adminReportsLoadedDocs = [];
    let adminReportsAllLoaded = false;

    function buildAdminReportCardHtml(docSnap) {
      const r = docSnap.data();
      const reportId = docSnap.id;
      const status = r.status || 'pending';
      const statusLabel = status === 'pending' ? window.t('admin.s269', '待處理') : (status === 'dismissed' ? window.t('admin.s270', '已駁回') : window.t('admin.s271', '已處理'));
      const statusColor = status === 'pending' ? '#C0524A' : '#999';
      const when = r.createdAt ? new Date(r.createdAt).toLocaleString('zh-HK') : '—';
      // v1.241.0 安全修補：截圖網址及被舉報 uid 由用戶提交，顯示前一律過濾
      const safeShot = window.safeImgSrc ? window.safeImgSrc(r.screenshot) : '';
      const safeReportedUid = /^[A-Za-z0-9]{1,128}$/.test(r.reportedUid || '') ? r.reportedUid : '';
      const screenshotHtml = safeShot
        ? `<img src="${escapeHtml(safeShot)}" style="width:100%; max-width:280px; border-radius:8px; border:1px solid #ddd; margin-top:6px; display:block; cursor:pointer;" onclick="window.open(this.src, '_blank')">`
        : `<p style="font-size:13px; color:#c99; margin-top:6px;">${window.t('admin.s272', '當時無法取得截圖')}</p>`;
      return `
        <div class="admin-card" style="${status !== 'pending' ? 'opacity:.6;' : ''}">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
            <span style="font-weight:700; color:${statusColor}; font-size:13px;">${statusLabel}</span>
            <span style="font-size:13px; color:#999;">${escapeHtml(when)}</span>
          </div>
          <p style="font-size:13px; margin-bottom:3px;"><b>${window.t('admin.s281', '被舉報：')}</b>${escapeHtml(r.reportedName || '—')} ${r.reportedLoginId ? '（' + escapeHtml(r.reportedLoginId) + '）' : ''}</p>
          <p style="font-size:13px; color:#888; margin-bottom:3px;">${r.reportedEmail ? escapeHtml(r.reportedEmail) : ''}</p>
          <p style="font-size:13px; margin-bottom:3px;"><b>${window.t('admin.s282', '舉報人：')}</b>${escapeHtml(r.reporterName || '—')} ${r.reporterLoginId ? '（' + escapeHtml(r.reporterLoginId) + '）' : ''}</p>
          <p style="font-size:13px; margin-bottom:3px;"><b>${window.t('admin.s283', '房間：')}</b>${escapeHtml(r.roomName || r.roomId || '—')}</p>
          <p style="font-size:13px; margin-bottom:3px;"><b>${window.t('feat.s11', '原因：')}</b>${escapeHtml(r.reason || '—')}</p>
          ${r.notes ? `<p style="font-size:13px; color:#666; background:#F7F5F2; border-radius:6px; padding:6px 8px; margin-bottom:3px;">${escapeHtml(r.notes)}</p>` : ''}
          ${screenshotHtml}
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px;">
            ${status === 'pending' ? `<button class="btn btn-outline" style="font-size:13px; padding:4px 9px;" onclick="window.adminMarkReportStatus('${reportId}', 'dismissed')">${window.t('admin.s273', '駁回（沒問題）')}</button>` : ''}
            ${status === 'pending' ? `<button class="btn btn-outline" style="font-size:13px; padding:4px 9px;" onclick="window.adminMarkReportStatus('${reportId}', 'reviewed')">${window.t('admin.s274', '標記已處理')}</button>` : ''}
            ${safeReportedUid && status === 'pending' ? `<button class="btn btn-red" style="font-size:13px; padding:4px 9px;" onclick="window.adminStrikeFromReport('${reportId}', '${safeReportedUid}', false)">${window.t('admin.s275', '確認違規並停權')}</button>` : ''}
            ${safeReportedUid && status === 'pending' ? `<button class="btn btn-red" style="font-size:13px; padding:4px 9px;" onclick="window.adminStrikeFromReport('${reportId}', '${safeReportedUid}', true)">${window.t('admin.s276', '嚴重違規（永久封號）')}</button>` : ''}
            ${r.action ? `<span style="font-size:13px; color:#888; align-self:center;">${window.t('admin.s279', '處理：')}${r.action === 'permanent' ? window.t('admin.s277', '永久封號') : (r.action === 'strike' ? window.t('admin.s278', '已按次數停權') : escapeHtml(r.action))}${r.handledBy ? '（' + escapeHtml(r.handledBy) + '）' : ''}</span>` : ''}
            ${status !== 'pending' ? `<button class="btn btn-outline" style="font-size:13px; padding:4px 9px; color:#999; border-color:#ccc;" onclick="window.adminDeleteReport('${reportId}')">${window.t('admin.s280', '刪除紀錄')}</button>` : ''}
          </div>
        </div>
      `;
    }

    function renderAdminReportsListUI() {
      const container = document.getElementById('admin-tab-reports');
      if (!container) return;
      if (adminReportsLoadedDocs.length === 0) {
        container.innerHTML = moderationSettingsHtml() + ('<div class="admin-card" style="text-align:center; color:#999;">' + window.t('admin.s284', '目前沒有任何舉報記錄') + '</div>');
        return;
      }
      const cards = adminReportsLoadedDocs.map(buildAdminReportCardHtml).join('');
      const loadMoreHtml = adminReportsAllLoaded
        ? ''
        : `<div style="text-align:center; margin-top:12px;">
             <button class="btn btn-outline" id="admin-reports-load-more-btn" type="button" onclick="window.adminLoadMoreReports()">${window.t('admin.s285', '載入更多（已顯示')} ${adminReportsLoadedDocs.length} ${window.t('admin.s286', '則）')}</button>
           </div>`;
      container.innerHTML = `
        ${moderationSettingsHtml()}
        ${cards}
        ${loadMoreHtml}
      `;
    }

    function renderAdminReportsTab() {
      const container = document.getElementById('admin-tab-reports');
      if (!container || !window.db || !window.fs) return;
      container.innerHTML = ('<p style="text-align:center; color:#999; padding:20px;">' + window.t('admin.s287', '正在載入舉報記錄…') + '</p>');
      loadModerationRules().then(() => { if (adminReportsLoadedDocs.length || adminReportsAllLoaded) renderAdminReportsListUI(); });

      adminReportsLoadedDocs = [];
      adminReportsAllLoaded = false;

      if (adminReportsUnsubscribe) adminReportsUnsubscribe();
      const q = window.fs.query(
        window.fs.collection(window.db, 'reports'),
        window.fs.orderBy('createdAt', 'desc'),
        window.fs.limit(ADMIN_REPORTS_PAGE_SIZE)
      );
      adminReportsUnsubscribe = window.fs.onSnapshot(q, (snapshot) => {
        adminReportsLoadedDocs = snapshot.docs;
        // 頭一頁攞返嘅數量少過成頁上限，即係話成個 collection 都已經
        // 攞晒，冇需要再顯示「載入更多」
        if (snapshot.docs.length < ADMIN_REPORTS_PAGE_SIZE) adminReportsAllLoaded = true;
        renderAdminReportsListUI();
      }, (err) => {
        container.innerHTML = `<div class="admin-card" style="color:#c0392b;">${window.t('admin.s190', '載入失敗：')}${err.message || err}</div>`;
      });
    }
    window.renderAdminReportsTab = renderAdminReportsTab;

    // 「載入更多」淨係一次性攞多一頁（唔會幫呢一頁另外加監聽），揭完之後
    // 就靜態咁擺喺度——舊舉報基本上唔會再變動，唔使成日即時監聽住佢哋
    window.adminLoadMoreReports = async function() {
      if (!window.db || !window.fs || adminReportsAllLoaded) return;
      const lastDoc = adminReportsLoadedDocs[adminReportsLoadedDocs.length - 1];
      if (!lastDoc) return;
      const btn = document.getElementById('admin-reports-load-more-btn');
      if (btn) { btn.disabled = true; btn.innerText = window.t('social.loadingWall', '載入中...'); }
      try {
        const q = window.fs.query(
          window.fs.collection(window.db, 'reports'),
          window.fs.orderBy('createdAt', 'desc'),
          window.fs.startAfter(lastDoc),
          window.fs.limit(ADMIN_REPORTS_PAGE_SIZE)
        );
        const snapshot = await window.fs.getDocs(q);
        if (snapshot.docs.length < ADMIN_REPORTS_PAGE_SIZE) adminReportsAllLoaded = true;
        adminReportsLoadedDocs = adminReportsLoadedDocs.concat(snapshot.docs);
        renderAdminReportsListUI();
      } catch (e) {
        window.showToast(window.t('admin.s288', '載入更多舉報失敗：') + (e.message || e), '❌');
        if (btn) { btn.disabled = false; btn.innerText = window.t('admin.s208', '載入更多'); }
      }
    };

    window.adminMarkReportStatus = async function(reportId, status) {
      try {
        await window.fs.updateDoc(window.fs.doc(window.db, 'reports', reportId), { status });
        window.showToast(status === 'dismissed' ? window.t('admin.s289', '已駁回舉報') : window.t('admin.s290', '已標記為已處理'), '✅');
      } catch (err) {
        window.showToast(window.t('tutor.s66', '更新失敗：') + (err.message || err), '❌');
      }
    };

    // v1.225.0：確認違規，由伺服器按違規次數停權（第 1 次、第 2 次按設定日數，第 3 次或嚴重違規永久封號）
    window.adminStrikeFromReport = async function(reportId, reportedUid, severe) {
      const m = window.MODERATION_RULES || { firstDays: 3, secondDays: 14 };
      const msg = severe
        ? window.t('admin.s291', '確定屬於嚴重違規？該帳戶會被永久封號，並無法再登入。')
        : `${window.t('admin.s292', '確定違規屬實？系統會按違規次數處理：第 1 次停權')} ${m.firstDays} ${window.t('admin.s293', '日、第 2 次停權')} ${m.secondDays} ${window.t('admin.s294', '日、第 3 次永久封號。')}`;
      if (!(await window.appConfirm(msg))) return;
      const doc = adminReportsLoadedDocs.find(x => x.id === reportId);
      const reason = doc && doc.data().reason ? doc.data().reason : '違反使用守則';
      try {
        const res = await window.callCloudFunction('moderateUser', { uid: reportedUid, action: severe ? 'permanent' : 'strike', reportId, reason });
        if (res && res.permanent) window.showToast(`${window.t('admin.s295', '已永久封號（累計違規')} ${res.strikeCount} ${window.t('admin.s296', '次）')}`, '🚫');
        else window.showToast(`${window.t('admin.s297', '已停權')} ${res.days} ${window.t('admin.s298', '日（第')} ${res.strikeCount} ${window.t('admin.s299', '次違規）')}`, '🚫');
      } catch (err) {
        window.showToast(window.t('admin.s194', '操作失敗：') + (window.friendlyErrorText ? window.friendlyErrorText(err) : (err.message || err)), '❌');
      }
    };

    // 停權規則設定（admin_config/moderation），只有超級管理員可修改
    window.MODERATION_RULES = { firstDays: 3, secondDays: 14 };
    async function loadModerationRules() {
      try {
        const snap = await window.fs.getDoc(window.fs.doc(window.db, 'admin_config', 'moderation'));
        if (snap.exists()) {
          const d = snap.data();
          if (typeof d.firstDays === 'number') window.MODERATION_RULES.firstDays = d.firstDays;
          if (typeof d.secondDays === 'number') window.MODERATION_RULES.secondDays = d.secondDays;
        }
      } catch (e) { console.warn('讀取停權設定失敗:', e); }
    }
    function moderationSettingsHtml() {
      const m = window.MODERATION_RULES;
      const canEdit = isCurrentUserSuperAdmin();
      return `
        <div class="admin-card" style="margin-bottom:12px;">
          <h3 style="font-size:14px; font-weight:bold; margin-bottom:8px;">${window.t('admin.s300', '停權規則')}</h3>
          <div style="display:flex; gap:16px; flex-wrap:wrap; align-items:center; font-size:13px; color:#555; margin-bottom:8px;">
            <label style="display:flex; align-items:center; gap:6px;">${window.t('admin.s301', '第 1 次違規停權')}
              <input class="admin-input-sm" type="number" min="1" max="365" step="1" style="width:64px;" id="admin-mod-first" value="${m.firstDays}" ${canEdit ? '' : 'disabled'}> ${window.t('cal.dow0', '日')}
            </label>
            <label style="display:flex; align-items:center; gap:6px;">${window.t('admin.s302', '第 2 次違規停權')}
              <input class="admin-input-sm" type="number" min="1" max="365" step="1" style="width:64px;" id="admin-mod-second" value="${m.secondDays}" ${canEdit ? '' : 'disabled'}> ${window.t('cal.dow0', '日')}
            </label>
            ${canEdit ? ('<button class="btn btn-primary" style="font-size:13px; padding:4px 10px;" onclick="window.adminSaveModerationRules()">' + window.t('common.save', '儲存') + '</button>') : ''}
          </div>
          <p style="font-size:13px; color:#888; margin:0;">${window.t('admin.s303', '第 3 次違規或嚴重違規（例如性騷擾、向未成年人提出不當要求、威脅）會永久封號，並停用登入帳戶。只有經管理員確認的舉報才會計入違規次數；停權期間用戶無法登入，到期自動解除。')}</p>
        </div>`;
    }
    window.adminSaveModerationRules = async function() {
      const first = Math.max(1, Math.min(365, parseInt(document.getElementById('admin-mod-first').value, 10) || 3));
      const second = Math.max(1, Math.min(365, parseInt(document.getElementById('admin-mod-second').value, 10) || 14));
      try {
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'moderation'), { firstDays: first, secondDays: second, updatedAt: Date.now() });
        window.MODERATION_RULES = { firstDays: first, secondDays: second };
        await logAdminAction('修改停權規則', { firstDays: first, secondDays: second });
        window.showToast(window.t('admin.s304', '已儲存停權規則'), '✅');
      } catch (err) {
        window.showToast(window.t('admin.s138', '儲存失敗：') + (err.message || err), '❌');
      }
    };

    // 淨係已經處理完（已駁回／已處理）嘅舉報先俾刪，pending 嘅唔會出呢粒掣，
    // 避免管理員手快手滑刪走仲未跟進嘅證據
    window.adminDeleteReport = async function(reportId) {
      if (!(await window.appConfirm(window.t('admin.s305', '確定刪除這一則已處理的舉報紀錄？連同截圖一併刪除，刪除後將無法復原。')))) return;
      try {
        await window.fs.deleteDoc(window.fs.doc(window.db, 'reports', reportId));
        window.showToast(window.t('admin.s306', '已刪除舉報紀錄'), '🗑️');
      } catch (err) {
        window.showToast(window.t('tutor.s15', '刪除失敗：') + (err.message || err), '❌');
      }
    };

    function renderAdminNavIconsTab() {
      const container = document.getElementById('admin-tab-icons');
      if (!container) return;

      if (!adminNavIconsDraft) {
        if (!navIconsConfigLoaded) {
          container.innerHTML = ('<p style="text-align:center; color:#999; padding:20px;">' + window.t('admin.s309', '載入中圖示設定...') + '</p>');
          return; // Firestore 資料一到，loadNavIconsFromFirestore() 會自動再 render 多次
        }
        adminNavIconsDraft = Object.assign({}, window.NAV_ICON_URLS);
      }

      const rows = NAV_ICON_ITEMS.map(item => {
        const url = adminNavIconsDraft[item.key];
        const thumbId = `admin-navicon-thumb-${item.key}`;
        const inputId = `admin-navicon-input-${item.key}`;
        const thumbInner = url
          ? `<img src="${url}" style="width:100%; height:100%; object-fit:contain;">`
          : `<span style="color:var(--brand-600); display:inline-flex;">${typeof window.cmNavSvg === 'function' ? window.cmNavSvg(item.key) : ''}</span>`;
        return `
          <div style="display:flex; align-items:center; gap:14px; padding:10px 0; border-bottom:1px solid #F0F0F0;">
            <div id="${thumbId}" onclick="document.getElementById('${inputId}').click()" title="${window.t('admin.s13', '點擊這裡上傳圖片')}" style="width:52px; height:52px; border-radius:10px; background:#F6F7FB; border:1px dashed #D2D9E9; display:flex; align-items:center; justify-content:center; cursor:pointer; overflow:hidden; flex-shrink:0;">${thumbInner}</div>
            <input type="file" accept="image/*" id="${inputId}" style="display:none;" onchange="adminUploadNavIcon('${item.key}',this)">
            <div style="flex:1; font-size:14px; font-weight:600; color:#333;">${escapeHtml(item.label)}</div>
            <div style="display:flex; gap:6px;">
              <button type="button" class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="document.getElementById('${inputId}').click()">${window.t('admin.s311', '上傳圖片')}</button>
              ${url ? `<button type="button" class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="adminRemoveNavIcon('${item.key}')">${window.t('admin.s310', '還原做預設圖示')}</button>` : ''}
            </div>
          </div>
        `;
      }).join('');

      container.innerHTML = `
        <div class="admin-card">
          <h3 style="font-size:15px; font-weight:bold; color:var(--brand-800); margin-bottom:6px;">${window.t('admin.s312', '側邊欄功能圖示')}</h3>
          <p style="font-size:13px; color:#888; margin-bottom:6px;">${window.t('admin.s313', '將側邊欄「主頁、視訊溫習室」等 8 個分頁按鈕原本的 emoji 圖示，換成自訂上傳的圖片。上傳新圖會即時取代畫面上顯示的圖示，未上傳過的項目則繼續使用預設 emoji。')}</p>
          ${rows}
          <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:14px;">
            <button class="btn btn-outline" type="button" onclick="adminResetNavIconsDraft()">${window.t('admin.s99', '還原未儲存的改動')}</button>
            <button class="btn btn-primary" type="button" onclick="adminSaveNavIconsConfig()">${window.t('admin.s100', '儲存全部改動')}</button>
          </div>
        </div>
      `;
    }
    window.renderAdminNavIconsTab = renderAdminNavIconsTab;

    window.adminUploadNavIcon = async function(key, inputEl) {
      if (!adminNavIconsDraft) return;
      const file = inputEl.files && inputEl.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        window.showToast(window.t('admin.s110', '請選擇圖片檔案'), '⚠️');
        return;
      }
      if (!window.storage || !window.storageApi) {
        window.showToast(window.t('admin.s111', 'Storage 未初始化，請重新整理頁面再試'), '⚠️');
        return;
      }
      const oldUrl = adminNavIconsDraft[key];
      window.showToast(window.t('admin.s123', '上傳中圖片…'), '📤');
      try {
        const { blob, mimeType } = await compressImageFileToBlob(file, 128, 0.85);
        const ext = mimeType === 'image/webp' ? 'webp' : (mimeType === 'image/png' ? 'png' : 'jpg');
        const path = `nav_icons/${key}_${Date.now()}.${ext}`;
        const fileRef = window.storageApi.ref(window.storage, path);
        await window.storageApi.uploadBytes(fileRef, blob, { contentType: mimeType });
        const downloadUrl = await window.storageApi.getDownloadURL(fileRef);
        adminNavIconsDraft[key] = downloadUrl;
        renderAdminNavIconsTab();
        window.showToast(window.t('admin.s124', '圖片上傳成功，請點擊「儲存全部改動」才會正式生效'), '🎉');
        tryDeleteOldGachaStoragePhoto(oldUrl); // best-effort，唔使等佢完成（呢個函式其實通用，唔止扭蛋貼紙先用得）
      } catch (err) {
        window.showToast(window.t('admin.s114', '圖片上傳失敗：') + (err.message || err), '❌');
      }
    };

    window.adminRemoveNavIcon = function(key) {
      if (!adminNavIconsDraft) return;
      const oldUrl = adminNavIconsDraft[key];
      tryDeleteOldGachaStoragePhoto(oldUrl); // best-effort
      delete adminNavIconsDraft[key];
      renderAdminNavIconsTab();
    };

    window.adminResetNavIconsDraft = function() {
      adminNavIconsDraft = null;
      renderAdminNavIconsTab();
    };

    // ===================== 🎓 導師申請審批（Phase A：導師 PDF 筆記商店） =====================
    // 呢個分頁分兩部分：(1) 導師申請（含待審批／歷史記錄），(2) 已批准
    // 嘅導師名單（可以喺度停權／解除停權）。審批動作全部經 Cloud
    // Functions（見 functions/index.js 嘅 approveTutorApplication／
    // rejectTutorApplication／suspendTutor／reinstateTutor），呢度純粹
    // 負責顯示同觸發呼叫，唔會直接寫 Firestore（tutorApplications／
    // tutors 兩個 collection 嘅前端寫入權限喺 firestore.rules 已經鎖死）。
    let adminTutorsBadgeUnsubscribe = null;
    let adminTutorAppsUnsubscribe = null;
    let adminTutorsListUnsubscribe = null;
    let adminTutorApps = [];
    let adminTutorsList = [];

    // 「🎓 導師申請」個紅點徽章同「🚩 舉報處理」個做法一樣，唔理管理員
    // 而家揀緊邊個分頁都要見到，一入管理後台就開始聽
    window.startAdminTutorsBadgeListener = function() {
      if (!window.db || !window.fs) return;
      if (adminTutorsBadgeUnsubscribe) return;
      try {
        const q = window.fs.query(
          window.fs.collection(window.db, 'tutorApplications'),
          window.fs.where('status', '==', 'pending')
        );
        adminTutorsBadgeUnsubscribe = window.fs.onSnapshot(q, (snapshot) => {
          const badge = document.getElementById('admin-tutors-badge');
          if (!badge) return;
          const count = snapshot.size;
          badge.innerText = String(count);
          badge.style.display = count > 0 ? 'inline-block' : 'none';
        }, (err) => {
          console.error('監聽導師申請數量失敗：', err);
        });
      } catch (e) {
        console.error('啟動導師申請 badge listener 失敗：', e);
      }
    };

    function buildAdminTutorAppCardHtml(docSnap) {
      const a = docSnap.data();
      const uid = docSnap.id;
      const status = a.status || 'pending';
      const statusLabel = status === 'pending' ? window.t('admin.s315', '待審批') : (status === 'approved' ? window.t('admin.s316', '已批准') : window.t('admin.s270', '已駁回'));
      const statusColor = status === 'pending' ? '#C0524A' : (status === 'approved' ? '#2F6B3A' : '#999');
      const when = a.submittedAt ? new Date(a.submittedAt).toLocaleString('zh-HK') : '—';
      const subjectsHtml = (a.subjectsIntended || [])
        .map(s => `<span class="tag" style="background:#F6F7FB; color:#29395C; margin-right:4px;">${escapeHtml(s)}</span>`)
        .join('');
      return `
        <div class="admin-card" style="${status !== 'pending' ? 'opacity:.65;' : ''}">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
            <span style="font-weight:700; color:${statusColor}; font-size:13px;">${statusLabel}</span>
            <span style="font-size:13px; color:#999;">${escapeHtml(when)}</span>
          </div>
          <p style="font-size:13px; margin-bottom:3px;"><b>${window.t('admin.s322', '顯示名稱：')}</b>${escapeHtml(a.displayName || '—')}</p>
          <p style="font-size:13px; color:#666; margin-bottom:3px;">${escapeHtml(a.bio || window.t('admin.s317', '（未填寫自我介紹）'))}</p>
          <p style="font-size:13px; margin-bottom:3px;">${subjectsHtml || window.t('admin.s318', '（未填寫科目）')}</p>
          <p style="font-size:13px; color:#888; margin-bottom:3px;"><b>${window.t('admin.s323', '聯絡方式：')}</b>${escapeHtml(a.contactInfo || '—')}</p>
          <p style="font-size:12px; color:#aaa; margin-bottom:3px;">${escapeHtml(uid)}</p>
          ${status === 'rejected' && a.rejectionReason ? `<p style="font-size:13px; color:#8a2f2f; background:#FBEAEA; border-radius:6px; padding:6px 8px; margin-bottom:3px;">${window.t('admin.s319', '駁回原因：')}${escapeHtml(a.rejectionReason)}</p>` : ''}
          ${status === 'pending' ? `
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px;">
              <button class="btn btn-primary" style="font-size:13px; padding:4px 9px;" onclick="window.adminApproveTutorApp('${uid}')">${window.t('admin.s320', '批准')}</button>
              <button class="btn btn-outline" style="font-size:13px; padding:4px 9px;" onclick="window.adminRejectTutorApp('${uid}')">${window.t('admin.s321', '駁回')}</button>
            </div>
          ` : ''}
        </div>
      `;
    }

    function buildAdminTutorCardHtml(docSnap) {
      const t = docSnap.data();
      const uid = docSnap.id;
      const status = t.status || 'active';
      const statusLabel = status === 'active' ? window.t('admin.s324', '正常') : window.t('admin.s297', '已停權');
      const statusColor = status === 'active' ? '#2F6B3A' : '#C0524A';
      const subjectsHtml = (t.subjectsIntended || [])
        .map(s => `<span class="tag" style="background:#F6F7FB; color:#29395C; margin-right:4px;">${escapeHtml(s)}</span>`)
        .join('');
      return `
        <div class="admin-card">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
            <span style="font-weight:700; color:${statusColor}; font-size:13px;">${statusLabel}</span>
            <span style="font-size:12px; color:#aaa;">${escapeHtml(uid)}</span>
          </div>
          <p style="font-size:13px; margin-bottom:3px;"><b>${escapeHtml(t.displayName || '—')}</b></p>
          <p style="font-size:13px; color:#666; margin-bottom:3px;">${escapeHtml(t.bio || '')}</p>
          <p style="font-size:13px; margin-bottom:3px;">${subjectsHtml}</p>
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px;">
            ${status === 'active'
              ? `<button class="btn btn-red" style="font-size:13px; padding:4px 9px;" onclick="window.adminSuspendTutor('${uid}')">${window.t('admin.s325', '停權')}</button>`
              : `<button class="btn btn-outline" style="font-size:13px; padding:4px 9px;" onclick="window.adminReinstateTutor('${uid}')">${window.t('admin.s203', '解除停權')}</button>`}
          </div>
        </div>
      `;
    }

    function renderAdminTutorsListUI() {
      const container = document.getElementById('admin-tab-tutors');
      if (!container) return;

      const pendingApps = adminTutorApps.filter(d => (d.data().status || 'pending') === 'pending');
      const otherApps = adminTutorApps.filter(d => (d.data().status || 'pending') !== 'pending');

      const pendingHtml = pendingApps.length
        ? pendingApps.map(buildAdminTutorAppCardHtml).join('')
        : ('<div class="admin-card" style="text-align:center; color:#999;">' + window.t('admin.s326', '目前沒有待審批的導師申請') + '</div>');

      const tutorsHtml = adminTutorsList.length
        ? adminTutorsList.map(buildAdminTutorCardHtml).join('')
        : ('<div class="admin-card" style="text-align:center; color:#999;">' + window.t('admin.s327', '目前還沒有任何已批准的導師') + '</div>');

      const historyHtml = otherApps.length ? otherApps.map(buildAdminTutorAppCardHtml).join('') : '';

      container.innerHTML = `
        <h4 style="font-size:14px; font-weight:bold; color:var(--brand-800); margin:4px 0 8px;">${window.t('admin.s329', '待審批申請')}</h4>
        ${pendingHtml}
        <h4 style="font-size:14px; font-weight:bold; color:var(--brand-800); margin:18px 0 8px;">${window.t('admin.s330', '導師名單')}</h4>
        ${tutorsHtml}
        ${historyHtml ? `<h4 style="font-size:14px; font-weight:bold; color:var(--brand-800); margin:18px 0 8px;">${window.t('admin.s328', '申請歷史（已批准／已駁回）')}</h4>${historyHtml}` : ''}
      `;
    }

    function renderAdminTutorsTab() {
      const container = document.getElementById('admin-tab-tutors');
      if (!container || !window.db || !window.fs) return;
      container.innerHTML = ('<p style="text-align:center; color:#999; padding:20px;">' + window.t('admin.s331', '載入中導師申請...') + '</p>');

      if (adminTutorAppsUnsubscribe) adminTutorAppsUnsubscribe();
      if (adminTutorsListUnsubscribe) adminTutorsListUnsubscribe();
      adminTutorApps = [];
      adminTutorsList = [];

      const appsQ = window.fs.query(
        window.fs.collection(window.db, 'tutorApplications'),
        window.fs.orderBy('submittedAt', 'desc'),
        window.fs.limit(100)
      );
      adminTutorAppsUnsubscribe = window.fs.onSnapshot(appsQ, (snapshot) => {
        adminTutorApps = snapshot.docs;
        renderAdminTutorsListUI();
      }, (err) => {
        container.innerHTML = `<div class="admin-card" style="color:#c0392b;">${window.t('admin.s332', '載入導師申請失敗：')}${err.message || err}</div>`;
      });

      const tutorsQ = window.fs.query(
        window.fs.collection(window.db, 'tutors'),
        window.fs.orderBy('createdAt', 'desc'),
        window.fs.limit(100)
      );
      adminTutorsListUnsubscribe = window.fs.onSnapshot(tutorsQ, (snapshot) => {
        adminTutorsList = snapshot.docs;
        renderAdminTutorsListUI();
      }, (err) => {
        console.error('載入導師名單失敗：', err);
      });
    }
    window.renderAdminTutorsTab = renderAdminTutorsTab;

    window.adminApproveTutorApp = async function(uid) {
      if (!(await window.appConfirm(window.t('admin.s333', '確定批准這個導師申請？批准之後該用戶會立即獲得導師身份。')))) return;
      try {
        await window.callCloudFunction('approveTutorApplication', { targetUid: uid });
        await logAdminAction('批准導師申請', { uid });
        window.showToast(window.t('admin.s334', '已批准導師申請'), '✅');
      } catch (err) {
        window.showToast(window.t('admin.s335', '批准失敗：') + (err.message || err), '❌');
      }
    };

    window.adminRejectTutorApp = async function(uid) {
      const reason = (await window.appPrompt(window.t('admin.s336', '駁回原因（會顯示給申請人查看，可以留空）：'), ''));
      if (reason === null) return; // 撳咗取消
      try {
        await window.callCloudFunction('rejectTutorApplication', { targetUid: uid, rejectionReason: reason });
        await logAdminAction('駁回導師申請', { uid, reason });
        window.showToast(window.t('admin.s337', '已駁回導師申請'), '🗂️');
      } catch (err) {
        window.showToast(window.t('admin.s338', '駁回失敗：') + (err.message || err), '❌');
      }
    };

    window.adminSuspendTutor = async function(uid) {
      if (!(await window.appConfirm(window.t('admin.s339', '確定停權這位導師？其已上架的筆記會自動下架，但已購買的學生保留下載權。')))) return;
      try {
        await window.callCloudFunction('suspendTutor', { targetUid: uid });
        await logAdminAction('停權導師', { uid });
        window.showToast(window.t('admin.s340', '已停權該導師'), '🚫');
      } catch (err) {
        window.showToast(window.t('admin.s341', '停權失敗：') + (err.message || err), '❌');
      }
    };

    window.adminReinstateTutor = async function(uid) {
      try {
        await window.callCloudFunction('reinstateTutor', { targetUid: uid });
        await logAdminAction('解除導師停權', { uid });
        window.showToast(window.t('admin.s227', '已解除停權'), '✅');
      } catch (err) {
        window.showToast(window.t('admin.s342', '解除停權失敗：') + (err.message || err), '❌');
      }
    };

    // ---------- Landing page（未登入主頁）文案／圖片管理 ----------
    // 做法同扭蛋機／等級系統／功能圖示嗰幾個分頁一致：資料存喺 Firestore
    // 嘅 admin_config/landingContent 文件，管理員喺呢度改完撳「儲存」，
    // 全站（包括未登入訪客）即時生效，唔使再改 code、推 GitHub。
    // 同其他幾個分頁唯一唔同嘅地方：呢份文件嘅讀取權限特登喺
    // firestore.rules 開放俾未登入用戶（見 admin_config/landingContent
    // 嗰條獨立規則），因為 Landing page 本身就係畀未登入嘅訪客睇。
    //
    // 文字部分直接存返 i18n.js 入面 'landing.*' 嗰 24 組 key 嘅三語
    // 內容（zh-Hant／en／yue），管理員改嘅其實就係 window.I18N_DICT
    // 入面呢幾組字嘅值；圖片部分（Nav Logo／主橫幅吉祥物圖）存返兩條
    // Firebase Storage 下載連結，冇自訂圖片嗰陣就維持用返 index.html
    // 寫死嘅預設檔案（assets/images/logo-hero.png／assets/images/ottie-wave.png）。

    // 分組顯示用：每個分組底下嘅 key 清單＋中文標籤，純粹為咗令管理員
    // 睇得明呢個欄位對應緊個網站邊一句字，唔影響實際儲存結構。
    const LANDING_FIELD_GROUPS = [
      {
        title: window.t('admin.s343', '導覽列'),
        fields: [
          { key: 'landing.navLogin', label: window.t('admin.s344', '「登入」按鈕文字') },
          { key: 'landing.registerBtn', label: window.t('admin.s345', '「註冊帳號」按鈕文字（頂部導覽／主橫幅／底部行動呼籲共用同一句，改一次三處一齊變）') }
        ]
      },
      {
        title: window.t('admin.s346', '主橫幅'),
        fields: [
          { key: 'landing.heroH1Line1', label: window.t('admin.s347', '主標題　第一行') },
          { key: 'landing.heroH1Line2', label: window.t('admin.s348', '主標題　第二行') },
          { key: 'landing.heroSub', label: window.t('admin.s349', '說明文字') },
          { key: 'landing.subjectChinese', label: window.t('admin.s350', '科目裝飾格：中文') },
          { key: 'landing.subjectEnglish', label: window.t('admin.s351', '科目裝飾格：英文') },
          { key: 'landing.subjectMath', label: window.t('admin.s352', '科目裝飾格：數學') }
        ]
      },
      {
        title: window.t('admin.s353', '「三個核心」介紹區'),
        fields: [
          { key: 'landing.stepsEyebrow', label: window.t('admin.s354', '小標籤') },
          { key: 'landing.stepsH2', label: window.t('admin.s355', '大標題') },
          { key: 'landing.stepsSub', label: window.t('admin.s349', '說明文字') },
          { key: 'landing.step1Title', label: window.t('admin.s356', '第一步　標題') },
          { key: 'landing.step1Desc', label: window.t('admin.s357', '第一步　說明') },
          { key: 'landing.step2Title', label: window.t('admin.s358', '第二步　標題') },
          { key: 'landing.step2Desc', label: window.t('admin.s359', '第二步　說明') },
          { key: 'landing.step3Title', label: window.t('admin.s360', '第三步　標題') },
          { key: 'landing.step3Desc', label: window.t('admin.s361', '第三步　說明') }
        ]
      },
      {
        title: window.t('admin.s362', '行動呼籲區'),
        fields: [
          { key: 'landing.ctaH2', label: window.t('admin.s355', '大標題') },
          { key: 'landing.ctaSub', label: window.t('admin.s349', '說明文字') }
        ]
      },
      {
        title: window.t('admin.s363', '頁尾'),
        fields: [
          { key: 'landing.footerCopyright', label: window.t('admin.s364', '版權文字') },
          { key: 'landing.footerTerms', label: window.t('admin.s365', '「服務條款」連結文字') },
          { key: 'landing.footerPrivacy', label: window.t('admin.s366', '「私隱政策」連結文字') }
        ]
      }
    ];

    function renderAdminLandingImageCard(imgKey, title, desc, defaultFile) {
      const url = adminLandingDraft.images[imgKey];
      const previewInner = url
        ? `<img src="${url}" style="width:100%; height:100%; object-fit:contain;">`
        : `<img src="${defaultFile}" style="width:100%; height:100%; object-fit:contain;">`;
      return `
        <div class="admin-card">
          <h3 style="font-size:15px; font-weight:bold; color:var(--brand-800); margin-bottom:10px;">${title}</h3>
          <p style="font-size:13px; color:#888; margin-bottom:10px;">${desc}</p>
          <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <div id="admin-landing-${imgKey}-thumb" onclick="document.getElementById('admin-landing-${imgKey}-input').click()" title="${window.t('admin.s13', '點擊這裡上傳圖片')}" style="width:80px; height:80px; border-radius:10px; background:#F6F7FB; border:1px dashed #D2D9E9; display:flex; align-items:center; justify-content:center; cursor:pointer; overflow:hidden;">${previewInner}</div>
            <input type="file" accept="image/*" id="admin-landing-${imgKey}-input" style="display:none;" onchange="adminUploadLandingImage('${imgKey}', this)">
            <div style="display:flex; flex-direction:column; gap:6px;">
              <button type="button" class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="document.getElementById('admin-landing-${imgKey}-input').click()">${window.t('admin.s14', '上傳新圖片')}</button>
              ${url ? `<button type="button" class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="adminRemoveLandingImage('${imgKey}')">${window.t('admin.s10', '還原做預設圖')}</button>` : ''}
            </div>
          </div>
        </div>
      `;
    }

    function renderAdminLandingTab() {
      const container = document.getElementById('admin-tab-landing');
      if (!container) return;

      if (!adminLandingDraft) {
        if (!landingConfigLoaded) {
          container.innerHTML = ('<p style="text-align:center; color:#999; padding:20px;">' + window.t('admin.s367', '載入中 Landing page 設定...') + '</p>');
          return; // Firestore 資料一到，loadLandingContentFromFirestore() 會自動再 render 多次
        }
        const texts = {};
        LANDING_FIELD_GROUPS.forEach(group => {
          group.fields.forEach(f => {
            const entry = (window.I18N_DICT && window.I18N_DICT[f.key]) || {};
            texts[f.key] = {
              'zh-Hant': entry['zh-Hant'] || '',
              'en': entry['en'] || '',
              'yue': entry['yue'] || ''
            };
          });
        });
        adminLandingDraft = {
          texts,
          images: {
            navLogoUrl: window.LANDING_IMAGE_OVERRIDES ? (window.LANDING_IMAGE_OVERRIDES.navLogoUrl || null) : null,
            heroImageUrl: window.LANDING_IMAGE_OVERRIDES ? (window.LANDING_IMAGE_OVERRIDES.heroImageUrl || null) : null
          }
        };
      }

      const groupsHtml = LANDING_FIELD_GROUPS.map(group => {
        const fieldsHtml = group.fields.map(f => {
          const v = adminLandingDraft.texts[f.key];
          return `
            <div style="margin-bottom:16px; padding-bottom:14px; border-bottom:1px solid #EEF3FA;">
              <p style="font-size:13px; font-weight:bold; color:var(--brand-700); margin-bottom:6px;">${f.label}</p>
              <div style="display:grid; grid-template-columns:1fr; gap:6px;">
                <label style="font-size:12px; color:#999;">${window.t('admin.s368', '繁體中文')}
                  <textarea rows="1" style="width:100%; font-size:14px; padding:6px 8px; border:1px solid #DCE5F4; border-radius:6px; font-family:inherit; resize:vertical;" oninput="adminUpdateLandingText('${f.key}','zh-Hant',this.value)">${v['zh-Hant']}</textarea>
                </label>
                <label style="font-size:12px; color:#999;">English
                  <textarea rows="1" style="width:100%; font-size:14px; padding:6px 8px; border:1px solid #DCE5F4; border-radius:6px; font-family:inherit; resize:vertical;" oninput="adminUpdateLandingText('${f.key}','en',this.value)">${v['en']}</textarea>
                </label>
                <label style="font-size:12px; color:#999;">${window.t('admin.s369', '廣東話')}
                  <textarea rows="1" style="width:100%; font-size:14px; padding:6px 8px; border:1px solid #DCE5F4; border-radius:6px; font-family:inherit; resize:vertical;" oninput="adminUpdateLandingText('${f.key}','yue',this.value)">${v['yue']}</textarea>
                </label>
              </div>
            </div>
          `;
        }).join('');
        return `
          <div class="admin-card" style="margin-bottom:16px;">
            <h3 style="font-size:16px; font-weight:bold; color:var(--brand-800); margin-bottom:14px;">${group.title}</h3>
            ${fieldsHtml}
          </div>
        `;
      }).join('');

      container.innerHTML = `
        <p style="font-size:13px; color:#888; margin-bottom:14px;">${window.t('admin.s374', '這裏的文字是未登入訪客打開網站時首先看到的首頁內容，三種語言可以分開修改。修改後點擊最底的「儲存全部改動」，即時全站生效（包括未登入的訪客），毋須修改程式。')}</p>
        ${renderAdminLandingImageCard('navLogoUrl', window.t('admin.s370', '主橫幅 Logo'), window.t('admin.s371', '顯示喺 Landing page 主橫幅左上方嘅大 Logo（建議用透明背景 PNG，闊度約 600px 以上）。'), 'assets/images/logo-hero.png')}
        ${renderAdminLandingImageCard('heroImageUrl', window.t('admin.s372', '主橫幅吉祥物圖'), window.t('admin.s373', '顯示在主橫幅中間的 Ottiee 吉祥物圖案。'), 'assets/images/ottie-wave.png')}
        ${groupsHtml}
        <div style="text-align:center; margin-top:10px;">
          <button type="button" class="btn btn-primary" id="btn-admin-save-landing" style="padding:12px 32px; font-size:15px;" onclick="adminSaveLandingContent()">${window.t('admin.s100', '儲存全部改動')}</button>
        </div>
      `;
    }
    window.renderAdminLandingTab = renderAdminLandingTab;

    window.adminUploadLandingImage = async function(imgKey, inputEl) {
      if (!adminLandingDraft) return;
      const file = inputEl.files && inputEl.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        window.showToast(window.t('admin.s110', '請選擇圖片檔案'), '⚠️');
        return;
      }
      if (!window.storage || !window.storageApi) {
        window.showToast(window.t('admin.s111', 'Storage 未初始化，請重新整理頁面再試'), '⚠️');
        return;
      }
      const oldUrl = adminLandingDraft.images[imgKey];
      window.showToast(window.t('admin.s123', '上傳中圖片…'), '📤');
      try {
        const { blob, mimeType } = await compressImageFileToBlob(file, 600, 0.9);
        const ext = mimeType === 'image/webp' ? 'webp' : (mimeType === 'image/png' ? 'png' : 'jpg');
        const path = `landing_assets/${imgKey}_${Date.now()}.${ext}`;
        const fileRef = window.storageApi.ref(window.storage, path);
        await window.storageApi.uploadBytes(fileRef, blob, { contentType: mimeType });
        const downloadUrl = await window.storageApi.getDownloadURL(fileRef);
        adminLandingDraft.images[imgKey] = downloadUrl;
        renderAdminLandingTab();
        window.showToast(window.t('admin.s124', '圖片上傳成功，請點擊「儲存全部改動」才會正式生效'), '🎉');
        tryDeleteOldGachaStoragePhoto(oldUrl); // best-effort，呢個函式其實通用，唔止扭蛋貼紙先用得
      } catch (err) {
        window.showToast(window.t('admin.s114', '圖片上傳失敗：') + (err.message || err), '❌');
      }
    };

    window.adminRemoveLandingImage = function(imgKey) {
      if (!adminLandingDraft) return;
      const oldUrl = adminLandingDraft.images[imgKey];
      tryDeleteOldGachaStoragePhoto(oldUrl); // best-effort
      adminLandingDraft.images[imgKey] = null;
      renderAdminLandingTab();
    };

    function renderAdminScoringTab() {
      // v1.224.0：計分規則併入「房間設定」分頁頂部
      const container = document.getElementById('admin-scoring-section') || document.getElementById('admin-tab-scoring');
      if (!container) return;

      if (!adminScoringDraft) {
        if (!scoringConfigLoaded) {
          container.innerHTML = ('<p style="text-align:center; color:#999; padding:20px;">' + window.t('admin.s377', '正在載入計分規則…') + '</p>');
          return; // Firestore 資料一到，loadScoringRulesFromFirestore() 會自動再 render 多次
        }
        adminScoringDraft = {
          ptsPerMinute: window.SCORING_RULES ? window.SCORING_RULES.ptsPerMinute : 1,
          presenceCheckBonus: window.SCORING_RULES ? window.SCORING_RULES.presenceCheckBonus : 2
        };
      }

      container.innerHTML = `
        <div class="admin-card">
          <h3 style="font-size:16px; font-weight:bold; color:var(--brand-800); margin-bottom:14px;">${window.t('admin.s378', '計分規則')}</h3>
          <p style="font-size:13px; color:#888; margin-bottom:16px;">${window.t('admin.s379', '這裏的數值會即時影響全站學生在視訊溫習室可獲得的 PTS，修改後請先核對清楚再儲存。')}</p>
          <div style="margin-bottom:18px;">
            <label style="font-size:13px; font-weight:bold; color:var(--brand-700); display:block; margin-bottom:6px;">${window.t('admin.s380', '每專注溫習 1 分鐘可獲得的 PTS')}</label>
            <input type="number" min="1" step="1" value="${adminScoringDraft.ptsPerMinute}" style="width:120px; font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px;" oninput="adminUpdateScoringDraft('ptsPerMinute', this.value)">
          </div>
          <div style="margin-bottom:10px;">
            <label style="font-size:13px; font-weight:bold; color:var(--brand-700); display:block; margin-bottom:6px;">${window.t('admin.s381', '確認「仍在學習」彈窗後額外可獲得的 PTS')}</label>
            <input type="number" min="1" step="1" value="${adminScoringDraft.presenceCheckBonus}" style="width:120px; font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px;" oninput="adminUpdateScoringDraft('presenceCheckBonus', this.value)">
          </div>
        </div>
        <div style="text-align:center; margin-top:16px;">
          <button type="button" class="btn btn-primary" id="btn-admin-save-scoring" style="padding:12px 32px; font-size:15px;" onclick="adminSaveScoringRules()">${window.t('admin.s382', '儲存計分規則')}</button>
        </div>
      `;
    }
    window.renderAdminScoringTab = renderAdminScoringTab;

    function renderAdminRoomSettingsTab() {
      const container = document.getElementById('admin-tab-roomsettings');
      if (!container) return;

      if (!adminRoomSettingsDraft) {
        if (!roomSettingsConfigLoaded) {
          container.innerHTML = ('<p style="text-align:center; color:#999; padding:20px;">' + window.t('admin.s386', '載入中房間設定...') + '</p>');
          return; // Firestore 資料一到，loadRoomSettingsFromFirestore() 會自動再 render 多次
        }
        const s = window.ROOM_SETTINGS || {};
        adminRoomSettingsDraft = {
          capacity2Enabled: s.capacity2Enabled !== false,
          capacity4Enabled: s.capacity4Enabled !== false,
          defaultCapacity: s.defaultCapacity === 2 ? 2 : 4,
          durationOptionsText: Array.isArray(s.durationOptions) ? s.durationOptions.join(', ') : '15, 30, 40, 45, 60',
          defaultDuration: s.defaultDuration || 30
        };
      }

      const d = adminRoomSettingsDraft;
      const capacityChoicesNow = [];
      if (d.capacity2Enabled) capacityChoicesNow.push(2);
      if (d.capacity4Enabled) capacityChoicesNow.push(4);

      container.innerHTML = `
        <div id="admin-scoring-section"></div>
        <div class="admin-card" style="margin-top:24px;">
          <h3 style="font-size:16px; font-weight:bold; color:var(--brand-800); margin-bottom:14px;">${window.t('admin.s389', '人數上限選項')}</h3>
          <p style="font-size:13px; color:#888; margin-bottom:16px;">${window.t('admin.s390', '學生建立溫習房時可選擇的人數上限（只有 2 人房及 4 人房兩種，因為視訊畫面只支援這兩種排列）。')}</p>
          <label style="display:flex; align-items:center; gap:8px; font-size:14px; margin-bottom:10px; cursor:pointer;">
            <input type="checkbox" ${d.capacity2Enabled ? 'checked' : ''} onchange="adminUpdateRoomSettingsDraft('capacity2Enabled', this.checked)"> ${window.t('admin.s391', '開放「2 人房」選項')}
          </label>
          <label style="display:flex; align-items:center; gap:8px; font-size:14px; margin-bottom:16px; cursor:pointer;">
            <input type="checkbox" ${d.capacity4Enabled ? 'checked' : ''} onchange="adminUpdateRoomSettingsDraft('capacity4Enabled', this.checked)"> ${window.t('admin.s392', '開放「4 人房」選項')}
          </label>
          <div>
            <label style="font-size:13px; font-weight:bold; color:var(--brand-700); display:block; margin-bottom:6px;">${window.t('admin.s393', '預設人數上限（開啟表格時預先選取）')}</label>
            <select style="width:160px; font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px;" onchange="adminUpdateRoomSettingsDraft('defaultCapacity', this.value)">
              ${capacityChoicesNow.map(n => `<option value="${n}" ${d.defaultCapacity === n ? 'selected' : ''}>${n} ${window.t('admin.s387', '人房')}</option>`).join('') || ('<option value="">' + window.t('admin.s388', '（請先開放最少一個選項）') + '</option>')}
            </select>
          </div>
        </div>
        <div class="admin-card" style="margin-top:16px;">
          <h3 style="font-size:16px; font-weight:bold; color:var(--brand-800); margin-bottom:14px;">${window.t('admin.s394', '預計溫習時間選項')}</h3>
          <p style="font-size:13px; color:#888; margin-bottom:16px;">${window.t('admin.s395', '此時間只會顯示在公開大廳的房間列表，供其他同學參考，房間不會因時間到而自動結束。可自由增減分鐘選項。')}</p>
          <div style="margin-bottom:16px;">
            <label style="font-size:13px; font-weight:bold; color:var(--brand-700); display:block; margin-bottom:6px;">${window.t('admin.s396', '分鐘選項（以逗號分隔，例如：15, 30, 40, 45, 60）')}</label>
            <input type="text" value="${d.durationOptionsText}" style="width:100%; max-width:420px; font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px;" oninput="adminUpdateRoomSettingsDraft('durationOptionsText', this.value)">
          </div>
          <div>
            <label style="font-size:13px; font-weight:bold; color:var(--brand-700); display:block; margin-bottom:6px;">${window.t('admin.s397', '預設溫習時間（分鐘，開啟表格時預先選取）')}</label>
            <input type="number" min="1" step="1" value="${d.defaultDuration}" style="width:160px; font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px;" oninput="adminUpdateRoomSettingsDraft('defaultDuration', this.value)">
          </div>
        </div>
        <div style="text-align:center; margin-top:16px;">
          <button type="button" class="btn btn-primary" id="btn-admin-save-roomsettings" style="padding:12px 32px; font-size:15px;" onclick="adminSaveRoomSettings()">${window.t('admin.s398', '儲存房間設定')}</button>
        </div>
      `;
      renderAdminScoringTab();
    }
    window.renderAdminRoomSettingsTab = renderAdminRoomSettingsTab;

    window.adminUpdateRoomSettingsDraft = function(key, value) {
      if (!adminRoomSettingsDraft) return;
      if (key === 'capacity2Enabled' || key === 'capacity4Enabled') {
        adminRoomSettingsDraft[key] = !!value;
      } else if (key === 'defaultCapacity') {
        const n = parseInt(value, 10);
        adminRoomSettingsDraft.defaultCapacity = (n === 2 || n === 4) ? n : adminRoomSettingsDraft.defaultCapacity;
      } else if (key === 'defaultDuration') {
        const n = parseInt(value, 10);
        adminRoomSettingsDraft.defaultDuration = (Number.isFinite(n) && n > 0) ? n : adminRoomSettingsDraft.defaultDuration;
      } else if (key === 'durationOptionsText') {
        adminRoomSettingsDraft.durationOptionsText = value;
      }
      renderAdminRoomSettingsTab();
    };

    const ANTI_IDLE_FIELDS = [
      { key: 'presenceCheckIntervalMin', label: window.t('admin.s403', '「仍在溫習緊？」確認彈窗，相隔幾多分鐘出現一次') },
      { key: 'presenceResponseMin', label: window.t('admin.s404', '彈窗出現之後，幾多分鐘內未確認就會暫停計分') },
      { key: 'micOpenLimitMin', label: window.t('admin.s405', '每次開咪，最多可以連續開幾多分鐘') },
      { key: 'micCooldownMin', label: window.t('admin.s406', '開咪撞到上限之後，要冷卻（鎖住咪掣）幾多分鐘先可以再開') },
      { key: 'micIdleResetMin', label: window.t('admin.s407', '主動關咪、未撞到上限嘅情況下，連續幾多分鐘冇再開咪就當完全休息返、重新計過開咪時限') }
    ];

    function renderAdminAntiIdleTab() {
      const container = document.getElementById('admin-tab-antiidle');
      if (!container) return;

      if (!adminAntiIdleDraft) {
        if (!antiIdleConfigLoaded) {
          container.innerHTML = ('<p style="text-align:center; color:#999; padding:20px;">' + window.t('admin.s408', '載入中防掛機參數設定...') + '</p>');
          return; // Firestore 資料一到，loadAntiIdleRulesFromFirestore() 會自動再 render 多次
        }
        const r = window.ANTI_IDLE_RULES || {};
        adminAntiIdleDraft = {
          presenceCheckIntervalMin: r.presenceCheckIntervalMin || 30,
          presenceResponseMin: r.presenceResponseMin || 5,
          micOpenLimitMin: r.micOpenLimitMin || 3,
          micCooldownMin: r.micCooldownMin || 5,
          micIdleResetMin: r.micIdleResetMin || 5
        };
      }

      const d = adminAntiIdleDraft;
      container.innerHTML = `
        <div class="admin-card">
          <h3 style="font-size:16px; font-weight:bold; color:var(--brand-800); margin-bottom:14px;">${window.t('admin.s409', '視訊溫習室防掛機參數')}</h3>
          <p style="font-size:13px; color:#888; margin-bottom:16px;">${window.t('admin.s410', '這組數值用作防止學生掛機或開着鏡頭不理會而賺取積分，單位均為「分鐘」，請核實後才儲存。已在房內的學生不會即時生效，要待下次入房或開咪時才套用新數值。')}</p>
          ${ANTI_IDLE_FIELDS.map(f => `
            <div style="margin-bottom:16px;">
              <label style="font-size:13px; font-weight:bold; color:var(--brand-700); display:block; margin-bottom:6px;">${f.label}</label>
              <input type="number" min="1" step="1" value="${d[f.key]}" style="width:120px; font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px;" oninput="adminUpdateAntiIdleDraft('${f.key}', this.value)"> ${window.t('unit.minutes', '分鐘')}
            </div>
          `).join('')}
        </div>
        <div style="text-align:center; margin-top:16px;">
          <button type="button" class="btn btn-primary" id="btn-admin-save-antiidle" style="padding:12px 32px; font-size:15px;" onclick="adminSaveAntiIdleRules()">${window.t('admin.s100', '儲存全部改動')}</button>
        </div>
      `;
    }
    window.renderAdminAntiIdleTab = renderAdminAntiIdleTab;

    window.adminSaveAntiIdleRules = async function() {
      if (!adminAntiIdleDraft) return;
      const d = adminAntiIdleDraft;
      const allValid = ANTI_IDLE_FIELDS.every(f => d[f.key] > 0);
      if (!allValid) {
        window.showToast(window.t('admin.s411', '所有數值都要大於 0'), '⚠️');
        return;
      }
      const payload = {
        presenceCheckIntervalMin: d.presenceCheckIntervalMin,
        presenceResponseMin: d.presenceResponseMin,
        micOpenLimitMin: d.micOpenLimitMin,
        micCooldownMin: d.micCooldownMin,
        micIdleResetMin: d.micIdleResetMin,
        updatedAt: Date.now(),
        updatedBy: window.currentUser ? window.currentUser.email : null
      };
      const btn = document.getElementById('btn-admin-save-antiidle');
      if (btn) { btn.disabled = true; btn.innerText = window.t('admin.s136', '儲存中…'); }
      try {
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'antiIdleRules'), payload);
        window.showToast(window.t('admin.s412', '防掛機參數已儲存，即時對所有用戶生效（已在房內的學生要下次入房或開啟麥克風後才會套用新數值）！'), '🎉');
      } catch (err) {
        window.showToast(window.t('admin.s138', '儲存失敗：') + (err.message || err), '❌');
      } finally {
        if (btn) { btn.disabled = false; btn.innerText = window.t('admin.s100', '儲存全部改動'); }
      }
    };

    // ---------- 數據總覽 Dashboard ----------
    // 第三階段（運營工具）第一項：畀Alvis一入Admin後台就即刻見到成個
    // 平台嘅關鍵數字，唔使逐個分頁揭嚟揭去自己數。
    //
    // 做法同其他分頁唔同：唔用 onSnapshot 持續監聽（用戶／房間呢兩個
    // collection 會隨平台成長越嚟越大，持續監聽成個dashboard會一直
    // 掛住唔少實時流量），而係用 getDocs／getCountFromServer 做「一次
    // 性讀取」，撳「重新整理」先再讀多次——對一個總覽畫面嚟講，數字
    // 唔使去到秒秒都即時更新，呢種做法對 Firestore 讀取量更溫和。
    // 「待處理舉報」「待審批導師申請」用 getCountFromServer 直接喺伺服
    // 器端計數，唔使下載晒成批文件，比較慳。
    // v1.200.0：為所有現有用戶補建 publicProfiles（其他用戶睇資料卡用）。
    window.adminBackfillPublicProfiles = async function(btn) {
      if (!(await window.appConfirm(window.t('admin.s414', '確定要為所有用戶同步公開資料卡？用戶較多時可能需要一至兩分鐘。')))) return;
      const original = btn ? btn.innerText : '';
      if (btn) { btn.disabled = true; btn.innerText = window.t('admin.s415', '同步中…'); }
      try {
        const result = await window.callCloudFunction('backfillPublicProfiles', {});
        window.showToast(`${window.t('admin.s416', '已同步')} ${result && result.count != null ? result.count : 0} ${window.t('admin.s417', '位用戶的公開資料')}`, '✅');
      } catch (e) {
        window.showToast(window.t('admin.s418', '同步失敗：') + (e.message || e), '❌');
      } finally {
        if (btn) { btn.disabled = false; btn.innerText = original; }
      }
    };

    let adminDashboardStats = null;
    let adminDashboardLoading = false;
    let adminDashboardLoadedAt = null;

    async function loadAdminDashboardStats() {
      if (!window.db || !window.fs) return;
      adminDashboardLoading = true;
      renderAdminDashboardTab();
      try {
        const [usersSnap, roomsSnap, reportsCountSnap, tutorsCountSnap] = await Promise.all([
          window.fs.getDocs(window.fs.collection(window.db, 'users')),
          window.fs.getDocs(window.fs.collection(window.db, 'rooms')),
          window.fs.getCountFromServer(window.fs.query(window.fs.collection(window.db, 'reports'), window.fs.where('status', '==', 'pending'))),
          window.fs.getCountFromServer(window.fs.query(window.fs.collection(window.db, 'tutorApplications'), window.fs.where('status', '==', 'pending')))
        ]);

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayStartMs = todayStart.getTime();
        const weekAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;

        let totalUsers = 0, newToday = 0, newThisWeek = 0, activeToday = 0;
        let suspendedCount = 0, tutorCount = 0, totalPoints = 0, totalHours = 0;

        usersSnap.forEach(docSnap => {
          const u = docSnap.data();
          totalUsers++;
          // createdAt／lastLoginAt 喺唔同時期寫入嘅帳號可能係數字（ms
          // 時間戳）或者 ISO字串，new Date() 兩種都食得，跟返其他分頁
          // （例如「房間管理」）一致嘅寬容寫法
          const createdMs = typeof u.createdAt === 'number' ? u.createdAt : (u.createdAt ? new Date(u.createdAt).getTime() : 0);
          if (createdMs >= todayStartMs) newToday++;
          if (createdMs >= weekAgoMs) newThisWeek++;
          const lastLoginMs = typeof u.lastLoginAt === 'number' ? u.lastLoginAt : (u.lastLoginAt ? new Date(u.lastLoginAt).getTime() : 0);
          if (lastLoginMs >= todayStartMs) activeToday++;
          if (u.suspended) suspendedCount++;
          if (u.accountType === 'tutor') tutorCount++;
          totalPoints += parseFloat(u.points) || 0;
          totalHours += parseFloat(u.hours) || 0;
        });

        adminDashboardStats = {
          totalUsers, newToday, newThisWeek, activeToday, suspendedCount, tutorCount,
          totalPoints: Math.round(totalPoints),
          totalHours: Math.round(totalHours * 10) / 10,
          roomCount: roomsSnap.size,
          pendingReports: reportsCountSnap.data().count,
          pendingTutorApps: tutorsCountSnap.data().count
        };
      } catch (err) {
        console.error('載入數據總覽失敗:', err);
        adminDashboardStats = { error: err.message || String(err) };
      } finally {
        adminDashboardLoading = false;
        adminDashboardLoadedAt = Date.now();
        renderAdminDashboardTab();
      }
    }
    window.loadAdminDashboardStats = loadAdminDashboardStats;
    window.adminRefreshDashboard = function() { loadAdminDashboardStats(); };

    function renderAdminDashboardTab() {
      const container = document.getElementById('admin-tab-dashboard');
      if (!container) return;

      if (!adminDashboardStats && !adminDashboardLoading) {
        loadAdminDashboardStats();
        return;
      }
      if (adminDashboardLoading && !adminDashboardStats) {
        container.innerHTML = ('<p style="text-align:center; color:#999; padding:20px;">' + window.t('admin.s419', '載入中數據總覽...') + '</p>');
        return;
      }
      if (adminDashboardStats && adminDashboardStats.error) {
        container.innerHTML = `<div class="admin-card" style="color:#c0392b;">${window.t('admin.s190', '載入失敗：')}${escapeHtml(adminDashboardStats.error)}</div>`;
        return;
      }

      const s = adminDashboardStats;
      const lastUpdateText = adminDashboardLoadedAt ? new Date(adminDashboardLoadedAt).toLocaleString('zh-HK') : '—';
      const refreshingNow = adminDashboardLoading;

      const cards = [
        { label: window.t('admin.s420', '總註冊用戶'), value: s.totalUsers },
        { label: window.t('admin.s421', '今日新註冊'), value: s.newToday },
        { label: window.t('admin.s422', '本週新註冊'), value: s.newThisWeek },
        { label: window.t('admin.s423', '今日活躍用戶（有登入）'), value: s.activeToday },
        { label: window.t('admin.s424', '目前溫習房間數'), value: s.roomCount },
        { label: window.t('admin.s425', '現存總 PTS（已扣除兌換）'), value: s.totalPoints.toLocaleString('zh-HK') },
        { label: window.t('admin.s426', '累積總溫習時數'), value: s.totalHours.toLocaleString('zh-HK') + window.t('admin.s427', ' 小時') },
        { label: window.t('admin.s428', '導師帳戶數'), value: s.tutorCount },
        { label: window.t('admin.s429', '停權帳戶數'), value: s.suspendedCount },
        { label: window.t('admin.s430', '待處理舉報'), value: s.pendingReports },
        { label: window.t('admin.s431', '待審批導師申請'), value: s.pendingTutorApps }
      ];

      container.innerHTML = `
        <div class="admin-card" style="margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <p style="font-size:13px; color:#888; margin:0;">${window.t('admin.s433', '數據截至：')}${lastUpdateText}${window.t('admin.s434', '（讀取當刻的快照，不會自動更新；如需最新數字，請點擊右邊的按鈕）')}</p>
          <button type="button" class="btn btn-outline" style="font-size:13px; padding:6px 14px;" ${refreshingNow ? 'disabled' : ''} onclick="window.adminRefreshDashboard()">${refreshingNow ? window.t('admin.s432', '更新中…') : window.t('admin.s221', '重新整理')}</button>
          <button type="button" class="btn btn-outline" style="font-size:13px; padding:6px 14px;" onclick="window.adminBackfillPublicProfiles(this)" title="${window.t('admin.s435', '為所有用戶建立／更新公開資料卡（用戶名、頭像、學校等）。系統更新後執行一次即可，重複執行亦無影響。')}">${window.t('admin.s436', '同步公開資料')}</button>
        </div>
        <div class="admin-stat-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:14px;">
          ${cards.map(c => `
            <div class="admin-card admin-stat-tile">
              <div class="admin-stat-num">${c.value}</div>
              <div class="admin-stat-label">${c.label}</div>
            </div>
          `).join('')}
        </div>
      `;
    }
    window.renderAdminDashboardTab = renderAdminDashboardTab;

    function renderAdminAnnouncementTab() {
      const container = document.getElementById('admin-tab-announcement');
      if (!container) return;

      if (!adminAnnouncementDraft) {
        if (!announcementConfigLoaded) {
          container.innerHTML = ('<p style="text-align:center; color:#999; padding:20px;">' + window.t('admin.s437', '載入中全站公告設定...') + '</p>');
          return; // Firestore 資料一到，loadSiteAnnouncementFromFirestore() 會自動再 render 多次
        }
        const a = window.SITE_ANNOUNCEMENT_RAW || {};
        adminAnnouncementDraft = {
          enabled: !!a.enabled,
          type: ['info', 'warning', 'urgent'].includes(a.type) ? a.type : 'info',
          message: {
            'zh-Hant': (a.message && a.message['zh-Hant']) || '',
            'en': (a.message && a.message['en']) || '',
            'yue': (a.message && a.message['yue']) || ''
          }
        };
      }

      const d = adminAnnouncementDraft;
      const typeOptions = [
        { v: 'info', label: window.t('admin.s438', '📘 一般資訊（藍色）') },
        { v: 'warning', label: window.t('admin.s439', '📙 注意事項（橙黃色）') },
        { v: 'urgent', label: window.t('admin.s440', '📕 緊急／重要（紅色）') }
      ];

      container.innerHTML = `
        <div class="admin-card">
          <h3 style="font-size:16px; font-weight:bold; color:var(--brand-800); margin-bottom:14px;">${window.t('admin.s441', '全站公告橫幅')}</h3>
          <p style="font-size:13px; color:#888; margin-bottom:16px;">${window.t('admin.s442', '顯示於整個網站最頂部（登入前首頁及登入後主應用均會看到）。訪客可以點擊關閉，關閉後除非公告文字有所修改，否則不會再次顯示。')}</p>
          <label style="display:flex; align-items:center; gap:8px; font-size:14px; margin-bottom:18px; cursor:pointer;">
            <input type="checkbox" ${d.enabled ? 'checked' : ''} onchange="adminUpdateAnnouncementDraft('enabled', this.checked)"> ${window.t('admin.s443', '開啟公告橫幅')}
          </label>
          <div style="margin-bottom:18px;">
            <label style="font-size:13px; font-weight:bold; color:var(--brand-700); display:block; margin-bottom:6px;">${window.t('admin.s444', '顏色／緊急程度')}</label>
            <select style="width:220px; font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px;" onchange="adminUpdateAnnouncementDraft('type', this.value)">
              ${typeOptions.map(o => `<option value="${o.v}" ${d.type === o.v ? 'selected' : ''}>${o.label}</option>`).join('')}
            </select>
          </div>
          <div style="margin-bottom:14px;">
            <label style="font-size:13px; font-weight:bold; color:var(--brand-700); display:block; margin-bottom:6px;">${window.t('admin.s445', '公告內容（繁體中文）')}</label>
            <textarea rows="2" style="width:100%; max-width:560px; font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px; font-family:inherit;" oninput="adminUpdateAnnouncementMessage('zh-Hant', this.value)">${escapeHtml(d.message['zh-Hant'])}</textarea>
          </div>
          <div style="margin-bottom:14px;">
            <label style="font-size:13px; font-weight:bold; color:var(--brand-700); display:block; margin-bottom:6px;">${window.t('admin.s446', '公告內容（English）')}</label>
            <textarea rows="2" style="width:100%; max-width:560px; font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px; font-family:inherit;" oninput="adminUpdateAnnouncementMessage('en', this.value)">${escapeHtml(d.message['en'])}</textarea>
          </div>
          <div>
            <label style="font-size:13px; font-weight:bold; color:var(--brand-700); display:block; margin-bottom:6px;">${window.t('admin.s447', '公告內容（廣東話）')}</label>
            <textarea rows="2" style="width:100%; max-width:560px; font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px; font-family:inherit;" oninput="adminUpdateAnnouncementMessage('yue', this.value)">${escapeHtml(d.message['yue'])}</textarea>
          </div>
          <p style="font-size:13px; color:#999; margin-top:6px;">${window.t('admin.s448', '如某種語言留空，選擇該語言的訪客會自動顯示繁體中文版本。')}</p>
        </div>
        <div style="text-align:center; margin-top:16px;">
          <button type="button" class="btn btn-primary" id="btn-admin-save-announcement" style="padding:12px 32px; font-size:15px;" onclick="adminSaveAnnouncement()">${window.t('admin.s100', '儲存全部改動')}</button>
        </div>
      `;
    }
    window.renderAdminAnnouncementTab = renderAdminAnnouncementTab;

    // ---------- 用戶支援工具 ----------
    // 第三階段（運營工具）最後一項：處理學生／家長support ticket嘅
    // 快捷工具——搜尋單一用戶、睇晒佢嘅關鍵資料，再直接喺呢度補發／
    // 扣減PTS、補發貼紙，唔使好似「用戶管理」分頁咁要喺一大張表格度
    // 揾（嗰頁仍然保留，做日常批量管理用；呢個分頁專門做「一個一個
    // 咁處理個別support個案」嘅場景）。
    //
    // 做法同「數據總覽」一樣：一次性讀取（唔持續監聽），撳「重新整理
    // 資料」先再讀多次；搜尋喺本機（瀏覽器）記憶體入面做，唔使每打
    // 一個字都問一次 Firestore。
    let adminSupportUsersCache = null;
    let adminSupportUsersCacheLoading = false;
    let adminSupportQuery = '';
    let adminSupportSelectedUid = null;
    let adminSupportPointsGrantAmount = 0;
    let adminSupportStickerGrantDraft = { stickerId: null, qty: 1 };

    async function loadAdminSupportUsersCache() {
      if (!window.db || !window.fs) return;
      // v1.229.3：「全部用戶」表格已在即時監聽 users，直接沿用，不重複讀取
      if (adminUsersLastSortedDocs) {
        mergeIntoSupportCache(adminUsersLastSortedDocs);
        renderAdminSupportTab();
        return;
      }
      if (adminTabShowing('users')) { adminSupportUsersCacheLoading = true; return; }
      adminSupportUsersCacheLoading = true;
      renderAdminSupportTab();
      try {
        const snap = await window.fs.getDocs(window.fs.collection(window.db, 'users'));
        adminSupportUsersCache = snap.docs.map(d => ({ uid: d.id, data: d.data() }));
      } catch (err) {
        console.error('載入用戶支援資料失敗:', err);
        adminSupportUsersCache = [];
      } finally {
        adminSupportUsersCacheLoading = false;
        renderAdminSupportTab();
      }
    }
    window.adminRefreshSupportUsers = function() { loadAdminSupportUsersCache(); };

    function renderSupportUserDetailCard(u) {
      const d = u.data;
      const uid = u.uid;
      const suspended = window.isSuspendedNow ? window.isSuspendedNow(d) : !!d.suspended;
      const displayEmail = d.contactEmail || d.email || '—';
      const createdMs = typeof d.createdAt === 'number' ? d.createdAt : (d.createdAt ? new Date(d.createdAt).getTime() : 0);
      const createdDisplay = createdMs ? new Date(createdMs).toLocaleString('zh-HK') : '—';
      const lastLoginDisplay = (typeof formatLastLoginDisplay === 'function') ? formatLastLoginDisplay(d.lastLoginAt) : '—';

      const stickerOptions = GACHA_STICKERS.map(s => `<option value="${s.id}" ${adminSupportStickerGrantDraft.stickerId === s.id ? 'selected' : ''}>${escapeHtml(s.name)}（#${s.id}）</option>`).join('');

      return `
        <div class="admin-card">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
            <h3 style="font-size:17px; font-weight:bold; color:var(--brand-800); margin:0;">${escapeHtml(d.username || '—')}${suspensionLabelHtml(d)}</h3>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              ${d.strikeCount > 0 ? `<button type="button" class="btn btn-outline" style="font-size:13px; padding:4px 10px;" onclick="adminResetStrikes('${uid}')">${window.t('admin.s205', '重設違規次數')}</button>` : ''}
              <button type="button" class="btn ${suspended ? 'btn-primary' : 'btn-red'}" style="font-size:13px; padding:4px 10px;" onclick="adminToggleSuspendUser('${uid}', ${!suspended})">${suspended ? window.t('admin.s203', '解除停權') : window.t('admin.s204', '永久停權')}</button>
            </div>
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:10px; font-size:13px; color:#555; margin-bottom:18px;">
            <div><b>${window.t('admin.s463', '帳號ID：')}</b>${escapeHtml(d.loginId || window.t('lb.notSet', '未設定'))}</div>
            <div><b>${window.t('admin.s464', '合資格溫習日數：')}</b>${typeof d.qualifiedDays === 'number' ? d.qualifiedDays + window.t('admin.s451', ' 日') : window.t('admin.s452', '未開始記錄')}</div>
            <div><b>Email：</b>${escapeHtml(displayEmail)}</div>
            <div><b>${window.t('admin.s465', '學校：')}</b>${escapeHtml(d.school || '—')}</div>
            <div><b>${window.t('admin.s466', '年級：')}</b>${escapeHtml(d.grade || '—')}</div>
            <div><b>${window.t('admin.s467', '身份：')}</b>${d.accountType === 'tutor' ? window.t('tutorview.defaultName', '導師') : window.t('admin.s453', '學生')}</div>
            <div><b>${window.t('admin.s468', '學校電郵：')}</b>${d.schoolEmailStatus === 'verified' && !d.schoolEmail ? window.t('admin.s454', '已驗證（管理員代設）') : d.schoolEmail ? escapeHtml(d.schoolEmail) + '（' + ({ verified: window.t('profile.emailVerifiedBadge', '已驗證'), pendingDomain: window.t('admin.s455', '待審批學校'), rejected: window.t('admin.s456', '已拒絕'), revoked: window.t('admin.s457', '已取消') }[d.schoolEmailStatus] || '—') + '）' : window.t('profile.emailNotVerifiedBadge', '未驗證')}</div>
            <div><b>${window.t('admin.s469', '本學年已確認學歷：')}</b>${typeof d.educationConfirmedYear === 'number' ? d.educationConfirmedYear + '/' + String(d.educationConfirmedYear + 1).slice(-2) : window.t('admin.s458', '未確認')}</div>
            <div><b>${window.t('admin.s470', '出生年月：')}</b>${d.birthYear ? escapeHtml(String(d.birthYear)) + window.t('admin.s459', ' 年') + (d.birthMonth ? ' ' + escapeHtml(String(d.birthMonth)) + window.t('admin.s460', ' 月') : '') : window.t('common.notFilled', '未填寫')}</div>
            <div><b>${window.t('admin.s471', '現存 PTS：')}</b>${d.points || 0}</div>
            <div><b>${window.t('myacc.hoursLabel', '累積時數：')}</b>${(parseFloat(d.hours) || 0).toFixed(1)}</div>
            <div><b>EXP：</b>${d.exp || 0}</div>
            <div><b>${window.t('admin.s472', '註冊時間：')}</b>${createdDisplay}</div>
            <div><b>${window.t('admin.s473', '最後上線：')}</b>${lastLoginDisplay}</div>
          </div>

          <div style="border-top:1px solid #F0F0F0; padding-top:14px; margin-bottom:14px;">
            <h4 style="font-size:14px; font-weight:bold; color:var(--brand-700); margin-bottom:8px;">${window.t('admin.s474', '補發／扣減 PTS')}</h4>
            <p style="font-size:13px; color:#999; margin-bottom:8px;">${window.t('admin.s475', '正數為補發，負數為扣減（例如處理爭議或錯誤發放）。')}</p>
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
              <input type="number" step="1" value="${adminSupportPointsGrantAmount}" style="width:120px; font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px;" oninput="adminUpdateSupportPointsAmount(this.value)">
              <button type="button" class="btn btn-primary" style="font-size:13px; padding:6px 16px;" onclick="adminGrantSupportPoints('${uid}')">${window.t('admin.s476', '確認')}</button>
            </div>
          </div>

          <div style="border-top:1px solid #F0F0F0; padding-top:14px; margin-bottom:14px;">
            <h4 style="font-size:14px; font-weight:bold; color:var(--brand-700); margin-bottom:8px;">${window.t('admin.s477', '學校電郵驗證（管理員代為處理）')}</h4>
            <p style="font-size:13px; color:#999; margin-bottom:8px;">${window.t('admin.s478', '只用於測試，或已用其他方式核實學生身份的特殊個案。中學生帳戶仍須同時符合：學歷為中學生、未滿 20 歲、已確認本學年學歷。')}</p>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              ${d.schoolEmailStatus === 'verified'
                ? `<button type="button" class="btn btn-outline" style="font-size:13px; padding:6px 16px;" onclick="adminSetSchoolVerified('${uid}', false)">${window.t('admin.s461', '取消學校電郵驗證')}</button>`
                : `<button type="button" class="btn btn-primary" style="font-size:13px; padding:6px 16px;" onclick="adminSetSchoolVerified('${uid}', true)">${window.t('admin.s462', '設為已驗證')}</button>`}
            </div>
          </div>

          <div style="border-top:1px solid #F0F0F0; padding-top:14px; margin-bottom:14px;">
            <h4 style="font-size:14px; font-weight:bold; color:var(--brand-700); margin-bottom:8px;">${window.t('admin.s479', '更正出生年月')}</h4>
            <p style="font-size:13px; color:#999; margin-bottom:8px;">${window.t('admin.s480', '用戶不能自行修改出生年月；如用戶電郵要求補填或更正，請先核實後在此修改。直播的最低開播年齡以此計算。')}</p>
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
              <input id="admin-birth-year-${uid}" type="number" min="1930" max="${new Date().getFullYear()}" step="1" placeholder="${window.t('admin.s481', '年份')}" value="${d.birthYear || ''}" style="width:110px; font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px;"> ${window.t('auth.yearOption', '年')}
              <input id="admin-birth-month-${uid}" type="number" min="1" max="12" step="1" placeholder="${window.t('admin.s482', '月份')}" value="${d.birthMonth || ''}" style="width:80px; font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px;"> ${window.t('auth.monthOption', '月')}
              <button type="button" class="btn btn-primary" style="font-size:13px; padding:6px 16px;" onclick="adminSetBirthDate('${uid}')">${window.t('common.save', '儲存')}</button>
            </div>
          </div>

          <div style="border-top:1px solid #F0F0F0; padding-top:14px;">
            <h4 style="font-size:14px; font-weight:bold; color:var(--brand-700); margin-bottom:8px;">${window.t('admin.s483', '補發貼紙')}</h4>
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
              <select style="font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px; max-width:240px;" onchange="adminUpdateSupportStickerDraft('stickerId', this.value)">${stickerOptions}</select>
              <input type="number" min="1" step="1" value="${adminSupportStickerGrantDraft.qty}" style="width:90px; font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px;" oninput="adminUpdateSupportStickerDraft('qty', this.value)">
              <button type="button" class="btn btn-primary" style="font-size:13px; padding:6px 16px;" onclick="adminGrantSupportSticker('${uid}')">${window.t('admin.s476', '確認')}</button>
            </div>
          </div>
        </div>
      `;
    }

    function renderAdminSupportTab() {
      const container = document.getElementById('admin-tab-support');
      if (!container) return;

      if (!adminSupportUsersCache && !adminSupportUsersCacheLoading) {
        loadAdminSupportUsersCache();
        return;
      }
      if (adminSupportUsersCacheLoading && !adminSupportUsersCache) {
        container.innerHTML = ('<p style="text-align:center; color:#999; padding:20px;">' + window.t('admin.s484', '載入中用戶資料...') + '</p>');
        return;
      }

      const q = adminSupportQuery.trim().toLowerCase();
      const matches = q ? (adminSupportSearchResults || []) : [];

      const selected = adminSupportSelectedUid ? adminSupportUsersCache.find(u => u.uid === adminSupportSelectedUid) : null;

      container.innerHTML = `
        <div class="admin-card" style="margin-bottom:16px;">
          <h3 style="font-size:16px; font-weight:bold; color:var(--brand-800); margin-bottom:10px;">${window.t('admin.s486', '搜尋用戶')}</h3>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <form style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;" onsubmit="event.preventDefault(); adminUpdateSupportQuery(document.getElementById('admin-support-q').value);">
            <input id="admin-support-q" type="search" enterkeyhint="search" placeholder="${window.t('admin.s487', '輸入帳號 ID／用戶名／電郵（開頭相符即可）')}" value="${escapeHtml(adminSupportQuery)}" style="flex:1; min-width:220px; font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px;">
            <button type="submit" class="btn btn-primary" style="font-size:14px; padding:7px 18px;">${window.t('social.searchBtn', '搜尋')}</button>
          </form>
          <p style="font-size:13px; color:#999; margin-top:8px;">${window.t('admin.s488', '輸入帳號 ID、用戶名或電郵的開頭（或完整 UID），然後按「搜尋」或 Enter。')}</p>
          ${q ? `
            <div style="margin-top:12px; max-height:260px; overflow-y:auto;">
              ${matches.length === 0 ? ('<p style="color:#999; font-size:13px;">' + window.t('admin.s485', '找不到相關用戶') + '</p>') : matches.map(u => `
                <div style="padding:8px 10px; border-bottom:1px solid #F0F0F0; cursor:pointer; ${adminSupportSelectedUid === u.uid ? 'background:var(--brand-50);' : ''}" onclick="adminSelectSupportUser('${u.uid}')">
                  <b>${escapeHtml(u.data.username || '—')}</b>
                  <span style="color:#888; font-size:13px;"> ／ ${escapeHtml(u.data.loginId || window.t('lb.notSet', '未設定'))} ／ ${escapeHtml(u.data.contactEmail || u.data.email || '—')}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
        ${selected ? renderSupportUserDetailCard(selected) : ''}
      `;
    }
    window.renderAdminSupportTab = renderAdminSupportTab;

    // v1.230.0：搜尋改為向伺服器查詢（帳號 ID／用戶名／電郵開頭相符），唔使預先載入全部用戶
    let adminSupportSearchResults = [];
    window.adminUpdateSupportQuery = async function(value) {
      adminSupportQuery = value;
      const raw = String(value || '').trim();
      if (!raw) { adminSupportSearchResults = []; renderAdminSupportTab(); return; }
      const col = window.fs.collection(window.db, 'users');
      const variants = Array.from(new Set([raw, raw.toLowerCase()]));
      const fields = ['loginId', 'username', 'contactEmail'];
      const tasks = [];
      fields.forEach(f => variants.forEach(v => tasks.push(
        window.fs.getDocs(window.fs.query(col, window.fs.where(f, '>=', v), window.fs.where(f, '<=', v + '\uf8ff'), window.fs.limit(10))).catch(() => null)
      )));
      tasks.push(window.fs.getDoc(window.fs.doc(window.db, 'users', raw)).catch(() => null));
      const results = await Promise.all(tasks);
      const seen = new Map();
      results.forEach(r => {
        if (!r) return;
        const docs = r.docs ? r.docs : (r.exists && r.exists() ? [r] : []);
        docs.forEach(d => seen.set(d.id, d));
      });
      const docs = Array.from(seen.values());
      mergeIntoSupportCache(docs);
      adminSupportSearchResults = docs.map(d => ({ uid: d.id, data: d.data() })).slice(0, 20);
      renderAdminSupportTab();
    };

    window.adminSelectSupportUser = function(uid, scroll) {
      adminSupportSelectedUid = uid;
      adminSupportPointsGrantAmount = 0;
      adminSupportStickerGrantDraft = { stickerId: (GACHA_STICKERS[0] && GACHA_STICKERS[0].id) || null, qty: 1 };
      renderAdminSupportTab();
      if (scroll) { const p = document.getElementById('admin-tab-support'); if (p) p.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    };

    window.adminUpdateSupportPointsAmount = function(value) {
      const n = parseInt(value, 10);
      adminSupportPointsGrantAmount = Number.isFinite(n) ? n : 0;
    };

    // v1.228.4：管理員代用戶補填／更正出生年月（用戶自己改不到，見 firestore.rules selfUserUpdateOk）
    // v1.229.2：管理員代為設定學校電郵驗證（測試或特殊個案）
    window.adminSetSchoolVerified = async function(uid, on) {
      if (!(await window.appConfirm(on ? window.t('admin.s489', '確定將這位用戶的學校電郵設為已驗證？請確認已用其他方式核實其中學生身份。') : window.t('admin.s490', '確定取消這位用戶的學校電郵驗證？對方將不能再進入中學生溫習室。')))) return;
      try {
        const upd = on
          ? { schoolEmailStatus: 'verified', schoolEmailVerifiedAt: Date.now(), schoolEmailManualBy: (window.currentUser && window.currentUser.loginId) || null }
          : { schoolEmailStatus: 'revoked' };
        await window.fs.updateDoc(window.fs.doc(window.db, 'users', uid), upd);
        await logAdminAction(on ? '代設學校電郵已驗證' : '取消學校電郵驗證', { uid });
        const cached = adminSupportUsersCache && adminSupportUsersCache.find(u => u.uid === uid);
        if (cached) Object.assign(cached.data, upd);
        window.showToast(window.t('admin.s491', '已更新'), '✅');
        renderAdminSupportTab();
      } catch (err) {
        window.showToast(window.t('tutor.s66', '更新失敗：') + (err.message || err), '❌');
      }
    };

    window.adminSetBirthDate = async function(uid) {
      const y = parseInt((document.getElementById('admin-birth-year-' + uid) || {}).value, 10);
      const m = parseInt((document.getElementById('admin-birth-month-' + uid) || {}).value, 10);
      const thisYear = new Date().getFullYear();
      if (!(y >= 1930 && y <= thisYear) || !(m >= 1 && m <= 12)) { window.showToast(window.t('admin.s492', '請輸入有效的年份及月份'), '⚠️'); return; }
      if (!(await window.appConfirm(`${window.t('admin.s493', '確定將這位用戶的出生年月設為')} ${y} ${window.t('auth.yearOption', '年')} ${m} ${window.t('admin.s494', '月？')}`))) return;
      try {
        await window.fs.updateDoc(window.fs.doc(window.db, 'users', uid), { birthYear: y, birthMonth: m });
        await logAdminAction('更正出生年月', { uid, birthYear: y, birthMonth: m });
        const cached = adminSupportUsersCache && adminSupportUsersCache.find(u => u.uid === uid);
        if (cached) { cached.data.birthYear = y; cached.data.birthMonth = m; }
        window.showToast(window.t('admin.s495', '已更新出生年月'), '✅');
        renderAdminSupportTab();
      } catch (err) {
        window.showToast(window.t('tutor.s66', '更新失敗：') + (err.message || err), '❌');
      }
    };

    window.adminGrantSupportPoints = async function(uid) {
      const amount = adminSupportPointsGrantAmount;
      if (!amount) {
        window.showToast(window.t('admin.s496', '請輸入不是 0 的數值'), '⚠️');
        return;
      }
      if (!(await window.appConfirm(`${window.t('admin.s499', '確定為這位用戶')}${amount > 0 ? window.t('admin.s497', '補發') : window.t('admin.s498', '扣減')} ${Math.abs(amount)} PTS？`))) return;
      try {
        await window.fs.updateDoc(window.fs.doc(window.db, 'users', uid), { points: window.fs.increment(amount) });
        await logAdminAction('補發／扣減PTS', { uid, amount });
        window.showToast(`${window.t('admin.s500', '已')}${amount > 0 ? window.t('admin.s497', '補發') : window.t('admin.s498', '扣減')} ${Math.abs(amount)} PTS`, '✅');
        adminSupportPointsGrantAmount = 0;
        // 更新返cache入面嗰份本地資料，等卡片即刻反映新數值，唔使成頁
        // 重新載入先至見到最新數字
        const cached = adminSupportUsersCache.find(u => u.uid === uid);
        if (cached) cached.data.points = (cached.data.points || 0) + amount;
        renderAdminSupportTab();
      } catch (err) {
        window.showToast(window.t('admin.s194', '操作失敗：') + (err.message || err), '❌');
      }
    };

    window.adminUpdateSupportStickerDraft = function(key, value) {
      if (key === 'stickerId') {
        const n = parseInt(value, 10);
        adminSupportStickerGrantDraft.stickerId = Number.isFinite(n) ? n : adminSupportStickerGrantDraft.stickerId;
      } else if (key === 'qty') {
        const n = parseInt(value, 10);
        adminSupportStickerGrantDraft.qty = (Number.isFinite(n) && n > 0) ? n : 1;
      }
    };

    window.adminGrantSupportSticker = async function(uid) {
      const { stickerId, qty } = adminSupportStickerGrantDraft;
      if (!stickerId || !(qty > 0)) {
        window.showToast(window.t('admin.s501', '請揀返貼紙同數量'), '⚠️');
        return;
      }
      const sticker = GACHA_STICKERS.find(s => s.id === stickerId);
      if (!(await window.appConfirm(`${window.t('admin.s502', '確定為這位用戶補發')} ${qty} ${window.t('admin.s503', '張「')}${sticker ? sticker.name : '#' + stickerId}」？`))) return;
      try {
        const payload = {};
        payload['ownedStickers.' + stickerId] = window.fs.increment(qty);
        await window.fs.updateDoc(window.fs.doc(window.db, 'users', uid), payload);
        await logAdminAction('補發貼紙', { uid, stickerId, qty });
        window.showToast(`${window.t('admin.s504', '已補發')} ${qty} ${window.t('admin.s505', '張貼紙')}`, '✅');
        adminSupportStickerGrantDraft.qty = 1;
        renderAdminSupportTab();
      } catch (err) {
        window.showToast(window.t('admin.s194', '操作失敗：') + (err.message || err), '❌');
      }
    };

    // ---------- 管理員名單（第四階段第9項：管理員權限分級）----------
    // 之前要加／減管理員，一定要去 Firebase Console 手動改
    // admin_config/adminIds 文件（連欄位名都要打啱先得），而家喺Admin
    // 後台開返呢頁俾超級管理員自己管理，仲加埋「權限等級」呢個新概念
    // （見檔案頂部 window.ADMIN_ROLES 嗰段解釋）。
    let adminAdminListDraft = null;
    let adminListConfigLoaded = false;

    async function ensureAdminListLoaded() {
      if (adminListConfigLoaded) return;
      try {
        const snap = await window.fs.getDoc(window.fs.doc(window.db, 'admin_config', 'adminIds'));
        const data = snap.exists() ? snap.data() : {};
        const ids = Array.isArray(data.ids) ? data.ids : [];
        const roles = (data.roles && typeof data.roles === 'object') ? data.roles : {};
        adminAdminListDraft = {
          entries: ids.map(id => ({ loginId: id, role: roles[id] || 'super' })),
          newLoginId: '',
          newRole: 'support'
        };
      } catch (err) {
        console.error('載入管理員名單失敗:', err);
        adminAdminListDraft = { entries: [], newLoginId: '', newRole: 'support' };
      } finally {
        adminListConfigLoaded = true;
        renderAdminAdminListTab();
      }
    }

    function renderAdminAdminListTab() {
      const container = document.getElementById('admin-tab-adminlist');
      if (!container) return;
      if (!isCurrentUserSuperAdmin()) {
        container.innerHTML = ('<div class="admin-card" style="color:#c0392b;">' + window.t('admin.s506', '只有「超級管理員」可以查看此頁。') + '</div>');
        return;
      }
      if (!adminAdminListDraft) {
        if (!adminListConfigLoaded) {
          container.innerHTML = ('<p style="text-align:center; color:#999; padding:20px;">' + window.t('admin.s507', '載入中管理員名單...') + '</p>');
          ensureAdminListLoaded();
          return;
        }
      }
      const d = adminAdminListDraft;
      const myLoginId = window.currentUser && window.currentUser.loginId;

      const rows = d.entries.map((e, idx) => `
        <tr>
          <td>${escapeHtml(e.loginId)}${e.loginId === myLoginId ? (' <span style="color:#999; font-size:12px;">' + window.t('admin.s508', '（你自己）') + '</span>') : ''}</td>
          <td>
            <select style="font-size:14px; padding:5px 8px; border:1px solid #DCE5F4; border-radius:6px;" onchange="adminUpdateAdminListRole(${idx}, this.value)">
              <option value="super" ${e.role === 'super' ? 'selected' : ''}>${window.t('admin.s509', '超級管理員')}</option>
              <option value="support" ${e.role === 'support' ? 'selected' : ''}>${window.t('admin.s510', '客服／支援管理員')}</option>
            </select>
          </td>
          <td><button class="btn btn-red" style="font-size:13px; padding:3px 8px;" onclick="adminRemoveAdminListEntry(${idx})">${window.t('admin.s57', '移除')}</button></td>
        </tr>
      `).join('');

      container.innerHTML = `
        <div class="admin-card" style="margin-bottom:16px;">
          <h3 style="font-size:16px; font-weight:bold; color:var(--brand-800); margin-bottom:10px;">${window.t('html.s54', '管理員名單')}</h3>
          <p style="font-size:13px; color:#888; margin-bottom:10px;"><b>${window.t('admin.s509', '超級管理員')}</b>${window.t('admin.s512', '可以使用全部分頁及設定；')}<b>${window.t('admin.s510', '客服／支援管理員')}</b>${window.t('admin.s513', '只會看到日常客服及巡查所需的分頁（數據總覽、用戶管理、舉報處理、導師申請、學校電郵審批、溫習室監察、疑難解答區管理），看不到網站設定（扭蛋機、計分規則等）及這兩個管治分頁。')}</p>
          <p style="font-size:13px; color:#c17a2e; margin-bottom:14px;">${window.t('admin.s514', '注意：此分級主要是後台介面層面的限制（控制可以看到及點擊哪些分頁），部分設定另有資料庫規則保護，但並非完整的防內部人員保安措施，適合互相信任的小團隊使用。')}</p>
          <div style="overflow-x:auto;">
            <table class="admin-table">
              <thead><tr><th>${window.t('admin.s515', '帳號ID')}</th><th>${window.t('admin.s516', '權限等級')}</th><th></th></tr></thead>
              <tbody>${rows || ('<tr><td colspan="3" style="text-align:center; color:#999;">' + window.t('admin.s511', '未有任何管理員') + '</td></tr>')}</tbody>
            </table>
          </div>
        </div>
        <div class="admin-card" style="margin-bottom:16px;">
          <h3 style="font-size:15px; font-weight:bold; color:var(--brand-800); margin-bottom:10px;">${window.t('admin.s517', '新增管理員')}</h3>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            <input type="text" placeholder="${window.t('admin.s518', '帳號 ID（即用戶登入用的 ID，不是電郵）')}" value="${escapeHtml(d.newLoginId)}" style="flex:1; min-width:220px; font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px;" oninput="adminUpdateAdminListNewField('newLoginId', this.value)">
            <select style="font-size:15px; padding:8px 10px; border:1px solid #DCE5F4; border-radius:6px;" onchange="adminUpdateAdminListNewField('newRole', this.value)">
              <option value="super" ${d.newRole === 'super' ? 'selected' : ''}>${window.t('admin.s509', '超級管理員')}</option>
              <option value="support" ${d.newRole === 'support' ? 'selected' : ''}>${window.t('admin.s510', '客服／支援管理員')}</option>
            </select>
            <button type="button" class="btn btn-outline" style="font-size:13px; padding:6px 16px;" onclick="adminAddAdminListEntry()">${window.t('room.inviteJoinBtn', '加入')}</button>
          </div>
        </div>
        <div style="text-align:center;">
          <button type="button" class="btn btn-primary" id="btn-admin-save-adminlist" style="padding:12px 32px; font-size:15px;" onclick="adminSaveAdminList()">${window.t('admin.s100', '儲存全部改動')}</button>
        </div>
      `;
    }
    window.renderAdminAdminListTab = renderAdminAdminListTab;

    window.adminUpdateAdminListRole = function(idx, role) {
      if (!adminAdminListDraft || !adminAdminListDraft.entries[idx]) return;
      adminAdminListDraft.entries[idx].role = role;
    };

    window.adminRemoveAdminListEntry = async function(idx) {
      if (!adminAdminListDraft || !adminAdminListDraft.entries[idx]) return;
      if (!(await window.appConfirm(`${window.t('admin.s519', '確定要移除「')}${adminAdminListDraft.entries[idx].loginId}${window.t('admin.s520', '」的管理員身份？')}`))) return;
      adminAdminListDraft.entries.splice(idx, 1);
      renderAdminAdminListTab();
    };

    window.adminUpdateAdminListNewField = function(key, value) {
      if (!adminAdminListDraft) return;
      adminAdminListDraft[key] = value;
    };

    window.adminAddAdminListEntry = function() {
      if (!adminAdminListDraft) return;
      const loginId = (adminAdminListDraft.newLoginId || '').trim();
      if (!loginId) { window.showToast(window.t('admin.s521', '請輸入帳號ID'), '⚠️'); return; }
      if (adminAdminListDraft.entries.some(e => e.loginId === loginId)) {
        window.showToast(window.t('admin.s522', '此帳號已在管理員名單內'), '⚠️');
        return;
      }
      adminAdminListDraft.entries.push({ loginId, role: adminAdminListDraft.newRole || 'support' });
      adminAdminListDraft.newLoginId = '';
      renderAdminAdminListTab();
    };

    window.adminSaveAdminList = async function() {
      if (!adminAdminListDraft) return;
      const entries = adminAdminListDraft.entries;
      if (entries.length === 0) {
        window.showToast(window.t('admin.s523', '管理員名單不可以清空，否則將無法再進入管理後台'), '⚠️');
        return;
      }
      const superCount = entries.filter(e => e.role === 'super').length;
      if (superCount === 0) {
        window.showToast(window.t('admin.s524', '最少要有一位「超級管理員」，否則沒有人可以再管理這份名單'), '⚠️');
        return;
      }
      const myLoginId = window.currentUser && window.currentUser.loginId;
      const stillAdmin = entries.some(e => e.loginId === myLoginId);
      const stillSuper = entries.some(e => e.loginId === myLoginId && e.role === 'super');
      if (!stillAdmin) {
        if (!(await window.appConfirm(window.t('admin.s525', '儲存後你將移除自己的管理員身份，並即時無法再進入管理後台。確定要這樣做嗎？')))) return;
      } else if (!stillSuper) {
        if (!(await window.appConfirm(window.t('admin.s526', '儲存後你將會降為「客服／支援管理員」，並立即無法查看此頁及其他設定分頁。確定要這樣做嗎？')))) return;
      }

      const ids = entries.map(e => e.loginId);
      const roles = {};
      entries.forEach(e => { roles[e.loginId] = e.role; });
      const payload = { ids, roles, updatedAt: Date.now(), updatedBy: window.currentUser ? window.currentUser.email : null };

      const btn = document.getElementById('btn-admin-save-adminlist');
      if (btn) { btn.disabled = true; btn.innerText = window.t('admin.s136', '儲存中…'); }
      try {
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'adminIds'), payload);
        await logAdminAction('更新管理員名單', { ids, roles });
        window.showToast(window.t('admin.s527', '管理員名單已儲存！'), '🎉');
        if (typeof window.loadAdminIdsFromFirestore === 'function') window.loadAdminIdsFromFirestore();
      } catch (err) {
        window.showToast(window.t('admin.s138', '儲存失敗：') + (err.message || err), '❌');
      } finally {
        if (btn) { btn.disabled = false; btn.innerText = window.t('admin.s100', '儲存全部改動'); }
      }
    };

    // ---------- 操作紀錄（第四階段第10項：Audit Log）----------
    let adminAuditLogEntries = null;
    let adminAuditLogLoading = false;

    async function loadAdminAuditLog() {
      if (!window.db || !window.fs) return;
      adminAuditLogLoading = true;
      renderAdminAuditLogTab();
      try {
        const q = window.fs.query(
          window.fs.collection(window.db, 'adminAuditLog'),
          window.fs.orderBy('createdAt', 'desc'),
          window.fs.limit(100)
        );
        const snap = await window.fs.getDocs(q);
        adminAuditLogEntries = snap.docs.map(d => d.data());
      } catch (err) {
        console.error('載入操作紀錄失敗:', err);
        adminAuditLogEntries = [];
      } finally {
        adminAuditLogLoading = false;
        renderAdminAuditLogTab();
      }
    }
    window.adminRefreshAuditLog = function() { loadAdminAuditLog(); };

    function renderAdminAuditLogTab() {
      const container = document.getElementById('admin-tab-auditlog');
      if (!container) return;
      if (!isCurrentUserSuperAdmin()) {
        container.innerHTML = ('<div class="admin-card" style="color:#c0392b;">' + window.t('admin.s506', '只有「超級管理員」可以查看此頁。') + '</div>');
        return;
      }
      if (!adminAuditLogEntries && !adminAuditLogLoading) {
        loadAdminAuditLog();
        return;
      }
      if (adminAuditLogLoading && !adminAuditLogEntries) {
        container.innerHTML = ('<p style="text-align:center; color:#999; padding:20px;">' + window.t('admin.s528', '載入中操作紀錄...') + '</p>');
        return;
      }
      const rows = adminAuditLogEntries.map(e => {
        const when = e.createdAt ? new Date(e.createdAt).toLocaleString('zh-HK') : '—';
        const who = e.adminLoginId || e.adminEmail || '—';
        const detailsText = e.details ? (typeof e.details === 'string' ? e.details : JSON.stringify(e.details)) : '';
        return `<tr><td style="white-space:nowrap;">${when}</td><td>${escapeHtml(who)}</td><td>${escapeHtml(e.action || '—')}</td><td style="font-size:12px; color:#888; max-width:320px; word-break:break-all;">${escapeHtml(detailsText)}</td></tr>`;
      }).join('');

      container.innerHTML = `
        <div class="admin-card" style="margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <p style="font-size:13px; color:#888; margin:0;">${window.t('admin.s530', '顯示最近')} ${adminAuditLogEntries.length} ${window.t('admin.s531', '筆重要操作紀錄（停權、補發分數／貼紙、強制關房、導師審批、管理員名單異動等）。清單於打開或重新整理此頁時讀取，如需最新紀錄，請點擊右邊的按鈕。')}</p>
          <button type="button" class="btn btn-outline" style="font-size:13px; padding:6px 14px;" onclick="window.adminRefreshAuditLog()">${window.t('admin.s221', '重新整理')}</button>
        </div>
        <div class="admin-card">
          <div style="overflow-x:auto;">
            <table class="admin-table">
              <thead><tr><th>${window.t('admin.s532', '時間')}</th><th>${window.t('admin.s213', '管理員')}</th><th>${window.t('admin.s533', '操作')}</th><th>${window.t('admin.s534', '詳情')}</th></tr></thead>
              <tbody>${rows || ('<tr><td colspan="4" style="text-align:center; color:#999;">' + window.t('admin.s529', '暫時未有任何紀錄') + '</td></tr>')}</tbody>
            </table>
          </div>
        </div>
      `;
    }
    window.renderAdminAuditLogTab = renderAdminAuditLogTab;
    let adminNewSubjectName = '';
    let adminNewSubjectNameEn = '';

    function renderAdminSubjectsTab() {
      const container = document.getElementById('admin-tab-subjects');
      if (!container) return;
      if (!isCurrentUserSuperAdmin()) {
        container.innerHTML = ('<div class="admin-card" style="color:#c0392b;">' + window.t('admin.s506', '只有「超級管理員」可以查看此頁。') + '</div>');
        return;
      }
      if (!subjectListConfigLoaded) {
        container.innerHTML = ('<p style="text-align:center; color:#999; padding:20px;">' + window.t('admin.s535', '載入中科目清單...') + '</p>');
        return;
      }
      const addedNames = new Set(((window.ADMIN_SUBJECT_LIST_RAW && window.ADMIN_SUBJECT_LIST_RAW.subjects) || []).map((s) => s.name));
      const rows = (window.TUTOR_DSE_SUBJECTS || []).filter((s) => s !== '其他（自行輸入）').map((s) => {
        const isAdded = addedNames.has(s);
        const enName = (window.DSE_SUBJECT_EN_NAMES && window.DSE_SUBJECT_EN_NAMES[s]) || '—';
        return `<tr><td>${escapeHtml(s)}</td><td style="color:#888;">${escapeHtml(enName)}</td><td>${isAdded ? ('<span style="color:#3F588F;">' + window.t('admin.s536', '後台新增') + '</span>') : ('<span style="color:#999;">' + window.t('admin.s537', '內建') + '</span>')}</td></tr>`;
      }).join('');

      container.innerHTML = `
        <div class="admin-card" style="margin-bottom:16px;">
          <p style="font-size:13px; color:#888; margin:0;">${window.t('admin.s538', '此處顯示全站使用的 HKDSE 科目清單（用於導師「想教的科目」及教材管理「新增科目」）。為免影響已使用這些科目名稱的帖子、房間及導師申請資料，此頁只可以')}<b>${window.t('tutormat.addBtn', '新增')}</b>${window.t('admin.s539', '科目，不支援改名或刪除；如新增錯誤，請聯絡開發者處理。')}</p>
        </div>
        <div class="admin-card" style="margin-bottom:16px;">
          <p style="font-size:13px; font-weight:bold; margin-bottom:8px;">${window.t('admin.s540', '➕ 新增科目')}</p>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end;">
            <div style="flex:1; min-width:160px;">
              <label style="font-size:12px; color:#888; display:block;">${window.t('admin.s541', '科目中文名稱 *')}</label>
              <input type="text" class="input-field" value="${escapeHtml(adminNewSubjectName)}" oninput="window.adminUpdateNewSubjectField('name', this.value)" placeholder="${window.t('admin.s542', '例如：資訊科技概論')}">
            </div>
            <div style="flex:1; min-width:160px;">
              <label style="font-size:12px; color:#888; display:block;">${window.t('admin.s543', '科目英文名稱（English顯示用，可留空）')}</label>
              <input type="text" class="input-field" value="${escapeHtml(adminNewSubjectNameEn)}" oninput="window.adminUpdateNewSubjectField('nameEn', this.value)" placeholder="e.g. Information Technology">
            </div>
            <button type="button" class="btn btn-primary" style="height:38px;" onclick="window.adminAddSubject()">${window.t('tutormat.addBtn', '新增')}</button>
          </div>
        </div>
        <div class="admin-card">
          <div style="overflow-x:auto;">
            <table class="admin-table">
              <thead><tr><th>${window.t('admin.s544', '科目（中文）')}</th><th>English</th><th>${window.t('admin.s545', '來源')}</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      `;
    }
    window.renderAdminSubjectsTab = renderAdminSubjectsTab;

    window.adminUpdateNewSubjectField = function(key, value) {
      if (key === 'name') adminNewSubjectName = value;
      else if (key === 'nameEn') adminNewSubjectNameEn = value;
    };

    window.adminAddSubject = async function() {
      const name = (adminNewSubjectName || '').trim();
      const nameEn = (adminNewSubjectNameEn || '').trim();
      if (!name) { window.showToast(window.t('admin.s546', '請輸入科目中文名稱'), '⚠️'); return; }
      if (window.TUTOR_DSE_SUBJECTS && window.TUTOR_DSE_SUBJECTS.includes(name)) {
        window.showToast(window.t('admin.s547', '此科目已在清單內'), '⚠️');
        return;
      }
      try {
        const ref = window.fs.doc(window.db, 'admin_config', 'subjectList');
        const existing = (window.ADMIN_SUBJECT_LIST_RAW && Array.isArray(window.ADMIN_SUBJECT_LIST_RAW.subjects)) ? window.ADMIN_SUBJECT_LIST_RAW.subjects.slice() : [];
        existing.push({ name, nameEn: nameEn || null });
        await window.fs.setDoc(ref, { subjects: existing, updatedAt: Date.now(), updatedBy: (window.currentUser && window.currentUser.loginId) || null });
        await logAdminAction('新增科目', { name, nameEn });
        adminNewSubjectName = '';
        adminNewSubjectNameEn = '';
        window.showToast(window.t('tutor.s10', '已新增科目'), '✅');
      } catch (err) {
        window.showToast(window.t('admin.s548', '新增失敗：') + (err.message || err), '❌');
      }
    };
    let adminNewDistrictRegion = '';
    let adminNewDistrictName = '';
    let adminNewDistrictNameEn = '';

    function renderAdminDistrictsTab() {
      const container = document.getElementById('admin-tab-districts');
      if (!container) return;
      if (!isCurrentUserSuperAdmin()) {
        container.innerHTML = ('<div class="admin-card" style="color:#c0392b;">' + window.t('admin.s506', '只有「超級管理員」可以查看此頁。') + '</div>');
        return;
      }
      if (!districtListConfigLoaded) {
        container.innerHTML = ('<p style="text-align:center; color:#999; padding:20px;">' + window.t('admin.s549', '載入中地區清單...') + '</p>');
        return;
      }
      const addedNames = new Set(((window.ADMIN_DISTRICT_LIST_RAW && window.ADMIN_DISTRICT_LIST_RAW.districts) || []).map((d) => d.name));
      const groupsHtml = (window.HK_DISTRICT_REGION_GROUPS || []).map((g) => {
        const rows = g.districts.map((d) => {
          const isAdded = addedNames.has(d);
          const enName = (window.HK_DISTRICT_EN_NAMES && window.HK_DISTRICT_EN_NAMES[d]) || '—';
          return `<tr><td>${escapeHtml(d)}</td><td style="color:#888;">${escapeHtml(enName)}</td><td>${isAdded ? ('<span style="color:#3F588F;">' + window.t('admin.s536', '後台新增') + '</span>') : ('<span style="color:#999;">' + window.t('admin.s537', '內建') + '</span>')}</td></tr>`;
        }).join('');
        return `<p style="font-size:13px; font-weight:bold; margin:12px 0 6px;">${escapeHtml(g.region)}</p><table class="admin-table"><thead><tr><th>${window.t('admin.s550', '地區')}</th><th>English</th><th>${window.t('admin.s545', '來源')}</th></tr></thead><tbody>${rows}</tbody></table>`;
      }).join('');
      const regionOptionsHtml = (window.HK_DISTRICT_REGION_GROUPS || []).map((g) => `<option value="${escapeHtml(g.region)}"></option>`).join('');

      container.innerHTML = `
        <div class="admin-card" style="margin-bottom:16px;">
          <p style="font-size:13px; color:#888; margin:0;">${window.t('admin.s551', '此處顯示全站使用的香港地區清單（用於註冊表格選擇學校地區及分區溫習排行榜）。與科目清單一樣，只可以')}<b>${window.t('tutormat.addBtn', '新增')}</b>${window.t('admin.s552', '，不支援改名或刪除。')}</p>
        </div>
        <div class="admin-card" style="margin-bottom:16px;">
          <p style="font-size:13px; font-weight:bold; margin-bottom:8px;">${window.t('admin.s553', '➕ 新增地區')}</p>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end;">
            <div style="flex:1; min-width:140px;">
              <label style="font-size:12px; color:#888; display:block;">${window.t('admin.s554', '所屬分區 *')}</label>
              <input type="text" class="input-field" list="admin-district-region-options" value="${escapeHtml(adminNewDistrictRegion)}" oninput="window.adminUpdateNewDistrictField('region', this.value)" placeholder="${window.t('admin.s555', '香港島／九龍／新界')}">
              <datalist id="admin-district-region-options">${regionOptionsHtml}</datalist>
            </div>
            <div style="flex:1; min-width:140px;">
              <label style="font-size:12px; color:#888; display:block;">${window.t('admin.s556', '地區名稱 *')}</label>
              <input type="text" class="input-field" value="${escapeHtml(adminNewDistrictName)}" oninput="window.adminUpdateNewDistrictField('name', this.value)" placeholder="${window.t('admin.s557', '例如：將軍澳區')}">
            </div>
            <div style="flex:1; min-width:140px;">
              <label style="font-size:12px; color:#888; display:block;">${window.t('admin.s558', '地區英文名稱（可留空）')}</label>
              <input type="text" class="input-field" value="${escapeHtml(adminNewDistrictNameEn)}" oninput="window.adminUpdateNewDistrictField('nameEn', this.value)" placeholder="e.g. Tseung Kwan O">
            </div>
            <button type="button" class="btn btn-primary" style="height:38px;" onclick="window.adminAddDistrict()">${window.t('tutormat.addBtn', '新增')}</button>
          </div>
        </div>
        <div class="admin-card">${groupsHtml}</div>
      `;
    }
    window.renderAdminDistrictsTab = renderAdminDistrictsTab;

    window.adminUpdateNewDistrictField = function(key, value) {
      if (key === 'region') adminNewDistrictRegion = value;
      else if (key === 'name') adminNewDistrictName = value;
      else if (key === 'nameEn') adminNewDistrictNameEn = value;
    };

    window.adminAddDistrict = async function() {
      const region = (adminNewDistrictRegion || '').trim();
      const name = (adminNewDistrictName || '').trim();
      const nameEn = (adminNewDistrictNameEn || '').trim();
      if (!region || !name) { window.showToast(window.t('admin.s559', '請填寫所屬分區同地區名稱'), '⚠️'); return; }
      const alreadyExists = (window.HK_DISTRICT_REGION_GROUPS || []).some((g) => g.districts.includes(name));
      if (alreadyExists) { window.showToast(window.t('admin.s560', '此地區已在清單內'), '⚠️'); return; }
      try {
        const ref = window.fs.doc(window.db, 'admin_config', 'districtList');
        const existing = (window.ADMIN_DISTRICT_LIST_RAW && Array.isArray(window.ADMIN_DISTRICT_LIST_RAW.districts)) ? window.ADMIN_DISTRICT_LIST_RAW.districts.slice() : [];
        existing.push({ region, name, nameEn: nameEn || null });
        await window.fs.setDoc(ref, { districts: existing, updatedAt: Date.now(), updatedBy: (window.currentUser && window.currentUser.loginId) || null });
        await logAdminAction('新增地區', { region, name, nameEn });
        adminNewDistrictRegion = '';
        adminNewDistrictName = '';
        adminNewDistrictNameEn = '';
        window.showToast(window.t('admin.s561', '已新增地區'), '✅');
      } catch (err) {
        window.showToast(window.t('admin.s548', '新增失敗：') + (err.message || err), '❌');
      }
    };
    let adminNewSecondarySchoolName = '';
    let adminNewSecondarySchoolDistrict = '';
    let adminNewTertiaryName = '';
    let adminNewTertiaryDistrict = '';

    function renderAdminSchoolsTab() {
      const container = document.getElementById('admin-tab-schools');
      if (!container) return;
      if (!isCurrentUserSuperAdmin()) {
        container.innerHTML = ('<div class="admin-card" style="color:#c0392b;">' + window.t('admin.s506', '只有「超級管理員」可以查看此頁。') + '</div>');
        return;
      }
      if (!schoolListConfigLoaded) {
        container.innerHTML = ('<p style="text-align:center; color:#999; padding:20px;">' + window.t('admin.s562', '載入中學校名單...') + '</p>');
        return;
      }
      const districtOptionsHtml = (window.HK_DISTRICT_REGION_GROUPS || []).map((g) =>
        `<optgroup label="${escapeHtml(g.region)}">${g.districts.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('')}</optgroup>`
      ).join('');
      const secondaryAdded = (window.ADMIN_SCHOOL_LIST_RAW && Array.isArray(window.ADMIN_SCHOOL_LIST_RAW.secondary)) ? window.ADMIN_SCHOOL_LIST_RAW.secondary : [];
      const tertiaryAdded = (window.ADMIN_SCHOOL_LIST_RAW && Array.isArray(window.ADMIN_SCHOOL_LIST_RAW.tertiary)) ? window.ADMIN_SCHOOL_LIST_RAW.tertiary : [];
      const secondaryRows = secondaryAdded.map((s) => `<tr><td>${escapeHtml(s.name)}</td><td style="color:#888;">${escapeHtml(s.district)}</td></tr>`).join('');
      const tertiaryRows = tertiaryAdded.map((t) => `<tr><td>${escapeHtml(t.name)}</td><td style="color:#888;">${t.district ? escapeHtml(t.district) : window.t('admin.s563', '常見院校（不分地區）')}</td></tr>`).join('');

      container.innerHTML = `
        <div class="admin-card" style="margin-bottom:16px;">
          <p style="font-size:13px; color:#888; margin:0;">${window.t('admin.s566', '此處可以新增註冊表格可選的中學及大專院校。與科目及地區清單一樣，只可以')}<b>${window.t('tutormat.addBtn', '新增')}</b>${window.t('admin.s567', '，不支援改名或刪除。下表只顯示在此新增的學校，內建的一千多間中學及院校不會逐一列出（可在註冊表格選擇地區查看完整清單）。')}</p>
        </div>
        <div class="admin-card" style="margin-bottom:16px;">
          <p style="font-size:13px; font-weight:bold; margin-bottom:8px;">${window.t('admin.s568', '➕ 新增中學')}</p>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end;">
            <div style="flex:1; min-width:180px;">
              <label style="font-size:12px; color:#888; display:block;">${window.t('admin.s569', '中學名稱 *')}</label>
              <input type="text" class="input-field" value="${escapeHtml(adminNewSecondarySchoolName)}" oninput="window.adminUpdateNewSchoolField('secondaryName', this.value)" placeholder="${window.t('admin.s570', '例如：XX中學')}">
            </div>
            <div style="flex:1; min-width:160px;">
              <label style="font-size:12px; color:#888; display:block;">${window.t('admin.s571', '所屬地區 *')}</label>
              <select class="input-field" onchange="window.adminUpdateNewSchoolField('secondaryDistrict', this.value)">
                <option value="">${window.t('admin.s572', '請選擇地區')}</option>
                ${districtOptionsHtml}
              </select>
            </div>
            <button type="button" class="btn btn-primary" style="height:38px;" onclick="window.adminAddSecondarySchool()">${window.t('tutormat.addBtn', '新增')}</button>
          </div>
        </div>
        <div class="admin-card" style="margin-bottom:16px;">
          <div style="overflow-x:auto;">
            <table class="admin-table">
              <thead><tr><th>${window.t('admin.s573', '中學（後台新增）')}</th><th>${window.t('admin.s550', '地區')}</th></tr></thead>
              <tbody>${secondaryRows || ('<tr><td colspan="2" style="text-align:center; color:#999;">' + window.t('admin.s564', '暫時未有在後台新增的中學') + '</td></tr>')}</tbody>
            </table>
          </div>
        </div>
        <div class="admin-card" style="margin-bottom:16px;">
          <p style="font-size:13px; font-weight:bold; margin-bottom:8px;">${window.t('admin.s574', '➕ 新增大專／大學')}</p>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end;">
            <div style="flex:1; min-width:180px;">
              <label style="font-size:12px; color:#888; display:block;">${window.t('auth.institutionNameLabel', '院校名稱 *')}</label>
              <input type="text" class="input-field" value="${escapeHtml(adminNewTertiaryName)}" oninput="window.adminUpdateNewSchoolField('tertiaryName', this.value)" placeholder="${window.t('admin.s575', '例如：XX學院')}">
            </div>
            <div style="flex:1; min-width:160px;">
              <label style="font-size:12px; color:#888; display:block;">${window.t('admin.s576', '所屬地區（可留空＝加入常見院校清單）')}</label>
              <select class="input-field" onchange="window.adminUpdateNewSchoolField('tertiaryDistrict', this.value)">
                <option value="">${window.t('admin.s577', '唔揀地區（常見院校）')}</option>
                ${districtOptionsHtml}
              </select>
            </div>
            <button type="button" class="btn btn-primary" style="height:38px;" onclick="window.adminAddTertiaryInstitution()">${window.t('tutormat.addBtn', '新增')}</button>
          </div>
        </div>
        <div class="admin-card">
          <div style="overflow-x:auto;">
            <table class="admin-table">
              <thead><tr><th>${window.t('admin.s578', '大專／大學（後台新增）')}</th><th>${window.t('admin.s550', '地區')}</th></tr></thead>
              <tbody>${tertiaryRows || ('<tr><td colspan="2" style="text-align:center; color:#999;">' + window.t('admin.s565', '暫時未有在後台新增的院校') + '</td></tr>')}</tbody>
            </table>
          </div>
        </div>
      `;
    }
    window.renderAdminSchoolsTab = renderAdminSchoolsTab;

    window.adminUpdateNewSchoolField = function(key, value) {
      if (key === 'secondaryName') adminNewSecondarySchoolName = value;
      else if (key === 'secondaryDistrict') adminNewSecondarySchoolDistrict = value;
      else if (key === 'tertiaryName') adminNewTertiaryName = value;
      else if (key === 'tertiaryDistrict') adminNewTertiaryDistrict = value;
    };

    window.adminAddSecondarySchool = async function() {
      const name = (adminNewSecondarySchoolName || '').trim();
      const district = (adminNewSecondarySchoolDistrict || '').trim();
      if (!name || !district) { window.showToast(window.t('admin.s579', '請填寫中學名稱同所屬地區'), '⚠️'); return; }
      const alreadyExists = window.HK_SECONDARY_SCHOOLS_BY_DISTRICT && Object.values(window.HK_SECONDARY_SCHOOLS_BY_DISTRICT).some((list) => list.includes(name));
      if (alreadyExists) { window.showToast(window.t('admin.s580', '此中學已在清單內'), '⚠️'); return; }
      try {
        const ref = window.fs.doc(window.db, 'admin_config', 'schoolList');
        const existingSecondary = (window.ADMIN_SCHOOL_LIST_RAW && Array.isArray(window.ADMIN_SCHOOL_LIST_RAW.secondary)) ? window.ADMIN_SCHOOL_LIST_RAW.secondary.slice() : [];
        const existingTertiary = (window.ADMIN_SCHOOL_LIST_RAW && Array.isArray(window.ADMIN_SCHOOL_LIST_RAW.tertiary)) ? window.ADMIN_SCHOOL_LIST_RAW.tertiary.slice() : [];
        existingSecondary.push({ name, district });
        await window.fs.setDoc(ref, { secondary: existingSecondary, tertiary: existingTertiary, updatedAt: Date.now(), updatedBy: (window.currentUser && window.currentUser.loginId) || null });
        await logAdminAction('新增中學', { name, district });
        adminNewSecondarySchoolName = '';
        adminNewSecondarySchoolDistrict = '';
        window.showToast(window.t('admin.s581', '已新增中學'), '✅');
      } catch (err) {
        window.showToast(window.t('admin.s548', '新增失敗：') + (err.message || err), '❌');
      }
    };

    window.adminAddTertiaryInstitution = async function() {
      const name = (adminNewTertiaryName || '').trim();
      const district = (adminNewTertiaryDistrict || '').trim();
      if (!name) { window.showToast(window.t('core.enterInstitutionName', '請輸入院校名稱'), '⚠️'); return; }
      const inByDistrict = window.HK_TERTIARY_INSTITUTIONS_BY_DISTRICT && Object.values(window.HK_TERTIARY_INSTITUTIONS_BY_DISTRICT).some((list) => list.includes(name));
      const inCommon = window.HK_TERTIARY_INSTITUTIONS_COMMON && window.HK_TERTIARY_INSTITUTIONS_COMMON.includes(name);
      if (inByDistrict || inCommon) { window.showToast(window.t('admin.s582', '此院校已在清單內'), '⚠️'); return; }
      try {
        const ref = window.fs.doc(window.db, 'admin_config', 'schoolList');
        const existingSecondary = (window.ADMIN_SCHOOL_LIST_RAW && Array.isArray(window.ADMIN_SCHOOL_LIST_RAW.secondary)) ? window.ADMIN_SCHOOL_LIST_RAW.secondary.slice() : [];
        const existingTertiary = (window.ADMIN_SCHOOL_LIST_RAW && Array.isArray(window.ADMIN_SCHOOL_LIST_RAW.tertiary)) ? window.ADMIN_SCHOOL_LIST_RAW.tertiary.slice() : [];
        existingTertiary.push({ name, district: district || null });
        await window.fs.setDoc(ref, { secondary: existingSecondary, tertiary: existingTertiary, updatedAt: Date.now(), updatedBy: (window.currentUser && window.currentUser.loginId) || null });
        await logAdminAction('新增大專院校', { name, district: district || '(常見院校)' });
        adminNewTertiaryName = '';
        adminNewTertiaryDistrict = '';
        window.showToast(window.t('admin.s583', '已新增院校'), '✅');
      } catch (err) {
        window.showToast(window.t('admin.s548', '新增失敗：') + (err.message || err), '❌');
      }
    };

    // ---------- 服務條款／私隱政策內容管理（低優先第13項）----------
    // 內容存喺 admin_config/legalContent（{terms:{zh-Hant,en,yue},
    // privacy:{zh-Hant,en,yue}}），支援三語言分開編輯。未經Admin編輯
    // 之前（Firestore冇對應語言嘅內容），index.html嗰兩個modal保持
    // 顯示返寫死嗰份原本繁體中文內容，唔會開天窗。English／廣東話
    // 留空會自動退返繁體中文版本顯示。下面兩個DEFAULT_*_ZH常數係
    // 將index.html而家寫死嗰份內容轉做純文字格式，等管理員第一次打開
    // 「條款內容」分頁嗰陣，文字框已經有現成內容可以直接編輯，唔使由
    // 零開始打成千字嘅法律文字。
    const DEFAULT_TERMS_ZH = `歡迎使用 ConcenMate 書伴（下稱「本服務」）。本服務由 ConcenMate 書伴（下稱「本公司」或「我們」）營運。本服務條款（下稱「本條款」）構成閣下（下稱「使用者」或「閣下」）與本公司之間具法律約束力之協議。

閣下一經註冊帳戶，或以任何方式使用本服務之任何功能，即視為閣下已閱讀、理解並同意接受本條款所載之全部內容，並同意受其約束。倘若閣下未滿十八歲，閣下確認已取得閣下之家長或監護人就使用本服務一事之同意。倘若閣下不同意本條款之任何部分，請立即停止使用本服務。

# 第一條　服務內容
本服務提供線上溫習室（包括視訊及語音功能）、直播溫習功能（Study with me）、學習進度追蹤（等級、經驗值、貼紙收藏）、好友及即時通訊功能、疑難解答討論區等功能。本公司保留隨時新增、修改、暫停或終止本服務任何功能之權利，毋須事先通知使用者。

# 第二條　帳戶註冊及使用者責任
（一）使用者於註冊帳戶時所提供之資料（包括登入識別碼、電郵地址等），須真實、準確及完整；
（二）使用者有責任妥善保管其帳戶登入密碼，不得將帳戶資料轉讓、出借或以任何方式提供予他人；
（三）除有證據證明帳戶遭第三方未經授權存取外，使用者帳戶下所發生之一切活動，均視為由使用者本人所為，使用者須就此負全責；
（四）除本公司另行書面同意外，每名使用者僅可擁有一個帳戶。
（五）學歷為中學生、未滿二十歲，並已以學校派發之電郵完成驗證之使用者，方屬「中學生帳戶」，可使用本服務指定之中學生功能（包括中學生溫習室）；其他使用者屬「一般帳戶」。使用者須於每學年（每年九月一日起）確認最新學歷。虛報學歷或年齡、或使用他人學校電郵者，本公司有權撤銷其中學生帳戶資格，並按第七條處理。

# 第三條　使用守則
使用者於使用本服務時，須遵守下列守則，不得從事下列行為：

（一）上載、發佈或傳送任何違法、猥褻、暴力、具威嚇性、侵犯他人權利，或帶有歧視成分之內容（包括但不限於即時通訊訊息、頭像圖片、討論區發帖及留言）；
（二）冒充他人身份，或提供虛假不實之個人資料；
（三）以任何方式（包括但不限於利用瀏覽器開發者工具）試圖繞過、破壞或篡改本服務之計分及經驗值機制；
（四）干擾或破壞本服務之正常運作，包括但不限於發動阻斷服務（DDoS）攻擊、大量發送垃圾訊息、濫用系統資源（例如無故大量開設溫習室）；
（五）未經授權存取其他使用者之帳戶或個人資料；
（六）將本服務用於任何違反香港特別行政區現行法例之用途；
（七）未經其他使用者同意，以截圖、拍照、錄影、錄音或任何其他方式記錄其他使用者於視訊溫習室內之鏡頭畫面或聲音，或將該等內容發佈、轉載或分享至本服務以外之任何平台（包括但不限於社交媒體）。使用本服務之「合照」功能時，未有開啟「容許合照」之使用者畫面將自動以馬賽克遮蓋，使用者不得以任何方式移除或規避該遮蓋。

使用者如違反上述任何守則，本公司有權暫停或終止該使用者之帳戶，情節嚴重者，本公司保留追究相關法律責任之一切權利。本服務已設有舉報機制，供使用者就違規內容或行為作出舉報，由本公司管理團隊進行審查及處理。

# 第四條　使用者生成內容
使用者於本服務上所發佈之內容（包括但不限於即時通訊訊息、討論區發帖及留言，下稱「使用者生成內容」）之知識產權，仍歸屬於該使用者。惟使用者同意，就其發佈之使用者生成內容，授予本公司一項非獨家、免版稅、全球性之許可，容許本公司於營運及提供本服務所必需之範圍內（包括顯示、儲存、傳輸該等內容），使用該等使用者生成內容。

本公司保留移除任何違反本條款之使用者生成內容之權利，毋須事先通知該使用者。

# 第四條之一　直播功能（Study with me）
（一）使用者須年滿十六歲（以註冊時所填寫之出生年月計算），並於本服務累積之合資格溫習日數達本公司不時訂定之要求，方可使用直播功能（下稱「直播」），向其他使用者播放其本人之鏡頭畫面。觀看直播不設年齡限制。本公司有權隨時修改開通要求（包括最低年齡）、暫停或撤銷任何使用者之直播資格，或暫停或終止直播功能，毋須事先通知。使用者如虛報出生年月，本公司有權撤銷其直播資格。

（二）未滿十八歲之使用者（下稱「未成年使用者」）於首次開始直播前，須確認已取得其父母或監護人之同意。本公司有權要求使用者提供有關同意之證明，並於未能提供時暫停其直播資格。

（三）進行直播之使用者（下稱「直播主」）須確保直播內容只限於溫習或學習活動，並不得於直播中：
1. 展示或透露任何可識別其本人或他人身份或所在位置之個人資料，包括但不限於住址、電話號碼、學校名稱、校服或校徽；
2. 展示他人之影像或聲音，惟已取得該人同意者除外；
3. 展示任何色情、暴力、仇恨、危險或違法之內容；
4. 進行任何商業推銷或宣傳。

（四）觀看直播之使用者（下稱「觀眾」）須為已登入本服務之使用者。觀眾只可以文字發表留言，並不得於留言中：
1. 發佈任何聯絡資料，包括但不限於社交媒體帳戶、電話號碼、即時通訊軟件帳戶或網址，或要求直播主提供聯絡資料；
2. 作出任何騷擾、恐嚇、歧視、具性暗示或不雅之言論；
3. 要求直播主作出任何與溫習或學習無關之行為。
本服務會自動過濾部分不當字詞及聯絡資料，惟此不構成本公司對任何留言內容之保證。

（五）本服務不設直播主與觀眾之間之私人訊息或打賞功能。

（六）直播主可刪除其直播內之留言，及封鎖個別觀眾。本公司有權隨時中止任何直播或刪除任何留言，毋須事先通知。

（七）為處理舉報及保障使用者安全，本公司會保存直播紀錄及留言，保存期限載於私隱政策。本公司不會錄製或保存直播影像。使用者不得錄製、截取或轉發其他使用者之直播畫面，有關規定參照第三條第（七）項。

（八）直播之畫質、播放延遲及可同時觀看之人數，視乎網絡狀況及本公司之系統安排而定，本公司對此不作任何保證。

# 第五條　收費及訂閱
本服務於本條款生效之時，並不涉及任何收費功能，現有一切功能均以免費方式提供予使用者。倘若本公司日後推出收費或訂閱服務，本公司將另行公佈詳細之收費條款（包括但不限於收費方式、退款政策），並於使用者使用該等收費功能前，徵得使用者之明確同意。

# 第六條　服務可用性及免責聲明
（一）本服務按「現況」（as is）及「現有」（as available）之基礎提供，本公司不對本服務之不間斷運作、無錯誤或絕對安全作出任何保證；
（二）本服務之運作依賴第三方基礎設施（包括但不限於 Google Firebase、GitHub Pages、Cloudflare、Vultr、EmailJS），倘若因該等第三方服務之故障或中斷而導致本服務無法正常運作，本公司對此不負直接責任；
（三）本服務之視訊溫習室功能依賴點對點即時通訊技術（WebRTC），於使用者之間直接建立連線，連線之品質可能受使用者之網絡環境及裝置性能所影響，本公司不對連線品質作出保證；
（四）本服務之直播功能經本公司租用之伺服器（由 Vultr 提供）傳送影像，播放可能出現延遲、畫質下降或中斷；
（五）於香港現行法例容許之最大範圍內，本公司對因使用或無法使用本服務而引致之任何直接、間接、附帶、特殊或衍生性損失或損害，概不負責。

# 第七條　帳戶暫停及終止
（一）使用者可隨時自行停止使用本服務，或依本公司之私隱政策申請刪除帳戶。

（二）任何使用者均可就違反本條款之內容或行為作出舉報。舉報須經本公司管理團隊審查並確認屬實，方會計入被舉報使用者之違規紀錄。

（三）經確認之違規，按以下方式處理：
1. 第一次違規：暫停帳戶三日；
2. 第二次違規：暫停帳戶十四日；
3. 第三次違規：永久終止帳戶。
上述暫停日數可由本公司不時調整，並於本服務內公佈。

（四）如違規屬嚴重性質，包括但不限於性騷擾、向未成年使用者作出不當要求或接觸、恐嚇或威脅他人人身安全、發佈涉及兒童之不當內容，或任何涉嫌刑事罪行之行為，本公司有權不經本條第（三）項之程序，即時永久終止該使用者之帳戶，並保留將有關資料轉交執法機關之權利。

（五）帳戶暫停期間，使用者將無法登入或使用本服務之任何功能；暫停期屆滿後，帳戶將自動恢復。

（六）帳戶被永久終止之使用者，不得以任何方式重新註冊，或以其他帳戶繼續使用本服務。

（七）使用者如對處理結果有異議，可於帳戶被暫停或終止後十四日內，透過第十條所載之聯絡方式提出覆核申請。本公司將於合理時間內作出覆核決定，該決定為最終決定。

（八）除上述情況外，倘若本公司合理懷疑使用者涉嫌濫用本服務，或基於其他合理理由，本公司保留暫停或終止該使用者帳戶之權利，並將於可行範圍內事先通知使用者，惟涉及惡意行為之情況則不在此限。

# 第八條　本條款之修訂
本公司保留隨時修訂本條款之權利。任何重大修訂將於本服務網站上公佈，並同時更新本文件頂部所載之「最後更新日期」。使用者於修訂公佈後繼續使用本服務，即視為使用者已接受該等經修訂之條款。

# 第九條　準據法及司法管轄
本條款受香港特別行政區法例管轄，並依照香港特別行政區法例解釋。因本條款所引起或與本條款有關之任何爭議，雙方同意接受香港特別行政區法院之非專屬司法管轄權。

# 第十條　聯絡方式
閣下如對本條款有任何疑問，請透過下列方式與本公司聯絡：電郵 support@concenmate.com`;

    const DEFAULT_PRIVACY_ZH = `ConcenMate 書伴（下稱「本服務」）由 ConcenMate 書伴（下稱「本公司」或「我們」）營運及管理。本公司高度重視使用者（下稱「閣下」或「使用者」）之個人資料私隱，並致力遵守香港特別行政區《個人資料（私隱）條例》（香港法例第486章，下稱「該條例」）之相關規定。

閣下透過瀏覽器登入、使用或以任何方式存取本服務，即表示閣下已閱讀、理解並同意接受本私隱政策（下稱「本政策」）所載之全部條款。倘若閣下不同意本政策之任何部分，請立即停止使用本服務。

# 第一條　本政策之適用範圍
本政策適用於閣下透過 concenmate.com 及其任何相關子網域使用本服務之情況。倘若閣下未滿十八歲，本公司建議由閣下之家長或監護人陪同閱讀本政策，並就使用本服務一事給予同意。

# 第二條　本公司所收集之資料類別
本公司因提供本服務之需要，可能收集以下類別之資料：帳戶資料（登入識別碼、電郵地址、顯示暱稱、頭像選項，於帳戶註冊時收集）；學歷及學校電郵（學歷聲明、每學年確認紀錄，以及中學生用作核實身份之學校電郵地址；學校電郵只用作核實身份，不會公開）；學習記錄（累積溫習時數、經驗值、等級、貼紙收藏紀錄，於使用服務過程中自動記錄）；社交互動資料（好友名單、即時通訊內容、討論區發帖及留言，於使用者主動使用相關功能時收集）；溫習室及視訊相關資料（房間設定、加入及離開時間、建立視像連線所需之協調訊息，於使用視訊溫習室功能時收集）；直播相關資料（直播標題、科目、開始及結束時間、觀看人數、直播留言、封鎖紀錄，以及未成年使用者就直播取得父母或監護人同意之確認紀錄，於使用者使用直播功能時收集）；舉報資料（舉報內容及相關佐證，於使用者提交舉報時收集）；違規及停權紀錄（於本公司處理舉報時記錄）；技術資料（瀏覽器類型、裝置資訊、網際網路協定（IP）位址，於連接本服務時由基礎設施自動記錄）。

關於視訊及語音資料之特別聲明：本服務之視訊溫習室功能採用點對點即時通訊技術（WebRTC），使用者之鏡頭及咪高峰畫面一般於瀏覽器之間直接傳輸；如雙方無法直接連線，則會經 Cloudflare 之中轉伺服器以加密方式轉送。本服務之直播功能則經本公司租用之直播伺服器（由 Vultr 提供，位於日本）即時轉送直播主之鏡頭畫面予觀眾。上述影像及聲音均只作即時傳送，本公司不會錄製或儲存。本公司之資料庫僅用作交換建立連線所需之協調（signaling）訊息。

關於直播之公開資料：直播期間，直播主之顯示名稱、直播標題、科目及鏡頭畫面，會向所有已登入本服務之使用者公開；觀眾於直播發表之留言及其顯示名稱，會向該直播之所有觀眾公開。

本公司不會收集閣下之身份證明文件號碼、住址、電話號碼，或信用卡及其他付款工具資料；本服務於現階段並不涉及任何收費功能。

# 第三條　收集資料之目的
本公司收集及處理閣下之個人資料，僅限於下列目的：（一）提供及維持本服務之核心功能，包括帳戶登入、溫習室運作、學習進度追蹤及社交互動功能；（二）維護帳戶安全及防止濫用行為，包括偵測異常操作、處理舉報事宜、執行本公司服務條款所載之違規處理，以及保障使用者（特別是未成年使用者）之安全；（三）透過第三方服務提供者發送電郵驗證訊息（詳見第五條）；（四）分析及改善本服務之功能與使用體驗。本公司承諾不會將閣下之個人資料用於向第三方廣告商進行行銷推廣之目的。

# 第四條　資料儲存地點及保安措施
閣下之個人資料儲存於 Google Firebase（包括 Firestore 資料庫及 Cloud Storage 儲存空間），該等服務由 Google Cloud Platform 提供。資料於傳輸過程中，均以超文本傳輸安全協定（HTTPS/TLS）加密。本公司並已採取下列保安措施：（一）Firebase App Check（結合 reCAPTCHA Enterprise），用以識別及阻截非經正常途徑發出之存取請求；（二）資料庫及儲存空間存取規則，訂明使用者僅可存取屬於自己之資料，唯獲授權之管理員方可存取管理功能；（三）單次資料變更幅度限制，就學習進度等敏感數值之單次變更設有上限，以防止篡改。

# 第五條　資料之披露及第三方服務提供者
本公司不會出售或出租閣下之個人資料予任何第三方。惟為提供本服務所需之技術支援，本公司會將有限度之資料傳送予下列第三方服務提供者：（一）Google Firebase——提供資料庫、身份驗證、檔案儲存及防濫用機制等服務；（二）EmailJS——用於發送電郵驗證、學校電郵驗證及重設密碼訊息，僅會接觸相關電郵地址；（三）Cloudflare——提供視訊溫習室之中轉伺服器，只作即時轉送加密影像及聲音；（四）Vultr——提供直播伺服器，只作即時轉送直播影像。倘若本公司因法律程序而有責任披露閣下之個人資料，本公司將依法配合，並於法律容許之範圍內事先通知閣下；如涉及懷疑刑事罪行或兒童安全，本公司可依法向執法機關披露相關資料。

# 第六條　Cookie 及本地儲存技術
本服務會利用瀏覽器之本地儲存功能（localStorage）記錄閣下之登入狀態，以省卻閣下每次重新登入之需要。該等資料儲存於閣下自身之裝置內，本公司並不藉此透過第三方追蹤 Cookie 監察閣下於其他網站之瀏覽活動。

# 第七條　未成年使用者
本公司理解本服務之使用者當中，不乏未滿十八歲之學生。倘若閣下為家長或監護人，並發現閣下之子女未經閣下同意而建立帳戶，或閣下希望查閱、更正或刪除該等未成年人士之個人資料，歡迎透過第十條所載之聯絡方式與本公司聯絡，本公司將優先處理該等請求。

# 第八條　使用者之權利
根據該條例，閣下就本公司所持有關於閣下之個人資料，享有下列權利：（一）查閱權；（二）更正權；（三）刪除權（惟因安全審查需要而須保留之資料，或經匿名化處理而無法識別個人身份之統計數據，則不在此限）；（四）停止使用權。閣下如欲行使上述任何權利，請透過第十條所載之聯絡方式提出申請，本公司將於合理時間內作出回覆及處理。

# 第九條　資料保留期限
本公司將於閣下之帳戶維持活躍狀態期間，保留閣下之個人資料。直播紀錄及直播留言於直播結束後保存九十日，其後自動刪除；違規及停權紀錄於帳戶存續期間保存，帳戶被永久終止後，本公司會繼續保留有關紀錄，以處理覆核申請及防止重新註冊。倘若閣下申請刪除帳戶，本公司將於合理時間內刪除或將閣下之個人可識別資料進行匿名化處理，惟因安全審查或法律責任而須予保留之資料，則不受此限。

# 第十條　聯絡方式
閣下如對本政策有任何疑問，或欲行使第八條所載之任何權利，請透過下列方式與本公司聯絡：電郵 support@concenmate.com

# 第十一條　政策之修訂
本公司保留隨時修訂本政策之權利。任何重大修訂將於本服務網站上公佈，並同時更新本文件頂部所載之「最後更新日期」。本公司建議閣下定期查閱本政策，以知悉最新內容。閣下於修訂公佈後繼續使用本服務，即視為閣下已接受該等修訂。`;
    let adminLegalActiveDoc = 'terms';
    let adminLegalActiveLang = 'zh-Hant';

    function ensureLegalDraftLoaded() {
      if (adminLegalDraft) return;
      const raw = window.LEGAL_CONTENT_RAW || {};
      adminLegalDraft = {
        terms: {
          'zh-Hant': (raw.terms && raw.terms['zh-Hant']) || DEFAULT_TERMS_ZH,
          'en': (raw.terms && raw.terms['en']) || '',
          'yue': (raw.terms && raw.terms['yue']) || '',
        },
        privacy: {
          'zh-Hant': (raw.privacy && raw.privacy['zh-Hant']) || DEFAULT_PRIVACY_ZH,
          'en': (raw.privacy && raw.privacy['en']) || '',
          'yue': (raw.privacy && raw.privacy['yue']) || '',
        },
      };
    }

    function renderAdminLegalTab() {
      const container = document.getElementById('admin-tab-legal');
      if (!container) return;
      if (!isCurrentUserSuperAdmin()) {
        container.innerHTML = ('<div class="admin-card" style="color:#c0392b;">' + window.t('admin.s506', '只有「超級管理員」可以查看此頁。') + '</div>');
        return;
      }
      if (!legalContentConfigLoaded) {
        container.innerHTML = ('<p style="text-align:center; color:#999; padding:20px;">' + window.t('admin.s584', '載入中條款內容設定...') + '</p>');
        return;
      }
      ensureLegalDraftLoaded();
      const docTabs = [['terms', window.t('landing.footerTerms', '服務條款')], ['privacy', window.t('landing.footerPrivacy', '私隱政策')]];
      const langTabs = [['zh-Hant', '繁體中文'], ['en', 'English'], ['yue', '廣東話']];
      const docBtns = docTabs.map(([k, label]) => `<button type="button" class="btn ${adminLegalActiveDoc === k ? 'btn-primary' : 'btn-outline'}" style="font-size:13px; padding:6px 14px;" onclick="window.adminSwitchLegalDoc('${k}')">${label}</button>`).join('');
      const langBtns = langTabs.map(([k, label]) => `<button type="button" class="btn ${adminLegalActiveLang === k ? 'btn-primary' : 'btn-outline'}" style="font-size:12px; padding:5px 12px;" onclick="window.adminSwitchLegalLang('${k}')">${label}</button>`).join('');
      const currentText = adminLegalDraft[adminLegalActiveDoc][adminLegalActiveLang] || '';
      const hint = adminLegalActiveLang === 'zh-Hant'
        ? window.t('admin.s585', '這是網站目前顯示的版本，可以直接修改。')
        : `${window.t('admin.s586', '如留空，此語言會自動顯示繁體中文版本（')}${adminLegalActiveLang === 'en' ? 'English' : window.t('admin.s369', '廣東話')}${window.t('admin.s587', '未填寫亦不會出現空白）。')}`;

      container.innerHTML = `
        <div class="admin-card" style="margin-bottom:16px;">
          <p style="font-size:13px; color:#888; margin:0;">${window.t('admin.s588', '此處編輯「服務條款」及「私隱政策」的內容，三種語言可以分開編輯。段落之間留一行空白；如需粗體小標題（例如「第一條　服務內容」），請在該行開頭輸入「#」。注意：English 及廣東話版本的翻譯準確性及法律效力，請自行核實或諮詢專業人士。')}</p>
        </div>
        <div class="admin-card" style="margin-bottom:16px;">
          <div style="display:flex; gap:8px; margin-bottom:10px;">${docBtns}</div>
          <div style="display:flex; gap:6px; margin-bottom:10px;">${langBtns}</div>
          <p style="font-size:12px; color:#999; margin-bottom:6px;">${hint}</p>
          <textarea class="input-field" style="width:100%; min-height:360px; font-family:inherit; font-size:13px; line-height:1.6;" oninput="window.adminUpdateLegalDraft(this.value)">${escapeHtml(currentText)}</textarea>
          <button type="button" class="btn btn-primary" style="margin-top:10px;" onclick="window.adminSaveLegalContent()">${window.t('admin.s589', '儲存全部語言')}</button>
        </div>
      `;
    }
    window.renderAdminLegalTab = renderAdminLegalTab;

    window.adminSwitchLegalDoc = function(docKey) {
      ensureLegalDraftLoaded();
      adminLegalActiveDoc = docKey;
      renderAdminLegalTab();
    };
    window.adminSwitchLegalLang = function(lang) {
      ensureLegalDraftLoaded();
      adminLegalActiveLang = lang;
      renderAdminLegalTab();
    };
    window.adminUpdateLegalDraft = function(value) {
      ensureLegalDraftLoaded();
      adminLegalDraft[adminLegalActiveDoc][adminLegalActiveLang] = value;
    };

    window.adminSaveLegalContent = async function() {
      ensureLegalDraftLoaded();
      if (!(await window.appConfirm(window.t('admin.s590', '確定要儲存嗎？此改動會即時影響全站顯示的服務條款／私隱政策內容。')))) return;
      try {
        const ref = window.fs.doc(window.db, 'admin_config', 'legalContent');
        await window.fs.setDoc(ref, {
          terms: adminLegalDraft.terms,
          privacy: adminLegalDraft.privacy,
          updatedAt: Date.now(),
          updatedBy: (window.currentUser && window.currentUser.loginId) || null,
        });
        await logAdminAction('更新服務條款／私隱政策內容', { doc: adminLegalActiveDoc, lang: adminLegalActiveLang });
        window.showToast(window.t('admin.s591', '已儲存'), '✅');
      } catch (err) {
        window.showToast(window.t('admin.s138', '儲存失敗：') + (err.message || err), '❌');
      }
    };


    // ===================== 中轉伺服器（TURN，v1.209.0） =====================
    // 顯示每月連線方式統計（直接連線／經中轉／失敗）同估算中轉用量，
    // 並可以即時關閉中轉、調整每月上限。設定存 admin_config/turnSettings；
    // 統計由 Cloud Function reportRtcResult 寫入 admin_config/rtcStats_YYYYMM。
    const TURN_GB_PER_RELAY_MINUTE = 0.0075; // 要同 functions/index.js 一致
    function rtcMonthKeyLocal(offset) {
      const hk = new Date(Date.now() + 8 * 3600 * 1000);
      const d = new Date(Date.UTC(hk.getUTCFullYear(), hk.getUTCMonth() - (offset || 0), 1));
      return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    }
    async function renderAdminTurnTab() {
      const panel = document.getElementById('admin-tab-turn');
      if (!panel) return;
      panel.innerHTML = ('<div class="card" style="padding:16px;">' + window.t('qa.loading', '載入中…') + '</div>');
      let settings = { enabled: true, monthlyCapGB: 900 };
      try {
        const s = await window.fs.getDoc(window.fs.doc(window.db, 'admin_config', 'turnSettings'));
        if (s.exists()) settings = Object.assign(settings, s.data());
      } catch (e) {}
      const months = [];
      for (let i = 0; i < 3; i++) {
        const key = rtcMonthKeyLocal(i);
        let d = {};
        try { const s = await window.fs.getDoc(window.fs.doc(window.db, 'admin_config', 'rtcStats_' + key)); if (s.exists()) d = s.data(); } catch (e) {}
        months.push({ key, d });
      }
      const row = (m) => {
        const direct = m.d.direct || 0, relay = m.d.relay || 0, failed = m.d.failed || 0, total = direct + relay + failed;
        const pct = (n) => total ? Math.round(n / total * 100) + '%' : '—';
        const gb = (m.d.relayMinutes || 0) * TURN_GB_PER_RELAY_MINUTE;
        const cost = Math.max(0, gb - 1000) * 0.05;
        return `<tr><td>${m.key.slice(0, 4)} ${window.t('auth.yearOption', '年')} ${Number(m.key.slice(4))} ${window.t('auth.monthOption', '月')}</td><td>${total}</td><td>${direct}（${pct(direct)}）</td><td>${relay}（${pct(relay)}）</td><td>${failed}（${pct(failed)}）</td><td>${gb.toFixed(1)} GB</td><td>US$${cost.toFixed(2)}</td></tr>`;
      };
      const cur = months[0];
      const curGB = (cur.d.relayMinutes || 0) * TURN_GB_PER_RELAY_MINUTE;
      const capReached = curGB >= settings.monthlyCapGB;
      panel.innerHTML = `
        <div class="card" style="padding:16px;">
          <h3 style="margin:0 0 6px;">${window.t('admin.s593', '中轉伺服器（TURN）')}</h3>
          <p style="font-size:13px; color:#666; line-height:1.7; margin:0 0 14px;">
            ${window.t('admin.s594', '學生在學校 Wi-Fi 或部分流動網絡下，未必能夠直接連線，需要經 Cloudflare 中轉伺服器轉送畫面。')}<br>
            ${window.t('admin.s595', 'Cloudflare 每月首 1,000 GB 免費，其後每 GB 收費 US$0.05。以下用量為系統估算，實際以 Cloudflare 帳單為準。')}<br>
            ${window.t('admin.s596', '本月估算用量達到上限時，系統會自動暫停中轉，直至下個月；暫停期間大部分同學仍可直接連線，只有需要中轉的同學會連線失敗。')}
          </p>
          <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center; margin-bottom:16px;">
            <label style="display:flex; align-items:center; gap:8px; font-weight:bold; color:var(--brand-800); cursor:pointer;">
              <input type="checkbox" id="turn-enabled" ${settings.enabled !== false ? 'checked' : ''} style="width:18px; height:18px;"> ${window.t('admin.s597', '啟用中轉伺服器')}
            </label>
            <label style="display:flex; align-items:center; gap:8px; font-size:14px;">${window.t('admin.s598', '每月上限')}
              <input type="number" id="turn-cap" min="1" step="50" value="${settings.monthlyCapGB}" style="width:90px; padding:6px 8px; border:1px solid var(--brand-200); border-radius:8px;"> GB
            </label>
            <button type="button" class="btn btn-primary" onclick="window.adminSaveTurnSettings()">${window.t('admin.s599', '儲存設定')}</button>
          </div>
          <div style="padding:12px 14px; border-radius:10px; background:${capReached ? '#FDECEA' : 'var(--brand-50)'}; color:${capReached ? '#8A2F2F' : 'var(--brand-800)'}; font-size:14px; margin-bottom:14px;">
            ${window.t('admin.s600', '本月估算中轉用量：')}<b>${curGB.toFixed(1)} GB</b>${window.t('admin.s601', '／上限')} ${settings.monthlyCapGB} GB${capReached ? window.t('admin.s592', '（已達上限，中轉已自動暫停）') : ''}
          </div>
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:13px;" class="admin-simple-table">
              <thead><tr style="text-align:left; color:#666;"><th>${window.t('admin.s482', '月份')}</th><th>${window.t('admin.s602', '連線總數')}</th><th>${window.t('admin.s603', '直接連線')}</th><th>${window.t('admin.s604', '經中轉')}</th><th>${window.t('admin.s605', '連線失敗')}</th><th>${window.t('admin.s606', '估算中轉用量')}</th><th>${window.t('admin.s607', '估算費用')}</th></tr></thead>
              <tbody>${months.map(row).join('')}</tbody>
            </table>
          </div>
        </div>`;
      panel.querySelectorAll('td,th').forEach((c) => { c.style.padding = '8px 6px'; c.style.borderBottom = '1px solid var(--brand-100)'; });
    }
    window.adminSaveTurnSettings = async function() {
      if (!(window.isCurrentUserSuperAdmin && window.isCurrentUserSuperAdmin())) { window.showToast(window.t('admin.s608', '只有超級管理員可以修改此設定'), ''); return; }
      const enabled = !!(document.getElementById('turn-enabled') || {}).checked;
      const cap = Number((document.getElementById('turn-cap') || {}).value);
      if (!(cap > 0)) { window.showToast(window.t('admin.s609', '請輸入有效的每月上限'), ''); return; }
      try {
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'turnSettings'), {
          enabled, monthlyCapGB: cap, updatedAt: Date.now(), updatedBy: window.currentUser ? window.currentUser.email : null
        }, { merge: true });
        if (typeof window.logAdminAction === 'function') window.logAdminAction('更新中轉伺服器設定', { enabled, monthlyCapGB: cap });
        window.showToast(window.t('admin.s610', '已儲存中轉伺服器設定'), '');
        renderAdminTurnTab();
      } catch (e) {
        window.showToast(window.t('admin.s138', '儲存失敗：') + window.friendlyErrorText(e), '');
      }
    };

    // ===================== 功能表顯示（v1.207.0） =====================
    // 逐個功能開／關，寫入 admin_config/navVisibility（hidden map）。
    // 前端監聽同套用喺 app-features.js（startNavVisibilityListener）。
    function renderAdminNavMenuTab() {
      const panel = document.getElementById('admin-tab-navmenu');
      if (!panel) return;
      const list = window.NAV_FEATURE_LIST || [];
      panel.innerHTML = `
        <div class="card" style="padding:16px;">
          <h3 style="margin:0 0 6px;">${window.t('admin.s611', '功能表顯示')}</h3>
          <p style="font-size:13px; color:#666; line-height:1.7; margin:0 0 14px;">
            ${window.t('admin.s612', '取消勾選即可暫時關閉該功能：一般用戶的功能表會即時隱藏該項目，亦無法從其他入口（例如主頁卡片、通知）進入。')}<br>
            ${window.t('admin.s613', '管理員仍可看到已關閉的項目（半透明並顯示「已關閉」），方便測試。「主頁」固定顯示，不可關閉。')}<br>
            ${window.t('admin.s614', '正在使用該功能的用戶不會被強制退出，例如正在溫習室溫習的同學可以繼續，離開後才無法再進入。')}
          </p>
          <div id="admin-navmenu-list" style="display:flex; flex-direction:column; gap:8px; max-width:520px;"></div>
        </div>`;
      const box = document.getElementById('admin-navmenu-list');
      const rowHome = document.createElement('div');
      rowHome.style.cssText = 'display:flex; align-items:center; gap:12px; padding:10px 14px; border:1px solid #E9EDF5; border-radius:10px; background:#F7FAFD;';
      rowHome.innerHTML = ('<input type="checkbox" checked disabled style="width:18px; height:18px;"><span style="font-weight:bold; color:#29395C; flex:1;">' + window.t('nav.home', '主頁') + '</span><span style="font-size:12px; color:#999;">' + window.t('admin.s615', '固定顯示') + '</span>');
      box.appendChild(rowHome);
      list.forEach((f) => {
        const hidden = !!(window.navHiddenFeatures && window.navHiddenFeatures[f.id]);
        const row = document.createElement('label');
        row.style.cssText = 'display:flex; align-items:center; gap:12px; padding:10px 14px; border:1px solid #E9EDF5; border-radius:10px; background:#fff; cursor:pointer;';
        row.innerHTML = `
          <input type="checkbox" ${hidden ? '' : 'checked'} style="width:18px; height:18px; cursor:pointer;" onchange="window.adminSetNavFeature('${f.id}', this.checked, this)">
          <span style="font-weight:bold; color:#29395C; flex:1;">${f.label}</span>
          <span id="admin-navmenu-status-${f.id}" style="font-size:12px; font-weight:bold; padding:2px 8px; border-radius:6px; ${hidden ? 'background:#F3F4F6; color:#6B7280;' : 'background:#E6F4EA; color:#1E7B3A;'}">${hidden ? window.t('nav.offTag', '已關閉') : window.t('admin.s616', '顯示中')}</span>`;
        box.appendChild(row);
      });
    }

    window.adminSetNavFeature = async function(id, show, input) {
      if (!(window.isCurrentUserSuperAdmin && window.isCurrentUserSuperAdmin())) { window.showToast(window.t('admin.s608', '只有超級管理員可以修改此設定'), ''); if (input) input.checked = !show; return; }
      const f = (window.NAV_FEATURE_LIST || []).find((x) => x.id === id);
      const label = f ? f.label : id;
      if (input) input.disabled = true;
      try {
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'navVisibility'), {
          hidden: { [id]: !show },
          updatedAt: Date.now(),
          updatedBy: window.currentUser ? window.currentUser.email : null
        }, { merge: true });
        if (!window.navHiddenFeatures) window.navHiddenFeatures = {};
        window.navHiddenFeatures[id] = !show;
        if (typeof window.applyNavVisibility === 'function') window.applyNavVisibility();
        const st = document.getElementById('admin-navmenu-status-' + id);
        if (st) {
          st.textContent = show ? window.t('admin.s616', '顯示中') : window.t('nav.offTag', '已關閉');
          st.style.background = show ? '#E6F4EA' : '#F3F4F6';
          st.style.color = show ? '#1E7B3A' : '#6B7280';
        }
        window.showToast(show ? `${window.t('admin.s617', '已開啟「')}${label}」` : `${window.t('admin.s618', '已關閉「')}${label}」`, '');
        if (typeof window.logAdminAction === 'function') window.logAdminAction(show ? '開啟功能' : '關閉功能', { feature: id, label });
      } catch (e) {
        if (input) input.checked = !show;
        window.showToast(window.t('admin.s138', '儲存失敗：') + (e.message || e), '');
      } finally {
        if (input) input.disabled = false;
      }
    };

    // ===================== 合照背景（v1.205.0） =====================
    // 溫習室「合照」可以按人數（1／2／3／4 人）各自設定一張背景圖。
    // 圖片會壓縮成 1080×1350 JPEG，存喺 admin_config/snapshotBg1～4
    // （data URL，唔經 Firebase Storage，避免跨域讀取限制令合照畫唔到）。
    // 冇上載嘅人數就用預設米白相紙底。
    const SNAPSHOT_BG_W = 1080, SNAPSHOT_BG_H = 1350;

    async function renderAdminSnapshotBgTab() {
      const panel = document.getElementById('admin-tab-snapshotbg');
      if (!panel) return;
      panel.innerHTML = `
        <div class="card" style="padding:16px;">
          <h3 style="margin:0 0 6px;">${window.t('html.s50', '合照背景')}</h3>
          <p style="font-size:13px; color:#666; line-height:1.7; margin:0 0 14px;">
            ${window.t('admin.s619', '溫習室「合照」可按人數使用不同背景。冇上載的人數會使用預設米白相紙背景。')}<br>
            ${window.t('admin.s620', '給設計師的規格：尺寸')} <b>${window.t('admin.s621', '1080 × 1350 像素')}</b>${window.t('admin.s622', '（直身 4:5）；底部 120 像素會顯示「今日溫習時數」及 ConcenMate 標誌，請保留空位；\n            每個人數的相片位置是固定的，請先下載對應的「設計範本」：灰色方框是相片位置（會被遮蓋），斜線範圍是文字及標誌位置，其餘地方可以自由設計。上載後會自動裁切及壓縮。')}
          </p>
          <div id="admin-snapshotbg-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:14px;"></div>
        </div>`;
      const grid = document.getElementById('admin-snapshotbg-grid');
      for (let n = 1; n <= 4; n++) {
        const card = document.createElement('div');
        card.style.cssText = 'border:1px solid #E9EDF5; border-radius:12px; padding:10px; text-align:center; background:#fff;';
        card.innerHTML = `
          <div style="font-weight:bold; color:#29395C; margin-bottom:8px;">${n} ${window.t('admin.s623', '人合照背景')}</div>
          <div id="admin-snapshotbg-preview-${n}" style="aspect-ratio:4/5; border-radius:8px; background:#F7F4EE; display:flex; align-items:center; justify-content:center; color:#999; font-size:13px; overflow:hidden;">${window.t('qa.loading', '載入中…')}</div>
          <div style="display:flex; gap:6px; justify-content:center; margin-top:8px; flex-wrap:wrap;">
            <label class="btn btn-primary" style="font-size:13px; padding:5px 10px; cursor:pointer;">${window.t('admin.s624', '上載圖片')}
              <input type="file" accept="image/png,image/jpeg,image/webp" style="display:none;" onchange="window.adminUploadSnapshotBg(${n}, this)">
            </label>
            <button type="button" class="btn btn-outline" style="font-size:13px; padding:5px 10px;" onclick="window.adminDownloadSnapshotTemplate(${n})">${window.t('admin.s625', '下載設計範本')}</button>
            <button type="button" class="btn btn-outline" style="font-size:13px; padding:5px 10px;" onclick="window.adminDeleteSnapshotBg(${n})">${window.t('admin.s57', '移除')}</button>
          </div>`;
        grid.appendChild(card);
        loadAdminSnapshotBgPreview(n);
      }
    }

    async function loadAdminSnapshotBgPreview(n) {
      const el = document.getElementById('admin-snapshotbg-preview-' + n);
      if (!el) return;
      try {
        const snap = await window.fs.getDoc(window.fs.doc(window.db, 'admin_config', 'snapshotBg' + n));
        const img = snap.exists() ? snap.data().image : null;
        el.innerHTML = img ? `<img src="${img}" alt="" style="width:100%; height:100%; object-fit:cover;">` : window.t('admin.s626', '使用預設背景');
      } catch (e) {
        el.innerText = window.t('admin.s627', '讀取失敗');
      }
    }

    function fileToSnapshotBgDataUrl(file) {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = SNAPSHOT_BG_W; canvas.height = SNAPSHOT_BG_H;
          const ctx = canvas.getContext('2d');
          const scale = Math.max(SNAPSHOT_BG_W / img.width, SNAPSHOT_BG_H / img.height);
          const dw = img.width * scale, dh = img.height * scale;
          ctx.drawImage(img, (SNAPSHOT_BG_W - dw) / 2, (SNAPSHOT_BG_H - dh) / 2, dw, dh);
          URL.revokeObjectURL(url);
          // Firestore 單一文件上限 1MB，壓到大約 850KB 以下
          let q = 0.88, data = canvas.toDataURL('image/jpeg', q);
          while (data.length > 850000 && q > 0.4) { q -= 0.08; data = canvas.toDataURL('image/jpeg', q); }
          if (data.length > 850000) reject(new Error(window.t('admin.s628', '圖片太複雜，壓縮後仍然太大，請提供較簡單的設計')));
          else resolve(data);
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(window.t('admin.s629', '無法讀取此圖片檔案'))); };
        img.src = url;
      });
    }

    window.adminUploadSnapshotBg = async function(n, input) {
      const file = input && input.files && input.files[0];
      if (input) input.value = '';
      if (!file) return;
      if (file.size > 15 * 1024 * 1024) { window.showToast(window.t('admin.s630', '圖片不可以超過 15MB'), ''); return; }
      try {
        if (window.showLoading) window.showLoading(window.t('admin.s631', '正在上載背景…'));
        const data = await fileToSnapshotBgDataUrl(file);
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'snapshotBg' + n), {
          image: data, updatedAt: Date.now(), updatedBy: window.currentUser ? window.currentUser.email : null
        });
        window.showToast(`${window.t('admin.s491', '已更新')} ${n} ${window.t('admin.s623', '人合照背景')}`, '');
        loadAdminSnapshotBgPreview(n);
      } catch (e) {
        window.showToast(window.t('admin.s632', '上載失敗：') + (e.message || e), '');
      } finally {
        if (window.hideLoading) window.hideLoading();
      }
    };

    window.adminDeleteSnapshotBg = async function(n) {
      if (!(await window.appConfirm(`${window.t('admin.s633', '確定移除')} ${n} ${window.t('admin.s634', '人合照背景？移除後會使用預設背景。')}`))) return;
      try {
        await window.fs.deleteDoc(window.fs.doc(window.db, 'admin_config', 'snapshotBg' + n));
        window.showToast(`${window.t('admin.s635', '已移除')} ${n} ${window.t('admin.s623', '人合照背景')}`, '');
        loadAdminSnapshotBgPreview(n);
      } catch (e) {
        window.showToast(window.t('admin.s636', '移除失敗：') + (e.message || e), '');
      }
    };


    // v1.205.1：設計範本——按實際合照排版畫出相片位置同文字位置，俾設計師
    // 直接喺上面設計（PNG，1080×1350）。
    window.adminDownloadSnapshotTemplate = function(n) {
      if (typeof window.getSnapshotLayout !== 'function') { window.showToast(window.t('admin.s637', '範本未能產生，請重新整理頁面再試'), ''); return; }
      const L = window.getSnapshotLayout(n);
      const c = document.createElement('canvas');
      c.width = L.width; c.height = L.height;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, c.width, c.height);
      // 底部文字範圍（斜線）
      const fy = c.height - L.footerHeight;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, fy, c.width, L.footerHeight); ctx.clip();
      ctx.fillStyle = '#FFF4E5'; ctx.fillRect(0, fy, c.width, L.footerHeight);
      ctx.strokeStyle = '#F0B27A'; ctx.lineWidth = 2;
      for (let x = -L.footerHeight; x < c.width; x += 18) { ctx.beginPath(); ctx.moveTo(x, c.height); ctx.lineTo(x + L.footerHeight, fy); ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = '#B9682B'; ctx.font = 'bold 26px sans-serif'; ctx.textBaseline = 'middle';
      ctx.textAlign = 'left'; ctx.fillText(window.t('admin.s638', '今日溫習時數（文字）'), 52, fy + L.footerHeight / 2);
      ctx.textAlign = 'right'; ctx.fillText(window.t('admin.s639', 'ConcenMate 標誌＋網址'), c.width - 52, fy + L.footerHeight / 2);
      // 相片位置
      L.slots.forEach((r, i) => {
        ctx.fillStyle = '#C9CED3'; ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = '#7A848C'; ctx.lineWidth = 3; ctx.strokeRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3);
        ctx.fillStyle = '#4F5961'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.round(Math.min(48, r.h / 6))}px sans-serif`;
        ctx.fillText(`${window.t('diary.photosLabel', '相片')} ${i + 1}`, r.x + r.w / 2, r.y + r.h / 2 - 18);
        ctx.font = `${Math.round(Math.min(26, r.h / 10))}px sans-serif`;
        ctx.fillText(`${r.w} × ${r.h} ${window.t('admin.s640', 'px（左上角')} ${r.x}, ${r.y}）`, r.x + r.w / 2, r.y + r.h / 2 + 26);
      });
      ctx.fillStyle = '#9AA3AA'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = '22px sans-serif';
      ctx.fillText(`ConcenMate ${n} ${window.t('admin.s641', '人合照背景範本　1080 × 1350 px')}`, c.width / 2, 12);
      c.toBlob((b) => {
        if (!b) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = `${window.t('admin.s642', 'ConcenMate-合照背景範本-')}${n}${window.t('admin.s643', '人.png')}`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }, 'image/png');
    };

// ===================== 營運開支儀表板（v1.228.0） =====================
// 資料由 Cloud Function getCostDashboard 提供（只限超級管理員，結果快取 30 分鐘）。
// 每個收費項目以圓形圖顯示「已用／免費額度或月費包含的用量」：
// 未到 70% 為正常（藍色），70%–89% 需留意（黃色），90% 或以上需立即處理（紅色）。
(function () {
  const HKD = 7.8;
  const LEVEL = {
    ok: { color: '#4A68A8', label: window.t('admin.s324', '正常') },
    watch: { color: '#E8B321', label: window.t('admin.s644', '需要留意') },
    urgent: { color: '#C0392B', label: window.t('admin.s645', '立即處理') },
    unknown: { color: '#A4B4D4', label: window.t('admin.s646', '未有數據') }
  };
  const SOURCE = { official: window.t('admin.s647', '官方數據'), count: window.t('admin.s648', '系統點數'), estimate: window.t('admin.s649', '系統估算'), unavailable: window.t('admin.s650', '未能取得') };
  const PIE_COLORS = ['#29395C', '#4A68A8', '#7F96C6', '#FFD84D', '#E8A33C', '#A4B4D4', '#C0392B', '#6B7894', '#344976'];
  const esc = (s) => (window.escapeHtml ? window.escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s));
  const fmt = (n, d) => (n == null ? '—' : Number(n).toLocaleString('zh-HK', { maximumFractionDigits: d == null ? 1 : d }));
  const usd = (n) => 'US$' + Number(n || 0).toFixed(2);
  const hkd = (n) => window.t('admin.s651', '約 HK$') + Math.round(Number(n || 0) * HKD).toLocaleString('zh-HK');

  // 圓環圖（百分比）
  function gauge(pct, color) {
    const r = 42, c = 2 * Math.PI * r;
    const p = pct == null ? 0 : Math.min(100, pct);
    return `<svg viewBox="0 0 100 100" width="110" height="110" aria-hidden="true">
      <circle cx="50" cy="50" r="${r}" fill="none" stroke="#E9EDF5" stroke-width="12"/>
      ${p > 0 ? `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round"
        stroke-dasharray="${(p / 100 * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 50 50)"/>` : ''}
      <text x="50" y="55" text-anchor="middle" font-size="18" font-weight="700" fill="#29395C">${pct == null ? '—' : pct + '%'}</text>
    </svg>`;
  }
  // 圓形圖（開支分佈）
  function pie(parts) {
    const total = parts.reduce((a, b) => a + b.value, 0);
    if (!total) return ('<p style="font-size:13px; color:#6B7894; margin:0;">' + window.t('admin.s652', '本月暫時沒有收費項目。') + '</p>');
    let acc = 0;
    const r = 40, cx = 50, cy = 50;
    const slices = parts.map((pt, i) => {
      const frac = pt.value / total;
      const color = PIE_COLORS[i % PIE_COLORS.length];
      if (frac >= 0.999) return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`;
      const a0 = acc * 2 * Math.PI - Math.PI / 2; acc += frac;
      const a1 = acc * 2 * Math.PI - Math.PI / 2;
      const large = frac > 0.5 ? 1 : 0;
      return `<path d="M${cx},${cy} L${(cx + r * Math.cos(a0)).toFixed(2)},${(cy + r * Math.sin(a0)).toFixed(2)} A${r},${r} 0 ${large} 1 ${(cx + r * Math.cos(a1)).toFixed(2)},${(cy + r * Math.sin(a1)).toFixed(2)} Z" fill="${color}"/>`;
    }).join('');
    const legend = parts.map((pt, i) => `<div style="display:flex; align-items:center; gap:8px; font-size:13px; color:var(--brand-800);">
        <span style="width:12px; height:12px; border-radius:3px; background:${PIE_COLORS[i % PIE_COLORS.length]}; flex:none;"></span>
        <span style="flex:1;">${esc(pt.name)}</span><b>${usd(pt.value)}</b><span style="color:#6B7894; width:42px; text-align:right;">${Math.round(pt.value / total * 100)}%</span></div>`).join('');
    return `<div style="display:flex; gap:18px; align-items:center; flex-wrap:wrap;">
      <svg viewBox="0 0 100 100" width="150" height="150" aria-hidden="true">${slices}<circle cx="50" cy="50" r="20" fill="#fff"/></svg>
      <div style="flex:1; min-width:220px; display:flex; flex-direction:column; gap:6px;">${legend}</div></div>`;
  }
  // 過去 6 個月棒形圖
  function bars(history) {
    const max = Math.max(1, ...history.map(h => h.totalUSD || 0));
    return `<div style="display:flex; gap:10px; align-items:flex-end; height:150px; padding-top:10px;">${history.map(h => {
      const v = h.totalUSD;
      const ht = v == null ? 4 : Math.max(4, Math.round(v / max * 110));
      return `<div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; min-width:0;">
        <span style="font-size:11px; color:var(--brand-800); white-space:nowrap;">${v == null ? '—' : usd(v)}</span>
        <div style="width:100%; max-width:46px; height:${ht}px; border-radius:6px 6px 0 0; background:${v == null ? '#E9EDF5' : '#4A68A8'};"></div>
        <span style="font-size:11px; color:#6B7894;">${Number(h.month.slice(4))} ${window.t('auth.monthOption', '月')}</span></div>`;
    }).join('')}</div>`;
  }

  async function load(refresh) {
    const panel = document.getElementById('admin-tab-costs');
    if (!panel) return;
    if (!panel.dataset.loaded || refresh) panel.innerHTML = ('<div class="card" style="padding:16px;">' + window.t('admin.s653', '正在讀取用量數據…（首次約需 5 至 10 秒）') + '</div>');
    let d;
    try {
      d = await window.callCloudFunction('getCostDashboard', { refresh: !!refresh });
    } catch (e) {
      panel.innerHTML = `<div class="card" style="padding:16px; color:#8A2F2F;">${window.t('admin.s654', '未能讀取營運開支數據：')}${esc((e && e.message) || e)}</div>`;
      return;
    }
    panel.dataset.loaded = '1';
    const items = d.items || [];
    const alerts = items.filter(it => it.level === 'urgent' || it.level === 'watch')
      .sort((a, b) => (a.level === 'urgent' ? 0 : 1) - (b.level === 'urgent' ? 0 : 1));
    const alertHtml = alerts.length
      ? alerts.map(it => `<div style="display:flex; gap:10px; padding:10px 12px; border-radius:10px; margin-bottom:8px; background:${it.level === 'urgent' ? '#FDECEA' : '#FFF7DA'}; border:1px solid ${it.level === 'urgent' ? '#F1B8B1' : '#F0D98A'};">
          <b style="color:${LEVEL[it.level].color}; white-space:nowrap;">${LEVEL[it.level].label}</b>
          <div style="font-size:13px; color:var(--brand-800); line-height:1.6;"><b>${esc(it.name)}</b>${window.t('admin.s655', '：已用')} ${it.pct}%。${esc(it.advice)}</div></div>`).join('')
      : ('<div style="padding:10px 12px; border-radius:10px; background:var(--brand-100); font-size:14px; color:var(--brand-800);">' + window.t('admin.s656', '所有項目均在安全水平，暫時毋須升級。') + '</div>');

    const pieParts = items.filter(it => it.costUSD > 0).map(it => ({ name: it.name.replace(/（.*?）/g, ''), value: it.costUSD }));
    if (d.domainUSD) pieParts.push({ name: window.t('admin.s657', '域名'), value: d.domainUSD });

    const cards = items.map(it => {
      const lv = LEVEL[it.level] || LEVEL.unknown;
      return `<div class="card" style="padding:14px; margin:0; display:flex; flex-direction:column; gap:8px; border-top:4px solid ${lv.color};">
        <div style="display:flex; justify-content:space-between; gap:6px; align-items:flex-start;">
          <b style="font-size:14px; color:var(--brand-800); line-height:1.4;">${esc(it.name)}</b>
          <span style="font-size:11px; color:#6B7894; background:var(--brand-100); border-radius:6px; padding:2px 6px; white-space:nowrap;">${esc(SOURCE[it.source] || '')}</span>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          ${gauge(it.pct, lv.color)}
          <div style="font-size:13px; color:var(--brand-800); line-height:1.7;">
            <div>${esc(it.period)}：<b>${fmt(it.used, it.unit === 'GB' ? 1 : 0)}</b> ${esc(it.unit)}</div>
            <div style="color:#6B7894;">${window.t('admin.s658', '上限：')}${fmt(it.limit, 0)} ${esc(it.unit)}</div>
            ${it.extra ? `<div style="color:#6B7894;">${esc(it.extra)}</div>` : ''}
            <div>${window.t('admin.s659', '本月估算：')}<b>${usd(it.costUSD)}</b></div>
            <div style="color:${lv.color}; font-weight:700;">${lv.label}</div>
          </div>
        </div>
        <details style="font-size:12px; color:#6B7894;"><summary style="cursor:pointer;">${window.t('admin.s660', '幾時要升級？')}</summary><p style="margin:6px 0 0; line-height:1.6;">${esc(it.advice)}</p></details>
      </div>`;
    }).join('');

    const errs = d.errors || {};
    const errNotes = [];
    if (errs.google) errNotes.push(window.t('admin.s661', 'Google 用量數據（資料庫、伺服器程式、相片儲存）未能取得：') + errs.google);
    if (errs.vultr) errNotes.push(window.t('admin.s662', 'Vultr 數據未能取得，直播流量改用系統估算：') + errs.vultr);
    const s = d.settings || {};
    const updated = new Date(d.at).toLocaleString('zh-HK', { hour12: false });
    // v1.230.1：每月預算自動控制狀態
    const g = d.budgetGuard || {};
    const budget = Number(s.monthlyBudgetUSD) || 0;
    const fmtTime = (ms) => ms ? new Date(ms).toLocaleString('zh-HK', { hour12: false }) : '';
    let budgetHtml;
    if (g.paused) {
      budgetHtml = `<div class="card" style="padding:16px; border:2px solid #C0392B; background:#FDF1EF;">
        <h3 style="margin:0 0 6px; font-size:16px; color:#A33A2F;">${window.t('admin.s663', '直播已自動暫停（本月開支已達預算上限）')}</h3>
        <p style="margin:0; font-size:14px; line-height:1.7; color:#5A2A24;">${window.t('admin.s664', '暫停時間：')}${esc(fmtTime(g.pausedAt))}<br>${window.t('admin.s665', '本月估算')} ${usd(d.totalUSD)}${window.t('admin.s666', '，預算上限')} ${usd(budget || g.budgetUSD)}。<br>${window.t('admin.s667', '暫停期間一般用戶不能開始或觀看直播（管理員除外）。提高預算上限或關閉「自動暫停」後儲存，直播會即時恢復；下月估算回落至預算以下亦會自動恢復。')}</p>
      </div>`;
    } else if (budget > 0) {
      const pct = Math.round(d.totalUSD / budget * 100);
      const barColor = pct >= 90 ? '#C0392B' : pct >= 70 ? '#E0A800' : '#4A68A8';
      budgetHtml = `<div class="card" style="padding:16px;">
        <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; align-items:baseline;">
          <h3 style="margin:0; font-size:16px;">${window.t('admin.s671', '每月預算控制')}</h3>
          <span style="font-size:13px; color:#6B7894;">${window.t('admin.s672', '自動暫停直播：')}<b>${s.budgetAutoStop ? window.t('admin.s668', '已開啟') : window.t('admin.s669', '未開啟')}</b></span>
        </div>
        <p style="margin:6px 0 8px; font-size:14px;">${window.t('admin.s665', '本月估算')} ${usd(d.totalUSD)} ${window.t('admin.s673', '／ 預算上限')} ${usd(budget)}（${pct}%）</p>
        <div style="height:10px; background:var(--brand-100); border-radius:6px; overflow:hidden;"><div style="height:100%; width:${Math.min(100, pct)}%; background:${barColor};"></div></div>
        ${g.resumedAt ? `<p style="margin:8px 0 0; font-size:12px; color:#8A94A8;">${window.t('admin.s670', '上次自動恢復直播：')}${esc(fmtTime(g.resumedAt))}</p>` : ''}
      </div>`;
    } else {
      budgetHtml = `<div class="card" style="padding:16px;"><h3 style="margin:0 0 4px; font-size:16px;">${window.t('admin.s671', '每月預算控制')}</h3><p style="margin:0; font-size:13px; color:#6B7894;">${window.t('admin.s674', '尚未設定預算上限。可在下方「方案設定」填寫每月預算上限，並開啟「超出預算時自動暫停直播」。')}</p></div>`;
    }

    panel.innerHTML = `
      <div class="card" style="padding:16px;">
        <!-- v1.235.1：「重新整理」掣固定在標題右邊（手機窄畫面亦不會跌到中間），更新時間移到金額下面 -->
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
          <h3 style="margin:0;">${window.t('html.s28', '營運開支')}</h3>
          <button type="button" class="btn btn-outline" style="font-size:13px; padding:5px 12px; min-height:0; flex-shrink:0;" onclick="window.renderAdminCostsTab(true)">${window.t('admin.s221', '重新整理')}</button>
        </div>
        <p style="margin:4px 0 0; font-size:13px; color:#6B7894;">${window.t('admin.s683', '本月（')}${Number(d.monthKey.slice(4))} ${window.t('admin.s684', '月，已過')} ${d.dayOfMonth}／${d.daysInMonth} ${window.t('admin.s685', '日）全月估算開支')}</p>
        <div style="font-size:28px; font-weight:800; color:var(--brand-800); margin-top:6px;">${usd(d.totalUSD)} <span style="font-size:15px; font-weight:600; color:#6B7894;">${hkd(d.totalUSD)}</span></div>
        ${d.vultrPendingUSD != null ? `<p style="margin:4px 0 0; font-size:13px; color:#6B7894;">${window.t('admin.s675', 'Vultr 本月實際累計帳單：')}${usd(d.vultrPendingUSD)}</p>` : ''}
        <p style="margin:6px 0 0; font-size:12px; color:#8A94A8;">${window.t('admin.s686', '更新時間：')}${esc(updated)}${window.t('admin.s687', '（數據每 30 分鐘更新一次）')}</p>
        <div style="display:flex; gap:14px; flex-wrap:wrap; margin-top:12px; font-size:12px; color:#6B7894;">
          ${['ok', 'watch', 'urgent'].map(k => `<span style="display:flex; align-items:center; gap:5px;"><span style="width:10px; height:10px; border-radius:50%; background:${LEVEL[k].color};"></span>${LEVEL[k].label}${k === 'ok' ? window.t('admin.s676', '（70% 以下）') : k === 'watch' ? '（70%–89%）' : window.t('admin.s677', '（90% 或以上）')}</span>`).join('')}
        </div>
      </div>

      ${budgetHtml}

      <div class="card" style="padding:16px;">
        <h3 style="margin:0 0 10px; font-size:16px;">${window.t('admin.s688', '需要處理的項目')}</h3>
        ${alertHtml}
        ${errNotes.length ? `<div style="font-size:12px; color:#8A6D1F; background:#FFF7E6; border:1px solid #F0D9A0; border-radius:8px; padding:8px 10px; margin-top:6px; line-height:1.6;">${errNotes.map(esc).join('<br>')}</div>` : ''}
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:12px; margin-bottom:12px;">${cards}</div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:12px;">
        <div class="card" style="padding:16px; margin:0;">
          <h3 style="margin:0 0 10px; font-size:16px;">${window.t('admin.s689', '本月開支分佈')}</h3>
          ${pie(pieParts)}
        </div>
        <div class="card" style="padding:16px; margin:0;">
          <h3 style="margin:0 0 4px; font-size:16px;">${window.t('admin.s690', '過去 6 個月估算開支')}</h3>
          <p style="margin:0; font-size:12px; color:#8A94A8;">${window.t('admin.s691', '每 3 小時自動記錄一次當月估算')}</p>
          ${bars(d.history || [])}
        </div>
      </div>

      <div class="card" style="padding:16px; margin-top:12px;">
        <h3 style="margin:0 0 6px; font-size:16px;">${window.t('admin.s692', '方案設定')}</h3>
        <p style="margin:0 0 12px; font-size:13px; color:#6B7894;">${window.t('admin.s693', '升級或更改方案後，請在此更新，圓形圖的上限及估算開支會隨之調整。')}</p>
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:10px; font-size:14px;">
          <label>${window.t('admin.s694', 'Vultr 月費（US$）')}<input id="cost-vultr-fee" type="number" min="0" step="1" value="${esc(s.vultrMonthlyUSD)}" class="input-field" style="width:100%; box-sizing:border-box; margin-top:4px; padding:8px; border:1px solid var(--brand-200); border-radius:8px;"></label>
          <label>${window.t('admin.s695', 'Vultr 每月包含流量（GB）')}<input id="cost-vultr-gb" type="number" min="1" step="100" value="${esc(s.vultrIncludedGB)}" style="width:100%; box-sizing:border-box; margin-top:4px; padding:8px; border:1px solid var(--brand-200); border-radius:8px;"></label>
          <label>${window.t('admin.s696', '直播同時觀看上限（人）')}<input id="cost-live-cap" type="number" min="1" step="10" value="${esc(s.liveViewerCapacity)}" style="width:100%; box-sizing:border-box; margin-top:4px; padding:8px; border:1px solid var(--brand-200); border-radius:8px;"></label>
          <label>${window.t('admin.s697', 'EmailJS 方案')}<select id="cost-emailjs" style="width:100%; box-sizing:border-box; margin-top:4px; padding:8px; border:1px solid var(--brand-200); border-radius:8px;">
            ${[[200, window.t('admin.s678', '免費（每月 200 封）')], [2000, window.t('admin.s679', 'Personal（2,000 封，US$9）')], [5000, window.t('admin.s680', 'Professional（5,000 封，US$15）')], [25000, window.t('admin.s681', 'Business（25,000 封，US$40）')]].map(([v, l]) => `<option value="${v}" ${Number(s.emailjsQuota) === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select></label>
          <label>${window.t('admin.s698', '每月預算上限（US$，0 為不設）')}<input id="cost-budget" type="number" min="0" step="1" value="${esc(s.monthlyBudgetUSD || 0)}" style="width:100%; box-sizing:border-box; margin-top:4px; padding:8px; border:1px solid var(--brand-200); border-radius:8px;"></label>
          <label style="display:flex; align-items:center; gap:8px; margin-top:22px;"><input id="cost-budget-autostop" type="checkbox" ${s.budgetAutoStop ? 'checked' : ''}>${window.t('admin.s699', '超出預算時自動暫停直播')}</label>
        </div>
        <p style="margin:10px 0 0; font-size:12px; color:#8A94A8;">${window.t('admin.s700', '系統每 3 小時檢查一次本月估算開支；達到預算上限時會結束所有進行中的直播，並暫停開播及觀看，直至估算回落至預算以下。中轉伺服器的上限請在「中轉伺服器」分頁設定。')}</p>
        <button type="button" class="btn btn-primary" style="margin-top:12px;" onclick="window.adminSaveCostSettings()">${window.t('admin.s701', '儲存方案設定')}</button>
      </div>`;
  }

  window.renderAdminCostsTab = function (refresh) { load(refresh === true); };
  window.adminSaveCostSettings = async function () {
    const v = (id) => (document.getElementById(id) || {}).value;
    try {
      await window.callCloudFunction('saveCostSettings', {
        vultrMonthlyUSD: v('cost-vultr-fee'), vultrIncludedGB: v('cost-vultr-gb'),
        liveViewerCapacity: v('cost-live-cap'), emailjsQuota: v('cost-emailjs'),
        monthlyBudgetUSD: v('cost-budget'),
        budgetAutoStop: !!(document.getElementById('cost-budget-autostop') || {}).checked
      });
      window.showToast(window.t('admin.s702', '已儲存方案設定'), '✅');
      load(true);
    } catch (e) {
      window.showToast(window.t('admin.s138', '儲存失敗：') + ((e && e.message) || e), '❌');
    }
  };
})();


// ===================== 學校電郵審批（v1.229.0） =====================
// 學生以 .edu.hk 電郵驗證時，如該域名第一次出現，會列在這裏等候管理員確認一次屬哪間中學；
// 批准後同一域名的學生即時成為中學生帳戶（已驗證），之後同校學生驗證即時通過。
(function () {
  const esc = (v) => (window.escapeHtml ? window.escapeHtml(String(v == null ? '' : v)) : String(v == null ? '' : v));
  let unsub = null;
  window.startAdminSchoolDomainsBadge = function () {
    if (unsub || !window.db || !window.fs) return;
    try {
      const q = window.fs.query(window.fs.collection(window.db, 'schoolEmailDomains'), window.fs.where('status', '==', 'pending'));
      unsub = window.fs.onSnapshot(q, (snap) => {
        const b = document.getElementById('admin-schooldomains-badge');
        if (b) { b.textContent = String(snap.size); b.style.display = snap.size ? '' : 'none'; }
        const panel = document.getElementById('admin-tab-schooldomains');
        if (panel && panel.style.display === 'block') window.renderAdminSchoolDomainsTab();
      }, () => { unsub = null; });
    } catch (_) {}
  };
  window.renderAdminSchoolDomainsTab = async function () {
    const panel = document.getElementById('admin-tab-schooldomains');
    if (!panel) return;
    let docs = [];
    try {
      const snap = await window.fs.getDocs(window.fs.collection(window.db, 'schoolEmailDomains'));
      docs = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
    } catch (e) {
      panel.innerHTML = `<div class="card" style="padding:16px; color:#8A2F2F;">${window.t('admin.s703', '未能讀取：')}${esc(e.message || e)}</div>`;
      return;
    }
    const pending = docs.filter(d => d.status === 'pending').sort((a, b) => (a.firstSeenAt || 0) - (b.firstSeenAt || 0));
    const done = docs.filter(d => d.status !== 'pending').sort((a, b) => (b.reviewedAt || 0) - (a.reviewedAt || 0));
    const pendHtml = pending.length ? pending.map(d => `
      <div style="border:1px solid var(--brand-200); border-radius:10px; padding:12px; margin-bottom:10px;">
        <div style="font-size:15px; font-weight:800; color:var(--brand-800); word-break:break-all;">@${esc(d.domain)}</div>
        <div style="font-size:13px; color:#6B7894; margin:4px 0 8px;">${window.t('admin.s704', '學生填寫的學校：')}${esc((d.sampleSchools || []).join('、') || '—')}　${window.t('admin.s705', '｜　等候人數：')}${esc(d.pendingCount || 0)}</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <input id="sd-school-${esc(d.id)}" value="${esc((d.sampleSchools || [])[0] || '')}" placeholder="${window.t('admin.s706', '這個域名屬於哪間中學')}" style="flex:1; min-width:180px; padding:8px 10px; border:1px solid var(--brand-300); border-radius:8px; font-size:14px;">
          <button type="button" class="btn btn-primary" onclick="window.adminReviewSchoolDomain('${esc(d.id)}', true)">${window.t('admin.s707', '確認為中學')}</button>
          <button type="button" class="btn btn-outline" onclick="window.adminReviewSchoolDomain('${esc(d.id)}', false)">${window.t('admin.s708', '不是中學')}</button>
        </div>
      </div>`).join('') : ('<p style="font-size:14px; color:#6B7894; margin:0;">' + window.t('admin.s709', '暫時沒有待審批的域名。') + '</p>');
    const doneHtml = done.length ? `<table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead><tr style="text-align:left; color:#6B7894;"><th style="padding:6px;">${window.t('admin.s657', '域名')}</th><th style="padding:6px;">${window.t('admin.s713', '結果')}</th><th style="padding:6px;">${window.t('admin.s215', '學校')}</th><th style="padding:6px;"></th></tr></thead>
        <tbody>${done.map(d => `<tr style="border-top:1px solid var(--brand-100);">
          <td style="padding:6px; word-break:break-all;">@${esc(d.domain)}</td>
          <td style="padding:6px;">${d.status === 'approved' ? window.t('admin.s710', '已確認為中學') : window.t('admin.s708', '不是中學')}</td>
          <td style="padding:6px;">${esc(d.school || '—')}</td>
          <td style="padding:6px; text-align:right;">${d.status === 'approved'
            ? `<button type="button" class="btn btn-outline" style="font-size:12px; padding:3px 8px;" onclick="window.adminReviewSchoolDomain('${esc(d.id)}', false)">${window.t('admin.s711', '撤銷')}</button>`
            : `<button type="button" class="btn btn-outline" style="font-size:12px; padding:3px 8px;" onclick="window.adminReopenSchoolDomain('${esc(d.id)}', '${esc(d.domain)}')">${window.t('admin.s712', '改為中學')}</button>`}</td></tr>`).join('')}</tbody></table>`
      : ('<p style="font-size:14px; color:#6B7894; margin:0;">' + window.t('admin.s714', '未有紀錄。') + '</p>');
    panel.innerHTML = `
      <div class="card" style="padding:16px;">
        <h3 style="margin:0 0 6px;">${window.t('html.s35', '學校電郵審批')}</h3>
        <p style="font-size:13px; color:#6B7894; line-height:1.7; margin:0;">${window.t('admin.s715', '學生用 .edu.hk 學校電郵驗證時，如果該學校的電郵域名是第一次出現，會列在這裏。請確認它屬於一間中學（例如在學校網站核對），確認後同一域名的學生會即時成為中學生帳戶，之後同校學生驗證時會即時通過。大專院校的域名系統已自動拒絕。')}</p>
      </div>
      <div class="card" style="padding:16px;"><h4 style="margin:0 0 10px;">${window.t('admin.s315', '待審批')}</h4>${pendHtml}</div>
      <div class="card" style="padding:16px;"><h4 style="margin:0 0 10px;">${window.t('admin.s271', '已處理')}</h4>${doneHtml}</div>`;
  };
  window.adminReviewSchoolDomain = async function (id, approve) {
    const input = document.getElementById('sd-school-' + id);
    const school = input ? input.value.trim() : '';
    const domain = id;
    if (approve && !school) { window.showToast(window.t('admin.s716', '請填寫學校名稱'), '⚠️'); return; }
    const msg = approve ? `${window.t('admin.s717', '確認 @')}${domain} ${window.t('admin.s718', '屬於「')}${school}${window.t('admin.s719', '」？同一域名等候中的學生會即時成為中學生帳戶。')}` : `${window.t('admin.s720', '確定 @')}${domain} ${window.t('admin.s721', '不是中學電郵？使用此域名的學生會失去中學生帳戶資格。')}`;
    if (!(await window.appConfirm(msg))) return;
    try {
      const res = await window.callCloudFunction('reviewSchoolEmailDomain', { domain, approve, school });
      window.showToast(`${window.t('admin.s722', '已處理，更新了')} ${res && res.updated || 0} ${window.t('admin.s723', '位學生')}`, '✅');
      window.renderAdminSchoolDomainsTab();
    } catch (e) {
      window.showToast(window.t('admin.s724', '處理失敗：') + (window.friendlyErrorText ? window.friendlyErrorText(e) : (e.message || e)), '❌');
    }
  };
  window.adminReopenSchoolDomain = async function (id, domain) {
    const school = await window.appPrompt(`@${domain} ${window.t('admin.s725', '屬於哪間中學？')}`, '');
    if (!school) return;
    try {
      const res = await window.callCloudFunction('reviewSchoolEmailDomain', { domain, approve: true, school: school.trim() });
      window.showToast(`${window.t('admin.s726', '已改為中學，更新了')} ${res && res.updated || 0} ${window.t('admin.s723', '位學生')}`, '✅');
      window.renderAdminSchoolDomainsTab();
    } catch (e) {
      window.showToast(window.t('admin.s724', '處理失敗：') + (window.friendlyErrorText ? window.friendlyErrorText(e) : (e.message || e)), '❌');
    }
  };
})();


// ===================== v1.235.0：管理後台「手機 App」分頁 =====================
// 1. App 使用統計（getAppStats）  2. 推送通知總開關（admin_config/push）
// 3. App 網站更新包上載（Storage app_updates/ + admin_config/appUpdate）及最低原生版本
(function () {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function cmpVer(a, b) {
    const pa = String(a || '').replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
    const pb = String(b || '').replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); }
    return 0;
  }
  function fmtTime(ms) { if (!ms) return '—'; const d = new Date(ms); return d.toLocaleString('zh-HK', { hour12: false }); }
  function listObj(o) {
    const ks = Object.keys(o || {}).sort((a, b) => (o[b] - o[a]));
    return ks.length ? ks.map(k => `${esc(k)}：${o[k]}`).join('　') : '—';
  }
  const ENV = () => (window.IS_PROD_SITE ? 'prod' : 'dev');

  window.renderAdminMobileAppTab = async function () {
    const box = document.getElementById('admin-tab-mobileapp');
    if (!box) return;
    box.innerHTML = ('<div class="admin-card">' + window.t('qa.loading', '載入中…') + '</div>');
    let stats = null, upd = {}, statsErr = '';
    try { stats = await window.callCloudFunction('getAppStats', {}); } catch (e) { statsErr = (window.friendlyErrorText ? window.friendlyErrorText(e) : (e.message || e)); }
    try { const s = await window.fs.getDoc(window.fs.doc(window.db, 'admin_config', 'appUpdate')); if (s.exists()) upd = s.data(); } catch (e) {}
    const pushOn = stats ? stats.pushEnabled : true;
    box.innerHTML = `
      <div class="admin-card">
        <h3 style="font-size:16px; font-weight:bold; color:var(--brand-800); margin-bottom:10px;">${window.t('admin.s744', 'App 使用統計')}</h3>
        ${stats ? `
        <table class="admin-table">
          <tr><th>${window.t('admin.s727', '過去 7 日使用 App 的用戶')}</th><td>${stats.users7}</td></tr>
          <tr><th>${window.t('admin.s728', '過去 30 日使用 App 的用戶')}</th><td>${stats.users30}${window.t('admin.s729', '（裝置')} ${stats.devices30} ${window.t('admin.s730', '部）')}</td></tr>
          <tr><th>${window.t('admin.s731', '平台')}</th><td>${listObj(stats.platforms)}</td></tr>
          <tr><th>${window.t('admin.s732', '網站版本分佈')}</th><td>${listObj(stats.webVersions)}</td></tr>
          <tr><th>${window.t('admin.s733', '原生版本（build）分佈')}</th><td>${listObj(stats.nativeBuilds)}</td></tr>
          <tr><th>${window.t('admin.s734', '已登記推送通知的裝置')}</th><td>${stats.pushDevices}</td></tr>
        </table>
        <p style="font-size:12px; color:#888; margin-top:6px;">${window.t('admin.s735', '每部裝置每日最多記錄一次；網站用戶不計算在內。')}</p>` : `<p style="color:#A33A2F; font-size:13px;">${window.t('admin.s736', '未能載入統計：')}${esc(statsErr)}</p>`}
      </div>

      <div class="admin-card">
        <h3 style="font-size:16px; font-weight:bold; color:var(--brand-800); margin-bottom:6px;">${window.t('admin.s745', '推送通知總開關')}</h3>
        <p style="font-size:13px; color:#6B7894; margin-bottom:10px;">${window.t('admin.s746', '關閉後，所有推送通知即時暫停（約 1 分鐘內生效），用戶個人設定保持不變。')}</p>
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <span style="font-weight:bold; color:${pushOn ? 'var(--brand-800)' : '#A33A2F'};">${window.t('admin.s747', '目前：')}${pushOn ? window.t('admin.s737', '開啟') : window.t('admin.s738', '已暫停')}</span>
          <button type="button" class="btn ${pushOn ? 'btn-outline' : 'btn-primary'}" id="adm-push-toggle">${pushOn ? window.t('admin.s739', '暫停所有推送通知') : window.t('admin.s740', '恢復推送通知')}</button>
        </div>
      </div>

      <div class="admin-card">
        <h3 style="font-size:16px; font-weight:bold; color:var(--brand-800); margin-bottom:6px;">${window.t('admin.s748', 'App 網站更新')}</h3>
        <p style="font-size:13px; color:#6B7894; line-height:1.7; margin-bottom:10px;">
          ${window.t('admin.s749', '網站改動推上 GitHub 後，只會更新網站；App 用戶要靠這裡的「網站更新包」才會更新。上載後，App 下次打開時會在背景下載，再下次打開時生效。')}<br>
          ${window.t('admin.s750', '製作方法：在終端機執行')} <code>cd ~/Desktop/concenmate-app/mobile && npm run bundle:${ENV()}</code>${window.t('admin.s751', '，然後在下面選擇')} <code>mobile/dist/</code> ${window.t('admin.s752', '內的 zip 檔。')}<br>
          ${window.t('admin.s753', '本頁是')}<b>${window.IS_PROD_SITE ? window.t('admin.s5', '正式網站') : window.t('admin.s741', '測試環境（Staging）')}</b>${window.t('admin.s754', '，只接受')} <code>concenmate-web-${ENV()}${window.t('admin.s755', '-版本.zip')}</code>。
        </p>
        <table class="admin-table" style="margin-bottom:12px;">
          <tr><th>${window.t('admin.s756', '目前發佈的網站版本')}</th><td>${upd.version ? 'v' + esc(upd.version) : window.t('admin.s742', '未有（App 使用安裝時內置的版本）')}</td></tr>
          <tr><th>${window.t('admin.s757', '上載時間')}</th><td>${esc(fmtTime(upd.uploadedAt))}${upd.uploadedBy ? '（' + esc(upd.uploadedBy) + '）' : ''}</td></tr>
          <tr><th>${window.t('admin.s758', '檔案大小')}</th><td>${upd.size ? (upd.size / 1048576).toFixed(1) + ' MB' : '—'}</td></tr>
        </table>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <input type="file" id="adm-bundle-file" accept=".zip,application/zip">
          <button type="button" class="btn btn-primary" id="adm-bundle-upload">${window.t('admin.s759', '上載網站更新包')}</button>
        </div>
        <div id="adm-bundle-progress" style="font-size:13px; color:#6B7894; margin-top:8px;"></div>
        ${upd.version ? `<button type="button" class="btn btn-outline" id="adm-bundle-stop" style="margin-top:10px;">${window.t('admin.s743', '停止發佈更新（已更新的 App 不受影響）')}</button>` : ''}
      </div>

      <div class="admin-card">
        <h3 style="font-size:16px; font-weight:bold; color:var(--brand-800); margin-bottom:6px;">${window.t('admin.s760', '最低 App 版本（強制更新）')}</h3>
        <p style="font-size:13px; color:#6B7894; line-height:1.7; margin-bottom:10px;">
          ${window.t('admin.s761', '原生版本號（build）低於此數字的 App，打開時會顯示「請到 Google Play 更新」，不能繼續使用。')}<br>
          ${window.t('admin.s762', '只在發布了新版 App（例如加入新的原生功能）而舊版不能再正常運作時才提高。目前第一版 App 的 build 是 1。設定為 0 即不限制。')}
        </p>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <input type="number" min="0" step="1" id="adm-min-build" class="admin-input-sm" style="width:100px;" value="${Number(upd.minNativeBuild) || 0}">
          <button type="button" class="btn btn-primary" id="adm-min-build-save">${window.t('common.save', '儲存')}</button>
        </div>
      </div>`;

    document.getElementById('adm-push-toggle').onclick = async () => {
      const next = !pushOn;
      if (!next && !(await window.appConfirm(window.t('admin.s763', '確定要暫停所有推送通知嗎？')))) return;
      try {
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'push'), { enabled: next, updatedAt: Date.now() }, { merge: true });
        window.showToast(next ? window.t('admin.s764', '已恢復推送通知') : window.t('admin.s765', '已暫停所有推送通知'));
        window.renderAdminMobileAppTab();
      } catch (e) { window.showToast(window.t('admin.s138', '儲存失敗：') + (e.message || e)); }
    };

    document.getElementById('adm-min-build-save').onclick = async () => {
      const v = Math.max(0, parseInt(document.getElementById('adm-min-build').value, 10) || 0);
      if (v > 0 && !(await window.appConfirm(`${window.t('admin.s766', '原生版本低於')} ${v} ${window.t('admin.s767', '的 App 將不能使用，要先到 Google Play 更新。確定嗎？')}`))) return;
      try {
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'appUpdate'), { minNativeBuild: v }, { merge: true });
        window.showToast(window.t('admin.s591', '已儲存'));
        window.renderAdminMobileAppTab();
      } catch (e) { window.showToast(window.t('admin.s138', '儲存失敗：') + (e.message || e)); }
    };

    const stopBtn = document.getElementById('adm-bundle-stop');
    if (stopBtn) stopBtn.onclick = async () => {
      if (!(await window.appConfirm(window.t('admin.s768', '停止後，未更新的 App 不會再下載這個版本。確定嗎？')))) return;
      try {
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'appUpdate'), { version: '', url: '' }, { merge: true });
        window.showToast(window.t('admin.s769', '已停止發佈'));
        window.renderAdminMobileAppTab();
      } catch (e) { window.showToast(window.t('admin.s138', '儲存失敗：') + (e.message || e)); }
    };

    document.getElementById('adm-bundle-upload').onclick = async (ev) => {
      const btn = ev.currentTarget;
      const prog = document.getElementById('adm-bundle-progress');
      const f = document.getElementById('adm-bundle-file').files[0];
      if (!f) { window.showToast(window.t('admin.s770', '請先選擇 zip 檔')); return; }
      const m = /^concenmate-web-(dev|prod)-(\d+\.\d+\.\d+)\.zip$/.exec(f.name);
      if (!m) { window.showToast(window.t('admin.s771', '檔名不正確，應為 concenmate-web-') + ENV() + window.t('admin.s772', '-版本.zip（由 npm run bundle:') + ENV() + window.t('admin.s773', ' 產生）')); return; }
      if (m[1] !== ENV()) { window.showToast(`${window.t('admin.s776', '這是')}${m[1] === 'prod' ? window.t('admin.s774', '正式版') : window.t('admin.s775', '測試版')}${window.t('admin.s777', '更新包，不能在')}${window.IS_PROD_SITE ? window.t('admin.s5', '正式網站') : window.t('admin.s6', '測試環境')}${window.t('admin.s778', '上載')}`); return; }
      const ver = m[2];
      if (upd.version && cmpVer(ver, upd.version) < 0) { window.showToast(`${window.t('admin.s779', '版本 v')}${ver} ${window.t('admin.s780', '比目前發佈的 v')}${upd.version} ${window.t('admin.s781', '舊，App 不會更新')}`); return; }
      if (upd.version && cmpVer(ver, upd.version) === 0 && !(await window.appConfirm(`v${ver} ${window.t('admin.s782', '已經發佈過，要重新上載取代嗎？')}`))) return;
      if (cmpVer(ver, window.APP_VERSION) !== 0 && !(await window.appConfirm(`${window.t('admin.s783', '更新包版本 v')}${ver} ${window.t('admin.s784', '與本網站目前版本')} ${window.APP_VERSION} ${window.t('admin.s785', '不同，確定要上載嗎？')}`))) return;
      if (f.size > 40 * 1024 * 1024) { window.showToast(window.t('admin.s786', '檔案超過 40MB')); return; }
      btn.disabled = true;
      try {
        prog.textContent = window.t('admin.s787', '計算檢查碼…');
        // v1.235.5：App 更新套件規定要有 SHA-256 檢查碼
        const hashBuf = await crypto.subtle.digest('SHA-256', await f.arrayBuffer());
        const checksum = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
        prog.textContent = window.t('admin.s788', '上載中…（') + (f.size / 1048576).toFixed(1) + ' MB）';
        const path = `app_updates/web-${ENV()}-${ver}.zip`;
        const ref = window.storageApi.ref(window.storage, path);
        await window.storageApi.uploadBytes(ref, f, { contentType: 'application/zip', cacheControl: 'public, max-age=31536000' });
        const url = await window.storageApi.getDownloadURL(ref);
        await window.fs.setDoc(window.fs.doc(window.db, 'admin_config', 'appUpdate'), {
          version: ver, url, checksum, env: ENV(), size: f.size, path,
          uploadedAt: Date.now(), uploadedBy: (window.currentUser && window.currentUser.loginId) || ''
        }, { merge: true });
        prog.textContent = '';
        window.showToast(`${window.t('admin.s789', '已發佈 v')}${ver}${window.t('admin.s790', '，App 下次打開時會自動下載')}`);
        window.renderAdminMobileAppTab();
      } catch (e) {
        prog.textContent = '';
        window.showToast(window.t('admin.s632', '上載失敗：') + (window.friendlyErrorText ? window.friendlyErrorText(e) : (e.message || e)));
      } finally { btn.disabled = false; }
    };
  };
})();

window.adminPanelLoaded = true;
