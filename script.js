// Initialize the map
var map = L.map('map').setView([-4.0435, 39.6682], 10); // Centered on Mombasa

// Add a base map layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
}).addTo(map);

// Placeholder GeoJSON data
var seaLevelData = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "properties": { "year": 1980 },
            "geometry": {
                "type": "Point",
                "coordinates": [39.6682, -4.0435]
            }
        },
        {
            "type": "Feature",
            "properties": { "year": 2000 },
            "geometry": {
                "type": "Point",
                "coordinates": [39.6682, -4.0435]
            }
        },
        {
            "type": "Feature",
            "properties": { "year": 2020 },
            "geometry": {
                "type": "Point",
                "coordinates": [39.6682, -4.0435]
            }
        }
    ]
};

// Function to update the map with data for a specific year
function updateMap(year) {
    var filteredData = seaLevelData.features.filter(function(feature) {
        return feature.properties.year == year;
    });

    // Clear existing layers
    map.eachLayer(function(layer) {
        if (layer instanceof L.GeoJSON) {
            map.removeLayer(layer);
        }
    });

    // Add the filtered data
    L.geoJSON({ "type": "FeatureCollection", "features": filteredData }).addTo(map);
}

// Add event listeners for each section
document.querySelectorAll('.section').forEach(function(section) {
    section.addEventListener('mouseenter', function() {
        var year = section.getAttribute('data-year');
        updateMap(year);
    });
});

// Add initial data to the map (for example, the first year)
updateMap(1980);

// Add content dynamically
document.getElementById('sections').innerHTML = `
    <div class="section" data-year="1980">
        <h2>1980</h2>
        <p>The mean sea level in 1980 was observed to be at a baseline level, with minor fluctuations that did not significantly impact the coastal regions of Mombasa.</p>
    </div>
    <div class="section" data-year="2000">
        <h2>2000</h2>
        <p>By the year 2000, there was a noticeable rise in the mean sea level, leading to increased coastal erosion and affecting local infrastructure.</p>
    </div>
    <div class="section" data-year="2020">
        <h2>2020</h2>
        <p>In 2020, the mean sea level had risen significantly, resulting in frequent flooding in low-lying areas and greater environmental challenges.</p>
    </div>
`;
