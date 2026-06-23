import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import RiskIntelligenceCard from '../../components/RiskIntelligenceCard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBriefStore } from '../../stores/briefStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { fetchBrief } from '../../lib/api';
import { openBriefPdf } from '../../lib/pdf';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../../constants/theme';
import AirportPicker from '../../components/AirportPicker';
import RiskGauge from '../../components/RiskGauge';
import RiskSummaryCard from '../../components/RiskSummaryCard';
import WeatherTable from '../../components/WeatherTable';
import NotamCard from '../../components/NotamCard';
import AiAssessment from '../../components/AiAssessment';
import AlternateList from '../../components/AlternateList';
import { Ionicons } from '@expo/vector-icons';

export default function Brief() {
  const { depIcao, arrIcao, isLoading, lastBrief, setLoading, setLastBrief, clear } =
    useBriefStore();

  const { crossLimitKt } = useSettingsStore();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFetchBrief = async () => {
    if (!depIcao || !arrIcao) {
      Alert.alert('Hata', 'Lütfen kalkış ve varış meydanlarını seçin.');
      return;
    }

    if (depIcao.toUpperCase() === arrIcao.toUpperCase()) {
      Alert.alert('Hata', 'Kalkış ve varış meydanları aynı olamaz.');
      return;
    }

    setErrorMsg(null);
    setLoading(true);

    try {
      const res = await fetchBrief(depIcao, arrIcao, crossLimitKt);
      setLastBrief(res);
    } catch (err) {
      console.error(err);
      setErrorMsg(
        'Brifing yüklenirken bir hata oluştu. Lütfen API bağlantısını kontrol edip tekrar deneyin.'
      );
    } finally {
      setLoading(false);
    }
  };

  const allNotams = lastBrief
    ? [
        ...(lastBrief.aiNotamAnalysis?.dep || lastBrief.notam?.dep || []),
        ...(lastBrief.aiNotamAnalysis?.arr || lastBrief.notam?.arr || []),
      ]
    : [];

  const canAnalyze = Boolean(depIcao && arrIcao && !isLoading);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroCard}>
          <View>
            <Text style={styles.heroTitle}>Uçuş Risk Brifingi</Text>
            <Text style={styles.heroSubtitle}>
              METAR, TAF, NOTAM, rüzgâr ve AI destekli risk analizi
            </Text>
          </View>

          <View style={styles.limitPill}>
            <Ionicons name="speedometer" size={14} color={COLORS.primaryLight} />
            <Text style={styles.limitText}>Crosswind limit: {crossLimitKt} kt</Text>
          </View>
        </View>

        <AirportPicker />

        <View style={styles.routePreview}>
          <View style={styles.routeAirport}>
            <Text style={styles.routeLabel}>DEP</Text>
            <Text style={styles.routeIcao}>{depIcao || '-'}</Text>
          </View>

          <Ionicons name="airplane" size={22} color={COLORS.primaryLight} />

          <View style={styles.routeAirport}>
            <Text style={styles.routeLabel}>ARR</Text>
            <Text style={styles.routeIcao}>{arrIcao || '-'}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.briefButton, !canAnalyze && styles.briefButtonDisabled]}
          onPress={handleFetchBrief}
          disabled={!canAnalyze}
        >
          {isLoading ? (
            <ActivityIndicator color={COLORS.textPrimary} />
          ) : (
            <View style={styles.btnInner}>
              <Ionicons
                name="flash"
                size={18}
                color={COLORS.textPrimary}
                style={{ marginRight: SPACING.xs }}
              />
              <Text style={styles.briefButtonText}>Risk Analizi Oluştur</Text>
            </View>
          )}
        </TouchableOpacity>

        {errorMsg ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={18} color={COLORS.danger} />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : null}

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingTitle}>Brifing hazırlanıyor</Text>
            <Text style={styles.loadingText}>
              Hava durumu, NOTAM verileri, alternate meydanlar ve AI raporu analiz ediliyor.
            </Text>
          </View>
        ) : null}

        {!isLoading && !lastBrief ? (
          <View style={styles.emptyCard}>
            <Ionicons name="document-text" size={28} color={COLORS.primaryLight} />
            <Text style={styles.emptyTitle}>Henüz analiz oluşturulmadı</Text>
            <Text style={styles.emptyText}>
              Kalkış ve varış meydanlarını seçtikten sonra risk analizi oluşturabilirsiniz.
            </Text>
          </View>
        ) : null}

        {!isLoading && lastBrief ? (
          <View style={styles.resultsContainer}>
            <View style={styles.resultsHeader}>
              <View>
                <Text style={styles.resultsTitle}>Analiz Sonuçları</Text>
                <Text style={styles.resultsSubtitle}>
                  {lastBrief.airports.dep.icao} → {lastBrief.airports.arr.icao}
                </Text>
              </View>

              <View style={styles.headerActions}>
                <TouchableOpacity
                  style={styles.pdfBtn}
                  onPress={() => openBriefPdf(depIcao, arrIcao, crossLimitKt)}
                >
                  <Ionicons
                    name="document-text-outline"
                    size={15}
                    color={COLORS.textPrimary}
                  />
                  <Text style={styles.pdfBtnText}>PDF</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.clearBtn} onPress={clear}>
                  <Ionicons
                    name="trash-outline"
                    size={15}
                    color={COLORS.textSecondary}
                  />
                  <Text style={styles.clearBtnText}>Temizle</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.sectionCard}>
              <SectionTitle icon="analytics" title="Genel Risk Değerlendirmesi" />
              
              <RiskGauge score={lastBrief.risk.score} />

              <RiskIntelligenceCard risk={lastBrief.risk} />

              <RiskSummaryCard
                score={lastBrief.risk.score}
                reasons={lastBrief.risk.reasons}
              />
            
            </View>

            <View style={styles.sectionCard}>
              <SectionTitle icon="sparkles" title="AI Destekli Değerlendirme" />
              <AiAssessment report={lastBrief.aiReport} />
            </View>

            <View style={styles.sectionCard}>
              <SectionTitle icon="partly-sunny" title="Hava Durumu Özeti" />
              <WeatherTable
                depMet={lastBrief.met.dep}
                arrMet={lastBrief.met.arr}
                depIcao={lastBrief.airports.dep.icao}
                arrIcao={lastBrief.airports.arr.icao}
              />
            </View>

            <View style={styles.sectionCard}>
              <SectionTitle icon="navigate" title="Yedek Meydan Önerileri" />
              <AlternateList
                alternates={lastBrief.risk.alternates}
                depIcao={lastBrief.airports.dep.icao}
              />
            </View>

            <View style={styles.sectionCard}>
              <SectionTitle icon="warning" title={`Aktif NOTAM'lar (${allNotams.length})`} />

              {allNotams.length > 0 ? (
                allNotams.map((notam, idx) => <NotamCard key={idx} item={notam} />)
              ) : (
                <Text style={styles.emptyNotamText}>
                  Meydanlar için aktif kritik NOTAM bulunamadı.
                </Text>
              )}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({ icon, title }: { icon: any; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Ionicons
        name={icon}
        size={19}
        color={COLORS.primaryLight}
        style={{ marginRight: SPACING.sm }}
      />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { padding: SPACING.md, paddingBottom: SPACING.xxl },

  heroCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  heroTitle: { color: COLORS.textPrimary, fontSize: FONT_SIZES.lg, fontWeight: 'bold' },
  heroSubtitle: { color: COLORS.textSecondary, fontSize: FONT_SIZES.sm, marginTop: 4 },

  limitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: COLORS.background,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    marginTop: SPACING.md,
  },
  limitText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.xs,
    marginLeft: 6,
    fontWeight: 'bold',
  },

  routePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  routeAirport: { flex: 1 },
  routeLabel: { color: COLORS.textMuted, fontSize: FONT_SIZES.xs, fontWeight: 'bold' },
  routeIcao: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.xl,
    fontWeight: 'bold',
    marginTop: 2,
  },

  briefButton: {
    backgroundColor: COLORS.primary,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    marginBottom: SPACING.lg,
    height: 54,
    justifyContent: 'center',
  },
  briefButtonDisabled: { opacity: 0.5 },
  btnInner: { flexDirection: 'row', alignItems: 'center' },
  briefButtonText: { color: COLORS.textPrimary, fontWeight: 'bold', fontSize: FONT_SIZES.md },

  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.danger + '20',
    borderColor: COLORS.danger,
    borderWidth: 1,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.sm,
    marginBottom: SPACING.md,
  },
  errorText: { flex: 1, color: COLORS.danger, fontSize: FONT_SIZES.sm, marginLeft: SPACING.sm },

  loadingContainer: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.xxl,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.md,
    fontWeight: 'bold',
    marginTop: SPACING.md,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },

  emptyCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg,
    alignItems: 'center',
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.md,
    fontWeight: 'bold',
    marginTop: SPACING.sm,
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    textAlign: 'center',
    marginTop: 6,
  },

  resultsContainer: { marginTop: SPACING.md },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  resultsTitle: { fontSize: FONT_SIZES.lg, fontWeight: 'bold', color: COLORS.textPrimary },
  resultsSubtitle: { color: COLORS.textSecondary, fontSize: FONT_SIZES.sm, marginTop: 2 },

  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  pdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 7,
  },
  pdfBtnText: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.xs,
    marginLeft: 4,
    fontWeight: 'bold',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 7,
  },
  clearBtnText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.xs,
    marginLeft: 4,
    fontWeight: 'bold',
  },

  sectionCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  sectionTitle: { fontSize: FONT_SIZES.md, fontWeight: 'bold', color: COLORS.textPrimary },
  emptyNotamText: {
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    fontSize: FONT_SIZES.sm,
  },
});