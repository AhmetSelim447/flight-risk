import React from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../stores/authStore';
import { useBriefStore } from '../../stores/briefStore';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function Home() {
  const { user, signOut } = useAuthStore();
  const { setDeparture, setArrival, lastBrief } = useBriefStore();
  const router = useRouter();

  const handleQuickBrief = (dep: string, arr: string, depName: string, arrName: string) => {
    setDeparture(dep, depName);
    setArrival(arr, arrName);
    router.push('/(tabs)/brief');
  };

  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Kaptan';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <View>
            <Text style={styles.welcomeTitle}>İyi Uçuşlar,</Text>
            <Text style={styles.pilotName}>{displayName}</Text>
          </View>
          <TouchableOpacity style={styles.profileButton} onPress={() => router.push('/(tabs)/profile')}>
            <Ionicons name="person-circle" size={40} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {/* Quick Actions / Popular Routes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Hızlı Rotalar</Text>
          <View style={styles.grid}>
            <TouchableOpacity 
              style={styles.routeCard}
              onPress={() => handleQuickBrief('LTFJ', 'LTAC', 'Sabiha Gökçen', 'Esenboğa')}
            >
              <View style={styles.routeHeader}>
                <Text style={styles.routeText}>LTFJ</Text>
                <Ionicons name="arrow-forward" size={16} color={COLORS.textSecondary} />
                <Text style={styles.routeText}>LTAC</Text>
              </View>
              <Text style={styles.routeSubtext}>İstanbul - Ankara</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.routeCard} 
              onPress={() => handleQuickBrief('LTFM', 'LTAF', 'İstanbul Havalimanı', 'Adana Şakirpaşa')}
            >
              <View style={styles.routeHeader}>
                <Text style={styles.routeText}>LTFM</Text>
                <Ionicons name="arrow-forward" size={16} color={COLORS.textSecondary} />
                <Text style={styles.routeText}>LTAF</Text>
              </View>
              <Text style={styles.routeSubtext}>İstanbul - Adana</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Last Briefing Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Son Analiz</Text>
          {lastBrief ? (
            <TouchableOpacity 
              style={styles.briefCard}
              onPress={() => router.push('/(tabs)/brief')}
            >
              <View style={styles.briefCardHeader}>
                <View style={styles.briefRoute}>
                  <Text style={styles.briefIcao}>{lastBrief.airports.dep.icao}</Text>
                  <Ionicons name="airplane" size={18} color={COLORS.primary} style={{ marginHorizontal: SPACING.sm }} />
                  <Text style={styles.briefIcao}>{lastBrief.airports.arr.icao}</Text>
                </View>
                <View style={[
                  styles.badge, 
                  { backgroundColor: lastBrief.risk.class === 'red' ? COLORS.riskRed + '20' : lastBrief.risk.class === 'yellow' ? COLORS.riskYellow + '20' : COLORS.riskGreen + '20' }
                ]}>
                  <Text style={[
                    styles.badgeText, 
                    { color: lastBrief.risk.class === 'red' ? COLORS.riskRed : lastBrief.risk.class === 'yellow' ? COLORS.riskYellow : COLORS.riskGreen }
                  ]}>
                    % {lastBrief.risk.score}
                  </Text>
                </View>
              </View>
              
              <Text style={styles.briefTime}>
                Analiz Zamanı: {new Date(lastBrief.met.dep[0]?.issued_at_utc || '').toLocaleTimeString()}
              </Text>
              <Text style={styles.briefReason} numberOfLines={2}>
                {lastBrief.risk.reasons.length > 0 
                  ? lastBrief.risk.reasons.join(', ') 
                  : 'Belirgin risk faktörü bulunamadı.'}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="document-text-outline" size={40} color={COLORS.textMuted} />
              <Text style={styles.emptyCardText}>Henüz yapılmış bir uçuş analizi yok.</Text>
              <TouchableOpacity 
                style={styles.emptyCardButton}
                onPress={() => router.push('/(tabs)/brief')}
              >
                <Text style={styles.emptyCardButtonText}>Hemen Başla</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Safety Banner */}
        <View style={styles.safetyBanner}>
          <Ionicons name="shield-checkmark" size={24} color={COLORS.riskGreen} />
          <Text style={styles.safetyText}>
            Güvenli uçuşlar. Brifing raporunu incelemeden ve NOTAM'ları kontrol etmeden uçuşa başlamayınız.
          </Text>
        </View>
        
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
  welcomeSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xl,
    paddingVertical: SPACING.sm,
  },
  welcomeTitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  pilotName: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  profileButton: {
    padding: SPACING.xs,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  grid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  routeCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    width: '48%',
  },
  routeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  routeText: {
    fontSize: FONT_SIZES.md,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  routeSubtext: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  briefCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
  },
  briefCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  briefRoute: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  briefIcao: {
    fontSize: FONT_SIZES.lg,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  badge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
  },
  badgeText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: 'bold',
  },
  briefTime: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginBottom: SPACING.xs,
  },
  briefReason: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.xl,
    alignItems: 'center',
  },
  emptyCardText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  emptyCardButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
  },
  emptyCardButtonText: {
    color: COLORS.textPrimary,
    fontWeight: 'bold',
    fontSize: FONT_SIZES.sm,
  },
  safetyBanner: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceLight,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  safetyText: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.xs,
    marginLeft: SPACING.sm,
  },
});
