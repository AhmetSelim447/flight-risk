import React from 'react';
import { StyleSheet, Text, View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { MetReport } from '@flight-risk/shared';

interface WeatherTableProps {
  depMet: MetReport[];
  arrMet: MetReport[];
  depIcao: string;
  arrIcao: string;
}

export default function WeatherTable({ depMet, arrMet, depIcao, arrIcao }: WeatherTableProps) {
  const getMetar = (met: MetReport[]) => met.find((m) => m.type === 'METAR');
  const getTaf = (met: MetReport[]) => met.find((m) => m.type === 'TAF');

  const depMetar = getMetar(depMet);
  const arrMetar = getMetar(arrMet);

  const formatWind = (parsed: any) => {
    if (!parsed) return 'Bilinmiyor';
    const dir = parsed.wind_dir != null ? `${parsed.wind_dir}°` : 'VRB';
    const spd = parsed.wind_spd != null ? `${parsed.wind_spd} kt` : '';
    const gust = parsed.gust != null ? ` G ${parsed.gust} kt` : '';
    return `${dir} / ${spd}${gust}` || 'Sakin';
  };

  const formatVis = (parsed: any) => {
    if (!parsed || parsed.vis == null) return 'Bilinmiyor';
    if (parsed.vis >= 9999) return '10 km veya üzeri';
    return `${parsed.vis} m`;
  };

  const formatCeiling = (parsed: any) => {
    if (!parsed) return 'Bilinmiyor';
    if (parsed.ceiling == null) return 'Ceiling yok (CAVOK/Açık)';
    return `${parsed.ceiling} ft AGL`;
  };

  const formatWx = (parsed: any) => {
    if (!parsed || !parsed.wx || parsed.wx.length === 0) return 'Yok';
    return parsed.wx.join(', ');
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="cloudy" size={20} color={COLORS.primaryLight} style={{ marginRight: SPACING.sm }} />
        <Text style={styles.title}>Hava Durumu Değerlendirmesi</Text>
      </View>

      {/* Table Headers */}
      <View style={styles.tableHeader}>
        <Text style={[styles.colHeader, styles.colParam]}>Parametre</Text>
        <Text style={[styles.colHeader, styles.colAirport]}>{depIcao}</Text>
        <Text style={[styles.colHeader, styles.colAirport]}>{arrIcao}</Text>
      </View>

      {/* Wind Row */}
      <View style={styles.tableRow}>
        <Text style={[styles.rowLabel, styles.colParam]}>Rüzgar</Text>
        <Text style={[styles.rowValue, styles.colAirport]}>{formatWind(depMetar?.parsed)}</Text>
        <Text style={[styles.rowValue, styles.colAirport]}>{formatWind(arrMetar?.parsed)}</Text>
      </View>

      <View style={styles.separator} />

      {/* Visibility Row */}
      <View style={styles.tableRow}>
        <Text style={[styles.rowLabel, styles.colParam]}>Görüş</Text>
        <Text style={[styles.rowValue, styles.colAirport]}>{formatVis(depMetar?.parsed)}</Text>
        <Text style={[styles.rowValue, styles.colAirport]}>{formatVis(arrMetar?.parsed)}</Text>
      </View>

      <View style={styles.separator} />

      {/* Ceiling Row */}
      <View style={styles.tableRow}>
        <Text style={[styles.rowLabel, styles.colParam]}>Bulut Tavanı</Text>
        <Text style={[styles.rowValue, styles.colAirport]}>{formatCeiling(depMetar?.parsed)}</Text>
        <Text style={[styles.rowValue, styles.colAirport]}>{formatCeiling(arrMetar?.parsed)}</Text>
      </View>

      <View style={styles.separator} />

      {/* Weather Row */}
      <View style={styles.tableRow}>
        <Text style={[styles.rowLabel, styles.colParam]}>Hava Hadisesi</Text>
        <Text style={[styles.rowValue, styles.colAirport]}>{formatWx(depMetar?.parsed)}</Text>
        <Text style={[styles.rowValue, styles.colAirport]}>{formatWx(arrMetar?.parsed)}</Text>
      </View>

      {/* Raw METARs */}
      <View style={styles.rawSection}>
        <Text style={styles.rawTitle}>Kalkış METAR ({depIcao}):</Text>
        <Text style={styles.rawText}>{depMetar?.raw || 'METAR yok'}</Text>

        <Text style={[styles.rawTitle, { marginTop: SPACING.sm }]}>Varış METAR ({arrIcao}):</Text>
        <Text style={styles.rawText}>{arrMetar?.raw || 'METAR yok'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: SPACING.sm,
  },
  title: {
    fontSize: FONT_SIZES.md,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  colHeader: {
    fontSize: FONT_SIZES.xs,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    alignItems: 'center',
  },
  rowLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
  },
  rowValue: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textPrimary,
  },
  colParam: {
    width: '30%',
  },
  colAirport: {
    width: '35%',
    textAlign: 'center',
  },
  separator: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  rawSection: {
    marginTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.md,
  },
  rawTitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  rawText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textPrimary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    backgroundColor: COLORS.background,
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    borderColor: COLORS.border,
    borderWidth: 1,
    lineHeight: 16,
  },
});
