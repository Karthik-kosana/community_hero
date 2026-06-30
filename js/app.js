/* ============================================================
   app.js — event wiring, view routing, form submission flow
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  State.load();
  bindNav();
  bindReportForm();
  bindMapFilters();
  bindCategoryTimeFilters();
  bindDeptFilters();
  bindLayerToggle();
  bindModal();
  bindResetLink();
  bindAdmin();

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
      ReportPinMap.invalidate();
      break;
    case 'map':
      UI.renderMapFilterChips(State.activeMapFilter);
      MapModule.render(State.filteredFeed(), (id) => openReportModal(id));
      MapModule.invalidate();
      UI.renderFeed((id) => openReportModal(id));
      break;
    case 'mine':
      UI.renderMyStats();
      UI.renderMine((id) => openReportModal(id));
      break;
    case 'dashboard':
      UI.renderDashStats();
      UI.renderDeptFilterChips();
      checkNewEmergencies();
      UI.renderEmergencyQueue(handleEmergencyAction);
      UI.renderModerationQueue(handleModerationAction);
      UI.renderWorkOrders((id) => openReportModal(id));
      UI.renderDeptLoad();
      UI.renderDeptResolution();
      break;
    case 'admin':
      UI.renderAdmin(handleAdminAction);
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

  // Pin-drop map: citizen taps/drags to set the exact damage location
  const coordsEl = document.getElementById('report-map-coords');
  ReportPinMap.init((lat, lng) => {
    State.pendingGeo = { lat, lng };
    coordsEl.textContent = `Pin set at ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    coordsEl.classList.add('ok');
    if (!locationInput.value) {
      locationInput.value = `Near ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
  });

  // "Use my location" affordance: try geolocation, else accept manual text
  locationInput.addEventListener('focus', () => {
    if (locationInput.value || !navigator.geolocation) return;
    locationStatus.textContent = 'Tip: type an address/landmark, or tap "Use my location" below.';
  });

  const geoBtn = document.getElementById('use-location-btn');
  if (geoBtn) {
    geoBtn.addEventListener('click', () => {
      if (!navigator.geolocation) {
        UI.toast('Geolocation is not available in this browser.');
        return;
      }
      locationStatus.textContent = 'Detecting your location...';
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          State.userLocation = { lat: latitude, lng: longitude };
          State.pendingGeo = { lat: latitude, lng: longitude };
          if (!locationInput.value) locationInput.value = `Near ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
          locationStatus.textContent = '✓ Location detected and attached to this report.';
          locationStatus.classList.add('ok');
          ReportPinMap.setPosition(latitude, longitude, 16);
          coordsEl.textContent = `Pin set at ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
          coordsEl.classList.add('ok');
        },
        () => {
          locationStatus.textContent = 'Could not get location — please type an address/landmark instead, or drop the pin on the map.';
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  }

  const anonCheck = document.getElementById('f-anonymous');
  if (anonCheck) {
    anonCheck.addEventListener('change', () => { State.pendingAnonymous = anonCheck.checked; });
  }

  const catSelect = document.getElementById('f-category');
  if (catSelect) {
    catSelect.addEventListener('change', () => {
      const hint = document.getElementById('category-hint');
      if (hint) hint.textContent = '';
    });
  }

  document.getElementById('upload-zone').insertAdjacentHTML('afterend', '');

  submitBtn.addEventListener('click', submitReport);

  // Try to silently offer geolocation as a convenience once on load
  if (navigator.geolocation && !locationInput.value) {
    locationStatus.textContent = 'Tap "Use my location" or enter manually.';
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
  UI.renderAIPanelStage('uploading');
  const title = document.getElementById('f-title').value;
  const desc = document.getElementById('f-desc').value;

  setTimeout(() => UI.renderAIPanelStage('analyzing'), 500);
  setTimeout(() => UI.renderAIPanelStage('duplicates'), 1100);

  AI.analyze({ title, description: desc, filename: 'photo', existingReports: State.reports })
    .then(result => {
      State.pendingAI = result;
      UI.renderAIPanelResult(result);
      const catSelect = document.getElementById('f-category');
      const hint = document.getElementById('category-hint');
      if (result.confidence < 0.6) {
        // Low confidence: don't silently auto-fill — ask the citizen to confirm/edit
        if (hint) hint.textContent = `AI wasn't fully sure (${Math.round(result.confidence * 100)}%) — please confirm or pick the right category.`;
        if (!catSelect.value) catSelect.value = result.category;
        catSelect.classList.add('needs-review');
      } else {
        if (hint) hint.textContent = '';
        catSelect.classList.remove('needs-review');
        if (!catSelect.value) catSelect.value = result.category;
      }
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
    const lat = State.pendingGeo ? State.pendingGeo.lat : jitterCoord(CITY_CENTER.lat, 0.03);
    const lng = State.pendingGeo ? State.pendingGeo.lng : jitterCoord(CITY_CENTER.lng, 0.03);
    const report = {
      id: uid('rep'),
      userId: State.currentUser.id,
      title,
      description: desc,
      category,
      location,
      lat, lng,
      photo: State.pendingPhoto,
      anonymous: !!State.pendingAnonymous,
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
  State.pendingAnonymous = false;
  State.pendingGeo = null;
  const coordsEl = document.getElementById('report-map-coords');
  if (coordsEl) { coordsEl.textContent = ''; coordsEl.classList.remove('ok'); }
  const center = State.userLocation || CITY_CENTER;
  ReportPinMap.setPosition(center.lat, center.lng, 14);
  const anonCheck = document.getElementById('f-anonymous');
  if (anonCheck) anonCheck.checked = false;
  const catHint = document.getElementById('category-hint');
  if (catHint) catHint.textContent = '';
}

/* ---------------- Map & feed filters ---------------- */

function bindMapFilters() {
  document.getElementById('filter-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    if (chip.dataset.distance) {
      handleDistanceFilterClick(chip);
      return;
    }
    State.activeMapFilter = chip.dataset.filter;
    UI.renderMapFilterChips(State.activeMapFilter);
    MapModule.render(State.filteredFeed(), (id) => openReportModal(id));
    UI.renderFeed((id) => openReportModal(id));
  });
}

function handleDistanceFilterClick(chip) {
  const km = Number(chip.dataset.distance);
  if (State.distanceFilterKm === km) {
    State.distanceFilterKm = null;
    UI.renderMapFilterChips(State.activeMapFilter);
    MapModule.render(State.filteredFeed(), (id) => openReportModal(id));
    UI.renderFeed((id) => openReportModal(id));
    return;
  }
  if (!navigator.geolocation) {
    UI.toast('Geolocation is not available in this browser.');
    return;
  }
  UI.toast('Finding reports near you...');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      State.userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      State.distanceFilterKm = km;
      UI.renderMapFilterChips(State.activeMapFilter);
      MapModule.render(State.filteredFeed(), (id) => openReportModal(id));
      MapModule.invalidate();
      UI.renderFeed((id) => openReportModal(id));
    },
    () => UI.toast('Could not get your location.'),
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

function bindLayerToggle() {
  document.querySelector('.map-layer-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.layer-btn');
    if (!btn) return;
    document.querySelectorAll('.layer-btn').forEach(b => b.classList.toggle('active', b === btn));
    MapModule.setLayer(btn.dataset.layer);
  });
}

function bindCategoryTimeFilters() {
  const catSel = document.getElementById('category-filter');
  const timeSel = document.getElementById('time-filter');
  if (catSel) {
    catSel.addEventListener('change', () => {
      State.activeCategoryFilter = catSel.value;
      MapModule.render(State.filteredFeed(), (id) => openReportModal(id));
      UI.renderFeed((id) => openReportModal(id));
    });
  }
  if (timeSel) {
    timeSel.addEventListener('change', () => {
      State.activeTimeFilter = timeSel.value;
      MapModule.render(State.filteredFeed(), (id) => openReportModal(id));
      UI.renderFeed((id) => openReportModal(id));
    });
  }
}

/* ---------------- Emergency audible alert (brief §6.4) ---------------- */

let seenEmergencyIds = new Set(JSON.parse(localStorage.getItem('ch_seen_emergencies') || '[]'));

function checkNewEmergencies() {
  const q = State.emergencyQueue();
  const newOnes = q.filter(r => !seenEmergencyIds.has(r.id));
  if (newOnes.length) {
    playEmergencyAlert();
    newOnes.forEach(r => seenEmergencyIds.add(r.id));
    localStorage.setItem('ch_seen_emergencies', JSON.stringify([...seenEmergencyIds]));
  }
}

function playEmergencyAlert() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    setTimeout(() => { osc.stop(); ctx.close(); }, 350);
  } catch (e) { /* audio unavailable — silently ignore */ }
}

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

/* ---------------- Admin ---------------- */

function bindAdmin() {
  const addDeptBtn = document.getElementById('admin-add-dept');
  if (addDeptBtn) {
    addDeptBtn.addEventListener('click', () => {
      const input = document.getElementById('admin-new-dept');
      const name = input.value.trim();
      if (!name) return;
      if (State.adminDepartments.includes(name)) { UI.toast('Department already exists.'); return; }
      State.adminDepartments.push(name);
      State.saveAdminData();
      input.value = '';
      UI.renderAdmin(handleAdminAction);
      UI.toast(`Department "${name}" added.`);
    });
  }
  const addUserBtn = document.getElementById('admin-add-user');
  if (addUserBtn) {
    addUserBtn.addEventListener('click', () => {
      const nameInput = document.getElementById('admin-new-user');
      const roleSelect = document.getElementById('admin-new-role');
      const name = nameInput.value.trim();
      if (!name) return;
      State.adminUsers.push({ id: uid('user'), name, role: roleSelect.value });
      State.saveAdminData();
      nameInput.value = '';
      UI.renderAdmin(handleAdminAction);
      UI.toast(`${name} added as ${roleSelect.value}.`);
    });
  }
}

function handleAdminAction(action, payload) {
  if (action === 'remove-dept') {
    State.adminDepartments = State.adminDepartments.filter(d => d !== payload);
    State.saveAdminData();
    UI.renderAdmin(handleAdminAction);
  } else if (action === 'remove-user') {
    State.adminUsers = State.adminUsers.filter(u => u.id !== payload);
    State.saveAdminData();
    UI.renderAdmin(handleAdminAction);
  } else if (action === 'change-role') {
    const { id, role } = payload;
    const u = State.adminUsers.find(x => x.id === id);
    if (u) u.role = role;
    State.saveAdminData();
    UI.toast('Role updated.');
  } else if (action === 'change-dept') {
    const { id, department } = payload;
    const u = State.adminUsers.find(x => x.id === id);
    if (u) u.department = department;
    State.saveAdminData();
    UI.toast('Department assignment updated.');
  }
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
