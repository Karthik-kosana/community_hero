/* ============================================================
   ai.js — mock AI vision / classification engine
   Simulates what a real YOLOv8 + NLP moderation pipeline would
   return, using simple heuristics over filename/title/description
   text so the demo feels responsive and "smart" without a backend.
   ============================================================ */

const AI = {

  // Keyword heuristics mapped to categories
  KEYWORDS: {
    'Pothole': ['pothole', 'crack', 'road damage', 'hole', 'asphalt'],
    'Water Leak': ['leak', 'pipe', 'water', 'flood', 'burst'],
    'Garbage Dumping': ['garbage', 'trash', 'dump', 'waste', 'litter'],
    'Broken Streetlight': ['streetlight', 'light', 'lamp', 'dark'],
    'Drainage Blockage': ['drain', 'sewage', 'blockage', 'clog', 'waterlog'],
    'Traffic Signal': ['signal', 'traffic light', 'junction'],
    'Park Maintenance': ['park', 'swing', 'bench', 'playground'],
    'Public Safety Hazard': ['wire', 'fire', 'gas', 'collapse', 'live wire', 'explosion', 'electrocut', 'unsafe']
  },

  EMERGENCY_TRIGGERS: [
    'fire', 'gas leak', 'live wire', 'electrocut', 'collapse', 'explosion',
    'live electric', 'gas smell', 'building collapse', 'snapped cable', 'sparking'
  ],

  /**
   * Run a (simulated) full analysis pass: classification, severity,
   * department routing, duplicate-likelihood, and moderation screen.
   * Returns a Promise to mimic network/inference latency.
   */
  analyze({ title = '', description = '', filename = '', existingReports = [] } = {}) {
    return new Promise((resolve) => {
      const delay = 900 + Math.random() * 700;
      setTimeout(() => {
        const text = `${title} ${description} ${filename}`.toLowerCase();
        const category = this._classify(text);
        const emergency = this._isEmergency(text);
        const severity = emergency ? 'critical' : this._estimateSeverity(text);
        const confidence = this._confidenceFor(category, text);
        const department = CATEGORY_DEPT[category] || 'Public Works';
        const duplicate = this._checkDuplicate(text, existingReports);
        const moderation = this._moderate(text);

        resolve({
          category,
          confidence,
          severity,
          department,
          emergency,
          duplicate,
          moderation,
          summary: this._summary(category, severity, emergency)
        });
      }, delay);
    });
  },

  _classify(text) {
    let best = null, bestScore = 0;
    for (const [cat, words] of Object.entries(this.KEYWORDS)) {
      let score = 0;
      words.forEach(w => { if (text.includes(w)) score += 1; });
      if (score > bestScore) { bestScore = score; best = cat; }
    }
    if (!best) {
      // fall back to a plausible-looking guess so the UI never looks empty
      const cats = Object.keys(this.KEYWORDS);
      best = cats[Math.floor(Math.random() * cats.length)];
    }
    return best;
  },

  _isEmergency(text) {
    return this.EMERGENCY_TRIGGERS.some(t => text.includes(t));
  },

  _estimateSeverity(text) {
    const highWords = ['large', 'major', 'deep', 'flooding', 'blocking', 'dangerous', 'hazard'];
    const lowWords = ['small', 'minor', 'slight'];
    if (highWords.some(w => text.includes(w))) return 'high';
    if (lowWords.some(w => text.includes(w))) return 'low';
    return 'medium';
  },

  _confidenceFor(category, text) {
    const hits = (this.KEYWORDS[category] || []).filter(w => text.includes(w)).length;
    const base = 0.62 + hits * 0.09;
    return Math.min(0.97, base + Math.random() * 0.08);
  },

  _checkDuplicate(text, existingReports) {
    // Very rough proximity-of-words duplicate check for demo purposes
    const dup = existingReports.find(r => {
      const rt = `${r.title} ${r.description}`.toLowerCase();
      const words = text.split(/\s+/).filter(w => w.length > 4);
      const overlap = words.filter(w => rt.includes(w)).length;
      return overlap >= 3;
    });
    return dup ? { isDuplicate: true, matchId: dup.id, matchTitle: dup.title } : { isDuplicate: false };
  },

  _moderate(text) {
    const toxic = ['idiot', 'stupid', 'hate', 'kill', 'slur'];
    const spam = ['buy now', 'http://', 'www.', 'click here', 'free money'];
    const flaggedToxic = toxic.some(w => text.includes(w));
    const flaggedSpam = spam.some(w => text.includes(w));
    if (flaggedToxic || flaggedSpam) {
      return {
        pending: true,
        flagged: true,
        reason: flaggedToxic ? 'Possible toxic/abusive language detected' : 'Possible spam content detected',
        action: null
      };
    }
    return { pending: false, flagged: false, reason: '', action: 'approved' };
  },

  _summary(category, severity, emergency) {
    if (emergency) {
      return `Flagged as a life-safety hazard. Routed instantly to Emergency Response for immediate dispatch.`;
    }
    const sevText = { low: 'minor', medium: 'moderate', high: 'significant' }[severity] || 'moderate';
    return `Classified as ${category} with ${sevText} severity. Routed to ${CATEGORY_DEPT[category] || 'the relevant department'}.`;
  }
};