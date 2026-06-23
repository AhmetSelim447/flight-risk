import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function RouteMapWebFallback() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.banner}>
        <Ionicons
          name="map"
          size={20}
          color={COLORS.primaryLight}
          style={{ marginRight: SPACING.sm }}
        />
        <Text style={styles.bannerText}>
          Harita özelliği web önizlemede devre dışıdır. Android/iOS üzerinde react-native-maps ile çalışacaktır.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    padding: SPACING.md,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
  },
  bannerText: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.sm,
  },
});