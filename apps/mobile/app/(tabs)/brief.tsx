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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBriefStore } from '../../stores/briefStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { fetchBrief } from '../../lib/api';
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
  const {
    depIcao,
    arrIcao,
    isLoading,
    lastBrief,
    setLoading,
    setLastBrief,
    clear,
  } = useBriefStore();

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
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Brifing yüklenirken bir hata oluştu. Lütfen bağlantınızı kontrol edip tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  const allNotams = lastBrief 
    ? [
        ...(lastBrief.aiNotamAnalysis?.dep || lastBrief.notam?.dep || []),
        ...(lastBrief.aiNotamAnalysis?.arr || lastBrief.notam?.arr || [])
      ]
    : [];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Airport Picker Inputs */}
        <AirportPicker />

        {/* Action Button */}
        <TouchableOpacity
          style={[styles.briefButton, (isLoading || !depIcao || !arrIcao) && styles.briefButtonDisabled]}
          onPress={handleFetchBrief}
          disabled={isLoading || !depIcao || !arrIcao}
        >
          {isLoading ? (
            <ActivityIndicator color={COLORS.textPrimary} />
          ) : (
            <View style={styles.btnInner}>
              <Ionicons name="flash" size={18} color={COLORS.textPrimary} style={{ marginRight: SPACING.xs }} />
              <Text style={styles.briefButtonText}>Hızlı Risk Analizi Yap</Text>
            </View>
          )}
        </TouchableOpacity>

        {errorMsg && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}

        {/* Loading Spinner State */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Hava Durumu, NOTAM verileri ve AI Raporu hazırlanıyor...</Text>
          </View>
        )}

        {/* Briefing Results */}
        {!isLoading && lastBrief && (
          <View style={styles.resultsContainer}>
            {/* Clear Button */}
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsTitle}>Analiz Sonuçları</Text>
              <TouchableOpacity style={styles.clearBtn} onPress={clear}>
                <Text style={styles.clearBtnText}>Temizle</Text>
              </TouchableOpacity>
            </View>

            {/* Risk Gauge Circle */}
            <RiskGauge score={lastBrief.risk.score} />

            {/* Risk Summary reasons */}
            <RiskSummaryCard score={lastBrief.risk.score} reasons={lastBrief.risk.reasons} />

            {/* AI Report assessment */}
            <AiAssessment report={lastBrief.aiReport} />

            {/* Weather Table METAR */}
            <WeatherTable
              depMet={lastBrief.met.dep}
              arrMet={lastBrief.met.arr}
              depIcao={lastBrief.airports.dep.icao}
              arrIcao={lastBrief.airports.arr.icao}
            />

            {/* Alternates */}
            <AlternateList 
              alternates={lastBrief.risk.alternates} 
              depIcao={lastBrief.airports.dep.icao} 
            />

            {/* NOTAM Section */}
            <View style={styles.notamSection}>
              <View style={styles.sectionHeader}>
                <Ionicons name="warning" size={20} color={COLORS.primaryLight} style={{ marginRight: SPACING.sm }} />
                <Text style={styles.sectionTitle}>Aktif NOTAM'lar ({allNotams.length})</Text>
              </View>

              {allNotams.length > 0 ? (
                allNotams.map((notam, idx) => (
                  <NotamCard key={idx} item={notam} />
                ))
              ) : (
                <Text style={styles.emptyNotamText}>Meydanlar için aktif kritik NOTAM bulunamadı.</Text>
              )}
            </View>

          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  briefButton: {
    backgroundColor: COLORS.primary,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    marginBottom: SPACING.lg,
    height: 52,
    justifyContent: 'center',
  },
  briefButtonDisabled: {
    opacity: 0.5,
  },
  btnInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  briefButtonText: {
    color: COLORS.textPrimary,
    fontWeight: 'bold',
    fontSize: FONT_SIZES.md,
  },
  errorContainer: {
    backgroundColor: COLORS.danger + '20',
    borderColor: COLORS.danger,
    borderWidth: 1,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.sm,
    marginBottom: SPACING.md,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: FONT_SIZES.sm,
    textAlign: 'center',
  },
  loadingContainer: {
    paddingVertical: SPACING.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    textAlign: 'center',
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.xl,
  },
  resultsContainer: {
    marginTop: SPACING.md,
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  resultsTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  clearBtn: {
    padding: SPACING.xs,
  },
  clearBtnText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
  },
  notamSection: {
    marginTop: SPACING.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  emptyNotamText: {
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    fontSize: FONT_SIZES.sm,
    paddingLeft: SPACING.sm,
  },
});
