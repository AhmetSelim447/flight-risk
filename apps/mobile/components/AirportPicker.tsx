import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  FlatList,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useBriefStore } from '../stores/briefStore';
import { searchAirports, AirportRow } from '../lib/api';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function AirportPicker() {
  const {
    depIcao,
    arrIcao,
    depName,
    arrName,
    setDeparture,
    setArrival,
    swapAirports,
  } = useBriefStore();

  const [activeInput, setActiveInput] = useState<'dep' | 'arr' | null>(null);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AirportRow[]>([]);
  const [loading, setLoading] = useState(false);

useEffect(() => {
  const trimmedQuery = query.trim();

  if (!trimmedQuery || trimmedQuery.length < 2) {
    setSuggestions([]);
    setLoading(false);
    return;
  }

  let cancelled = false;

  const delayDebounce = setTimeout(async () => {
    setLoading(true);

    try {
      const res = await searchAirports(trimmedQuery);

      if (!cancelled) {
        setSuggestions(res.matches);
      }
    } catch (error) {
      console.error('Airport search failed:', error);

      if (!cancelled) {
        setSuggestions([]);
      }
    } finally {
      if (!cancelled) {
        setLoading(false);
      }
    }
  }, 300);

  return () => {
    cancelled = true;
    clearTimeout(delayDebounce);
  };
}, [query]);

  const selectAirport = (item: AirportRow) => {
    if (activeInput === 'dep') {
      setDeparture(item.icao, item.name || item.city || '');
    } else if (activeInput === 'arr') {
      setArrival(item.icao, item.name || item.city || '');
    }
    setQuery('');
    setSuggestions([]);
    setActiveInput(null);
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputsWrapper}>
        <View style={styles.inputsColumn}>
          {/* Departure Input */}
          <View style={styles.inputField}>
            <Text style={styles.label}>KALKIŞ MEYDANI (DEP)</Text>
            <TouchableOpacity
              style={[styles.inputBox, activeInput === 'dep' && styles.inputActive]}
              onPress={() => {
                setActiveInput('dep');
                setQuery(depIcao);
              }}
            >
              <View style={styles.airportBrief}>
                <Text style={depIcao ? styles.icaoText : styles.placeholder}>
                  {depIcao || 'DEP ICAO Seçin'}
                </Text>
                {depName ? <Text style={styles.nameText} numberOfLines={1}>{depName}</Text> : null}
              </View>
            </TouchableOpacity>
          </View>

          {/* Arrival Input */}
          <View style={[styles.inputField, { marginBottom: 0 }]}>
            <Text style={styles.label}>VARIŞ MEYDANI (ARR)</Text>
            <TouchableOpacity
              style={[styles.inputBox, activeInput === 'arr' && styles.inputActive]}
              onPress={() => {
                setActiveInput('arr');
                setQuery(arrIcao);
              }}
            >
              <View style={styles.airportBrief}>
                <Text style={arrIcao ? styles.icaoText : styles.placeholder}>
                  {arrIcao || 'ARR ICAO Seçin'}
                </Text>
                {arrName ? <Text style={styles.nameText} numberOfLines={1}>{arrName}</Text> : null}
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Swap Button */}
        <TouchableOpacity style={styles.swapButton} onPress={swapAirports}>
          <Ionicons name="swap-vertical" size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Overlay Suggestion List */}
      {activeInput && (
        <View style={styles.suggestionsContainer}>
          <View style={styles.searchHeader}>
            <Ionicons name="search" size={18} color={COLORS.textSecondary} style={{ marginRight: SPACING.sm }} />
            <TextInput
              style={styles.searchInput}
              placeholder="ICAO, Havalimanı Adı veya Şehir yazın..."
              placeholderTextColor={COLORS.textMuted}
              value={query}
              onChangeText={setQuery}
              autoFocus
              autoCapitalize="characters"
            />
            <TouchableOpacity onPress={() => setActiveInput(null)}>
              <Text style={styles.closeBtn}>Kapat</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator style={{ padding: SPACING.lg }} color={COLORS.primary} />
          ) : (
            <ScrollView 
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled={true}
            >
              {suggestions.length === 0 ? (
                query.length >= 2 ? (
                  <Text style={styles.emptyText}>Havalimanı bulunamadı.</Text>
                ) : (
                  <Text style={styles.emptyText}>Aramak için en az 2 karakter girin.</Text>
                )
              ) : (
                suggestions.map((item) => (
                  <TouchableOpacity 
                    key={item.icao} 
                    style={styles.suggestionRow} 
                    onPress={() => selectAirport(item)}
                  >
                    <View style={styles.suggestionLeft}>
                      <Text style={styles.sIcao}>{item.icao}</Text>
                      {item.iata && <Text style={styles.sIata}>({item.iata})</Text>}
                    </View>
                    <View style={styles.suggestionRight}>
                      <Text style={styles.sName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.sCity} numberOfLines={1}>{item.city}</Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 10,
    marginBottom: SPACING.md,
  },
  inputsWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
  },
  inputsColumn: {
    flex: 1,
    marginRight: SPACING.md,
  },
  inputField: {
    marginBottom: SPACING.sm,
  },
  label: {
    fontSize: FONT_SIZES.xs,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.md,
    height: 52,
  },
  inputActive: {
    borderColor: COLORS.primary,
  },
  placeholder: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.md,
  },
  icaoText: {
    color: COLORS.textPrimary,
    fontWeight: 'bold',
    fontSize: FONT_SIZES.md,
  },
  nameText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    marginTop: 2,
  },
  airportBrief: {
    flex: 1,
    justifyContent: 'center',
  },
  swapButton: {
    backgroundColor: COLORS.surfaceLight,
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.full,
    justifyContent: 'center',
    alignItems: 'center',
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  suggestionsContainer: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.xs,
    maxHeight: 250,
    overflow: 'hidden',
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    height: 50,
  },
  searchInput: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.md,
    paddingVertical: SPACING.sm,
  },
  closeBtn: {
    color: COLORS.primaryLight,
    fontWeight: 'bold',
    marginLeft: SPACING.sm,
    fontSize: FONT_SIZES.sm,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  suggestionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 90,
  },
  sIcao: {
    color: COLORS.textPrimary,
    fontWeight: 'bold',
    fontSize: FONT_SIZES.md,
  },
  sIata: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.sm,
    marginLeft: 4,
  },
  suggestionRight: {
    flex: 1,
    marginLeft: SPACING.sm,
  },
  sName: {
    color: COLORS.textPrimary,
    fontWeight: 'bold',
    fontSize: FONT_SIZES.sm,
  },
  sCity: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.xs,
  },
  emptyText: {
    color: COLORS.textMuted,
    padding: SPACING.lg,
    textAlign: 'center',
    fontSize: FONT_SIZES.sm,
  },
});
