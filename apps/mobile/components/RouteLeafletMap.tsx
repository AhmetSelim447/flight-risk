import React, { useMemo } from 'react';
import { WebView } from 'react-native-webview';

type PointRole = 'DEP' | 'ARR' | 'ALT' | 'NEAR' | 'ACFT';

type Point = {
  label: string;
  role: PointRole;
  lat: number;
  lng: number;
  name?: string;
  extra?: string;
};

type Props = {
  dep?: Point | null;
  arr?: Point | null;
  alternates?: Point[];
  nearbyAirports?: Point[];
  aircraft?: Point[];
  riskColor?: string;
};

export default function RouteLeafletMap({
  dep,
  arr,
  alternates = [],
  nearbyAirports = [],
  aircraft = [],
  riskColor = '#2563eb',
}: Props) {
  const html = useMemo(() => {
    const points = [
      dep,
      arr,
      ...alternates,
      ...nearbyAirports,
      ...aircraft,
    ].filter(Boolean);

    return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map {
      height: 100%;
      width: 100%;
      margin: 0;
      padding: 0;
      background: #0b1220;
    }
    .marker {
      color: white;
      font-weight: 800;
      font-size: 10px;
      width: 40px;
      height: 40px;
      border-radius: 999px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid white;
      box-shadow: 0 8px 18px rgba(0,0,0,.35);
    }
    .dep { background: #3b82f6; }
    .arr { background: ${riskColor}; }
    .alt { background: #10b981; }
    .near { background: #f59e0b; }
    .acft {
      background: #111827;
      font-size: 18px;
    }
    .popup-title {
      font-weight: 800;
      margin-bottom: 4px;
    }
  </style>
</head>
<body>
  <div id="map"></div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const points = ${JSON.stringify(points)};
    const dep = ${JSON.stringify(dep)};
    const arr = ${JSON.stringify(arr)};

    const center = dep || arr || { lat: 39, lng: 35 };
    const map = L.map('map', { zoomControl: true }).setView([center.lat, center.lng], 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap'
    }).addTo(map);

    function iconFor(role) {
      let cls = 'near';
      let text = role;

      if (role === 'DEP') { cls = 'dep'; text = 'DEP'; }
      if (role === 'ARR') { cls = 'arr'; text = 'ARR'; }
      if (role === 'ALT') { cls = 'alt'; text = 'ALT'; }
      if (role === 'NEAR') { cls = 'near'; text = 'NEAR'; }
      if (role === 'ACFT') { cls = 'acft'; text = '✈'; }

      return L.divIcon({
        className: '',
        html: '<div class="marker ' + cls + '">' + text + '</div>',
        iconSize: [40, 40],
        iconAnchor: [20, 20]
      });
    }

    points.forEach(p => {
      const title = p.label || p.role;
      const name = p.name || '';
      const extra = p.extra || '';

      L.marker([p.lat, p.lng], { icon: iconFor(p.role) })
        .addTo(map)
        .bindPopup(
          '<div class="popup-title">' + title + '</div>' +
          '<div>' + name + '</div>' +
          (extra ? '<div>' + extra + '</div>' : '')
        );
    });

    if (dep && arr) {
      L.polyline(
        [[dep.lat, dep.lng], [arr.lat, arr.lng]],
        { color: '${riskColor}', weight: 4, dashArray: '10, 6' }
      ).addTo(map);
    }

    if (points.length > 1) {
      const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [55, 55] });
    }
  </script>
</body>
</html>
`;
  }, [dep, arr, alternates, nearbyAirports, aircraft, riskColor]);

  return (
    <WebView
      originWhitelist={['*']}
      source={{ html }}
      javaScriptEnabled
      domStorageEnabled
      mixedContentMode="always"
      style={{ flex: 1 }}
    />
  );
}