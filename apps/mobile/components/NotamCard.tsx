import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { parseNotamToTurkish, NotamItem } from '@flight-risk/shared';

interface NotamCardProps {
  item: NotamItem;
}

export default function NotamCard({ item }: NotamCardProps) {
  const [expanded, setExpanded] = useState(false);

  const rawText = item.text || item.raw || '';
  const severity = item.severity || (item.critical ? 'Critical' : 'Info');
  
  const localTranslation = parseNotamToTurkish(rawText);
  const isGenericSummary = !item.summary || 
    item.summary.startsWith("Bilgilendirici NOTAM") ||
    item.summary.startsWith("Pist veya pist operasyonu") ||
    item.summary.startsWith("Seyrüsefer veya yaklaşma") ||
    item.summary.startsWith("Meydan çalışma") ||
    item.summary.startsWith("Operasyonel dikkat");

  let trText = "";
  if (isGenericSummary) {
    trText = localTranslation;
  } else {
    trText = item.summary || "";
  }

  // Eğer yerel çeviri ham metnin kendisine düşmüşse (regex eşleşmediyse)
  // ve elimizde generic de olsa bir özet varsa, generic özeti tercih et
  const isRawFallback = trText === rawText || (rawText.length > 120 && trText === rawText.slice(0, 117) + "...");
  if (isRawFallback && item.summary) {
    trText = item.summary;
  }

  // Operasyonel etki ekle
  const opImpact = (item as any).operationalImpact;
  if (opImpact && !trText.includes(opImpact)) {
    trText += `\n\nOperasyonel Etki: ${opImpact}`;
  }

  const getSeverityColors = () => {
    switch (severity) {
      case 'Critical':
        return {
          bg: COLORS.riskRed + '15',
          border: COLORS.riskRed + '60',
          text: COLORS.riskRed,
          icon: 'alert-circle',
        };
      case 'Medium':
        return {
          bg: COLORS.riskYellow + '15',
          border: COLORS.riskYellow + '60',
          text: COLORS.riskYellow,
          icon: 'warning',
        };
      default:
        return {
          bg: COLORS.primary + '15',
          border: COLORS.border,
          text: COLORS.primaryLight,
          icon: 'information-circle',
        };
    }
  };

  const colors = getSeverityColors();

  return (
    <View style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name={colors.icon as any} size={18} color={colors.text} style={{ marginRight: SPACING.sm }} />
          <Text style={[styles.severityText, { color: colors.text }]}>
            {severity === 'Critical' ? 'Kritik NOTAM' : severity === 'Medium' ? 'Orta NOTAM' : 'Bilgi NOTAM'}
          </Text>
        </View>
        <Text style={styles.notamId}>{item.id || 'NOTAM'}</Text>
      </View>

      <Text style={styles.translatedText}>{trText}</Text>

      {/* Accordion for Raw Text */}
      <TouchableOpacity style={styles.rawHeader} onPress={() => setExpanded(!expanded)}>
        <Text style={styles.rawTitle}>Ham NOTAM Metni (İngilizce)</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.textSecondary} />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.rawContainer}>
          <Text style={styles.rawText}>{rawText}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  severityText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  notamId: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  translatedText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textPrimary,
    lineHeight: 20,
    marginBottom: SPACING.sm,
  },
  rawHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.border + '30',
    paddingTop: SPACING.sm,
    marginTop: SPACING.xs,
  },
  rawTitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  rawContainer: {
    backgroundColor: COLORS.background + '60',
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    marginTop: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.border + '15',
  },
  rawText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    lineHeight: 16,
  },
});
