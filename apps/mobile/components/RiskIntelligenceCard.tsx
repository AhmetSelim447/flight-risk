import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';

type Props = {
  risk: any;
};

function toPercent(value: unknown) {
  if (typeof value !== 'number') return null;
  if (value <= 1) return Math.round(value * 100);
  return Math.round(value);
}

function getRiskLabel(riskClass?: string, score?: number) {
  if (riskClass === 'red' || (typeof score === 'number' && score >= 70)) return 'Yüksek Risk';
  if (riskClass === 'yellow' || (typeof score === 'number' && score >= 40)) return 'Orta Risk';
  return 'Düşük Risk';
}

function getDriverLabel(driver?: string) {
  if (!driver) return 'Kural tabanlı risk sonucu';
  const normalized = driver.toLowerCase();

  if (normalized.includes('weather')) return 'Hava Durumu';
  if (normalized.includes('wind')) return 'Rüzgâr / Crosswind';
  if (normalized.includes('notam')) return 'NOTAM';
  if (normalized.includes('visibility')) return 'Görüş';
  if (normalized.includes('ceiling')) return 'Bulut Tavanı';

  return driver;
}

export default function RiskIntelligenceCard({ risk }: Props) {
  const score = typeof risk?.score === 'number' ? risk.score : undefined;
  const riskClass = risk?.class || risk?.level;
  const confidence = toPercent(risk?.confidence);

  const primaryDriver =
    risk?.primaryDriver ||
    risk?.primary_driver ||
    risk?.driver ||
    risk?.mainReason;

  const breakdown = risk?.breakdown || {};
  const weather = toPercent(breakdown.weather);
  const wind = toPercent(breakdown.wind);
  const notam = toPercent(breakdown.notam);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="pulse" size={19} color={COLORS.primaryLight} />
        <Text style={styles.title}>Risk Intelligence</Text>
      </View>

      <View style={styles.grid}>
        <InfoBox label="Risk Sınıfı" value={getRiskLabel(riskClass, score)} />
        <InfoBox label="Ana Sebep" value={getDriverLabel(primaryDriver)} />
        <InfoBox label="Güven" value={confidence !== null ? `%${confidence}` : 'Veri yeterli'} />
      </View>

      <View style={styles.breakdownBox}>
        <Text style={styles.breakdownTitle}>Risk Dağılımı</Text>

        <BreakdownRow label="Hava Durumu" value={weather} fallback={breakdown.weather} />
        <BreakdownRow label="Rüzgâr" value={wind} fallback={breakdown.wind} />
        <BreakdownRow label="NOTAM" value={notam} fallback={breakdown.notam} />
      </View>
    </View>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoBox}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function BreakdownRow({
  label,
  value,
  fallback,
}: {
  label: string;
  value: number | null;
  fallback?: unknown;
}) {
  const displayValue =
    value !== null ? `%${value}` : typeof fallback === 'number' ? String(fallback) : '-';

  return (
    <View style={styles.breakdownRow}>
      <Text style={styles.breakdownLabel}>{label}</Text>
      <Text style={styles.breakdownValue}>{displayValue}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.md,
    fontWeight: 'bold',
  },
  grid: {
    gap: SPACING.sm,
  },
  infoBox: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.md,
  },
  infoLabel: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.xs,
    fontWeight: 'bold',
  },
  infoValue: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.md,
    fontWeight: 'bold',
    marginTop: 4,
  },
  breakdownBox: {
    marginTop: SPACING.md,
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    paddingTop: SPACING.md,
  },
  breakdownTitle: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    fontWeight: 'bold',
    marginBottom: SPACING.sm,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  breakdownLabel: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
  },
  breakdownValue: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.sm,
    fontWeight: 'bold',
  },
});