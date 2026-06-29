/* ============================================================
   map.js — Leaflet map rendering for the Map & Feed view
   ============================================================ */

const MapModule = {
  map: null,
  markers: [],
  streetLayer: null,
  satelliteLayer: null,

  STATUS_COLOR: {
    reported: '#7C8AA0',
    review: '#E0922E',
    verified: '#2E6BE0',
    progress: '#1B3F8C',
    resolved: '#2E8B57'
  },

  init() {
    if (this.map) return;
    this.map = L.map('real-map', { zoomControl: true }).setView([CITY_CENTER.lat, CITY_CENTER.lng], 13);

    this.streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.map);

    this.satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri'
    });

    // fix sizing glitches when the map view becomes visible after being hidden
    setTimeout(() => this.map.invalidateSize(), 200);
  },

  setLayer(layer) {
    if (!this.map) return;
    if (layer === 'satellite') {
      if (this.map.hasLayer(this.streetLayer)) this.map.removeLayer(this.streetLayer);
      this.satelliteLayer.addTo(this.map);
    } else {
      if (this.map.hasLayer(this.satelliteLayer)) this.map.removeLayer(this.satelliteLayer);
      this.streetLayer.addTo(this.map);
    }
  },

  clearMarkers() {
    this.markers.forEach(m => this.map.removeLayer(m));
    this.markers = [];
  },

  render(reports, onMarkerClick) {
    this.init();
    this.clearMarkers();

    reports.forEach(r => {
      const color = r.ai && r.ai.emergency ? '#C1432E' : (this.STATUS_COLOR[r.status] || '#7C8AA0');
      const icon = L.divIcon({
        className: 'ch-marker',
        html: `<div style="
            width:16px;height:16px;border-radius:50%;
            background:${color};border:2px solid #fff;
            box-shadow:0 1px 4px rgba(0,0,0,.4);
            ${r.ai && r.ai.emergency ? 'animation:chpulse 1.2s infinite;' : ''}
          "></div>`,
        iconSize: [16, 16]
      });
      const marker = L.marker([r.lat, r.lng], { icon }).addTo(this.map);
      marker.bindTooltip(r.title, { direction: 'top', offset: [0, -8] });
      marker.on('click', () => onMarkerClick && onMarkerClick(r.id));
      this.markers.push(marker);
    });

    if (!document.getElementById('ch-marker-pulse-style')) {
      const style = document.createElement('style');
      style.id = 'ch-marker-pulse-style';
      style.textContent = `@keyframes chpulse{0%{box-shadow:0 0 0 0 rgba(193,67,46,.6);}70%{box-shadow:0 0 0 8px rgba(193,67,46,0);}100%{box-shadow:0 0 0 0 rgba(193,67,46,0);}}`;
      document.head.appendChild(style);
    }
  },

  invalidate() {
    if (this.map) setTimeout(() => this.map.invalidateSize(), 150);
  }
};