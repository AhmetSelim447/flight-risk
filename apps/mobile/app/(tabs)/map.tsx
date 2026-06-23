import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, Callout, PROVIDER_GOOGLE } from 'react-native-maps';
import { useBriefStore } from '../../stores/briefStore';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function RouteMap() {
  const { lastBrief } = useBriefStore();
  const mapRef = useRef<MapView>(null);

  const dep = lastBrief?.airports?.dep;
  const arr = lastBrief?.airports?.arr;

  // Alternate airports details
  const alternateDetails = (lastBrief?.risk as any)?.alternateDetails || [];

  useEffect(() => {
    if (!mapRef.current || !dep?.coords || !arr?.coords) return;

    const coordinates = [
      { latitude: dep.coords.lat, longitude: dep.coords.lng },
      { latitude: arr.coords.lat, longitude: arr.coords.lng },
      ...alternateDetails
        .filter((alt: any) => alt.lat && alt.lon)
        .map((alt: any) => ({ latitude: alt.lat, longitude: alt.lon })),
    ];

    setTimeout(() => {
      mapRef.current?.fitToCoordinates(coordinates, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    }, 500);
  }, [dep, arr, alternateDetails]);

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
        {dep?.coords && (
          <Marker
            coordinate={{ latitude: dep.coords.lat, longitude: dep.coords.lng }}
            title={dep.icao}
            description={dep.name || 'Kalkış Havalimanı'}
            pinColor={COLORS.primary}
          >
            <Callout>
              <View style={styles.callout}>
                <Text style={styles.calloutTitle}>{dep.icao}</Text>
                <Text style={styles.calloutDesc}>{dep.name}</Text>
                <Text style={styles.calloutRole}>Kalkış Meydanı</Text>
              </View>
            </Callout>
          </Marker>
        )}

        {arr?.coords && (
          <Marker
            coordinate={{ latitude: arr.coords.lat, longitude: arr.coords.lng }}
            title={arr.icao}
            description={arr.name || 'Varış Havalimanı'}
            pinColor={
              lastBrief?.risk.class === 'red' 
                ? COLORS.riskRed 
                : lastBrief?.risk.class === 'yellow' 
                ? COLORS.riskYellow 
                : COLORS.riskGreen
            }
          >
            <Callout>
              <View style={styles.callout}>
                <Text style={styles.calloutTitle}>{arr.icao}</Text>
                <Text style={styles.calloutDesc}>{arr.name}</Text>
                <Text style={styles.calloutRole}>Varış Meydanı</Text>
                <Text style={styles.calloutRisk}>
                  Risk Skoru: %{lastBrief?.risk.score}
                </Text>
              </View>
            </Callout>
          </Marker>
        )}

        {/* Alternate markers */}
        {alternateDetails.map((alt: any, index: number) => {
          if (!alt.lat || !alt.lon) return null;
          return (
            <Marker
              key={index}
              coordinate={{ latitude: alt.lat, longitude: alt.lon }}
              title={alt.icao}
              description={alt.name || 'Yedek Havalimanı'}
              pinColor={COLORS.primaryLight}
            >
              <Callout>
                <View style={styles.callout}>
                  <Text style={styles.calloutTitle}>{alt.icao}</Text>
                  <Text style={styles.calloutDesc}>{alt.name || alt.city}</Text>
                  <Text style={styles.calloutRole}>Yedek Meydan (ALTN)</Text>
                  {alt.distance_nm && (
                    <Text style={styles.calloutRisk}>Mesafe: {Math.round(alt.distance_nm)} NM</Text>
                  )}
                </View>
              </Callout>
            </Marker>
          );
        })}

        {dep?.coords && arr?.coords && (
          <Polyline
            coordinates={[
              { latitude: dep.coords.lat, longitude: dep.coords.lng },
              { latitude: arr.coords.lat, longitude: arr.coords.lng },
            ]}
            strokeColor={COLORS.primary}
            strokeWidth={3}
            lineDashPattern={[5, 5]}
          />
        )}
      </MapView>

      {!lastBrief && (
        <View style={styles.banner}>
          <Ionicons name="information-circle" size={20} color={COLORS.primaryLight} style={{ marginRight: SPACING.sm }} />
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
  callout: {
    padding: SPACING.sm,
    width: 200,
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
