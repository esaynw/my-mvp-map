// Initialize map
const map = L.map('map').setView([45.508888, -73.561668], 12);

// Base tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 20,
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Define Layer Groups
const roadsLayer = L.layerGroup().addTo(map);
const collisionsLayer = L.layerGroup().addTo(map);

// Helper: Color by gravity
function graviteColor(value) {
  if (!value) return "green";
  const g = value.toLowerCase();
  if (g.includes("mortel") || g.includes("grave")) return "red";
  if (g.includes("léger")) return "yellow";
  return "green";
}

// Load bike lane network
fetch('./reseau_cyclable.json')
  .then(res => res.json())
  .then(data => {
    const reseau = L.geoJSON(data, {
      style: feature => {
        const sep = (feature.properties.SEPARATEUR_CODE || "").trim().toUpperCase();
        if (["M", "C", "J", "S"].includes(sep))
          return { color: "#66b7d0", weight: 2, opacity: 0.9 };
        if (["D", "P"].includes(sep))
          return { color: "#c780e8", weight: 1.8, opacity: 0.9 };
        return { color: "#737373", weight: 1, opacity: 0.5 };
      },
      onEachFeature: (feature, layer) =>
        layer.bindPopup("SEPARATEUR_CODE: " + feature.properties.SEPARATEUR_CODE)
    }).addTo(roadsLayer);
  })
  .catch(err => console.error("❌ Failed to load reseau_cyclable.json", err));

// Load bike accidents (points + heatmap)
fetch('./bikes.geojson')
  .then(res => res.json())
  .then(data => {
    const heatPoints = [];

    const collisions = L.geoJSON(data, {
      pointToLayer: (feature, latlng) => {
        const grav = feature.properties.GRAVITE || "";
        heatPoints.push([latlng.lat, latlng.lng, 0.6]); // for heatmap
        return L.circleMarker(latlng, {
          radius: 6,
          fillColor: graviteColor(grav),
          color: "#333",
          weight: 1,
          opacity: 1,
          fillOpacity: 0.8
        });
      },
      onEachFeature: (feature, layer) => {
        layer.bindPopup(
          `<b>Collision ID:</b> ${feature.properties.NO_SEQ_COLL}<br>
           <b>Bikes involved:</b> ${feature.properties.NB_BICYCLETTE}<br>
           <b>Gravité:</b> ${feature.properties.GRAVITE}`
        );
      }
    }).addTo(collisionsLayer);

    // Create the heatmap layer
    const heat = L.heatLayer(heatPoints, {
      radius: 25,
      blur: 20,
      minOpacity: 0.25,
      gradient: {
        0.2: "#ebd369ff",
        0.4: "#f0b505ff",
        0.6: "#f48c04ff",
        0.8: "#ff0303ff"
      }
    }).addTo(map);

    // Fit map and bring collisions to front
    map.fitBounds(collisions.getBounds());
    collisionsLayer.bringToFront();

    // Optional layer control
    const overlays = {
      "Bike Accidents (points)": collisionsLayer,
      "Heatmap": heat
    };
    L.control.layers(null, overlays, { collapsed: false }).addTo(map);
  })
  .catch(err => {
    console.error("❌ Failed to load bikes.geojson", err);
  });

// Legend
const legend = L.control({ position: "bottomright" });
legend.onAdd = function () {
  const div = L.DomUtil.create("div", "info legend");
  div.style.background = "white";
  div.style.padding = "8px";
  div.style.border = "1px solid #ccc";
  div.innerHTML = `
    <h4>Legend</h4>
    <div><span style="display:inline-block;width:12px;height:12px;background:red;margin-right:6px;border:1px solid #fff;"></span>Serious injury or fatal</div>
    <div><span style="display:inline-block;width:12px;height:12px;background:yellow;margin-right:6px;border:1px solid #ccc;"></span>Injury without hospitalization</div>
    <div><span style="display:inline-block;width:12px;height:12px;background:green;margin-right:6px;border:1px solid #fff;"></span>No injury</div>
    <hr>
    <div><span style="display:inline-block;width:20px;height:3px;background:#4287f5;margin-right:6px;"></span>Protected bike lanes (M, C, J, S)</div>
    <div><span style="display:inline-block;width:20px;height:3px;background:#cd95e6;margin-right:6px;"></span>Non-protected bike lanes (D, P)</div>
  `;
  return div;
};
legend.addTo(map);
