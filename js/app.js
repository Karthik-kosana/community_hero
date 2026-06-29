/* ============================================================
   app.js — event wiring, view routing, form submission flow
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  State.load();
  bindNav();
  bindReportForm();
  bindMapFilters();
  bindDeptFilters();
  bindLayerToggle();
  bindModal();
  bindResetLink();

  renderActiveView();
});

function switchView(view) {
  State.activeView = view;
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
  document.querySelectorAll('.view').forEach(sec => sec.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  renderActiveView();
}

function renderActiveView() {
  UI.renderHeaderStats();
  switch (State.activeView) {
    case 'report':
      break;
    case 'map':
      UI.renderMapFilterChips(State.activeMapFilter);
      MapModule.render(State.filteredFeed(), (id) => openReportModal(id));
      MapModule.invalidate();
      UI.renderFeed((id) => openReportModal(id));
      break;
    case 'mine':
      UI.renderMine((id) => openReportModal(id));
      break;
    case 'dashboard':
      UI.renderDashStats();
      UI.renderDeptFilterChips();
      UI.renderEmergencyQueue(handleEmergencyAction);
      UI.renderModerationQueue(handleModerationAction);
      UI.renderWorkOrders((id) => openReportModal(id));
      UI.renderDeptLoad();
      UI.renderDeptResolution();
      break;
  }
}

function bindNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
}

/* ---------------- Report form ---------------- */

function bindReportForm() {
  const zone = document.getElementById('upload-zone');
  const fileInput = document.getElementById('file-input');
  const submitBtn = document.getElementById('submit-report');
  const locationInput = document.getElementById('f-location');
  const locationStatus = document.getElementById('location-status');

  zone.addEventListener('click', () => fileInput.click());
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.style.borderColor = 'var(--blue)'; });
  zone.addEventListener('dragleave', () => { zone.style.borderColor = ''; });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.style.borderColor = '';
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handlePhoto(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) handlePhoto(fileInput.files[0]);
  });

  // "Use my location" affordance: try geolocation, else accept manual text
  locationInput.addEventListener('focus', () => {
    if (locationInput.value || !navigator.geolocation) return;
    locationStatus.textContent = 'Tip: type an address/landmark, or allow location access below.';
  });

  document.getElementById('upload-zone').insertAdjacentHTML('afterend', '');

  submitBtn.addEventListener('click', submitReport);

  // Try to silently offer geolocation as a convenience once on load
  if (navigator.geolocation && !locationInput.value) {
    locationStatus.textContent = 'Location auto-detected when available, or enter manually.';
  }
}

function handlePhoto(file) {
  if (!file.type.startsWith('image/')) {
    UI.toast('Please choose an image file.');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    State.pendingPhoto = e.target.result;
    const zone = document.getElementById('upload-zone');
    zone.classList.add('has-image');
    zone.innerHTML = `<img src="${e.target.result}" alt="Uploaded photo">`;
    runAIAnalysis();
  };
  reader.readAsDataURL(file);
}

function runAIAnalysis() {
  UI.renderAIPanelLoading();
  const title = document.getElementById('f-title').value;
  const desc = document.getElementById('f-desc').value;
  AI.analyze({ title, description: desc, filename: 'photo', existingReports: State.reports })
    .then(result => {
      State.pendingAI = result;
      UI.renderAIPanelResult(result);
      // Auto-fill category select if user hasn't chosen one
      const catSelect = document.getElementById('f-category');
      if (!catSelect.value) catSelect.value = result.category;
    });
}

function submitReport() {
  const title = document.getElementById('f-title').value.trim();
  const desc = document.getElementById('f-desc').value.trim();
  const catSelect = document.getElementById('f-category');
  const location = document.getElementById('f-location').value.trim();

  if (!title) {
    UI.toast('Please describe the issue before submitting.');
    document.getElementById('f-title').focus();
    return;
  }
  if (!location) {
    UI.toast('Please add a location so it can be routed correctly.');
    document.getElementById('f-location').focus();
    return;
  }

  const finalize = (ai) => {
    const category = catSelect.value || (ai && ai.category) || CATEGORIES[0];
    const lat = jitterCoord(CITY_CENTER.lat, 0.03);
    const lng = jitterCoord(CITY_CENTER.lng, 0.03);
    const report = {
      id: uid('rep'),
      userId: State.currentUser.id,
      title,
      description: desc,
      category,
      location,
      lat, lng,
      photo: State.pendingPhoto,
      status: ai && ai.emergency ? 'verified' : 'reported',
      confirmations: 0,
      comments: [],
      ai: ai || null,
      moderation: ai && ai.moderation ? ai.moderation : { pending: false, flagged: false, reason: '', action: 'approved' },
      progress: 0,
      history: [{ status: 'reported', at: Date.now(), note: 'Report submitted' }],
      createdAt: Date.now()
    };
    State.addReport(report);
    resetReportForm();
    UI.renderHeaderStats();
    if (ai && ai.emergency) {
      UI.toast('🚨 Emergency detected — escalated to Emergency Response.');
    } else {
      UI.toast('Report submitted. Thanks for helping your community!');
    }
  };

  if (State.pendingAI) {
    finalize(State.pendingAI);
  } else {
    // No photo uploaded: still run a quick text-only classification
    AI.analyze({ title, description: desc, filename: '', existingReports: State.reports }).then(finalize);
  }
}

function resetReportForm() {
  document.getElementById('f-title').value = '';
  document.getElementById('f-desc').value = '';
  document.getElementById('f-category').value = '';
  document.getElementById('f-location').value = '';
  document.getElementById('location-status').textContent = '';
  document.getElementById('file-input').value = '';
  const zone = document.getElementById('upload-zone');
  zone.classList.remove('has-image');
  zone.innerHTML = `<div class="upload-icon">📷</div><div class="upload-text"><strong>Tap to add a photo</strong><br>or drag &amp; drop</div>`;
  UI.clearAIPanel();
  State.pendingPhoto = null;
  State.pendingAI = null;
}

/* ---------------- Map & feed filters ---------------- */

function bindMapFilters() {
  document.getElementById('filter-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    State.activeMapFilter = chip.dataset.filter;
    UI.renderMapFilterChips(State.activeMapFilter);
    MapModule.render(State.filteredFeed(), (id) => openReportModal(id));
    UI.renderFeed((id) => openReportModal(id));
  });
}

function bindLayerToggle() {
  document.querySelector('.map-layer-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.layer-btn');
    if (!btn) return;
    document.querySelectorAll('.layer-btn').forEach(b => b.classList.toggle('active', b === btn));
    MapModule.setLayer(btn.dataset.layer);
  });
}

/* ---------------- Dashboard ---------------- */

function bindDeptFilters() {
  document.getElementById('dept-filter-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    State.activeDeptFilter = chip.dataset.dept;
    UI.renderDeptFilterChips();
    UI.renderWorkOrders((id) => openReportModal(id));
  });
}

function handleEmergencyAction(action, id) {
  if (action === 'dispatch') {
    State.advanceStatus(id, 'progress', 'Emergency response team dispatched');
    State.updateReport(id, { progress: 20 });
    UI.toast('Emergency response team dispatched.');
    renderActiveView();
  } else if (action === 'view') {
    openReportModal(id);
  }
}

function handleModerationAction(action, id) {
  if (action === 'approve') {
    State.resolveModeration(id, 'approved');
    UI.toast('Report approved and published.');
  } else if (action === 'reject') {
    State.resolveModeration(id, 'rejected');
    UI.toast('Report rejected and removed from public feed.');
  }
  renderActiveView();
}

/* ---------------- Modal ---------------- */

function bindModal() {
  document.getElementById('modal-close').addEventListener('click', UI.closeModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') UI.closeModal();
  });
}

function openReportModal(id) {
  const report = State.getReport(id);
  if (!report) return;
  UI.openModal(report, {
    onConfirm: (reportId) => {
      State.voteConfirm(reportId);
      UI.toast('Thanks for confirming this issue.');
      openReportModal(reportId); // re-render modal with updated confirmation count/status
      renderActiveView();
    },
    onComment: (reportId) => {
      const text = prompt('Add a comment about this issue:');
      if (text && text.trim()) {
        State.addComment(reportId, text.trim());
        UI.toast('Comment added.');
      }
    }
  });
}

/* ---------------- Reset ---------------- */

function bindResetLink() {
  document.getElementById('reset-link').addEventListener('click', (e) => {
    e.preventDefault();
    if (confirm('Reset all demo data? This clears every report and restores the sample dataset.')) {
      State.reset();
      resetReportForm();
      renderActiveView();
      UI.toast('All data has been reset.');
    }
  });
}