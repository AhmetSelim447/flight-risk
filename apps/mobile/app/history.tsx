import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getBriefHistory, deleteBriefHistory, BriefHistoryItem } from '../lib/api';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';

export default function HistoryScreen() {
  const router = useRouter();
  const [items, setItems] = useState<BriefHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const data = await getBriefHistory();
    setItems(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(id: string) {
    await deleteBriefHistory(id);
    await load();
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Geçmiş Brifingler</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {items.length === 0 ? (
            <Text style={styles.empty}>Henüz geçmiş brifing yok.</Text>
          ) : (
            items.map((item) => (
              <View key={item.id} style={styles.card}>
                <View>
                  <Text style={styles.route}>{item.dep} → {item.arr}</Text>
                  <Text style={styles.meta}>
                    Risk: {item.risk_score ?? '-'} / {item.risk_class ?? '-'}
                  </Text>
                  <Text style={styles.meta}>
                    {new Date(item.created_at).toLocaleString()}
                  </Text>
                </View>

                <TouchableOpacity onPress={() => remove(item.id)}>
                  <Ionicons name="trash-outline" size={22} color={COLORS.riskRed} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.lg,
    fontWeight: 'bold',
    marginLeft: SPACING.md,
  },
  content: { padding: SPACING.md },
  empty: { color: COLORS.textSecondary, textAlign: 'center', marginTop: 40 },
  card: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  route: { color: COLORS.textPrimary, fontWeight: 'bold', fontSize: FONT_SIZES.lg },
  meta: { color: COLORS.textSecondary, marginTop: 4 },
});