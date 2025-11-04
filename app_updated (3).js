// --- Initialize map ---
const map = L.map('map').setView([45.508888, -73.561668], 12);

// Base tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 20,
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

// --- Panes ---
map.createPane("roadsPane"); map.getPane("roadsPane").style.zIndex = 400;
map.createPane("collisionsPane"); map.getPane("collisionsPane").style.zIndex = 450;
map.createPane("heatPane"); map.getPane("heatPane").style.zIndex = 460;

// --- Severity helper ---
function graviteColor(value) {
  if (!value) return "green";
  const g = value.toLowerCase();
  if (g.includes("mortel") || g.includes("grave")) return "red";      // Serious/fatal
  if (g.includes("léger")) return "yellow";                           // Minor injury
  return "green";                                                     // No injury
}

// --- Map severity label helper ---
function getSeverityCategory(value) {
  if (!value) return "none";
  const g = value.toLowerCase();
  if (g.includes("mortel") || g.includes("grave")) return "serious";
  if (g.includes("léger")) return "minor";
  return "none";
}

// --- Layer variables ---
let bikeData = null;
let collisionsLayer = L.layerGroup();
let heatLayer = L.layerGroup();
let roadsLayer;
let layerControl;

// --- Multi-select filter UI ---
const filtersDiv = L.control({ position: 'topright' });
filtersDiv.onAdd = function() {
  const div = L.DomUtil.create('div', 'filters p-2 bg-white rounded shadow-sm');
  div.innerHTML = `
    <div><strong>Speed limit:</strong><br>
      <label><input type="checkbox" class="speedCheckbox" value="under50"> <50 km/h</label><br>
      <label><input type="checkbox" class="speedCheckbox" value="50"> 50 km/h</label><br>
      <label><input type="checkbox" class="speedCheckbox" value="60"> 60 km/h</label><br>
      <label><input type="checkbox" class="speedCheckbox" value="70"> 70 km/h</label><br>
      <label><input type="checkbox" class="speedCheckbox" value="80"> 80 km/h</label><br>
      <label><input type="checkbox" class="speedCheckbox" value="90"> 90 km/h</label><br>
      <label><input type="checkbox" class="speedCheckbox" value="100"> 100+ km/h</label>
    </div>
    <div class="mt-2"><strong>Severity:</strong><br>
      <label><input type="checkbox" class="graviteCheckbox" value="serious"> Serious injury or fatal</label><br>
      <label><input type="checkbox" class="graviteCheckbox" value="minor"> Injury without hospitalization</label><br>
      <label><input type="checkbox" class="graviteCheckbox" value="none"> No injury</label>
    </div>
  `;
  return div;
};
filtersDiv.addTo(map);

// --- Load bike accidents ---
fetch('./bikes.geojson')
  .then(res => res.json())
  .then(data => {
    bikeData = data;
    renderLayers();
    setupFilters();

    // Layer control setup after data loaded
    layerControl = L.control.layers(null, {
      "Accident Severity": collisionsLayer,
      "Heatmap": heatLayer,
      "Bike Network": roadsLayer
    }, { collapsed:false }).addTo(map);
  })
  .catch(err => console.error("❌ Failed to load bikes.geojson", err));

// --- Render layers ---
function renderLayers() {
  const speedChecks = Array.from(document.querySelectorAll('.speedCheckbox:checked')).map(c => c.value);
  const graviteChecks = Array.from(document.querySelectorAll('.graviteCheckbox:checked')).map(c => c.value);

  collisionsLayer.clearLayers();
  heatLayer.clearLayers();

  if (!bikeData) return;

  const filtered = bikeData.features.filter(f => {
    const speedVal = Number(f.properties.VITESSE_AUTOR);
    const gravVal = getSeverityCategory(f.properties.GRAVITE);

    const speedOk = speedChecks.length === 0 ? false : speedChecks.some(val => {
      if (val === 'under50') return speedVal < 50;
      if (val === '100') return speedVal >= 100;
      return speedVal === Number(val);
    });

    const gravOk = graviteChecks.length === 0 ? false : graviteChecks.includes(gravVal);

    return speedOk && gravOk;
  });

  // Add collision points
  filtered.forEach(f => {
    const latlng = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
    const marker = L.circleMarker(latlng, {
      radius: 6,
      fillColor: graviteColor(f.properties.GRAVITE),
      color: "#333",
      weight: 1,
      opacity: 1,
      fillOpacity: 0.8
    }).bindPopup(`<b>ID:</b> ${f.properties.NO_SEQ_COLL}<br>
                  <b>Speed:</b> ${f.properties.VITESSE_AUTOR} km/h<br>
                  <b>Gravité:</b> ${f.properties.GRAVITE}`);
    collisionsLayer.addLayer(marker);
  });

  // Heatmap with red (dense) -> green (sparse)
  const heatPoints = filtered.map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0], 0.6]);
  const heat = L.heatLayer(heatPoints, {
    pane: "heatPane",
    radius: 25,
    blur: 20,
    minOpacity: 0.25,
    gradient: {0.0: 'green', 0.5: 'yellow', 1.0: 'red'}
  });
  heatLayer.addLayer(heat);

  // Add layers to map if not already
  if (!map.hasLayer(collisionsLayer)) collisionsLayer.addTo(map);
  if (!map.hasLayer(heatLayer)) heatLayer.addTo(map);

  if (filtered.length > 0) map.fitBounds(collisionsLayer.getBounds());
}

// --- Setup filter listeners ---
function setupFilters() {
  document.querySelectorAll('.speedCheckbox, .graviteCheckbox')
    .forEach(c => c.addEventListener('change', renderLayers));
}

// --- Load bike network ---
fetch('./reseau_cyclable.json')
  .then(res => res.json())
  .then(data => {
    roadsLayer = L.geoJSON(data, {
      pane: "roadsPane",
      style: f => {
        const sep = (f.properties.SEPARATEUR_CODE || "").trim().toUpperCase();
        if (["M","C","J","S"].includes(sep)) return { color:"#66b7d0", weight:2, opacity:0.9 };
        if (["D","P"].includes(sep)) return { color:"#c780e8", weight:1.8, opacity:0.9 };
        return { color:"#737373", weight:1, opacity:0.5 };
      },
      onEachFeature: (f, layer) => layer.bindPopup("SEPARATEUR_CODE: " + f.properties.SEPARATEUR_CODE)
    }).addTo(map);

    // Add bike network to layer control if it exists
    if (layerControl) layerControl.addOverlay(roadsLayer, "Bike Network");

    // --- Bike network legend ---
    const bikeLegend = L.control({ position: "bottomright" });
    bikeLegend.onAdd = function() {
      const div = L.DomUtil.create("div", "info legend p-2 bg-white rounded shadow-sm");
      div.innerHTML = `
        <h6>Bike Lanes</h6>
        <div><span style="display:inline-block;width:20px;height:3px;background:#66b7d0;margin-right:6px;"></span>Protected lanes</div>
        <div><span style="display:inline-block;width:20px;height:3px;background:#c780e8;margin-right:6px;"></span>Non-protected lanes</div>
      
      `;
      return div;
    };
    bikeLegend.addTo(map);
  })
  .catch(err => console.error("❌ Failed to load reseau_cyclable.json", err));
