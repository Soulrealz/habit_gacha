import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { getGachaConfig } from '../config/gacha';
import { RARITY_COLOURS } from '../data/characters';
import type { Rarity } from '../types';

/**
 * Formats a 0–1 rate as a percentage string.
 *
 * Rounded through `toFixed` before being turned back into a number, because the rates
 * are binary floats: `0.15 * 100` is `15.000000000000002`, and the derived 3★ rate is
 * worse. Trailing zeroes are dropped by the `Number` round-trip, so 0.15 reads as "15%"
 * rather than "15.00%".
 */
export function formatPercent(rate: number): string {
  return `${Number((rate * 100).toFixed(2))}%`;
}

/**
 * Explains the economy: what tickets are worth, what the pull rates are, and how the
 * pity guarantee works.
 *
 * Deliberately stateless — it reads nothing from the database, so it cannot spin, fail,
 * or go stale. Every number comes from `getGachaConfig()` at render time and NOT ONE of
 * them may be retyped into the copy: the moment a rate is tuned this screen would
 * otherwise start lying, and it is exactly the sort of drift nobody notices for months.
 * `HowItWorksScreen.test.tsx` renders against a config the app has never shipped to
 * enforce that.
 *
 * Reading `getGachaConfig()` rather than `GACHA_CONFIG` also means a dev build shows the
 * rates it is actually rolling on. Those are wildly more generous than production, so
 * the banner says so — see `docs/next-steps.md` for the two ways that misleads you.
 */
export function HowItWorksScreen() {
  const config = getGachaConfig();

  // No config field holds this: 3★ is whatever is left over. Derived rather than
  // declared so it cannot disagree with the other two.
  const threeStarRate = 1 - config.fiveStarRate - config.fourStarRate;

  const rates: { rarity: Rarity; rate: number }[] = [
    { rarity: 5, rate: config.fiveStarRate },
    { rarity: 4, rate: config.fourStarRate },
    { rarity: 3, rate: threeStarRate },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {__DEV__ ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Development rates — these are not the real economy.</Text>
        </View>
      ) : null}

      <Text style={styles.heading}>Earning tickets</Text>
      <Text style={styles.body}>
        Complete a habit and you earn a summoning ticket. You can earn at most{' '}
        {config.dailyTicketCap} tickets a day, however much you log after that.
      </Text>
      <Text style={styles.body}>
        Lowering a count does not take a ticket back. Progress is editable; earnings are final.
      </Text>

      <Text style={styles.heading}>Summoning</Text>
      <Text style={styles.body}>
        Each summon costs one ticket and always gives you a character. Pulling one you already own
        adds a copy.
      </Text>

      <Text style={styles.heading}>Pull rates</Text>
      {rates.map(({ rarity, rate }) => (
        <View key={rarity} style={styles.rateRow}>
          <Text style={[styles.rateLabel, { color: RARITY_COLOURS[rarity] }]}>
            {'★'.repeat(rarity)}
          </Text>
          <Text style={styles.rateValue}>{formatPercent(rate)}</Text>
        </View>
      ))}

      <Text style={styles.heading}>The guarantee</Text>
      <Text style={styles.body}>
        Go {config.pityThreshold - 1} summons in a row without a 5★ and the next one is guaranteed
        to be 5★ — so a 5★ never takes more than {config.pityThreshold} summons.
      </Text>
      <Text style={styles.body}>
        The count resets every time you pull a 5★, whether you earned it on the rates or on the
        guarantee.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, paddingBottom: 48 },
  banner: {
    backgroundColor: '#fff3bf',
    borderRadius: 8,
    padding: 12,
    marginBottom: 24,
  },
  bannerText: { color: '#845ef7', fontWeight: '700' },
  heading: { fontSize: 18, fontWeight: '700', marginTop: 20, marginBottom: 8 },
  body: { fontSize: 15, lineHeight: 22, color: '#343a40', marginBottom: 8 },
  rateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  rateLabel: { fontSize: 18 },
  rateValue: { fontSize: 16, fontWeight: '600', color: '#343a40' },
});
