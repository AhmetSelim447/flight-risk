import React, { useMemo } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useBriefStore } from '../../stores/briefStore';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../../constants/theme';
import RouteLeafletMap from '../../components/RouteLeafletMap';

type MapAirport = {
  icao?: string;
  name?: string;
  city?: string;
  coords?: { lat?: number; lng?: number };
  lat?: number;
  lon?: number;
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

export default function RouteMap() {
  const { lastBrief } = useBriefStore();

  const dep = lastBrief?.airports?.dep as MapAirport | undefined;
  const arr = lastBrief?.airports?.arr as MapAirport | undefined;

  const depCoord = getCoord(dep);
  const arrCoord = getCoord(arr);

  const riskScore = lastBrief?.risk?.score;
  const riskClass = lastBrief?.risk?.class;
  const riskColor = getRiskColor(riskClass, riskScore);
  const riskLabel = getRiskLabel(riskClass, riskScore);

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

        return {
          label: String(a.icao || a.ident || 'ALT'),
          role: 'ALT' as const,
          lat: coord.lat,
          lng: coord.lng,
          name: a.name || a.city || 'Yedek meydan',
        };
      })
      .filter(Boolean);
  }, [lastBrief]);

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

      <TouchableOpacity style={styles.infoButton}>
        <Ionicons name="map" size={20} color={COLORS.textPrimary} />
      </TouchableOpacity>
    </SafeAreaView>
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
  infoButton: {
    position: 'absolute',
    right: SPACING.md,
    bottom: SPACING.lg,
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: COLORS.border,
    borderWidth: 1,
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