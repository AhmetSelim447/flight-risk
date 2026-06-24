import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useBriefStore } from '../../stores/briefStore';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../../constants/theme';
import RouteLeafletMap from '../../components/RouteLeafletMap';
import {
  fetchNearbyAirports,
  fetchLiveAircraft,
  NearbyAirportRow,
  LiveAircraftRow,
} from '../../lib/api';

type MapAirport = {
  icao?: string;
  name?: string;
  city?: string;
  coords?: { lat?: number; lng?: number };
  lat?: number;
  lon?: number;
  distance_nm?: number;
  distanceKm?: number;
};

function getCoord(a?: MapAirport | null) {
  const lat =
    typeof a?.coords?.lat === 'number'
      ? a.coords.lat
      : typeof a?.lat === 'number'
        ? a.lat
        : undefined;

  const lng =
    typeof a?.coords?.lng === 'number'
      ? a.coords.lng
      : typeof a?.lon === 'number'
        ? a.lon
        : undefined;

  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return { lat, lng };
}

function getRiskColor(riskClass?: string, score?: number) {
  if (riskClass === 'red' || (typeof score === 'number' && score >= 70)) return '#ef4444';
  if (riskClass === 'yellow' || (typeof score === 'number' && score >= 40)) return '#f59e0b';
  return '#10b981';
}

function getRiskLabel(riskClass?: string, score?: number) {
  if (riskClass === 'red' || (typeof score === 'number' && score >= 70)) return 'Yüksek Risk';
  if (riskClass === 'yellow' || (typeof score === 'number' && score >= 40)) return 'Orta Risk';
  return 'Düşük Risk';
}

function buildBounds(dep?: { lat: number; lng: number } | null, arr?: { lat: number; lng: number } | null) {
  const lat1 = dep?.lat ?? 35;
  const lat2 = arr?.lat ?? 43;
  const lng1 = dep?.lng ?? 25;
  const lng2 = arr?.lng ?? 45;

  return {
    minLat: Math.min(lat1, lat2) - 1,
    maxLat: Math.max(lat1, lat2) + 1,
    minLng: Math.min(lng1, lng2) - 1,
    maxLng: Math.max(lng1, lng2) + 1,
  };
}

export default function RouteMap() {
  const { lastBrief } = useBriefStore();

  const [nearby, setNearby] = useState<NearbyAirportRow[]>([]);
  const [aircraft, setAircraft] = useState<LiveAircraftRow[]>([]);
  const [loadingExtras, setLoadingExtras] = useState(false);
  const [showNearby, setShowNearby] = useState(true);
  const [showTraffic, setShowTraffic] = useState(true);

  const dep = lastBrief?.airports?.dep as MapAirport | undefined;
  const arr = lastBrief?.airports?.arr as MapAirport | undefined;

  const depCoord = getCoord(dep);
  const arrCoord = getCoord(arr);

  const riskScore = lastBrief?.risk?.score;
  const riskClass = lastBrief?.risk?.class;
  const riskColor = getRiskColor(riskClass, riskScore);
  const riskLabel = getRiskLabel(riskClass, riskScore);

  useEffect(() => {
    let alive = true;

    async function loadExtras() {
      if (!depCoord && !arrCoord) return;

      setLoadingExtras(true);

      try {
        const center = depCoord || arrCoord;
        if (!center) return;

        const bounds = buildBounds(depCoord, arrCoord);

        const [nearbyRows, aircraftRows] = await Promise.all([
          fetchNearbyAirports(center.lat, center.lng, 160),
          fetchLiveAircraft(bounds.minLat, bounds.maxLat, bounds.minLng, bounds.maxLng),
        ]);

        if (!alive) return;

        setNearby(nearbyRows);
        setAircraft(aircraftRows);
      } finally {
        if (alive) setLoadingExtras(false);
      }
    }

    loadExtras();

    return () => {
      alive = false;
    };
  }, [depCoord?.lat, depCoord?.lng, arrCoord?.lat, arrCoord?.lng]);

  const alternates = useMemo(() => {
    const riskAny = lastBrief?.risk as any;
    const list =
      Array.isArray(riskAny?.alternateDetails)
        ? riskAny.alternateDetails
        : Array.isArray(riskAny?.alternates)
          ? riskAny.alternates
          : [];

    return list
      .map((a: any) => {
        const coord = getCoord(a);
        if (!coord) return null;

        const distance =
          typeof a.distance_nm === 'number'
            ? `${Math.round(a.distance_nm)} NM`
            : typeof a.distanceKm === 'number'
              ? `${Math.round(a.distanceKm)} km`
              : '';

        return {
          label: String(a.icao || a.ident || 'ALT'),
          role: 'ALT' as const,
          lat: coord.lat,
          lng: coord.lng,
          name: a.name || a.city || 'Yedek meydan',
          extra: distance ? `Mesafe: ${distance}` : '',
        };
      })
      .filter(Boolean);
  }, [lastBrief]);

  const nearbyPoints = useMemo(() => {
    if (!showNearby) return [];

    return nearby
      .map((a) => {
        const coord = getCoord(a as any);
        if (!coord) return null;

        const code = a.icao || 'NEAR';
        const distance =
          typeof a.distance_nm === 'number'
            ? `${Math.round(a.distance_nm)} NM`
            : typeof a.distanceKm === 'number'
              ? `${Math.round(a.distanceKm)} km`
              : '';

        return {
          label: code,
          role: 'NEAR' as const,
          lat: coord.lat,
          lng: coord.lng,
          name: a.name || a.city || 'Yakın meydan',
          extra: distance ? `Mesafe: ${distance}` : '',
        };
      })
      .filter(Boolean);
  }, [nearby, showNearby]);

  const aircraftPoints = useMemo(() => {
    if (!showTraffic) return [];

    return aircraft
      .filter((a) => typeof a.lat === 'number' && typeof a.lon === 'number')
      .slice(0, 40)
      .map((a) => ({
        label: a.callsign?.trim() || a.icao24 || 'Aircraft',
        role: 'ACFT' as const,
        lat: a.lat,
        lng: a.lon,
        name: 'Canlı trafik',
        extra:
          typeof a.altitude === 'number'
            ? `İrtifa: ${Math.round(a.altitude)} m`
            : typeof a.velocity === 'number'
              ? `Hız: ${Math.round(a.velocity)} m/s`
              : '',
      }));
  }, [aircraft, showTraffic]);

  const depPoint =
    dep && depCoord
      ? {
          label: dep.icao || 'DEP',
          role: 'DEP' as const,
          lat: depCoord.lat,
          lng: depCoord.lng,
          name: dep.name || dep.city || 'Kalkış meydanı',
        }
      : null;

  const arrPoint =
    arr && arrCoord
      ? {
          label: arr.icao || 'ARR',
          role: 'ARR' as const,
          lat: arrCoord.lat,
          lng: arrCoord.lng,
          name: arr.name || arr.city || 'Varış meydanı',
        }
      : null;

  return (
    <SafeAreaView style={styles.container}>
      <RouteLeafletMap
        dep={depPoint}
        arr={arrPoint}
        alternates={alternates as any}
        nearbyAirports={nearbyPoints as any}
        aircraft={aircraftPoints as any}
        riskColor={riskColor}
      />

      {lastBrief ? (
        <View style={styles.topCard}>
          <View style={styles.routeRow}>
            <View style={styles.routeItem}>
              <Text style={styles.routeLabel}>DEP</Text>
              <Text style={styles.routeIcao}>{dep?.icao || '-'}</Text>
            </View>

            <View style={styles.planeCircle}>
              <Ionicons name="airplane" size={19} color={COLORS.textPrimary} />
            </View>

            <View style={styles.routeItem}>
              <Text style={styles.routeLabel}>ARR</Text>
              <Text style={styles.routeIcao}>{arr?.icao || '-'}</Text>
            </View>
          </View>

          <View style={styles.riskPill}>
            <View style={[styles.riskDot, { backgroundColor: riskColor }]} />
            <Text style={styles.riskText}>
              {riskLabel} / %{riskScore ?? '-'}
            </Text>
          </View>

          <View style={styles.statsRow}>
            <Text style={styles.statsText}>ALT: {alternates.length}</Text>
            <Text style={styles.statsText}>NEAR: {nearbyPoints.length}</Text>
            <Text style={styles.statsText}>ACFT: {aircraftPoints.length}</Text>
            {loadingExtras ? <ActivityIndicator size="small" color={COLORS.primaryLight} /> : null}
          </View>
        </View>
      ) : (
        <View style={styles.banner}>
          <Ionicons
            name="information-circle"
            size={20}
            color={COLORS.primaryLight}
            style={{ marginRight: SPACING.sm }}
          />
          <Text style={styles.bannerText}>
            Rota çizmek için Brifing sekmesinden uçuş analizi yapın.
          </Text>
        </View>
      )}

      {lastBrief ? (
        <View style={styles.layerPanel}>
          <LayerButton label="Nearby" active={showNearby} onPress={() => setShowNearby((v) => !v)} />
          <LayerButton label="Traffic" active={showTraffic} onPress={() => setShowTraffic((v) => !v)} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function LayerButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.layerButton, active && styles.layerButtonActive]}
      onPress={onPress}
    >
      <Text style={[styles.layerButtonText, active && styles.layerButtonTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  topCard: {
    position: 'absolute',
    top: SPACING.lg,
    left: SPACING.md,
    right: SPACING.md,
    backgroundColor: COLORS.surface + 'E8',
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  routeItem: {
    flex: 1,
  },
  routeLabel: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.xs,
    fontWeight: 'bold',
  },
  routeIcao: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.xl,
    fontWeight: 'bold',
  },
  planeCircle: {
    width: 38,
    height: 38,
    borderRadius: BORDER_RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    marginHorizontal: SPACING.sm,
  },
  riskPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  riskDot: {
    width: 9,
    height: 9,
    borderRadius: 99,
    marginRight: 6,
  },
  riskText: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.xs,
    fontWeight: 'bold',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  statsText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.xs,
    fontWeight: 'bold',
  },
  layerPanel: {
    position: 'absolute',
    right: SPACING.md,
    bottom: SPACING.lg,
    gap: SPACING.sm,
  },
  layerButton: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
  },
  layerButtonActive: {
    backgroundColor: COLORS.primary,
  },
  layerButtonText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.xs,
    fontWeight: 'bold',
  },
  layerButtonTextActive: {
    color: COLORS.textPrimary,
  },
  banner: {
    position: 'absolute',
    bottom: SPACING.lg,
    left: SPACING.md,
    right: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface + 'D0',
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
  },
  bannerText: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.sm,
  },
});