import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, riskColor } from '../constants/theme';

interface RiskSummaryCardProps {
  score: number;
  reasons: string[];
}

export default function RiskSummaryCard({ score, reasons }: RiskSummaryCardProps) {
  const getRiskClass = (s: number): 'green' | 'yellow' | 'red' => {
    if (s <= 30) return 'green';
    if (s <= 70) return 'yellow';
    return 'red';
  };

  const riskClass = getRiskClass(score);
  const color = riskColor(riskClass);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="warning" size={22} color={color} style={{ marginRight: SPACING.sm }} />
        <Text style={styles.title}>Temel Risk Faktörleri</Text>
      </View>

      <View style={styles.reasonsList}>
        {reasons.length > 0 ? (
          reasons.map((reason, index) => (
            <View key={index} style={styles.reasonRow}>
              <Ionicons name="close-circle" size={16} color={COLORS.danger} style={styles.bullet} />
              <Text style={styles.reasonText}>{reason}</Text>
            </View>
          ))
        ) : (
          <View style={styles.reasonRow}>
            <Ionicons name="checkmark-circle" size={18} color={COLORS.success} style={styles.bullet} />
            <Text style={styles.noRiskText}>Belirgin bir olumsuz risk faktörü tespit edilmedi.</Text>
          </View>
        )}
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
  reasonsList: {
    marginTop: SPACING.xs,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  bullet: {
    marginTop: 2,
    marginRight: SPACING.sm,
  },
  reasonText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textPrimary,
    flex: 1,
  },
  noRiskText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.success,
    flex: 1,
  },
});
