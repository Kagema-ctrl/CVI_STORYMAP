// ===== Base map =====
var map = L.map('map').setView([-3.6, 40.0], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);

// ===== Globals =====
let layers = { physical: null, socio: null, indices: null };
let raw = {};                    // raw GeoJSON cache
let active = { mode: 'index', indexKey: 'CVI', group: null, key: null };
let legendControl;
let equalBreaksCache = {};       // cache breaks per attribute (CVI/PVI/SoVI)

// ===== Field map (adjust names if needed) =====
const FIELDS = {
  physical: {
    SLR:   { value: 'grid_cod_1',   rank: 'RANK_SLR',   title: 'Sea-Level Rise (ranked)' },
    SWH:   { value: 'MEAN_SIG_W',   rank: 'RANK_SIGWA',   title: 'Mean Significant Wave Height (ranked)' },
    SLOPE: { value: 'grid_code1', rank: 'RANK_SLOPE', title: 'Coastal Slope (ranked)' },
    GEOM:  { value: 'CLASS',  rank: 'RANK_GEOMO',  title: 'Geomorphology (ranked)' },
    SLC:   { value: 'WLR',   rank: 'RANK_SLC',   title: 'Shoreline Change (ranked)' },
    BATHY: { value: 'grid_code', rank: 'RANK_BATHY', title: 'Bathymetry (ranked)' },
    TIDE:  { value: 'TIDAL_RANG',  rank: 'RANK_TIDAL',  title: 'Mean Tidal Range (ranked)' },
    ELEV:  { value: 'grid_code_',  rank: 'RANK_ELEVA',  title: 'Coastal Elevation (ranked)' }
  },
  socio: {
    LULC:  { value: 'LULC_Class',  rank: 'RANK_LULC',  title: 'Land Use / Land Cover (ranked)' },
    POP:   { value: 'gridcode',   rank: 'RANK_POP',   title: 'Population Density (ranked)' },
    ROAD:  { value: 'NEAR_DIST',  rank: 'RANK_ROADS',  title: 'Distance from Roads (ranked)' }
  },
  indices: {
    CVI:   { value: 'CVI',   title: 'Coastal Vulnerability Index' },
    PVI:   { value: 'PVI_nrm',   title: 'Physical Vulnerability Index' },
    SoVI:  { value: 'SVI_nrm',  title: 'Social Vulnerability Index' },
    CVI_CLASS_FIELD: 'CVI_Class' // optional, used only if you want to show classes instead of equal breaks
  }
};

// ===== Color ramps =====
// 5-step sequential for equal-interval classes (light → dark)
function ramp5(i) {
  // i in {1..5}
  return i === 1 ? '#f7fbff' :
         i === 2 ? '#cce5ff' :
         i === 3 ? '#66b2ff' :
         i === 4 ? '#1f78b4' :
                    '#08306b';
}
// Ranked (1..5) for indicator ranks
function rankColor(r){ return ramp5(r); }

// ===== Utilities =====
function fmt(x){ return (x==null || x==='') ? '—' : (isNaN(Number(x)) ? x : Number(x).toFixed(2)); }

// Compute 5 equal-interval breaks [b0..b5] from values (min..max)
function computeEqualBreaks(values) {
  const v = values.filter(n => typeof n === 'number' && !isNaN(n));
  if (v.length === 0) return null;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const step = (max - min) / 5;
  const breaks = [min, min+step, min+2*step, min+3*step, min+4*step, max];
  // Ensure monotonic rounding for display (does not change classing)
  return breaks;
}
// Return class index 1..5 for value given breaks [b0..b5]
function classifyEqual(value, breaks) {
  if (value == null || isNaN(Number(value))) return 3;
  const v = Number(value);
  // inclusive on upper bound of last class
  if (v <= breaks[1]) return 1;
  if (v <= breaks[2]) return 2;
  if (v <= breaks[3]) return 3;
  if (v <= breaks[4]) return 4;
  return 5;
}

// ===== Legend =====
function buildLegend() {
  if (legendControl) { legendControl.remove(); legendControl = null; }
  legendControl = L.control({ position: 'bottomright' });
  legendControl.onAdd = function(){
    const div = L.DomUtil.create('div','info legend');
    let html = '';

    if (active.mode === 'indicator') {
      const fm = FIELDS[active.group][active.key];
      const rn = {1:'Very Low',2:'Low',3:'Moderate',4:'High',5:'Very High'};
      html += `<div><b>${fm.title}</b></div>`;
      [1,2,3,4,5].forEach(r=>{
        html += `<div><i style="background:${rankColor(r)}"></i>Rank ${r} &ndash; ${rn[r]}</div>`;
      });
    } else {
      // Equal-interval legend for CVI/PVI/SoVI
      const attr = FIELDS.indices[active.indexKey].value;
      const br = equalBreaksCache[attr];
      html += `<div><b>${FIELDS.indices[active.indexKey].title}</b></div>`;
      if (br) {
        for (let i=1;i<=5;i++){
          const lo = br[i-1], hi = br[i];
          html += `<div><i style="background:${ramp5(i)}"></i>${fmt(lo)} – ${fmt(hi)} ${i===5?'(highest vulnerability)':''}</div>`;
        }
      } else {
        html += `<div>Equal-interval classes will appear once data loads.</div>`;
      }
    }
    div.innerHTML = html;
    return div;
  };
  legendControl.addTo(map);
}

// ===== Styles & popups =====
function styleIndicator(groupKey, key){
  return function(f){
    const fm = FIELDS[groupKey][key];
    const r  = Number(f.properties[fm.rank]);
    return { color:'#444', weight:0.6, fillOpacity:0.75, fillColor: rankColor(r) };
  };
}
function popupIndicator(groupKey, key){
  return function(f){
    const fm = FIELDS[groupKey][key];
    const p = f.properties || {};
    return `<strong>Segment ${p.SegmentID}</strong><br>
      County: ${p.County}<br>
      ${fm.title}: ${fmt(p[fm.value])}<br>
      Rank: ${fmt(p[fm.rank])}`;
  };
}

// Equal-interval styling for CVI/PVI/SoVI (from one combined indices layer)
function styleIndexEqual(attr){
  const br = equalBreaksCache[attr];
  return function(f){
    const v = Number(f.properties[attr]);
    const cls = br ? classifyEqual(v, br) : 3;
    return { color:'#222', weight:0.6, fillOpacity:0.75, fillColor: ramp5(cls) };
  };
}
function popupIndex(attr, title){
  return function(f){
    const p = f.properties || {};
    return `<strong>Segment ${p.SegmentID}</strong><br>
      County: ${p.County}<br>
      ${title}: ${fmt(p[attr])}`;
  };
}

// ===== Render =====
function fitOnce(geoLayer){
  try {
    const b = geoLayer.getBounds();
    if (b && b.isValid()) map.fitBounds(b.pad(0.05));
  } catch(e){}
}

function render(){
  // remove present thematic layers
  Object.values(layers).forEach(Lyr => { if (Lyr && map.hasLayer(Lyr)) map.removeLayer(Lyr); });

  if (active.mode === 'indicator') {
    const group = active.group;   // 'physical' | 'socio'
    const key   = active.key;     // e.g., 'SLR' | 'LULC'
    layers[group] = L.geoJSON(raw[group], {
      style: styleIndicator(group, key),
      onEachFeature: (f, layer) => layer.bindPopup(popupIndicator(group, key)(f))
    }).addTo(map);
    fitOnce(layers[group]);

  } else {
    // indices from ONE combined file
    const attr = FIELDS.indices[active.indexKey].value; // 'CVI' | 'PVI' | 'SoVI'
    // compute equal-interval breaks on first use
    if (!equalBreaksCache[attr]) {
      const vals = (raw.indices.features || []).map(ft => {
        const v = Number(ft.properties?.[attr]);
        return isNaN(v) ? null : v;
      }).filter(v => v !== null);
      const br = computeEqualBreaks(vals);
      if (br) equalBreaksCache[attr] = br;
    }
    layers.indices = L.geoJSON(raw.indices, {
      style: styleIndexEqual(attr),
      onEachFeature: (f, layer) => layer.bindPopup(popupIndex(attr, FIELDS.indices[active.indexKey].title)(f))
    }).addTo(map);
    fitOnce(layers.indices);
  }
  buildLegend();
}

// ===== View setters =====
function showIndicator(group, key){
  active = { mode: 'indicator', group, key, indexKey: null };
  render();
}
function showIndex(indexKey){   // 'CVI' | 'PVI' | 'SoVI'
  active = { mode: 'index', indexKey, group: null, key: null };
  render();
}
function zoomToCounty(name){
  // subset from the dataset currently in view
  let dataKey = (active.mode === 'indicator') ? active.group : 'indices';
  const subset = L.geoJSON(raw[dataKey], { filter: f => (f.properties?.County === name) });
  const b = subset.getBounds();
  if (b && b.isValid()) map.fitBounds(b.pad(0.2));
}

// ===== Load datasets once =====
Promise.all([
  fetch('STORYMAP_SHP/Physical_Indicators.json').then(r=>r.json()),
  fetch('STORYMAP_SHP/Socio_Indicators.json').then(r=>r.json()),
  fetch('STORYMAP_SHP/CVI.json').then(r=>r.json()) // <-- combined CVI/PVI/SoVI
]).then(([physical, socio, indices])=>{
  raw.physical = physical;
  raw.socio    = socio;
  raw.indices  = indices;
  showIndex('CVI'); // default view
});

// ===== Hook up sections (hover triggers) =====
document.querySelectorAll('.section').forEach(sec=>{
  sec.addEventListener('mouseenter', ()=>{
    const g = sec.getAttribute('data-group');   // 'physical' | 'socio'
    const k = sec.getAttribute('data-key');     // e.g., 'SLR','LULC'
    const idx = sec.getAttribute('data-index'); // 'CVI','PVI','SoVI'
    const county = sec.getAttribute('data-county');

    if (g && k && FIELDS[g] && FIELDS[g][k]) showIndicator(g, k);
    else if (idx && FIELDS.indices[idx]) showIndex(idx);

    if (county) zoomToCounty(county);
  });
});
