/* ============================================================
   state.js — central data store, persistence, derived stats
   ============================================================ */

const STORAGE_KEY = 'ch_reports_v1';

const CATEGORIES = [
  'Pothole', 'Water Leak', 'Garbage Dumping', 'Broken Streetlight',
  'Drainage Blockage', 'Traffic Signal', 'Park Maintenance', 'Public Safety Hazard'
];

const CATEGORY_DEPT = {
  'Pothole': 'Public Works',
  'Water Leak': 'Water Board',
  'Garbage Dumping': 'Sanitation',
  'Broken Streetlight': 'Electrical',
  'Drainage Blockage': 'Public Works',
  'Traffic Signal': 'Traffic Dept.',
  'Park Maintenance': 'Parks & Rec',
  'Public Safety Hazard': 'Emergency Response'
};

const STATUS_ORDER = ['reported', 'review', 'verified', 'progress', 'resolved'];
const STATUS_LABEL = {
  reported: 'Reported', review: 'Under review', verified: 'Verified',
  progress: 'In progress', resolved: 'Resolved'
};

// Tirupati-ish bounding box for demo coordinates
const CITY_CENTER = { lat: 13.6288, lng: 79.4192 };

const State = {
  reports: [],
  currentUser: { id: 'u-demo', name: 'You' },
  activeView: 'report',
  activeMapFilter: 'all',
  activeDeptFilter: 'all',
  pendingPhoto: null,   // { dataUrl } currently staged in the report form
  pendingAI: null,      // AI analysis result for the staged photo

  load() {
    let raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { raw = null; }
    if (raw) {
      try {
        this.reports = JSON.parse(raw);
        return;
      } catch (e) { /* fall through to seed */ }
    }
    this.reports = seedReports();
    this.save();
  },

  save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.reports)); }
    catch (e) { /* storage unavailable — continue in-memory only */ }
  },

  reset() {
    this.reports = seedReports();
    this.save();
  },

  addReport(report) {
    this.reports.unshift(report);
    this.save();
  },

  getReport(id) {
    return this.reports.find(r => r.id === id);
  },

  updateReport(id, patch) {
    const r = this.getReport(id);
    if (!r) return null;
    Object.assign(r, patch);
    this.save();
    return r;
  },

  advanceStatus(id, newStatus, note) {
    const r = this.getReport(id);
    if (!r) return;
    r.status = newStatus;
    r.history.push({ status: newStatus, at: Date.now(), note: note || '' });
    this.save();
  },

  voteConfirm(id) {
    const r = this.getReport(id);
    if (!r) return;
    r.confirmations = (r.confirmations || 0) + 1;
    if (r.status === 'reported' && r.confirmations >= 3) {
      r.status = 'verified';
      r.history.push({ status: 'verified', at: Date.now(), note: 'Auto-verified by community confirmations' });
    }
    this.save();
  },

  addComment(id, text) {
    const r = this.getReport(id);
    if (!r) return;
    r.comments = r.comments || [];
    r.comments.push({ text, at: Date.now(), by: this.currentUser.name });
    this.save();
  },

  resolveModeration(id, action) {
    const r = this.getReport(id);
    if (!r) return;
    r.moderation.pending = false;
    r.moderation.action = action; // 'approved' | 'rejected'
    if (action === 'rejected') r.status = 'rejected';
    this.save();
  },

  // ---- derived stats ----

  stats() {
    const total = this.reports.length;
    const resolved = this.reports.filter(r => r.status === 'resolved').length;
    const active = this.reports.filter(r => ['review', 'verified', 'progress'].includes(r.status)).length;
    return { total, resolved, active };
  },

  emergencyQueue() {
    return this.reports.filter(r => r.ai && r.ai.emergency && r.status !== 'resolved');
  },

  moderationQueue() {
    return this.reports.filter(r => r.moderation && r.moderation.pending);
  },

  myReports() {
    return this.reports.filter(r => r.userId === this.currentUser.id);
  },

  filteredFeed() {
    const f = this.activeMapFilter;
    if (f === 'all') return this.reports;
    const map = { reported: 'reported', verified: 'verified', progress: 'progress', resolved: 'resolved' };
    return this.reports.filter(r => r.status === map[f]);
  },

  departments() {
    return [...new Set(Object.values(CATEGORY_DEPT))];
  },

  deptLoad() {
    const depts = this.departments();
    return depts.map(d => {
      const count = this.reports.filter(r => CATEGORY_DEPT[r.category] === d && r.status !== 'resolved').length;
      return { dept: d, count };
    }).sort((a, b) => b.count - a.count);
  },

  deptResolutionRate() {
    const depts = this.departments();
    return depts.map(d => {
      const all = this.reports.filter(r => CATEGORY_DEPT[r.category] === d);
      const resolved = all.filter(r => r.status === 'resolved').length;
      const rate = all.length ? Math.round((resolved / all.length) * 100) : 0;
      return { dept: d, rate, total: all.length };
    });
  },

  workOrders() {
    return this.reports.filter(r => r.status === 'progress' || r.status === 'verified');
  }
};

function uid(prefix) {
  return prefix + '-' + Math.random().toString(36).slice(2, 9);
}

function jitterCoord(base, spread) {
  return base + (Math.random() - 0.5) * spread;
}

function seedReports() {
  const samples = [
    { title: 'Deep pothole on main road', category: 'Pothole', desc: 'About 2 feet wide, vehicles swerving to avoid it near the bus stand junction.', status: 'progress', emergency: false, loc: 'Tirupati Bus Stand' },
    { title: 'Overflowing garbage bin', category: 'Garbage Dumping', desc: 'Bin has not been collected for over a week, attracting strays.', status: 'reported', emergency: false, loc: 'Korlagunta Market' },
    { title: 'Streetlight out for 5 nights', category: 'Broken Streetlight', desc: 'Entire stretch is dark, residents worried about safety after sunset.', status: 'verified', emergency: false, loc: 'Tiruchanoor Road' },
    { title: 'Major water pipeline leak', category: 'Water Leak', desc: 'Continuous flow flooding the side lane, wasting large volume of water.', status: 'review', emergency: false, loc: 'Air Bypass Road' },
    { title: 'Live wire hanging over footpath', category: 'Public Safety Hazard', desc: 'Snapped electric line dangling at head height after last night\'s storm.', status: 'reported', emergency: true, loc: 'Renigunta Road' },
    { title: 'Blocked stormwater drain', category: 'Drainage Blockage', desc: 'Drain clogged with debris, causing waterlogging during rain.', status: 'resolved', emergency: false, loc: 'Leela Mahal Circle' },
    { title: 'Traffic signal stuck on red', category: 'Traffic Signal', desc: 'Signal has been stuck on one phase for two days causing jams.', status: 'verified', emergency: false, loc: 'Gandhi Road Junction' },
    { title: 'Park swings broken', category: 'Park Maintenance', desc: 'Two swing seats snapped off, exposed sharp chain ends.', status: 'progress', emergency: false, loc: 'Kapila Theertham Park' }
  ];

  return samples.map((s, i) => {
    const lat = jitterCoord(CITY_CENTER.lat, 0.03);
    const lng = jitterCoord(CITY_CENTER.lng, 0.03);
    const createdAt = Date.now() - (samples.length - i) * 86400000 * 1.3;
    return {
      id: uid('rep'),
      userId: i % 3 === 0 ? 'u-demo' : uid('user'),
      title: s.title,
      description: s.desc,
      category: s.category,
      location: s.loc,
      lat, lng,
      photo: null,
      status: s.status,
      confirmations: Math.floor(Math.random() * 6),
      comments: [],
      ai: {
        category: s.category,
        confidence: 0.78 + Math.random() * 0.2,
        severity: s.emergency ? 'critical' : ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
        department: CATEGORY_DEPT[s.category],
        emergency: s.emergency,
        summary: 'Auto-classified from seed data for demo purposes.'
      },
      moderation: { pending: false, action: 'approved', flagged: false, reason: '' },
      progress: s.status === 'progress' ? 35 + Math.floor(Math.random() * 50) : (s.status === 'resolved' ? 100 : 0),
      history: [{ status: 'reported', at: createdAt, note: 'Report submitted' }].concat(
        s.status !== 'reported' ? [{ status: s.status, at: createdAt + 3600000, note: 'Status updated' }] : []
      ),
      createdAt
    };
  });
}