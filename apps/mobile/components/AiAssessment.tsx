import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { AiBriefReport } from '@flight-risk/shared';

interface AiAssessmentProps {
  report?: AiBriefReport;
}

export default function AiAssessment({ report }: AiAssessmentProps) {
  if (!report) {
    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <Ionicons name="chatbubble-ellipses" size={20} color={COLORS.primaryLight} style={{ marginRight: SPACING.sm }} />
          <Text style={styles.title}>AI Uçuş Değerlendirmesi</Text>
        </View>
        <Text style={styles.emptyText}>Bu brifing için yapay zeka raporu oluşturulamadı.</Text>
      </View>
    );
  }

  const renderSection = (title: string, content: string | string[] | undefined, iconName: string) => {
    if (!content || (Array.isArray(content) && content.length === 0)) return null;

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name={iconName as any} size={16} color={COLORS.primaryLight} style={{ marginRight: SPACING.sm }} />
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        {Array.isArray(content) ? (
          content.map((item, idx) => (
            <View key={idx} style={styles.bulletRow}>
              <View style={styles.bulletPoint} />
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.sectionBody}>{content}</Text>
        )}
      </View>
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="chatbubble-ellipses" size={20} color={COLORS.primaryLight} style={{ marginRight: SPACING.sm }} />
        <Text style={styles.title}>AI Uçuş Değerlendirmesi</Text>
      </View>

      {renderSection('Özet brifing', report.summary, 'reader-outline')}
      {renderSection('Risk Yorumlama', report.riskInterpretation, 'pulse-outline')}
      {renderSection('Hava Durumu Endişeleri', report.weatherConcerns, 'cloudy-outline')}
      {renderSection('Rüzgar Etkisi', report.windConcerns, 'flag-outline')}
      {renderSection('NOTAM Değerlendirmesi', report.notamImpacts, 'alert-circle-outline')}
      {renderSection('Yedek Meydan Analizi', report.alternateCommentary, 'map-outline')}

      {report.confidenceNote ? (
        <View style={styles.footerNote}>
          <Ionicons name="information-circle-outline" size={14} color={COLORS.textMuted} style={{ marginRight: SPACING.xs }} />
          <Text style={styles.footerText}>{report.confidenceNote}</Text>
        </View>
      ) : null}
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
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    fontStyle: 'italic',
  },
  section: {
    marginBottom: SPACING.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionBody: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textPrimary,
    lineHeight: 20,
    paddingLeft: SPACING.md + 4,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: SPACING.md + 4,
    marginBottom: 4,
  },
  bulletPoint: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primaryLight,
    marginTop: 8,
    marginRight: SPACING.sm,
  },
  bulletText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textPrimary,
    flex: 1,
    lineHeight: 20,
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.sm,
    marginTop: SPACING.sm,
  },
  footerText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    flex: 1,
  },
});
