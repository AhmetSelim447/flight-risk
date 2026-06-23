import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../stores/authStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function Profile() {
  const { user, signOut } = useAuthStore();
  const { 
    crossLimitKt, 
    windUnit, 
    distUnit, 
    notificationsEnabled,
    setCrossLimit,
    setWindUnit,
    setDistUnit,
    setNotifications 
  } = useSettingsStore();

  const handleSignOut = async () => {
    await signOut();
  };

  const email = user?.email || 'Bilinmeyen E-posta';
  const displayName = user?.user_metadata?.display_name || email.split('@')[0] || 'Kaptan';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Pilot Info */}
        <View style={styles.profileHeader}>
          <Ionicons name="person-circle-outline" size={80} color={COLORS.primary} />
          <Text style={styles.nameText}>{displayName}</Text>
          <Text style={styles.emailText}>{email}</Text>
          <Text style={styles.roleText}>Pilot / Kaptan</Text>
        </View>

        {/* Settings Group */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Uçuş Tercihleri</Text>
          
          <View style={styles.card}>
            {/* Crosswind Limit */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Ionicons name="swap-horizontal" size={22} color={COLORS.primaryLight} style={styles.icon} />
                <View>
                  <Text style={styles.rowTitle}>Yan Rüzgar Limiti</Text>
                  <Text style={styles.rowSubtitle}>Maksimum limit (Crosswind)</Text>
                </View>
              </View>
              <View style={styles.limitControl}>
                <TouchableOpacity 
                  style={styles.limitBtn} 
                  onPress={() => setCrossLimit(Math.max(5, crossLimitKt - 1))}
                >
                  <Text style={styles.limitBtnText}>-</Text>
                </TouchableOpacity>
                <Text style={styles.limitValue}>{crossLimitKt} kt</Text>
                <TouchableOpacity 
                  style={styles.limitBtn} 
                  onPress={() => setCrossLimit(Math.min(40, crossLimitKt + 1))}
                >
                  <Text style={styles.limitBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.separator} />

            {/* Wind Unit */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Ionicons name="speedometer" size={22} color={COLORS.primaryLight} style={styles.icon} />
                <View>
                  <Text style={styles.rowTitle}>Rüzgar Birimi</Text>
                  <Text style={styles.rowSubtitle}>Hız gösterim birimi</Text>
                </View>
              </View>
              <View style={styles.toggleContainer}>
                <TouchableOpacity 
                  style={[styles.toggleBtn, windUnit === 'kt' && styles.toggleBtnActive]}
                  onPress={() => setWindUnit('kt')}
                >
                  <Text style={[styles.toggleBtnText, windUnit === 'kt' && styles.toggleBtnTextActive]}>KT</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.toggleBtn, windUnit === 'kmh' && styles.toggleBtnActive]}
                  onPress={() => setWindUnit('kmh')}
                >
                  <Text style={[styles.toggleBtnText, windUnit === 'kmh' && styles.toggleBtnTextActive]}>KM/H</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.separator} />

            {/* Distance Unit */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Ionicons name="navigate" size={22} color={COLORS.primaryLight} style={styles.icon} />
                <View>
                  <Text style={styles.rowTitle}>Mesafe Birimi</Text>
                  <Text style={styles.rowSubtitle}>Mesafe gösterim birimi</Text>
                </View>
              </View>
              <View style={styles.toggleContainer}>
                <TouchableOpacity 
                  style={[styles.toggleBtn, distUnit === 'nm' && styles.toggleBtnActive]}
                  onPress={() => setDistUnit('nm')}
                >
                  <Text style={[styles.toggleBtnText, distUnit === 'nm' && styles.toggleBtnTextActive]}>NM</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.toggleBtn, distUnit === 'km' && styles.toggleBtnActive]}
                  onPress={() => setDistUnit('km')}
                >
                  <Text style={[styles.toggleBtnText, distUnit === 'km' && styles.toggleBtnTextActive]}>KM</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.separator} />

            {/* Notifications */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Ionicons name="notifications" size={22} color={COLORS.primaryLight} style={styles.icon} />
                <View>
                  <Text style={styles.rowTitle}>Bildirimler</Text>
                  <Text style={styles.rowSubtitle}>Hava durumu değişiklik uyarıları</Text>
                </View>
              </View>
              <Switch 
                value={notificationsEnabled} 
                onValueChange={setNotifications} 
                trackColor={{ false: COLORS.border, true: COLORS.primary }}
                thumbColor={COLORS.textPrimary}
              />
            </View>
          </View>
        </View>

        {/* Action Button */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={22} color={COLORS.riskRed} style={{ marginRight: SPACING.sm }} />
          <Text style={styles.signOutButtonText}>Güvenli Çıkış Yap</Text>
        </TouchableOpacity>

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
  profileHeader: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    borderColor: COLORS.border,
    borderWidth: 1,
    marginBottom: SPACING.xl,
  },
  nameText: {
    fontSize: FONT_SIZES.xl,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginTop: SPACING.sm,
  },
  emailText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  roleText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.primaryLight,
    fontWeight: 'bold',
    marginTop: SPACING.sm,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  icon: {
    marginRight: SPACING.md,
  },
  rowTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  rowSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
  },
  separator: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.sm,
  },
  limitControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.sm,
    borderColor: COLORS.border,
    borderWidth: 1,
    padding: SPACING.xs,
  },
  limitBtn: {
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.sm,
  },
  limitBtnText: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.md,
    fontWeight: 'bold',
  },
  limitValue: {
    color: COLORS.textPrimary,
    fontWeight: 'bold',
    fontSize: FONT_SIZES.sm,
    paddingHorizontal: SPACING.sm,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.sm,
    borderColor: COLORS.border,
    borderWidth: 1,
    padding: 2,
  },
  toggleBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
  },
  toggleBtnActive: {
    backgroundColor: COLORS.primary,
  },
  toggleBtnText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.xs,
    fontWeight: 'bold',
  },
  toggleBtnTextActive: {
    color: COLORS.textPrimary,
  },
  signOutButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.riskRed + '40',
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  signOutButtonText: {
    color: COLORS.riskRed,
    fontWeight: 'bold',
    fontSize: FONT_SIZES.md,
  },
});
