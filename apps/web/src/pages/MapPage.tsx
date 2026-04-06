// apps/web/src/pages/MapPage.tsx
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

import { fetchTrafficByBBox, type TrafficAircraft } from "../lib/traffic";

import { fetchBrief, type BriefResponse, API_BASE } from "../lib/api";
import { loadSettings, convWind, convDist } from "../lib/settings";
import { getAirportByIcaoCached } from "../lib/airportsCache";

// --- Yardımcı: rüzgâr oku (Leaflet divIcon) ---
function windArrow(windDirDeg?: number, windVal?: number, unitLabel: string = "kt") {
  if (windDirDeg == null) return null;
  const rotation = windDirDeg;
  const html = `
    <div class="leaflet-wind" style="transform: rotate(${rotation}deg)">
      <div class="leaflet-wind-label">${windVal ?? ""}${windVal != null ? unitLabel : ""}</div>
    </div>
  `;
  return L.divIcon({ className: "", html, iconSize: [0, 0] });
}

// --- Yardımcı: merkez + heading ile ≈2 km pist hattı ---
function runwayLine(center: [number, number], headingDeg: number) {
  const Rkm = 1.0;
  const to = (lat: number, lng: number, brg: number, distKm: number) => {
    const R = 6371,
      δ = distKm / R,
      θ = (brg * Math.PI) / 180;
    const φ1 = (lat * Math.PI) / 180,
      λ1 = (lng * Math.PI) / 180;
    const sinφ1 = Math.sin(φ1),
      cosφ1 = Math.cos(φ1);
    const sinδ = Math.sin(δ),
      cosδ = Math.cos(δ);
    const sinθ = Math.sin(θ),
      cosθ = Math.cos(θ);
    const sinφ2 = sinφ1 * cosδ + cosφ1 * sinδ * cosθ;
    const φ2 = Math.asin(sinφ2);
    const λ2 = λ1 + Math.atan2(sinθ * sinδ * cosφ1, cosδ - sinφ1 * sinφ2);
    return [(φ2 * 180) / Math.PI, (((λ2 * 180) / Math.PI) + 540) % 360 - 180] as [number, number];
  };
  const [lat, lng] = center;
  const a = to(lat, lng, headingDeg, Rkm);
  const b = to(lat, lng, (headingDeg + 180) % 360, Rkm);
  return [a, b] as [[number, number], [number, number]];
}

// --- Basit renkli marker (DEP/ARR/ALT/NEAR) ---
function dotIcon(color: string) {
  const html = `
    <div style="
      width:14px;height:14px;border-radius:999px;
      background:${color};
      border:2px solid rgba(255,255,255,.9);
      box-shadow:0 2px 10px rgba(0,0,0,.35);
    "></div>
  `;
  return L.divIcon({ className: "", html, iconSize: [14, 14], iconAnchor: [7, 7] });
}

// --- Fade anim CSS (ALT + NEAR) ---
function ensureFadeCssOnce() {
  const id = "pin-fade-css";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.innerHTML = `
    .pin-fade-in { opacity: 0; transform: translateY(-4px); }
    .pin-fade-in.pin-fade-in--on { opacity: 1; transform: translateY(0); transition: opacity .25s ease, transform .25s ease; }
    .pin-fade-out { opacity: 1; }
    .pin-fade-out.pin-fade-out--on { opacity: 0; transition: opacity .2s ease; }
  `;
  document.head.appendChild(style);
}

function applyFadeInToMarker(marker: any) {
  const el = marker?._icon as HTMLElement | undefined;
  if (!el) return;
  el.classList.add("pin-fade-in");
  requestAnimationFrame(() => el.classList.add("pin-fade-in--on"));
}

function fadeOutLayerGroupAndRemove(group: L.LayerGroup | null, onDone: () => void) {
  if (!group) return;
  group.eachLayer((l) => {
    // @ts-ignore
    const el = (l as any)?._icon as HTMLElement | undefined;
    if (!el) return;
    el.classList.add("pin-fade-out");
    requestAnimationFrame(() => el.classList.add("pin-fade-out--on"));
  });
  setTimeout(onDone, 220);
}

type TrafficMarkerEntry = {
  marker: L.Marker;
  trail: L.Polyline;
  aircraft: TrafficAircraft;
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  fromTs: number;
  toTs: number;
  history: L.LatLngTuple[];
};

type AlternatePopupDetail = {
  icao: string;
  name?: string;
  dist_km?: number;
  best_rwy_m?: number;
  rank_score?: number;
  badges?: string[];
  critical_notams?: number;
  crosswind_abs?: number;
  weather_label?: string;
  ceiling_label?: string;
  visibility_label?: string;
  reason_summary?: string;
};

export default function MapPage() {
  const mapEl = useRef<HTMLDivElement | null>(null);

  // Çizim katmanları
  const layerRef = useRef<{
    route?: L.Polyline;
    dep?: L.Marker;
    arr?: L.Marker;
    rwy?: L.Polyline;
    wind?: L.Marker;
  }>({});

  // Yakın meydanlar katmanı
  const nearbyLayerRef = useRef<L.LayerGroup | null>(null);

  // Alternates katmanı
  const altsLayerRef = useRef<L.LayerGroup | null>(null);
  const altsEnabledRef = useRef<boolean>(false);

  // Traffic katmanı
  const trafficLayerRef = useRef<L.LayerGroup | null>(null);
  const trafficMarkersRef = useRef<Map<string, TrafficMarkerEntry>>(new Map());
  const trafficAbortRef = useRef<AbortController | null>(null);
  const trafficRefreshTimerRef = useRef<number | null>(null);
  const trafficAnimFrameRef = useRef<number | null>(null);
  const trafficEnabledRef = useRef<boolean>(true);

  // UI active state refs
  const nearEnabledRef = useRef<boolean>(false);
  const btnNearRef = useRef<HTMLButtonElement | null>(null);
  const btnAltsRef = useRef<HTMLButtonElement | null>(null);
  const btnTrafficRef = useRef<HTMLButtonElement | null>(null);
  const btnAirborneRef = useRef<HTMLButtonElement | null>(null);
  const trafficBadgeRef = useRef<HTMLSpanElement | null>(null);

  const airborneOnlyRef = useRef<boolean>(false);

  // async job cancel
  const altsJobRef = useRef<number>(0);
  const nearJobRef = useRef<number>(0);

  // Yakın Meydanlar button state kontrol
  const nearLoadingRef = useRef<boolean>(false);

  useEffect(() => {
    if (!mapEl.current) return;

    ensureFadeCssOnce();

    const popupSkinId = "traffic-popup-skin-css";
    if (!document.getElementById(popupSkinId)) {
      const st = document.createElement("style");
      st.id = popupSkinId;
      st.innerHTML = `
        .leaflet-popup-content-wrapper {
          background: rgba(24,24,27,0.94);
          color: #e5e7eb;
          border: 1px solid rgba(63,63,70,1);
          border-radius: 12px;
        }
        .leaflet-popup-tip {
          background: rgba(24,24,27,0.94);
        }
        .leaflet-popup-content {
          margin: 12px 14px;
        }
      `;
      document.head.appendChild(st);
    }

    // Leaflet default marker fix (Vite)
    const DefaultIcon = L.icon({
      iconRetinaUrl: markerIcon2x,
      iconUrl: markerIcon,
      shadowUrl: markerShadow,
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });
    // @ts-expect-error override
    L.Marker.prototype.options.icon = DefaultIcon;

    const map = L.map(mapEl.current, {
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    // ====== PERF helpers (chunked marker add) ======
    const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
    const yieldEvery = async (i: number, every = 15) => {
      if (i > 0 && i % every === 0) await nextFrame();
    };

    function getAlternateDetailsFromBrief(rawBrief: string | null): AlternatePopupDetail[] {
      if (!rawBrief) return [];
      try {
        const brief = JSON.parse(rawBrief);
        const list = (brief?.risk?.alternateDetails ?? []) as AlternatePopupDetail[];
        return Array.isArray(list) ? list : [];
      } catch {
        return [];
      }
    }

    function getAlternateLabelIcaos(rawBrief: string | null): string[] {
      if (!rawBrief) return [];
      try {
        const brief = JSON.parse(rawBrief);
        const alts = Array.isArray(brief?.risk?.alternates) ? brief.risk.alternates : [];
        return alts
          .map((s: unknown) => String(s).toUpperCase().match(/^[A-Z]{4}/)?.[0])
          .filter(Boolean) as string[];
      } catch {
        return [];
      }
    }

    function getAlternateDetailByIcao(
      icao: string,
      details: AlternatePopupDetail[],
      fallbackIndex: number
    ) {
      return details.find((d) => d?.icao === icao) ?? details[fallbackIndex];
    }

    function formatAltPopupBadge(text: string, tone: "neutral" | "sky" | "rose" | "amber" = "neutral") {
      const styles =
        tone === "sky"
          ? "border:1px solid rgba(56,189,248,.35); background:rgba(56,189,248,.10); color:#bae6fd;"
          : tone === "rose"
          ? "border:1px solid rgba(244,63,94,.35); background:rgba(244,63,94,.10); color:#fecdd3;"
          : tone === "amber"
          ? "border:1px solid rgba(245,158,11,.35); background:rgba(245,158,11,.10); color:#fde68a;"
          : "border:1px solid rgba(63,63,70,1); background:rgba(39,39,42,.55); color:#e4e4e7;";

      return `<span style="display:inline-flex; align-items:center; padding:3px 8px; border-radius:999px; font-size:11px; font-weight:600; ${styles}">${text}</span>`;
    }

    function buildAlternatePopupHtml(opts: {
      exact: { icao: string; name?: string };
      detail?: AlternatePopupDetail;
      currentDepIcao?: string;
      currentArrIcao?: string;
      isTopPick: boolean;
    }) {
      const { exact, detail, currentDepIcao, currentArrIcao, isTopPick } = opts;

      const badges = Array.isArray(detail?.badges) ? detail!.badges!.slice(0, 4) : [];
      const metaBits: string[] = [];

      if (typeof detail?.dist_km === "number") metaBits.push(`Mesafe: ${detail.dist_km} km`);
      if (typeof detail?.best_rwy_m === "number") metaBits.push(`Pist: ${detail.best_rwy_m} m`);
      if (typeof detail?.critical_notams === "number") metaBits.push(`Kritik NOTAM: ${detail.critical_notams}`);
      if (typeof detail?.crosswind_abs === "number") metaBits.push(`Crosswind: ${detail.crosswind_abs} kt`);

      const weatherChips: string[] = [];
      if (detail?.weather_label) weatherChips.push(formatAltPopupBadge(detail.weather_label, "sky"));
      if (detail?.ceiling_label) weatherChips.push(formatAltPopupBadge(detail.ceiling_label));
      if (detail?.visibility_label) weatherChips.push(formatAltPopupBadge(detail.visibility_label));

      const badgeHtml = [
        isTopPick ? formatAltPopupBadge("★ En iyi öneri", "amber") : "",
        typeof detail?.rank_score === "number"
          ? formatAltPopupBadge(`Rank: ${detail.rank_score}`, "sky")
          : "",
        ...badges.map((b) => formatAltPopupBadge(b)),
      ]
        .filter(Boolean)
        .join("");

      const summaryHtml = detail?.reason_summary
        ? `<div style="
            margin-top:8px;
            margin-bottom:8px;
            padding:8px 10px;
            border-radius:10px;
            border:1px solid rgba(63,63,70,1);
            background:rgba(24,24,27,0.75);
            color:#d4d4d8;
            font-size:12px;
            line-height:1.45;
          ">${detail.reason_summary}</div>`
        : "";

      const metaHtml =
        metaBits.length > 0
          ? `<div style="margin-top:8px; display:grid; grid-template-columns:auto 1fr; gap:4px 8px; font-size:12px; color:#d4d4d8;">
              ${metaBits
                .map((m) => {
                  const parts = m.split(":");
                  const k = parts[0] ?? "";
                  const v = parts.slice(1).join(":").trim();
                  return `<div style="color:#a1a1aa;">${k}</div><div>${v}</div>`;
                })
                .join("")}
            </div>`
          : "";

      return `
        <div style="min-width:240px; max-width:280px;">
          <div style="font-size:13px; font-weight:700; margin-bottom:6px;">
            ${exact.icao}${exact.name ? " – " + exact.name : ""}
          </div>

          <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px;">
            ${badgeHtml}
            ${weatherChips.join("")}
          </div>

          ${summaryHtml}
          ${metaHtml}

          <div style="display:flex; gap:8px; margin-top:10px; margin-bottom:8px;">
            <button class="alt-dep-btn" style="
              flex:1;
              padding:6px 8px; font-size:12px; border-radius:8px;
              border:1px solid rgba(34,197,94,.35);
              background:rgba(34,197,94,.10);
              color:#bbf7d0; cursor:pointer;
            ">${exact.icao === currentDepIcao ? "Mevcut DEP" : "DEP yap"}</button>

            <button class="alt-arr-btn" style="
              flex:1;
              padding:6px 8px; font-size:12px; border-radius:8px;
              border:1px solid rgba(56,189,248,.35);
              background:rgba(56,189,248,.08);
              color:#bae6fd; cursor:pointer;
            ">${exact.icao === currentArrIcao ? "Mevcut ARR" : "ARR yap"}</button>
          </div>

          <button class="alt-fit-btn" style="
            width:100%;
            padding:6px 8px; font-size:12px; border-radius:8px;
            border:1px solid rgba(161,161,170,.35);
            background:rgba(39,39,42,.55);
            color:#e4e4e7; cursor:pointer;
          ">Haritada Göster</button>
        </div>
      `;
    }

    // ====== Traffic helpers ======
    function getTrafficBoundsBBox(currentMap: L.Map) {
      const bounds = currentMap.getBounds();
      return {
        minLon: bounds.getWest(),
        minLat: bounds.getSouth(),
        maxLon: bounds.getEast(),
        maxLat: bounds.getNorth(),
      };
    }

    function applyTrailStyle(trail: L.Polyline, aircraft: TrafficAircraft) {
      const onGround = Boolean(aircraft.onGround);

      trail.setStyle({
        color: "#f59e0b",
        weight: onGround ? 2 : 3,
        opacity: onGround ? 0.18 : 0.45,
        lineCap: "round",
        lineJoin: "round",
        interactive: false,
      });
    }

    const TRAFFIC_TRAIL_MAX_POINTS = 6;

    function pushTrailPoint(history: L.LatLngTuple[], point: L.LatLngTuple) {
      const last = history[history.length - 1];
      if (last && Math.abs(last[0] - point[0]) < 0.0001 && Math.abs(last[1] - point[1]) < 0.0001) {
        return history;
      }

      const next = [...history, point];
      if (next.length > TRAFFIC_TRAIL_MAX_POINTS) {
        next.splice(0, next.length - TRAFFIC_TRAIL_MAX_POINTS);
      }
      return next;
    }

    function getRouteTrafficBBox(currentMap: L.Map) {
      const depMarker = layerRef.current.dep;
      const arrMarker = layerRef.current.arr;

      if (!depMarker || !arrMarker) {
        return getTrafficBoundsBBox(currentMap);
      }

      const depPos = depMarker.getLatLng();
      const arrPos = arrMarker.getLatLng();

      const minLat = Math.min(depPos.lat, arrPos.lat);
      const maxLat = Math.max(depPos.lat, arrPos.lat);
      const minLon = Math.min(depPos.lng, arrPos.lng);
      const maxLon = Math.max(depPos.lng, arrPos.lng);

      const corridorKm = 120;

      const midLat = (depPos.lat + arrPos.lat) / 2;
      const latPad = corridorKm / 111;
      const lonPad = corridorKm / Math.max(25, 111 * Math.cos((midLat * Math.PI) / 180));

      return {
        minLon: minLon - lonPad,
        minLat: minLat - latPad,
        maxLon: maxLon + lonPad,
        maxLat: maxLat + latPad,
      };
    }

    function getPreferredTrafficBBox(currentMap: L.Map) {
      return getRouteTrafficBBox(currentMap);
    }

    function formatTrafficNumber(value?: number, suffix = "") {
      if (!Number.isFinite(value)) return "—";
      return `${Math.round(Number(value))}${suffix}`;
    }

    function formatTrafficUpdatedAgo(updatedAt?: number) {
      if (!updatedAt || !Number.isFinite(updatedAt)) return "—";

      const diffSec = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
      if (diffSec < 60) return `${diffSec}s ago`;

      const diffMin = Math.round(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;

      const diffHr = Math.round(diffMin / 60);
      return `${diffHr}h ago`;
    }

    function formatTrafficPopup(a: TrafficAircraft) {
      const callsign = a.callsign?.trim() || a.icao24 || "Unknown";
      const icao24 = a.icao24 || "—";
      const altitude = formatTrafficNumber(a.altitudeFt, " ft");
      const speed = formatTrafficNumber(a.speedKt, " kt");
      const heading = Number.isFinite(a.heading) ? `${Math.round(Number(a.heading))}°` : "—";
      const updatedAtText = a.updatedAt ? new Date(a.updatedAt).toLocaleTimeString() : "—";
      const updatedAgo = formatTrafficUpdatedAgo(a.updatedAt);
      const originCountry = a.originCountry || "—";
      const status = a.onGround ? "On ground" : "Airborne";

      return `
        <div style="min-width:220px; color:#e5e7eb;">
          <div style="font-size:14px; font-weight:700; margin-bottom:6px; color:#fde68a;">
            ${callsign}
          </div>

          <div style="display:grid; grid-template-columns:auto 1fr; gap:4px 8px; font-size:12px; line-height:1.35;">
            <div style="color:#9ca3af;">Status</div><div>${status}</div>
            <div style="color:#9ca3af;">ICAO24</div><div>${icao24}</div>
            <div style="color:#9ca3af;">Heading</div><div>${heading}</div>
            <div style="color:#9ca3af;">Altitude</div><div>${altitude}</div>
            <div style="color:#9ca3af;">Speed</div><div>${speed}</div>
            <div style="color:#9ca3af;">Country</div><div>${originCountry}</div>
            <div style="color:#9ca3af;">Updated</div><div>${updatedAtText} <span style="color:#a1a1aa;">(${updatedAgo})</span></div>
            <div style="color:#9ca3af;">Source</div><div>${a.source}</div>
          </div>
        </div>
      `;
    }

    function createTrafficIcon(heading?: number, onGround?: boolean) {
      const rotation = Number.isFinite(heading) ? Number(heading) : 0;
      const bg = onGround ? "rgba(245,158,11,.72)" : "rgba(245,158,11,.96)";
      const planeFill = onGround ? "#1f2937" : "#111827";

      return L.divIcon({
        className: "",
        html: `
          <div style="
            width:28px;
            height:28px;
            border-radius:999px;
            background:${bg};
            border:2px solid rgba(15,23,42,.95);
            box-shadow:0 2px 10px rgba(0,0,0,.45);
            display:flex;
            align-items:center;
            justify-content:center;
          ">
            <svg
              viewBox="0 0 64 64"
              width="18"
              height="18"
              style="
                display:block;
                transform:rotate(${rotation}deg);
                transform-origin:50% 50%;
              "
              aria-hidden="true"
            >
              <path
                d="M34 4
                   L40 20
                   L56 24
                   L56 30
                   L40 30
                   L40 44
                   L48 52
                   L48 58
                   L34 50
                   L34 60
                   L30 60
                   L30 50
                   L16 58
                   L16 52
                   L24 44
                   L24 30
                   L8 30
                   L8 24
                   L24 20
                   L30 4
                   Z"
                fill="${planeFill}"
                stroke="rgba(255,255,255,.18)"
                stroke-width="1.5"
                stroke-linejoin="round"
              />
            </svg>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
    }

    function ensureTrafficLayer(currentMap: L.Map) {
      if (!trafficLayerRef.current) {
        trafficLayerRef.current = L.layerGroup().addTo(currentMap);
      }
      return trafficLayerRef.current;
    }

    function stopTrafficAnimationLoop() {
      if (trafficAnimFrameRef.current != null) {
        cancelAnimationFrame(trafficAnimFrameRef.current);
        trafficAnimFrameRef.current = null;
      }
    }

    function clearTrafficMarkers() {
      stopTrafficAnimationLoop();

      trafficMarkersRef.current.forEach((entry) => {
        entry.marker.remove();
        entry.trail.remove();
      });
      trafficMarkersRef.current.clear();

      if (trafficLayerRef.current) {
        trafficLayerRef.current.clearLayers();
      }

      updateTrafficBadge(0);
    }

    function lerp(a: number, b: number, t: number) {
      return a + (b - a) * t;
    }

    function startTrafficAnimationLoop() {
      if (trafficAnimFrameRef.current != null) return;

      const tick = () => {
        trafficAnimFrameRef.current = requestAnimationFrame(tick);

        const now = Date.now();
        let hasAny = false;

        trafficMarkersRef.current.forEach((entry) => {
          hasAny = true;

          const duration = Math.max(1, entry.toTs - entry.fromTs);
          const t = Math.max(0, Math.min(1, (now - entry.fromTs) / duration));

          const lat = lerp(entry.fromLat, entry.toLat, t);
          const lon = lerp(entry.fromLon, entry.toLon, t);

          entry.marker.setLatLng([lat, lon]);

          const baseHistory =
            entry.history.length > 1 ? entry.history.slice(0, -1) : entry.history.slice();

          const animatedPoint: L.LatLngTuple = [lat, lon];
          const nextTrailPoints = [...baseHistory, animatedPoint];
          entry.trail.setLatLngs(nextTrailPoints);
        });

        if (!hasAny) {
          stopTrafficAnimationLoop();
        }
      };

      trafficAnimFrameRef.current = requestAnimationFrame(tick);
    }

    function upsertTrafficMarkers(currentMap: L.Map, aircraftList: TrafficAircraft[]) {
      const layer = ensureTrafficLayer(currentMap);
      const nextIds = new Set<string>();
      const now = Date.now();
      const animDurationMs = 12000;

      for (const aircraft of aircraftList) {
        const id = aircraft.id;
        nextIds.add(id);

        const existing = trafficMarkersRef.current.get(id);

        if (existing) {
          const currentPos = existing.marker.getLatLng();
          const nextPoint: L.LatLngTuple = [aircraft.lat, aircraft.lon];
          const updatedHistory = pushTrailPoint(existing.history, nextPoint);

          existing.fromLat = currentPos.lat;
          existing.fromLon = currentPos.lng;
          existing.toLat = aircraft.lat;
          existing.toLon = aircraft.lon;
          existing.fromTs = now;
          existing.toTs = now + animDurationMs;
          existing.aircraft = aircraft;
          existing.history = updatedHistory;

          existing.marker.setIcon(createTrafficIcon(aircraft.heading, aircraft.onGround));
          existing.marker.bindPopup(formatTrafficPopup(aircraft));
          existing.trail.setLatLngs(updatedHistory);
          applyTrailStyle(existing.trail, aircraft);

          continue;
        }

        const marker = L.marker([aircraft.lat, aircraft.lon], {
          icon: createTrafficIcon(aircraft.heading, aircraft.onGround),
          keyboard: false,
          title: aircraft.callsign || aircraft.icao24 || aircraft.id,
        });

        marker.bindPopup(formatTrafficPopup(aircraft));
        marker.addTo(layer);

        const initialHistory: L.LatLngTuple[] = [[aircraft.lat, aircraft.lon]];

        const trail = L.polyline(initialHistory, {
          color: "#f59e0b",
          weight: 3,
          opacity: 0.45,
          lineCap: "round",
          lineJoin: "round",
          interactive: false,
        }).addTo(layer);

        applyTrailStyle(trail, aircraft);

        trafficMarkersRef.current.set(id, {
          marker,
          trail,
          aircraft,
          fromLat: aircraft.lat,
          fromLon: aircraft.lon,
          toLat: aircraft.lat,
          toLon: aircraft.lon,
          fromTs: now,
          toTs: now,
          history: initialHistory,
        });
      }

      for (const [id, entry] of trafficMarkersRef.current.entries()) {
        if (nextIds.has(id)) continue;
        entry.marker.remove();
        entry.trail.remove();
        trafficMarkersRef.current.delete(id);
      }

      const visibleCount = trafficMarkersRef.current.size;
      updateTrafficBadge(visibleCount);

      if (visibleCount > 0) {
        startTrafficAnimationLoop();
      } else {
        stopTrafficAnimationLoop();
      }
    }

    async function refreshTraffic() {
      if (!trafficEnabledRef.current) {
        updateTrafficBadge(0);
        return;
      }

      const zoom = map.getZoom();
      if (zoom < 6) {
        clearTrafficMarkers();
        return;
      }

      trafficAbortRef.current?.abort();
      const controller = new AbortController();
      trafficAbortRef.current = controller;

      try {
        const bbox = getPreferredTrafficBBox(map);
        const response = await fetchTrafficByBBox(bbox, controller.signal);

        if (!trafficEnabledRef.current) return;

        const rawAircraft = Array.isArray(response.aircraft) ? response.aircraft : [];
        const filteredAircraft = airborneOnlyRef.current
          ? rawAircraft.filter((a) => !a.onGround)
          : rawAircraft;

        upsertTrafficMarkers(map, filteredAircraft);
        updateTrafficBadge(filteredAircraft.length);
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        console.error("[traffic] refresh failed:", err);
        updateTrafficBadge(0);
      }
    }

    function scheduleTrafficRefresh(delayMs = 0) {
      if (trafficRefreshTimerRef.current != null) {
        window.clearTimeout(trafficRefreshTimerRef.current);
        trafficRefreshTimerRef.current = null;
      }

      trafficRefreshTimerRef.current = window.setTimeout(() => {
        void refreshTraffic();
      }, delayMs);
    }

    // ====== UI active state helpers ======
    const applyNearBtnStyle = () => {
      const btn = btnNearRef.current;
      if (!btn) return;
      const active = nearEnabledRef.current;
      btn.style.opacity = active ? "1" : "0.85";
      btn.style.borderColor = active ? "rgba(249,115,22,.75)" : "rgba(63,63,70,1)";
      btn.style.boxShadow = active ? "0 0 0 2px rgba(249,115,22,.18)" : "none";
    };

    const applyTrafficBtnStyle = () => {
      const btn = btnTrafficRef.current;
      if (!btn) return;

      const active = trafficEnabledRef.current;
      btn.style.opacity = active ? "1" : "0.72";
      btn.style.borderColor = active ? "rgba(245,158,11,.62)" : "rgba(63,63,70,1)";
      btn.style.background = active ? "rgba(245,158,11,.14)" : "rgba(24,24,27,0.80)";
      btn.style.color = active ? "#fde68a" : "#e4e4e7";
      btn.style.boxShadow = active ? "0 0 0 2px rgba(245,158,11,.16)" : "none";
    };

    const applyAirborneBtnStyle = () => {
      const btn = btnAirborneRef.current;
      if (!btn) return;

      const active = airborneOnlyRef.current;
      btn.style.opacity = active ? "1" : "0.74";
      btn.style.borderColor = active ? "rgba(16,185,129,.58)" : "rgba(63,63,70,1)";
      btn.style.background = active ? "rgba(16,185,129,.14)" : "rgba(24,24,27,0.80)";
      btn.style.color = active ? "#a7f3d0" : "#e4e4e7";
      btn.style.boxShadow = active ? "0 0 0 2px rgba(16,185,129,.15)" : "none";
    };

    function setAirborneOnly(v: boolean) {
      airborneOnlyRef.current = v;
      applyAirborneBtnStyle();

      if (!trafficEnabledRef.current) return;
      scheduleTrafficRefresh(80);
    }

    const applyAltsBtnStyle = () => {
      const btn = btnAltsRef.current;
      if (!btn) return;
      const active = altsEnabledRef.current;
      btn.style.opacity = active ? "1" : "0.6";
      btn.style.borderColor = active ? "rgba(56,189,248,.75)" : "rgba(3,105,161,.7)";
      btn.style.boxShadow = active ? "0 0 0 2px rgba(56,189,248,.18)" : "none";
    };

    function updateTrafficBadge(count?: number) {
      const el = trafficBadgeRef.current;
      if (!el) return;

      if (!trafficEnabledRef.current) {
        el.textContent = "Traffic: Off";
        el.style.opacity = "0.7";
        el.style.borderColor = "rgba(63,63,70,1)";
        el.style.color = "#a1a1aa";
        return;
      }

      const safeCount =
        typeof count === "number" && Number.isFinite(count)
          ? count
          : trafficMarkersRef.current.size;

      el.textContent = airborneOnlyRef.current
        ? `Traffic: ${safeCount} Airborne`
        : `Traffic: ${safeCount}`;

      el.style.opacity = "1";
      el.style.borderColor =
        safeCount > 0 ? "rgba(245,158,11,.45)" : "rgba(63,63,70,1)";
      el.style.color = safeCount > 0 ? "#fde68a" : "#d4d4d8";
    }

    function setTrafficEnabled(v: boolean) {
      trafficEnabledRef.current = v;
      applyTrafficBtnStyle();

      if (!v) {
        trafficAbortRef.current?.abort();

        if (trafficRefreshTimerRef.current != null) {
          window.clearTimeout(trafficRefreshTimerRef.current);
          trafficRefreshTimerRef.current = null;
        }

        clearTrafficMarkers();
        updateTrafficBadge(0);
        return;
      }

      updateTrafficBadge(trafficMarkersRef.current.size);
      scheduleTrafficRefresh(100);
    }

    async function refreshTrafficNow() {
      try {
        if (!trafficEnabledRef.current) return;
        if (!map) return;

        trafficAbortRef.current?.abort();
        trafficAbortRef.current = new AbortController();

        if (trafficRefreshTimerRef.current != null) {
          window.clearTimeout(trafficRefreshTimerRef.current);
          trafficRefreshTimerRef.current = null;
        }

        await refreshTraffic();
        scheduleTrafficRefresh();
      } catch {
        //
      }
    }

    function setNearEnabled(v: boolean) {
      nearEnabledRef.current = v;
      applyNearBtnStyle();
    }

    function setNearActive(v: boolean) {
      nearEnabledRef.current = v;
      const btn = btnNearRef.current;
      if (!btn) return;

      btn.style.opacity = v ? "1" : "0.75";
      btn.style.borderColor = v ? "rgba(249,115,22,.55)" : "rgba(63,63,70,1)";
      btn.style.background = v ? "rgba(249,115,22,.12)" : "rgba(24,24,27,0.80)";
      btn.style.color = v ? "#fdba74" : "#e4e4e7";
    }

    function setNearLoading(v: boolean) {
      nearLoadingRef.current = v;
      const btn = btnNearRef.current;
      if (!btn) return;

      btn.disabled = v;

      if (v) {
        btn.style.opacity = "0.65";
        btn.innerHTML = `
          <span style="display:inline-flex;align-items:center;gap:8px;">
            <span style="
              width:12px;height:12px;border-radius:999px;
              border:2px solid rgba(228,228,231,.7);
              border-top-color: transparent;
              display:inline-block;
              animation: spin .8s linear infinite;
            "></span>
            Yakın Meydanlar
          </span>
        `;
      } else {
        btn.textContent = "Yakın Meydanlar";
        setNearActive(nearEnabledRef.current);
      }
    }

    const spinId = "leaflet-spin-css";
    if (!document.getElementById(spinId)) {
      const st = document.createElement("style");
      st.id = spinId;
      st.innerHTML = `@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`;
      document.head.appendChild(st);
    }

    let dep: [number, number] = [41.275, 28.751];
    let arr: [number, number] = [40.128, 32.995];
    let depHeading = 350;
    let windDir: number | undefined = 30;
    let windKt: number | undefined = 11;

    try {
      const rawBrief = localStorage.getItem("lastBrief");
      if (rawBrief) {
        const b = JSON.parse(rawBrief);
        const d = b?.airports?.dep?.coords;
        const a = b?.airports?.arr?.coords;
        const h = b?.airports?.dep?.activeRunway?.heading ?? b?.airports?.dep?.runways?.[0]?.heading;
        if (d?.lat && d?.lng) dep = [d.lat, d.lng];
        if (a?.lat && a?.lng) arr = [a.lat, a.lng];
        if (typeof h === "number") depHeading = h;
        const mDep = b?.met?.dep?.[0];
        windDir = mDep?.parsed?.wind_dir ?? windDir;
        windKt = mDep?.parsed?.wind_spd ?? windKt;
      }
    } catch {}

    layerRef.current.dep = L.marker(dep, { icon: dotIcon("#22c55e") }).addTo(map).bindPopup("DEP");
    layerRef.current.arr = L.marker(arr, { icon: dotIcon("#ef4444") }).addTo(map).bindPopup("ARR");
    layerRef.current.rwy = L.polyline(runwayLine(dep, depHeading), { color: "#38bdf8", weight: 4 }).addTo(map);
    layerRef.current.route = L.polyline([dep, arr], { weight: 3 }).addTo(map);

    const s0 = loadSettings();
    const disp0 = convWind(windKt, s0.windUnit);
    const wIcon0 = windArrow(windDir, Number.isFinite(Number(disp0.val)) ? Number(disp0.val) : undefined, disp0.unit);
    if (wIcon0) layerRef.current.wind = L.marker(dep, { icon: wIcon0 }).addTo(map);

    const initialLayers = [layerRef.current.dep, layerRef.current.arr, layerRef.current.route, layerRef.current.rwy, layerRef.current.wind].filter(
      (l): l is L.Layer => !!l
    );
    if (initialLayers.length) {
      const group = L.featureGroup(initialLayers);
      map.fitBounds(group.getBounds(), { padding: [30, 30] });
    }
    setTimeout(() => map.invalidateSize(), 0);

    setTimeout(() => {
      void focusAirportFromStorage();
    }, 250);

    ensureTrafficLayer(map);
    scheduleTrafficRefresh(300);

    function fitBoundsIncluding(extra?: L.Layer, opts?: { includeNear?: boolean }) {
      const base = [layerRef.current.dep, layerRef.current.arr, layerRef.current.route, layerRef.current.rwy, layerRef.current.wind].filter(
        (l): l is L.Layer => !!l
      );

      if (opts?.includeNear && nearbyLayerRef.current) {
        nearbyLayerRef.current.eachLayer((l) => base.push(l));
      }

      if (extra) base.push(extra);
      if (!base.length) return;

      const g = L.featureGroup(base);
      map.fitBounds(g.getBounds(), { padding: [30, 30] });
    }

    async function applyNewPairFromPopup(opts: { depIcao: string; arrIcao: string }) {
      const { depIcao, arrIcao } = opts;
      try {
        window.dispatchEvent(new Event("brief-loading"));
        const nb = await fetchBrief(depIcao, arrIcao);

        localStorage.setItem("lastBrief", JSON.stringify(nb));
        const d = nb.airports?.dep?.coords;
        const a = nb.airports?.arr?.coords;
        if (d && a) localStorage.setItem("lastRoute", JSON.stringify({ dep: d, arr: a }));

        localStorage.setItem("lastPair", JSON.stringify({ depIcao, arrIcao, depLabel: depIcao, arrLabel: arrIcao }));

        const params = new URLSearchParams(window.location.search);
        params.set("dep", depIcao);
        params.set("arr", arrIcao);
        window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);

        window.dispatchEvent(new Event("flight-route-updated"));
      } finally {
        window.dispatchEvent(new Event("brief-loaded"));
      }
    }

    async function focusAlternateAirportByIcao(icao: string) {
      try {
        const exact = await getAirportByIcaoCached(icao);
        if (!exact?.coords) return;

        const latlng: L.LatLngTuple = [exact.coords.lat, exact.coords.lng];

        const tempMarker = L.marker(latlng, {
          icon: dotIcon("#38bdf8"),
        }).addTo(map);

        tempMarker.bindPopup(`${exact.icao}${exact.name ? " – " + exact.name : ""}`).openPopup();

        map.flyTo(latlng, Math.max(map.getZoom(), 9), {
          duration: 0.8,
        });

        window.setTimeout(() => {
          tempMarker.remove();
        }, 2500);
      } catch {}
    }

    async function focusAirportFromStorage() {
      try {
        const raw = localStorage.getItem("mapFocusAirport");
        if (!raw) return;

        const payload = JSON.parse(raw);
        const icao = String(payload?.icao || "").toUpperCase().trim();
        const source = String(payload?.source || "");
        const reasonSummary = String(payload?.reason_summary || "").trim();

        if (!icao) return;

        const exact = await getAirportByIcaoCached(icao);
        if (!exact?.coords) return;

        let currentDep = "LTFM";
        let currentArr = "LTAC";

        try {
          const rawBrief = localStorage.getItem("lastBrief");
          if (rawBrief) {
            const b = JSON.parse(rawBrief);
            currentDep = b?.airports?.dep?.icao || currentDep;
            currentArr = b?.airports?.arr?.icao || currentArr;
          } else {
            const rawPair = localStorage.getItem("lastPair");
            if (rawPair) {
              const p = JSON.parse(rawPair);
              currentDep = p?.depIcao || currentDep;
              currentArr = p?.arrIcao || currentArr;
            }
          }
        } catch {}

        const latlng: L.LatLngTuple = [exact.coords.lat, exact.coords.lng];

        const tempMarker = L.marker(latlng, {
          icon: dotIcon("#38bdf8"),
        }).addTo(map);

        tempMarker.bindPopup(() => {
          const div = L.DomUtil.create("div");
          div.style.minWidth = "220px";
          div.style.maxWidth = "260px";

          const badgeHtml =
            source === "alternate-apply-map"
              ? `<div style="
                  display:inline-block;
                  margin-bottom:8px;
                  padding:3px 8px;
                  border-radius:999px;
                  border:1px solid rgba(56,189,248,.35);
                  background:rgba(56,189,248,.10);
                  color:#bae6fd;
                  font-size:11px;
                  font-weight:600;
                ">ALT seçildi</div>`
              : source === "alternate-card"
              ? `<div style="
                  display:inline-block;
                  margin-bottom:8px;
                  padding:3px 8px;
                  border-radius:999px;
                  border:1px solid rgba(161,161,170,.35);
                  background:rgba(39,39,42,.55);
                  color:#e4e4e7;
                  font-size:11px;
                  font-weight:600;
                ">Alternate odak</div>`
              : "";

          const summaryHtml = reasonSummary
            ? `<div style="
                margin-top:4px;
                margin-bottom:8px;
                padding:8px 10px;
                border-radius:10px;
                border:1px solid rgba(63,63,70,1);
                background:rgba(24,24,27,0.75);
                color:#d4d4d8;
                font-size:12px;
                line-height:1.45;
              ">${reasonSummary}</div>`
            : "";

          div.innerHTML = `
            <div style="font-size:13px;font-weight:700;margin-bottom:6px;">
              ${exact.icao}${exact.name ? " – " + exact.name : ""}
            </div>

            ${badgeHtml}
            ${summaryHtml}

            <div style="display:flex; gap:8px; margin-bottom:8px;">
              <button class="focus-alt-dep-btn" style="
                flex:1;
                padding:6px 8px;
                font-size:12px;
                border-radius:8px;
                border:1px solid rgba(34,197,94,.35);
                background:rgba(34,197,94,.10);
                color:#bbf7d0;
                cursor:pointer;
              ">
                ${exact.icao === currentDep ? "Mevcut DEP" : "DEP yap"}
              </button>

              <button class="focus-alt-arr-btn" style="
                flex:1;
                padding:6px 8px;
                font-size:12px;
                border-radius:8px;
                border:1px solid rgba(245,158,11,.35);
                background:rgba(245,158,11,.10);
                color:#fde68a;
                cursor:pointer;
              ">
                ${exact.icao === currentArr ? "Mevcut ARR" : "ARR yap"}
              </button>
            </div>

            <div style="font-size:12px;color:#a1a1aa;">
              Mevcut rota: ${currentDep} → ${currentArr}
            </div>
          `;

          setTimeout(() => {
            const btnDep = div.querySelector<HTMLButtonElement>(".focus-alt-dep-btn");
            const btnArr = div.querySelector<HTMLButtonElement>(".focus-alt-arr-btn");

            if (btnDep) {
              if (exact.icao === currentDep) {
                btnDep.disabled = true;
                btnDep.style.opacity = "0.6";
                btnDep.style.cursor = "not-allowed";
              } else {
                btnDep.onclick = async () => {
                  try {
                    tempMarker.closePopup();
                  } catch {}
                  try {
                    tempMarker.remove();
                  } catch {}

                  await applyNewPairFromPopup({
                    depIcao: exact.icao,
                    arrIcao: currentArr,
                  });
                };
              }
            }

            if (btnArr) {
              if (exact.icao === currentArr) {
                btnArr.disabled = true;
                btnArr.style.opacity = "0.6";
                btnArr.style.cursor = "not-allowed";
              } else {
                btnArr.onclick = async () => {
                  try {
                    tempMarker.closePopup();
                  } catch {}
                  try {
                    tempMarker.remove();
                  } catch {}

                  await applyNewPairFromPopup({
                    depIcao: currentDep,
                    arrIcao: exact.icao,
                  });
                };
              }
            }
          }, 0);

          return div;
        }).openPopup();

        map.flyTo(latlng, Math.max(map.getZoom(), 9), {
          duration: 0.8,
        });

        window.setTimeout(() => {
          try {
            tempMarker.remove();
          } catch {}
        }, 6000);

        localStorage.removeItem("mapFocusAirport");
      } catch {}
    }

    function removeAltsSoft() {
      altsEnabledRef.current = false;
      const g = altsLayerRef.current;
      if (!g) return;
      fadeOutLayerGroupAndRemove(g, () => {
        if (altsLayerRef.current) {
          altsLayerRef.current.remove();
          altsLayerRef.current = null;
        }
      });
    }

    async function drawAlternates() {
      if (altsLayerRef.current) removeAltsSoft();
      if (!altsEnabledRef.current) return;

      const rawBrief = localStorage.getItem("lastBrief");
      if (!rawBrief) return;

      let brief: BriefResponse;
      try {
        brief = JSON.parse(rawBrief);
      } catch {
        return;
      }

      const currentDepIcao = brief?.airports?.dep?.icao;
      const currentArrIcao = brief?.airports?.arr?.icao;

      const detailList = getAlternateDetailsFromBrief(rawBrief);
      const detailIcaos = detailList.map((d) => d?.icao).filter(Boolean) as string[];
      const labelIcaos = getAlternateLabelIcaos(rawBrief);

      const icaos = (detailIcaos.length > 0 ? detailIcaos : labelIcaos).slice(0, 6);
      if (!icaos.length) return;

      const jobId = ++altsJobRef.current;

      const group = L.layerGroup().addTo(map);
      altsLayerRef.current = group;

      for (let i = 0; i < icaos.length; i++) {
        if (altsJobRef.current !== jobId) {
          group.remove();
          if (altsLayerRef.current === group) altsLayerRef.current = null;
          return;
        }

        const icao = icaos[i];
        const detail = getAlternateDetailByIcao(icao, detailList, i);
        const isTopPick = i === 0;

        try {
          const exact = await getAirportByIcaoCached(icao);
          if (!exact?.coords) continue;

          const marker = L.marker([exact.coords.lat, exact.coords.lng], { icon: dotIcon("#38bdf8") }).bindPopup(() => {
            const div = L.DomUtil.create("div");
            div.innerHTML = buildAlternatePopupHtml({
              exact,
              detail,
              currentDepIcao,
              currentArrIcao,
              isTopPick,
            });

            setTimeout(() => {
              const btnDep = div.querySelector<HTMLButtonElement>(".alt-dep-btn");
              const btnArr = div.querySelector<HTMLButtonElement>(".alt-arr-btn");
              const btnFit = div.querySelector<HTMLButtonElement>(".alt-fit-btn");

              if (btnDep) {
                if (exact.icao === currentDepIcao) {
                  btnDep.disabled = true;
                  btnDep.style.opacity = "0.6";
                  btnDep.style.cursor = "not-allowed";
                } else {
                  btnDep.onclick = async () =>
                    applyNewPairFromPopup({
                      depIcao: exact.icao,
                      arrIcao: currentArrIcao || "LTAC",
                    });
                }
              }

              if (btnArr) {
                if (exact.icao === currentArrIcao) {
                  btnArr.disabled = true;
                  btnArr.style.opacity = "0.6";
                  btnArr.style.cursor = "not-allowed";
                } else {
                  btnArr.onclick = async () =>
                    applyNewPairFromPopup({
                      depIcao: currentDepIcao || "LTFM",
                      arrIcao: exact.icao,
                    });
                }
              }

              if (btnFit) {
                btnFit.onclick = async () => {
                  try {
                    const focused = await getAirportByIcaoCached(exact.icao);
                    if (!focused?.coords) return;
                    map.flyTo([focused.coords.lat, focused.coords.lng], Math.max(map.getZoom(), 9), {
                      duration: 0.8,
                    });
                  } catch {}
                };
              }
            }, 0);

            return div;
          });

          marker.on("add", () => applyFadeInToMarker(marker as any));
          group.addLayer(marker);
        } catch {}

        await yieldEvery(i, 12);
      }
    }

    function removeNearbySoft() {
      nearJobRef.current++;
      setNearLoading(false);
      setNearActive(false);

      const g = nearbyLayerRef.current;
      if (!g) return;

      fadeOutLayerGroupAndRemove(g, () => {
        if (nearbyLayerRef.current) {
          nearbyLayerRef.current.remove();
          nearbyLayerRef.current = null;
        }
      });
    }

    async function showNearbyFrom(lat: number, lng: number) {
      const jobId = ++nearJobRef.current;
      setNearLoading(true);

      try {
        const url = `${API_BASE}/airports/near?lat=${lat}&lng=${lng}&max_km=200&limit=30`;
        const r = await fetch(url);
        const j = await r.json();
        const rawMatches = j?.matches || [];
        const matches = Array.isArray(rawMatches) ? rawMatches.slice(0, 30) : [];

        if (nearbyLayerRef.current) removeNearbySoft();

        setNearEnabled(true);

        let currentDep = "LTFM";
        let currentArr = "LTAC";
        try {
          const rawBrief = localStorage.getItem("lastBrief");
          if (rawBrief) {
            const b = JSON.parse(rawBrief);
            currentDep = b?.airports?.dep?.icao || currentDep;
            currentArr = b?.airports?.arr?.icao || currentArr;
          } else {
            const rawPair = localStorage.getItem("lastPair");
            if (rawPair) {
              const p = JSON.parse(rawPair);
              currentDep = p?.depIcao || currentDep;
              currentArr = p?.arrIcao || currentArr;
            }
          }
        } catch {}

        const s = loadSettings();
        const group = L.layerGroup().addTo(map);
        nearbyLayerRef.current = group;

        setNearActive(true);

        for (let i = 0; i < matches.length; i++) {
          if (nearJobRef.current !== jobId) {
            group.remove();
            if (nearbyLayerRef.current === group) nearbyLayerRef.current = null;
            setNearEnabled(false);
            return;
          }

          const a = matches[i];
          if (!a?.coords) continue;

          const d = convDist(a.dist_km, s.distUnit);
          const label = `${a.icao}${a.name ? " – " + a.name : ""} • ${d.val} ${String(d.unit).toUpperCase()}`;

          const marker = L.marker([a.coords.lat, a.coords.lng], { icon: dotIcon("#f97316") }).bindPopup(() => {
            const div = L.DomUtil.create("div");

            div.innerHTML = `
              <div style="font-size:13px; font-weight:600; margin-bottom:6px;">
                ${label}
              </div>

              <div style="display:flex; gap:8px; margin-bottom:8px;">
                <button class="near-dep-btn" style="
                  padding:6px 8px; font-size:12px; border-radius:8px;
                  border:1px solid rgba(34,197,94,.35);
                  background:rgba(34,197,94,.10);
                  color:#bbf7d0; cursor:pointer;
                ">DEP yap</button>

                <button class="near-arr-btn" style="
                  padding:6px 8px; font-size:12px; border-radius:8px;
                  border:1px solid rgba(56,189,248,.35);
                  background:rgba(56,189,248,.08);
                  color:#bae6fd; cursor:pointer;
                ">ARR yap</button>
              </div>

              <button class="near-fit-btn" style="
                width:100%;
                padding:6px 8px; font-size:12px; border-radius:8px;
                border:1px solid rgba(161,161,170,.35);
                background:rgba(39,39,42,.55);
                color:#e4e4e7; cursor:pointer;
              ">Haritada Göster</button>

              <div style="margin-top:6px; font-size:11px; color:#a1a1aa;">
                Mevcut: ${currentDep} → ${currentArr}
              </div>
            `;

            setTimeout(() => {
              const btnDep = div.querySelector<HTMLButtonElement>(".near-dep-btn");
              const btnArr = div.querySelector<HTMLButtonElement>(".near-arr-btn");
              const btnFit = div.querySelector<HTMLButtonElement>(".near-fit-btn");

              if (btnDep) btnDep.onclick = async () => applyNewPairFromPopup({ depIcao: a.icao, arrIcao: currentArr });
              if (btnArr) btnArr.onclick = async () => applyNewPairFromPopup({ depIcao: currentDep, arrIcao: a.icao });
              if (btnFit) btnFit.onclick = () => fitBoundsIncluding(undefined, { includeNear: true });
            }, 0);

            return div;
          });

          marker.on("add", () => applyFadeInToMarker(marker as any));
          group.addLayer(marker);

          await yieldEvery(i, 12);
        }
      } catch {
        setNearEnabled(false);
      } finally {
        if (nearJobRef.current === jobId) setNearLoading(false);
        if (nearJobRef.current === jobId && !nearbyLayerRef.current) {
          setNearActive(false);
        }
      }
    }

    function geolocateAndShowNearby() {
      if (!("geolocation" in navigator)) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          map.setView([latitude, longitude], 9);
          void showNearbyFrom(latitude, longitude);
        },
        () => {
          setNearLoading(false);
          setNearEnabled(false);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }

    const DEFAULT_DEP: L.LatLngTuple = [41.275, 28.751];
    const DEFAULT_ARR: L.LatLngTuple = [40.128, 32.995];

    function isFiniteNum(n: any): n is number {
      return typeof n === "number" && Number.isFinite(n);
    }
    function isCoords(c: any): c is { lat: number; lng: number } {
      return c && isFiniteNum(c.lat) && isFiniteNum(c.lng);
    }
    function readPairFromUrl(): { depIcao: string; arrIcao: string } | null {
      try {
        const p = new URLSearchParams(window.location.search);
        const depIcao = String(p.get("dep") ?? "").trim().toUpperCase();
        const arrIcao = String(p.get("arr") ?? "").trim().toUpperCase();
        if (/^[A-Z]{4}$/.test(depIcao) && /^[A-Z]{4}$/.test(arrIcao)) return { depIcao, arrIcao };
        return null;
      } catch {
        return null;
      }
    }

    const onRouteUpdated = () => {
      void (async () => {
        try {
          const rawBrief = localStorage.getItem("lastBrief");
          const rawRoute = localStorage.getItem("lastRoute");

          let brief: any = null;
          try {
            brief = rawBrief ? JSON.parse(rawBrief) : null;
          } catch {
            brief = null;
          }

          let A: L.LatLngTuple | null = null;
          let B: L.LatLngTuple | null = null;

          const bDep = brief?.airports?.dep?.coords;
          const bArr = brief?.airports?.arr?.coords;
          if (isCoords(bDep) && isCoords(bArr)) {
            A = [bDep.lat, bDep.lng];
            B = [bArr.lat, bArr.lng];
          }

          if (!A || !B) {
            try {
              const r = rawRoute ? JSON.parse(rawRoute) : null;
              const rDep = r?.dep;
              const rArr = r?.arr;
              if (isCoords(rDep) && isCoords(rArr)) {
                A = [rDep.lat, rDep.lng];
                B = [rArr.lat, rArr.lng];
              }
            } catch {}
          }

          let urlPair: { depIcao: string; arrIcao: string } | null = null;
          if (!A || !B) {
            urlPair = readPairFromUrl();
            if (urlPair) {
              const [depAp, arrAp] = await Promise.all([
                getAirportByIcaoCached(urlPair.depIcao),
                getAirportByIcaoCached(urlPair.arrIcao),
              ]);

              if (depAp?.coords && arrAp?.coords) {
                A = [depAp.coords.lat, depAp.coords.lng];
                B = [arrAp.coords.lat, arrAp.coords.lng];
              }
            }
          }

          if (!A) A = DEFAULT_DEP;
          if (!B) B = DEFAULT_ARR;

          layerRef.current.route?.remove();
          layerRef.current.dep?.remove();
          layerRef.current.arr?.remove();
          layerRef.current.rwy?.remove();
          layerRef.current.wind?.remove();

          const depLabel = brief?.airports?.dep?.icao ?? urlPair?.depIcao ?? "DEP";
          const arrLabel = brief?.airports?.arr?.icao ?? urlPair?.arrIcao ?? "ARR";

          layerRef.current.dep = L.marker(A, { icon: dotIcon("#22c55e") }).addTo(map).bindPopup(depLabel);
          layerRef.current.arr = L.marker(B, { icon: dotIcon("#ef4444") }).addTo(map).bindPopup(arrLabel);

          const heading =
            brief?.airports?.dep?.activeRunway?.heading ??
            brief?.airports?.dep?.runways?.[0]?.heading ??
            350;

          layerRef.current.rwy = L.polyline(runwayLine(A, heading), { color: "#38bdf8", weight: 4 }).addTo(map);
          layerRef.current.route = L.polyline([A, B], { weight: 3 }).addTo(map);

          const wdir = brief?.met?.dep?.[0]?.parsed?.wind_dir as number | undefined;
          const wspd = brief?.met?.dep?.[0]?.parsed?.wind_spd as number | undefined;
          const s = loadSettings();
          const disp = convWind(wspd, s.windUnit);
          const w2 = windArrow(wdir, Number.isFinite(Number(disp.val)) ? Number(disp.val) : undefined, disp.unit);
          if (w2) layerRef.current.wind = L.marker(A, { icon: w2 }).addTo(map);

          const group2 = L.featureGroup(
            [layerRef.current.route, layerRef.current.dep, layerRef.current.arr, layerRef.current.rwy, layerRef.current.wind].filter(
              (l): l is L.Layer => !!l
            )
          );
          map.fitBounds(group2.getBounds(), { padding: [30, 30] });

          if (altsEnabledRef.current) void drawAlternates();

          if (trafficEnabledRef.current) {
            window.setTimeout(() => {
              void refreshTrafficNow();
            }, 250);
          }

          scheduleTrafficRefresh(250);
        } catch {}
      })();
    };

    const onMapMoveEnd = () => {
      scheduleTrafficRefresh(400);
    };

    const onMapZoomEnd = () => {
      scheduleTrafficRefresh(250);
    };

    map.on("moveend", onMapMoveEnd);
    map.on("zoomend", onMapZoomEnd);

    window.addEventListener("flight-route-updated", onRouteUpdated);

    const onFocusAlternateAirport = (ev: Event) => {
      const custom = ev as CustomEvent<{ icao?: string }>;
      const icao = String(custom.detail?.icao || "").toUpperCase().trim();
      if (!icao) return;

      void focusAlternateAirportByIcao(icao);
    };

    window.addEventListener("focus-alternate-airport", onFocusAlternateAirport as EventListener);

    const onSettingsUpdated = () => {
      try {
        const rawBrief = localStorage.getItem("lastBrief");
        if (!rawBrief) return;
        const brief = JSON.parse(rawBrief);
        const d = brief?.airports?.dep?.coords;
        if (!d?.lat || !d?.lng) return;

        layerRef.current.wind?.remove();

        const wdir = brief?.met?.dep?.[0]?.parsed?.wind_dir as number | undefined;
        const wspd = brief?.met?.dep?.[0]?.parsed?.wind_spd as number | undefined;

        const s = loadSettings();
        const disp = convWind(wspd, s.windUnit);
        const w = windArrow(wdir, Number.isFinite(Number(disp.val)) ? Number(disp.val) : undefined, disp.unit);
        if (w) layerRef.current.wind = L.marker([d.lat, d.lng], { icon: w }).addTo(map);
      } catch {}
    };

    window.addEventListener("settings-updated", onSettingsUpdated);

    const legend = L.control({ position: "bottomleft" });
    legend.onAdd = () => {
      const div = L.DomUtil.create("div");
      div.style.background = "rgba(24,24,27,0.82)";
      div.style.border = "1px solid #3f3f46";
      div.style.borderRadius = "10px";
      div.style.padding = "10px 10px";
      div.style.color = "#e4e4e7";
      div.style.fontSize = "12px";
      div.style.backdropFilter = "blur(4px)";
      div.style.boxShadow = "0 10px 30px rgba(0,0,0,.25)";
      div.style.minWidth = "160px";

      const row = (color: string, label: string) => `
        <div style="display:flex; align-items:center; gap:8px; margin:4px 0;">
          <span style="width:10px;height:10px;border-radius:999px;background:${color};border:2px solid rgba(255,255,255,.9);display:inline-block;"></span>
          <span>${label}</span>
        </div>
      `;

      div.innerHTML = `
        <div style="font-weight:700; margin-bottom:6px;">Legend</div>
        ${row("#22c55e", "DEP")}
        ${row("#ef4444", "ARR")}
        ${row("#38bdf8", "ALT (Alternates)")}
        ${row("#f97316", "NEAR (Yakın)")}
        <div style="margin-top:8px; color:#a1a1aa; font-size:11px;">
          Pist: <span style="color:#7dd3fc;">mavi çizgi</span><br/>
          Rota: gri çizgi<br/>
          Trafik: sarı ✈ + kısa iz
        </div>
      `;
      L.DomEvent.disableClickPropagation(div);
      return div;
    };
    legend.addTo(map);

    function setAltsActive(btn: HTMLButtonElement, v: boolean) {
      btn.style.opacity = "1";
      btn.style.borderColor = v ? "rgba(56,189,248,.55)" : "rgba(63,63,70,1)";
      btn.style.background = v ? "rgba(56,189,248,.14)" : "rgba(24,24,27,0.80)";
      btn.style.color = v ? "#bae6fd" : "#e4e4e7";
    }

    const controls = L.control({ position: "topright" });
    controls.onAdd = () => {
      const div = L.DomUtil.create("div", "leaflet-bar");
      div.style.display = "flex";
      div.style.gap = "8px";
      div.style.padding = "8px";
      div.style.background = "rgba(24,24,27,0.8)";
      div.style.border = "1px solid #3f3f46";
      div.style.borderRadius = "8px";
      div.style.backdropFilter = "blur(4px)";

      const btnNear = L.DomUtil.create("button", "", div);
      btnNearRef.current = btnNear;
      btnNear.className = "rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-sm";
      btnNear.title = "Yakındaki meydanları göster / kapat (200 km)";
      btnNear.innerText = "Yakın Meydanlar";
      btnNear.onclick = () => {
        if (nearLoadingRef.current) return;

        if (nearEnabledRef.current && nearbyLayerRef.current) {
          removeNearbySoft();
          return;
        }
        setNearActive(true);
        geolocateAndShowNearby();
      };

      const btnClearNear = L.DomUtil.create("button", "", div);
      btnClearNear.className = "rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-sm";
      btnClearNear.title = "Yakın meydan katmanını temizle";
      btnClearNear.innerText = "Temizle";
      btnClearNear.onclick = () => {
        if (nearbyLayerRef.current) removeNearbySoft();
        else setNearEnabled(false);
      };

      const btnAlts = L.DomUtil.create("button", "", div);
      btnAltsRef.current = btnAlts;
      btnAlts.className = "rounded-md border border-sky-700 bg-sky-900/60 px-3 py-1.5 text-sm";
      btnAlts.title = "Alternates pinlerini aç/kapat";
      btnAlts.innerText = "Alternates";

      setAltsActive(btnAlts, altsEnabledRef.current);

      btnAlts.onclick = async () => {
        altsEnabledRef.current = !altsEnabledRef.current;
        setAltsActive(btnAlts, altsEnabledRef.current);

        if (altsEnabledRef.current) {
          await drawAlternates();
        } else {
          removeAltsSoft();
        }
      };

      const btnTraffic = L.DomUtil.create("button", "", div);
      btnTrafficRef.current = btnTraffic;
      btnTraffic.className = "rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-sm";
      btnTraffic.title = "Canlı trafik katmanını aç/kapat";
      btnTraffic.innerText = "Traffic";
      btnTraffic.onclick = () => {
        setTrafficEnabled(!trafficEnabledRef.current);
      };

      const btnAirborne = L.DomUtil.create("button", "", div);
      btnAirborneRef.current = btnAirborne;
      btnAirborne.className = "rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-sm";
      btnAirborne.title = "Sadece havadaki uçakları göster";
      btnAirborne.innerText = "Airborne";
      btnAirborne.onclick = () => {
        setAirborneOnly(!airborneOnlyRef.current);
      };

      const trafficBadge = L.DomUtil.create("span", "", div);
      trafficBadgeRef.current = trafficBadge;
      trafficBadge.style.display = "inline-flex";
      trafficBadge.style.alignItems = "center";
      trafficBadge.style.padding = "0 10px";
      trafficBadge.style.borderRadius = "8px";
      trafficBadge.style.border = "1px solid rgba(63,63,70,1)";
      trafficBadge.style.background = "rgba(24,24,27,0.72)";
      trafficBadge.style.color = "#d4d4d8";
      trafficBadge.style.fontSize = "12px";
      trafficBadge.style.whiteSpace = "nowrap";
      trafficBadge.textContent = "Traffic: 0";

      applyNearBtnStyle();
      applyAltsBtnStyle();
      applyTrafficBtnStyle();
      applyAirborneBtnStyle();
      updateTrafficBadge(trafficMarkersRef.current.size);

      L.DomEvent.disableClickPropagation(div);
      return div;
    };
    controls.addTo(map);

    return () => {
      window.removeEventListener("flight-route-updated", onRouteUpdated);
      window.removeEventListener("settings-updated", onSettingsUpdated);
      window.removeEventListener("focus-alternate-airport", onFocusAlternateAirport as EventListener);

      map.off("moveend", onMapMoveEnd);
      map.off("zoomend", onMapZoomEnd);

      trafficAbortRef.current?.abort();

      if (trafficRefreshTimerRef.current != null) {
        window.clearTimeout(trafficRefreshTimerRef.current);
        trafficRefreshTimerRef.current = null;
      }

      stopTrafficAnimationLoop();
      clearTrafficMarkers();

      if (trafficLayerRef.current) {
        trafficLayerRef.current.remove();
        trafficLayerRef.current = null;
      }

      map.remove();
    };
  }, []);

  return (
    <div className="fixed left-0 right-0 bottom-0" style={{ top: 56 }}>
      <div ref={mapEl} className="h-full w-full" />
    </div>
  );
}