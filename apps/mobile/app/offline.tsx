import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { listOfflineBriefs } from '../lib/offline';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';

export default function OfflineScreen() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const data = await listOfflineBriefs();
    setItems(data as any[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Offline Brifingler</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {items.length === 0 ? (
            <Text style={styles.empty}>Offline kayıt yok.</Text>
          ) : (
            items.map((item, index) => (
              <View key={`${item.dep}-${item.arr}-${index}`} style={styles.card}>
                <Text style={styles.route}>{item.dep} → {item.arr}</Text>
                <Text style={styles.meta}>
                  Kaydedilme: {new Date(item.savedAt).toLocaleString()}
                </Text>
                <Text style={styles.meta}>
                  Risk: {item.brief?.risk?.score ?? '-'} / {item.brief?.risk?.class ?? '-'}
                </Text>
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
  },
  route: { color: COLORS.textPrimary, fontWeight: 'bold', fontSize: FONT_SIZES.lg },
  meta: { color: COLORS.textSecondary, marginTop: 4 },
});