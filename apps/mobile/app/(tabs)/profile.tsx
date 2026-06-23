import React, { useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../stores/authStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useBriefStore } from '../../stores/briefStore';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function Profile() {
  const { user, signOut } = useAuthStore();

  const {
    crossLimitKt,
    windUnit,
    distUnit,
    notificationsEnabled,
    profileLoading,
    profileError,
    setCrossLimit,
    setWindUnit,
    setDistUnit,
    setNotifications,
    loadProfileSettings,
    saveProfileSettings,

  } = useSettingsStore();

  const { depIcao, arrIcao, lastBrief } = useBriefStore();

  useEffect(() => {
    if (user?.id) {
      loadProfileSettings(user.id);
    }
  }, [user?.id, loadProfileSettings]);

  const email = user?.email || 'Bilinmeyen E-posta';
  const displayName =
    user?.user_metadata?.display_name || email.split('@')[0] || 'Kaptan';

  const defaultDep = depIcao || 'Tanımlı değil';
  const defaultArr = arrIcao || 'Tanımlı değil';

  const lastRoute = lastBrief
    ? `${lastBrief.airports?.dep?.icao || '-'} → ${lastBrief.airports?.arr?.icao || '-'}`
    : 'Henüz analiz yok';

  const lastRisk =
    typeof lastBrief?.risk?.score === 'number'
      ? `%${Math.round(lastBrief.risk.score)}`
      : '-';

const handleSaveProfile = async () => {
  if (!user?.id) return;
  await saveProfileSettings(user.id, depIcao, arrIcao);
};

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.profileHeader}>
          <View style={styles.avatarCircle}>
            <Ionicons name="person" size={48} color={COLORS.textPrimary} />
          </View>

          <Text style={styles.nameText}>{displayName}</Text>
          <Text style={styles.emailText}>{email}</Text>

          <View style={styles.rolePill}>
            <Ionicons name="airplane" size={13} color={COLORS.primaryLight} />
            <Text style={styles.roleText}>Pilot / Kaptan</Text>
          </View>
        </View>

        {profileError ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={COLORS.danger} />
            <Text style={styles.errorText}>{profileError}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pilot Profili</Text>

          <View style={styles.card}>
            <InfoRow
              icon="shield-checkmark"
              title="Rol"
              value="Pilot"
              subtitle="Uçuş risk değerlendirme profili"
            />

            <View style={styles.separator} />

            <InfoRow
              icon="navigate-circle"
              title="Varsayılan Kalkış"
              value={defaultDep}
              subtitle="Son seçilen kalkış meydanı"
            />

            <View style={styles.separator} />

            <InfoRow
              icon="location"
              title="Varsayılan Varış"
              value={defaultArr}
              subtitle="Son seçilen varış meydanı"
            />

            <View style={styles.separator} />

            <InfoRow
              icon="swap-horizontal"
              title="Crosswind Limiti"
              value={`${crossLimitKt} kt`}
              subtitle="Pilot yan rüzgâr toleransı"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Son Brifing Özeti</Text>

          <View style={styles.statsGrid}>
            <StatBox label="Son Rota" value={lastRoute} icon="git-branch" />
            <StatBox label="Son Risk" value={lastRisk} icon="pulse" />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Uçuş Tercihleri</Text>

          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Ionicons
                  name="swap-horizontal"
                  size={22}
                  color={COLORS.primaryLight}
                  style={styles.icon}
                />
                <View>
                  <Text style={styles.rowTitle}>Yan Rüzgar Limiti</Text>
                  <Text style={styles.rowSubtitle}>Maksimum crosswind limiti</Text>
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

            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Ionicons
                  name="speedometer"
                  size={22}
                  color={COLORS.primaryLight}
                  style={styles.icon}
                />
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
                  <Text
                    style={[
                      styles.toggleBtnText,
                      windUnit === 'kt' && styles.toggleBtnTextActive,
                    ]}
                  >
                    KT
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.toggleBtn, windUnit === 'kmh' && styles.toggleBtnActive]}
                  onPress={() => setWindUnit('kmh')}
                >
                  <Text
                    style={[
                      styles.toggleBtnText,
                      windUnit === 'kmh' && styles.toggleBtnTextActive,
                    ]}
                  >
                    KM/H
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.separator} />

            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Ionicons
                  name="navigate"
                  size={22}
                  color={COLORS.primaryLight}
                  style={styles.icon}
                />
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
                  <Text
                    style={[
                      styles.toggleBtnText,
                      distUnit === 'nm' && styles.toggleBtnTextActive,
                    ]}
                  >
                    NM
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.toggleBtn, distUnit === 'km' && styles.toggleBtnActive]}
                  onPress={() => setDistUnit('km')}
                >
                  <Text
                    style={[
                      styles.toggleBtnText,
                      distUnit === 'km' && styles.toggleBtnTextActive,
                    ]}
                  >
                    KM
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.separator} />

            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Ionicons
                  name="notifications"
                  size={22}
                  color={COLORS.primaryLight}
                  style={styles.icon}
                />
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

          <TouchableOpacity
            style={[styles.saveButton, profileLoading && styles.saveButtonDisabled]}
            onPress={handleSaveProfile}
            disabled={profileLoading || !user?.id}
          >
            {profileLoading ? (
              <ActivityIndicator color={COLORS.textPrimary} />
            ) : (
              <>
                <Ionicons
                  name="save-outline"
                  size={18}
                  color={COLORS.textPrimary}
                  style={{ marginRight: SPACING.sm }}
                />
                <Text style={styles.saveButtonText}>Profili Kaydet</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Uygulama Bilgisi</Text>

          <View style={styles.appInfoCard}>
            <Ionicons name="airplane-outline" size={24} color={COLORS.primaryLight} />
            <View style={{ flex: 1 }}>
              <Text style={styles.appTitle}>Flight-Risk Mobile</Text>
              <Text style={styles.appSubtitle}>
                AI destekli uçuş risk değerlendirme ve brifing sistemi
              </Text>
            </View>
            <Text style={styles.versionText}>v1.0</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Ionicons
            name="log-out-outline"
            size={22}
            color={COLORS.riskRed}
            style={{ marginRight: SPACING.sm }}
          />
          <Text style={styles.signOutButtonText}>Güvenli Çıkış Yap</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({
  icon,
  title,
  subtitle,
  value,
}: {
  icon: any;
  title: string;
  subtitle: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={22} color={COLORS.primaryLight} style={styles.icon} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function StatBox({ label, value, icon }: { label: string; value: string; icon: any }) {
  return (
    <View style={styles.statBox}>
      <Ionicons name={icon} size={20} color={COLORS.primaryLight} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { padding: SPACING.md, paddingBottom: SPACING.xxl },

  profileHeader: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    borderColor: COLORS.border,
    borderWidth: 1,
    marginBottom: SPACING.xl,
  },
  avatarCircle: {
    width: 90,
    height: 90,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  nameText: {
    fontSize: FONT_SIZES.xl,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  emailText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    marginTop: SPACING.md,
  },
  roleText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.primaryLight,
    fontWeight: 'bold',
    marginLeft: 6,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  section: { marginBottom: SPACING.xl },
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
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.danger + '20',
    borderColor: COLORS.danger,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  errorText: {
    flex: 1,
    color: COLORS.danger,
    fontSize: FONT_SIZES.sm,
    marginLeft: SPACING.sm,
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  infoValue: {
    color: COLORS.textPrimary,
    fontWeight: 'bold',
    fontSize: FONT_SIZES.sm,
    maxWidth: 110,
    textAlign: 'right',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  statBox: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
  },
  statLabel: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.xs,
    marginTop: SPACING.sm,
    fontWeight: 'bold',
  },
  statValue: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.md,
    fontWeight: 'bold',
    marginTop: 4,
  },
  appInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
  },
  appTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.md,
    fontWeight: 'bold',
  },
  appSubtitle: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.xs,
    marginTop: 2,
  },
  versionText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.xs,
    fontWeight: 'bold',
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
  icon: { marginRight: SPACING.md },
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
  saveButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.md,
    minHeight: 50,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: COLORS.textPrimary,
    fontWeight: 'bold',
    fontSize: FONT_SIZES.md,
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