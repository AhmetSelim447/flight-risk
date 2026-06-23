import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { useRouter } from 'expo-router';
import { useBriefStore } from '../stores/briefStore';

interface AlternateListProps {
  alternates: string[];
  depIcao: string;
}

export default function AlternateList({ alternates, depIcao }: AlternateListProps) {
  const router = useRouter();
  const { setDeparture, setArrival } = useBriefStore();

  const handleAlternateSelect = (icao: string) => {
    // Quickly set a briefing from depIcao to the alternate icao
    setDeparture(depIcao, '');
    setArrival(icao, '');
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="git-branch" size={20} color={COLORS.primaryLight} style={{ marginRight: SPACING.sm }} />
        <Text style={styles.title}>Önerilen Yedek Meydanlar (ALTN)</Text>
      </View>

      {alternates && alternates.length > 0 ? (
        <View style={styles.list}>
          {alternates.map((icao, index) => (
            <TouchableOpacity 
              key={index} 
              style={styles.altRow}
              onPress={() => handleAlternateSelect(icao)}
            >
              <View style={styles.altLeft}>
                <Ionicons name="airplane-outline" size={18} color={COLORS.primary} style={{ marginRight: SPACING.sm }} />
                <Text style={styles.altIcao}>{icao}</Text>
              </View>
              <View style={styles.altRight}>
                <Text style={styles.actionText}>Analiz Et</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>Yedek meydan önerisi bulunmamaktadır.</Text>
      )}
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
  list: {
    marginTop: SPACING.xs,
  },
  altRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border + '30',
  },
  altLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  altIcao: {
    fontSize: FONT_SIZES.md,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  altRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primaryLight,
    fontWeight: 'bold',
    marginRight: 4,
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    fontStyle: 'italic',
  },
});
