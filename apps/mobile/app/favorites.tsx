import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getFavoriteRoutes, deleteFavoriteRoute, FavoriteRouteItem } from '../lib/api';
import { useBriefStore } from '../stores/briefStore';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';

export default function FavoritesScreen() {
  const router = useRouter();
  const { setDeparture, setArrival } = useBriefStore();
  const [items, setItems] = useState<FavoriteRouteItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const data = await getFavoriteRoutes();
    setItems(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openRoute(dep: string, arr: string) {
    setDeparture(dep, dep);
    setArrival(arr, arr);
    router.push('/(tabs)/brief');
  }

  async function remove(id: string) {
    await deleteFavoriteRoute(id);
    await load();
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Favori Rotalar</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {items.length === 0 ? (
            <Text style={styles.empty}>Henüz favori rota yok.</Text>
          ) : (
            items.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.card}
                onPress={() => openRoute(item.dep, item.arr)}
              >
                <View>
                  <Text style={styles.route}>{item.dep} → {item.arr}</Text>
                  <Text style={styles.meta}>{item.label || 'Favori rota'}</Text>
                </View>

                <TouchableOpacity onPress={() => remove(item.id)}>
                  <Ionicons name="trash-outline" size={22} color={COLORS.riskRed} />
                </TouchableOpacity>
              </TouchableOpacity>
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