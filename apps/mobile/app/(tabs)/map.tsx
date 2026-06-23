import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, {
  Marker,
  Polyline,
  Callout,
  PROVIDER_GOOGLE,
  LatLng,
} from 'react-native-maps';
import { useBriefStore } from '../../stores/briefStore';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

type MapAirport = {
  icao?: string;
  name?: string;
  city?: string;
  coords?: {
    lat?: number;
    lng?: number;
  };
  lat?: number;
  lon?: number;
  distance_nm?: number;
  distanceKm?: number;
  riskScore?: number;
};

function getAirportCoordinate(airport?: MapAirport | null): LatLng | null {
  const lat =
    typeof airport?.coords?.lat === 'number'
      ? airport.coords.lat
      : typeof airport?.lat === 'number'
        ? airport.lat
        : undefined;

  const lng =
    typeof airport?.coords?.lng === 'number'
      ? airport.coords.lng
      : typeof airport?.lon === 'number'
        ? airport.lon
        : undefined;

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return null;
  }

  return {
    latitude: lat,
    longitude: lng,
  };
}

function getRiskColor(riskClass?: string, score?: number) {
  if (riskClass === 'red' || (typeof score === 'number' && score >= 70)) {
    return COLORS.riskRed;
  }

  if (riskClass === 'yellow' || (typeof score === 'number' && score >= 40)) {
    return COLORS.riskYellow;
  }

  return COLORS.riskGreen;
}

function getRiskLabel(riskClass?: string, score?: number) {
  if (riskClass === 'red' || (typeof score === 'number' && score >= 70)) {
    return 'Yüksek Risk';
  }

  if (riskClass === 'yellow' || (typeof score === 'number' && score >= 40)) {
    return 'Orta Risk';
  }

  return 'Düşük Risk';
}

export default function RouteMap() {
  const { lastBrief } = useBriefStore();
  const mapRef = useRef<MapView>(null);

  const dep = lastBrief?.airports?.dep as MapAirport | undefined;
  const arr = lastBrief?.airports?.arr as MapAirport | undefined;

  const depCoordinate = useMemo(() => getAirportCoordinate(dep), [dep]);
  const arrCoordinate = useMemo(() => getAirportCoordinate(arr), [arr]);

  const alternateDetails = useMemo<MapAirport[]>(() => {
    const riskAny = lastBrief?.risk as any;

    if (Array.isArray(riskAny?.alternateDetails)) {
      return riskAny.alternateDetails;
    }

    if (Array.isArray(riskAny?.alternates)) {
      return riskAny.alternates;
    }

    if (Array.isArray((lastBrief as any)?.alternates)) {
      return (lastBrief as any).alternates;
    }

    return [];
  }, [lastBrief]);

  const alternateCoordinates = useMemo(() => {
    return alternateDetails
      .map((airport) => ({
        airport,
        coordinate: getAirportCoordinate(airport),
      }))
      .filter((item): item is { airport: MapAirport; coordinate: LatLng } => {
        return item.coordinate !== null;
      });
  }, [alternateDetails]);

  const routeCoordinates = useMemo(() => {
    if (!depCoordinate || !arrCoordinate) return [];
    return [depCoordinate, arrCoordinate];
  }, [depCoordinate, arrCoordinate]);

  const riskScore = lastBrief?.risk?.score;
  const riskClass = lastBrief?.risk?.class;
  const riskColor = getRiskColor(riskClass, riskScore);
  const riskLabel = getRiskLabel(riskClass, riskScore);

  const fitRoute = () => {
    if (!mapRef.current || !depCoordinate || !arrCoordinate) return;

    const coordinates = [
      depCoordinate,
      arrCoordinate,
      ...alternateCoordinates.map((item) => item.coordinate),
    ];

    mapRef.current.fitToCoordinates(coordinates, {
      edgePadding: {
        top: 130,
        right: 60,
        bottom: 120,
        left: 60,
      },
      animated: true,
    });
  };

  useEffect(() => {
    if (!depCoordinate || !arrCoordinate) return;

    const timer = setTimeout(() => {
      fitRoute();
    }, 500);

    return () => clearTimeout(timer);
  }, [depCoordinate, arrCoordinate, alternateCoordinates]);

  const defaultRegion = {
    latitude: 39.0,
    longitude: 35.0,
    latitudeDelta: 8.0,
    longitudeDelta: 8.0,
  };

  return (
    <SafeAreaView style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={defaultRegion}
        userInterfaceStyle="dark"
      >
        {depCoordinate ? (
          <Marker
            coordinate={depCoordinate}
            title={dep?.icao}
            description={dep?.name || 'Kalkış Havalimanı'}
            pinColor={COLORS.primary}
          >
            <Callout tooltip={false}>
              <View style={styles.callout}>
                <Text style={styles.calloutTitle}>{dep?.icao || 'DEP'}</Text>
                <Text style={styles.calloutDesc}>
                  {dep?.name || dep?.city || 'Kalkış Havalimanı'}
                </Text>
                <Text style={styles.calloutRole}>Kalkış Meydanı</Text>
              </View>
            </Callout>
          </Marker>
        ) : null}

        {arrCoordinate ? (
          <Marker
            coordinate={arrCoordinate}
            title={arr?.icao}
            description={arr?.name || 'Varış Havalimanı'}
            pinColor={riskColor}
          >
            <Callout tooltip={false}>
              <View style={styles.callout}>
                <Text style={styles.calloutTitle}>{arr?.icao || 'ARR'}</Text>
                <Text style={styles.calloutDesc}>
                  {arr?.name || arr?.city || 'Varış Havalimanı'}
                </Text>
                <Text style={styles.calloutRole}>Varış Meydanı</Text>
                <Text style={[styles.calloutRisk, { color: riskColor }]}>
                  {riskLabel} / %{riskScore ?? '-'}
                </Text>
              </View>
            </Callout>
          </Marker>
        ) : null}

        {alternateCoordinates.map(({ airport, coordinate }, index) => (
          <Marker
            key={`${airport.icao || 'ALT'}-${index}`}
            coordinate={coordinate}
            title={airport.icao}
            description={airport.name || airport.city || 'Yedek Havalimanı'}
            pinColor={COLORS.primaryLight}
          >
            <Callout tooltip={false}>
              <View style={styles.callout}>
                <Text style={styles.calloutTitle}>{airport.icao || 'ALTN'}</Text>
                <Text style={styles.calloutDesc}>
                  {airport.name || airport.city || 'Yedek Havalimanı'}
                </Text>
                <Text style={styles.calloutRole}>Yedek Meydan</Text>

                {typeof airport.distance_nm === 'number' ? (
                  <Text style={styles.calloutRisk}>
                    Mesafe: {Math.round(airport.distance_nm)} NM
                  </Text>
                ) : null}

                {typeof airport.distanceKm === 'number' ? (
                  <Text style={styles.calloutRisk}>
                    Mesafe: {Math.round(airport.distanceKm)} km
                  </Text>
                ) : null}

                {typeof airport.riskScore === 'number' ? (
                  <Text style={styles.calloutRisk}>
                    Risk: %{Math.round(airport.riskScore)}
                  </Text>
                ) : null}
              </View>
            </Callout>
          </Marker>
        ))}

        {routeCoordinates.length === 2 ? (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor={riskColor}
            strokeWidth={5}
            lineDashPattern={[10, 6]}
          />
        ) : null}
      </MapView>

      {lastBrief ? (
        <>
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

          <TouchableOpacity style={styles.focusButton} onPress={fitRoute}>
            <Ionicons name="locate" size={20} color={COLORS.textPrimary} />
          </TouchableOpacity>
        </>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  map: {
    width: '100%',
    height: '100%',
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
  focusButton: {
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
  callout: {
    padding: SPACING.sm,
    width: 210,
    backgroundColor: COLORS.surface,
  },
  calloutTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  calloutDesc: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  calloutRole: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.primaryLight,
    fontWeight: 'bold',
    marginTop: 4,
  },
  calloutRisk: {
    fontSize: FONT_SIZES.xs,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginTop: 2,
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