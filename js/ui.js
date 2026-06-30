/* ============================================================
   ui.js — rendering helpers for every view + modal + toast
   ============================================================ */

const UI = {

  toastTimer: null,

  toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  },

  timeAgo(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  },

  stampClass(status) {
    return { reported: 'reported', review: 'review', verified: 'verified', progress: 'progress', resolved: 'resolved' }[status] || 'reported';
  },

  // ---------- Header stats (report view) ----------
  renderHeaderStats() {
    const s = State.stats();
    document.getElementById('stat-total').textContent = s.total;
    document.getElementById('stat-resolved').textContent = s.resolved;
    document.getElementById('stat-active').textContent = s.active;
  },

  // ---------- AI panel in report form ----------
  renderAIPanelStage(stage) {
    const panel = document.getElementById('ai-panel');
    panel.classList.add('show');
    const stages = {
      uploading: 'Uploading photo...',
      analyzing: 'Running vision model...',
      duplicates: 'Cross-referencing nearby reports...'
    };
    panel.innerHTML = `
      <div class="ai-card">
        <div class="ai-card-head"><span class="spin"></span> Analyzing photo</div>
        <div class="ai-row"><span>${stages[stage] || 'Working...'}</span></div>
      </div>`;
  },

  renderAIPanelLoading() {
    this.renderAIPanelStage('uploading');
  },

  renderAIPanelResult(ai) {
    const panel = document.getElementById('ai-panel');
    panel.classList.add('show');
    const sevClass = ai.severity || 'medium';
    panel.innerHTML = `
      <div class="ai-card">
        <div class="ai-card-head">✓ AI analysis complete</div>
        <div class="ai-row"><span>Detected category</span><b>${ai.category}</b></div>
        <div class="ai-row"><span>Confidence</span><span class="ai-conf">${Math.round(ai.confidence * 100)}%</span></div>
        <div class="ai-row"><span>Severity</span><span class="ai-badge ${ai.emergency ? 'critical' : sevClass}">${ai.emergency ? 'critical' : ai.severity}</span></div>
        <div class="ai-row"><span>Routed to</span><b>${ai.department}</b></div>
        ${ai.duplicate && ai.duplicate.isDuplicate ? `<div class="ai-row"><span>Possible duplicate of</span><b>"${ai.duplicate.matchTitle}"</b></div>` : ''}
        ${ai.confidence < 0.6 ? `<div class="ai-row" style="color:var(--amber);"><span>Low confidence — please confirm category below</span></div>` : ''}
      </div>`;
    document.getElementById('emergency-banner-form').classList.toggle('show', !!ai.emergency);
  },

  clearAIPanel() {
    const panel = document.getElementById('ai-panel');
    panel.classList.remove('show');
    panel.innerHTML = '';
    document.getElementById('emergency-banner-form').classList.remove('show');
  },

  // ---------- Map & Feed view ----------
  renderFeed(onCardClick) {
    const list = State.filteredFeed().slice().sort((a, b) => b.createdAt - a.createdAt);
    const el = document.getElementById('feed-list');
    if (!list.length) {
      el.innerHTML = `<div class="feed-empty">No reports match this filter yet.</div>`;
      return;
    }
    el.innerHTML = list.map(r => `
      <div class="feed-card ${r.ai && r.ai.emergency ? 'emergency' : ''}" data-id="${r.id}">
        <div class="feed-card-top">
          <div class="feed-card-title">${this.esc(r.title)}</div>
          <span class="stamp ${this.stampClass(r.status)}">${STATUS_LABEL[r.status] || r.status}</span>
        </div>
        <div style="font-size:12px; color:#4B5A70;">${this.esc(r.category)} · ${this.esc(r.location)}${r.anonymous ? ' · <span style="color:var(--steel);">Anonymous</span>' : ''}</div>
        <div class="feed-card-meta">
          <span>${this.timeAgo(r.createdAt)}</span>
          <span>✓ ${r.confirmations || 0} confirms</span>
          ${State.userLocation ? `<span>${haversineKm(State.userLocation, { lat: r.lat, lng: r.lng }).toFixed(1)} km away</span>` : ''}
          ${r.ai && r.ai.emergency ? '<span style="color:var(--red); font-weight:700;">🚨 EMERGENCY</span>' : ''}
        </div>
      </div>
    `).join('');
    el.querySelectorAll('.feed-card').forEach(card => {
      card.addEventListener('click', () => onCardClick(card.dataset.id));
    });
  },

  renderMapFilterChips(activeFilter) {
    document.querySelectorAll('#filter-chips .chip').forEach(chip => {
      if (chip.dataset.distance) {
        chip.classList.toggle('active', Number(chip.dataset.distance) === State.distanceFilterKm);
      } else {
        chip.classList.toggle('active', chip.dataset.filter === activeFilter);
      }
    });
  },

  // ---------- My Reports view ----------
  renderMyStats() {
    const wrap = document.getElementById('my-stats');
    if (!wrap) return;
    const s = State.myStats();
    wrap.innerHTML = `
      <div class="points-card">
        <div class="points-num">${s.points}</div>
        <div class="points-label">Civic points</div>
      </div>
      <div class="badges-row">
        ${s.badges.length ? s.badges.map(b => `<span class="badge-pill" title="${this.esc(b.label)}">${b.icon} ${this.esc(b.label)}</span>`).join('') : '<span class="empty-queue">File reports and get them verified/resolved to earn badges.</span>'}
      </div>`;
  },

  renderMine(onCardClick) {
    const mine = State.myReports().slice().sort((a, b) => b.createdAt - a.createdAt);
    const el = document.getElementById('mine-list');
    if (!mine.length) {
      el.innerHTML = `<div class="empty-state">You haven't filed any reports yet.<br>Head to the Report tab to flag your first issue.</div>`;
      return;
    }
    el.innerHTML = mine.map(r => `
      <div class="mine-card" data-id="${r.id}">
        <img class="mine-thumb" src="${r.photo || this.placeholderImg()}" alt="">
        <div class="mine-body">
          <div class="mine-title">${this.esc(r.title)}${r.anonymous ? ' <span style="font-size:10px; color:var(--steel); font-weight:600;">(anonymous)</span>' : ''}</div>
          <div class="mine-sub">${this.esc(r.category)} · ${this.timeAgo(r.createdAt)}${State.estimateETA(r) ? ' · ETA: ' + State.estimateETA(r) : ''}</div>
        </div>
        <span class="stamp ${this.stampClass(r.status)}">${STATUS_LABEL[r.status] || r.status}</span>
      </div>
    `).join('');
    el.querySelectorAll('.mine-card').forEach(card => {
      card.addEventListener('click', () => onCardClick(card.dataset.id));
    });
  },

  placeholderImg() {
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#EEF0F3"/><text x="50" y="55" font-size="11" text-anchor="middle" fill="#7C8AA0" font-family="sans-serif">No photo</text></svg>`
    );
  },

  // ---------- Officer Dashboard ----------
  renderDashStats() {
    const reports = State.reports;
    const total = reports.length;
    const pending = reports.filter(r => r.status === 'reported' || r.status === 'review').length;
    const inProgress = reports.filter(r => r.status === 'progress').length;
    const resolved = reports.filter(r => r.status === 'resolved').length;
    const el = document.getElementById('dash-stats');
    const cards = [
      ['Total reports', total],
      ['Pending review', pending],
      ['In progress', inProgress],
      ['Resolved', resolved]
    ];
    el.innerHTML = cards.map(([label, num]) => `
      <div class="dash-stat-card">
        <div class="dash-stat-num">${num}</div>
        <div class="dash-stat-label">${label}</div>
      </div>
    `).join('');
  },

  renderDeptFilterChips() {
    const wrap = document.getElementById('dept-filter-chips');
    const depts = State.departments();
    const existing = wrap.querySelectorAll('.chip[data-dept]:not([data-dept="all"])');
    existing.forEach(c => c.remove());
    depts.forEach(d => {
      const btn = document.createElement('button');
      btn.className = 'chip';
      btn.dataset.dept = d;
      btn.textContent = d;
      wrap.appendChild(btn);
    });
    wrap.querySelectorAll('.chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.dept === State.activeDeptFilter);
    });
  },

  renderEmergencyQueue(onAction) {
    const q = State.emergencyQueue();
    const wrap = document.getElementById('emergency-queue');
    if (!q.length) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = `
      <div class="emergency-queue-wrap">
        <div class="emergency-queue-title">🚨 Emergency escalations (${q.length})</div>
        ${q.map(r => `
          <div class="queue-row in-emergency" data-id="${r.id}">
            <img class="queue-thumb" src="${r.photo || this.placeholderImg()}" alt="">
            <div class="queue-body">
              <div class="queue-title">${this.esc(r.title)}</div>
              <div class="queue-meta">${this.esc(r.location)} · ${this.timeAgo(r.createdAt)} · Dept: ${r.ai.department}</div>
            </div>
            <div class="queue-actions">
              <button class="q-btn primary" data-action="dispatch" data-id="${r.id}">Dispatch team</button>
              <button class="q-btn" data-action="view" data-id="${r.id}">View</button>
            </div>
          </div>
        `).join('')}
      </div>`;
    wrap.querySelectorAll('.q-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onAction(btn.dataset.action, btn.dataset.id);
      });
    });
  },

  renderModerationQueue(onAction) {
    const q = State.moderationQueue();
    const wrap = document.getElementById('moderation-queue');
    const countEl = document.getElementById('mod-queue-count');
    countEl.textContent = q.length ? `${q.length} PENDING` : '';
    if (!q.length) {
      wrap.innerHTML = `<div class="empty-queue">No reports awaiting moderation. Nice and clean.</div>`;
      return;
    }
    wrap.innerHTML = q.map(r => `
      <div class="mod-row" data-id="${r.id}">
        <img class="queue-thumb" src="${r.photo || this.placeholderImg()}" alt="">
        <div class="queue-body">
          <div class="queue-title">${this.esc(r.title)}</div>
          <div class="mod-reason">${this.esc(r.moderation.reason)}</div>
        </div>
        <div class="queue-actions">
          <button class="q-btn primary" data-action="approve" data-id="${r.id}">Approve</button>
          <button class="q-btn danger" data-action="reject" data-id="${r.id}">Reject</button>
        </div>
      </div>
    `).join('');
    wrap.querySelectorAll('.q-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onAction(btn.dataset.action, btn.dataset.id);
      });
    });
  },

  renderWorkOrders(onCardClick) {
    let orders = State.workOrders();
    if (State.activeDeptFilter !== 'all') {
      orders = orders.filter(r => CATEGORY_DEPT[r.category] === State.activeDeptFilter);
    }
    const el = document.getElementById('work-orders');
    if (!orders.length) {
      el.innerHTML = `<div class="empty-queue">No active work orders for this filter.</div>`;
      return;
    }
    el.innerHTML = orders.map(r => `
      <div class="wo-card" data-id="${r.id}">
        <div class="wo-top">
          <span class="wo-title">${this.esc(r.title)}</span>
          <span class="stamp ${this.stampClass(r.status)}">${STATUS_LABEL[r.status]}</span>
        </div>
        <div class="wo-meta">${CATEGORY_DEPT[r.category]} · ${this.esc(r.location)} · ${this.timeAgo(r.createdAt)}</div>
        <div class="progress-bg"><div class="progress-fill" style="width:${r.progress || 0}%"></div></div>
      </div>
    `).join('');
    el.querySelectorAll('.wo-card').forEach(card => {
      card.addEventListener('click', () => onCardClick(card.dataset.id));
    });
  },

  renderDeptLoad() {
    const data = State.deptLoad();
    const max = Math.max(1, ...data.map(d => d.count));
    document.getElementById('dept-load').innerHTML = data.map(d => `
      <div class="dept-row">
        <span class="dn">${d.dept}</span>
        <div class="dept-bar-bg"><div class="dept-bar" style="width:${(d.count / max) * 100}%"></div></div>
        <span class="dv">${d.count}</span>
      </div>
    `).join('');
  },

  renderDeptResolution() {
    const data = State.deptResolutionRate();
    document.getElementById('dept-resolution').innerHTML = data.map(d => `
      <div class="dept-row">
        <span class="dn">${d.dept}</span>
        <div class="dept-bar-bg"><div class="dept-bar" style="width:${d.rate}%; background:var(--green);"></div></div>
        <span class="dv">${d.rate}%</span>
      </div>
    `).join('');
  },

  // ---------- Admin view ----------
  renderAdmin(onAction) {
    const deptList = document.getElementById('admin-dept-list');
    if (deptList) {
      deptList.innerHTML = State.adminDepartments.map(d => `
        <div class="admin-row">
          <span>${this.esc(d)}</span>
          <button class="remove-btn" data-dept="${this.esc(d)}">✕</button>
        </div>
      `).join('') || '<div class="empty-queue">No departments yet.</div>';
      deptList.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', () => onAction('remove-dept', btn.dataset.dept));
      });
    }

    const userList = document.getElementById('admin-user-list');
    if (userList) {
      userList.innerHTML = State.adminUsers.map(u => `
        <div class="admin-row">
          <span>${this.esc(u.name)}</span>
          <select data-user="${u.id}" class="role-select">
            <option value="citizen" ${u.role === 'citizen' ? 'selected' : ''}>Citizen</option>
            <option value="officer" ${u.role === 'officer' ? 'selected' : ''}>Officer</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
          </select>
          ${u.role === 'officer' ? `
            <select data-user-dept="${u.id}" class="dept-select">
              ${State.adminDepartments.map(d => `<option ${u.department === d ? 'selected' : ''}>${this.esc(d)}</option>`).join('')}
            </select>` : ''}
          <button class="remove-btn" data-user-remove="${u.id}">✕</button>
        </div>
      `).join('') || '<div class="empty-queue">No users yet.</div>';
      userList.querySelectorAll('.role-select').forEach(sel => {
        sel.addEventListener('change', () => onAction('change-role', { id: sel.dataset.user, role: sel.value }));
      });
      userList.querySelectorAll('.dept-select').forEach(sel => {
        sel.addEventListener('change', () => onAction('change-dept', { id: sel.dataset.userDept, department: sel.value }));
      });
      userList.querySelectorAll('[data-user-remove]').forEach(btn => {
        btn.addEventListener('click', () => onAction('remove-user', btn.dataset.userRemove));
      });
    }

    const versionEl = document.getElementById('admin-ai-version');
    if (versionEl) {
      versionEl.textContent = 'civic-triage-v1.2 · keyword-heuristic engine (mock) · last updated locally';
    }

    const costEl = document.getElementById('admin-ai-cost');
    if (costEl) {
      const runs = State.reports.filter(r => r.ai).length;
      const estCost = (runs * 0.0008).toFixed(4);
      costEl.innerHTML = `
        <div class="dept-row"><span class="dn">AI runs (mock)</span><span class="dv" style="width:auto;">${runs}</span></div>
        <div class="dept-row"><span class="dn">Est. cost</span><span class="dv" style="width:auto;">$${estCost}</span></div>
      `;
    }
  },

  // ---------- Modal ----------
  openModal(report, handlers) {
    const overlay = document.getElementById('modal-overlay');
    document.getElementById('modal-img').src = report.photo || this.placeholderImg();
    document.getElementById('modal-title').textContent = report.title;
    document.getElementById('modal-desc').textContent = report.description || 'No additional details provided.';
    document.getElementById('modal-cat').textContent = report.category;
    document.getElementById('modal-loc').textContent = report.location;
    document.getElementById('modal-time').textContent = this.timeAgo(report.createdAt) + (report.anonymous ? ' · Anonymous' : '');

    const etaItem = document.getElementById('modal-eta-item');
    const eta = State.estimateETA(report);
    if (etaItem) {
      if (eta) {
        etaItem.style.display = '';
        document.getElementById('modal-eta').textContent = eta;
      } else {
        etaItem.style.display = 'none';
      }
    }

    const stamp = document.getElementById('modal-stamp');
    stamp.className = `stamp ${this.stampClass(report.status)}`;
    stamp.textContent = STATUS_LABEL[report.status] || report.status;

    const flaggedStamp = document.getElementById('modal-flagged-stamp');
    flaggedStamp.style.display = report.moderation && report.moderation.flagged ? 'inline-block' : 'none';

    document.getElementById('modal-emergency-banner').classList.toggle('show', !!(report.ai && report.ai.emergency));

    const aiBlock = document.getElementById('modal-ai-block');
    if (report.ai) {
      aiBlock.style.display = 'block';
      aiBlock.innerHTML = `
        <div class="ai-card" style="margin-bottom:14px;">
          <div class="ai-card-head">AI analysis</div>
          <div class="ai-row"><span>Category</span><b>${report.ai.category}</b></div>
          <div class="ai-row"><span>Confidence</span><span class="ai-conf">${Math.round(report.ai.confidence * 100)}%</span></div>
          <div class="ai-row"><span>Severity</span><span class="ai-badge ${report.ai.emergency ? 'critical' : report.ai.severity}">${report.ai.emergency ? 'critical' : report.ai.severity}</span></div>
          <div class="ai-row"><span>Department</span><b>${report.ai.department}</b></div>
        </div>`;
    } else {
      aiBlock.style.display = 'none';
      aiBlock.innerHTML = '';
    }

    const flagNotice = document.getElementById('modal-flag-notice');
    if (report.moderation && report.moderation.flagged && report.moderation.pending) {
      flagNotice.style.display = 'block';
      flagNotice.textContent = `This report is pending moderation review: ${report.moderation.reason}`;
    } else {
      flagNotice.style.display = 'none';
    }

    overlay.classList.add('show');

    document.getElementById('vote-confirm').onclick = () => handlers.onConfirm(report.id);
    document.getElementById('vote-comment').onclick = () => handlers.onComment(report.id);
  },

  closeModal() {
    document.getElementById('modal-overlay').classList.remove('show');
  },

  esc(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }
};
