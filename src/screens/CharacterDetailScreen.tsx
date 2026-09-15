import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RankBorder } from '../components/RankBorder';
import { CHARACTERS, RARITY_COLOURS } from '../data/characters';
import { getCollection } from '../services/collection';
import {
  ART_RANK,
  BORDER_RANK,
  copiesToNextRank,
  MAX_RANK,
  rankFor,
  unlockedLore,
} from '../services/collection/rank';
import { getShowRankBorders } from '../services/settings';

// A minimal structural prop rather than NativeStackScreenProps: it is assignable from
// what the navigator passes, keeps navigation types out of the screen, and lets a test
// render it with a plain object.
type CharacterDetailProps = {
  route: { params: { characterId: string } };
};

export function CharacterDetailScreen({ route }: CharacterDetailProps) {
  const { characterId } = route.params;
  const character = CHARACTERS.find((entry) => entry.id === characterId);
  const [copies, setCopies] = useState<number | null>(null);
  // Defaults to true so a border never flickers off while the preference loads.
  const [showBorders, setShowBorders] = useState(true);

  // useFocusEffect, not useEffect: a pull on the Summon tab can raise the rank while
  // this screen is mounted underneath, and switching back must not show a stale rank.
  useFocusEffect(
    useCallback(() => {
      let active = true;

      getCollection()
        .then((rows) => {
          if (!active) {
            return;
          }
          setCopies(rows.find((row) => row.characterId === characterId)?.copies ?? 0);
        })
        .catch((error) => {
          console.error('Loading the collection failed', error);
          if (active) {
            // Not 0: a failed read is not an empty shelf. Rank renders from 0 copies
            // anyway, and the banner below says the number is missing.
            setCopies(-1);
          }
        });

      getShowRankBorders()
        .then((value) => {
          if (active) {
            setShowBorders(value);
          }
        })
        .catch((error) => {
          // A missing preference is not worth failing the screen over — the default
          // stands and the art still renders.
          console.error('Reading the rank border setting failed', error);
        });

      return () => {
        active = false;
      };
    }, [characterId]),
  );

  if (!character) {
    return (
      <View style={styles.centred}>
        <Text style={styles.error}>That character is not in the roster.</Text>
      </View>
    );
  }

  if (copies === null) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const failed = copies < 0;
  const held = failed ? 0 : copies;
  const rank = rankFor(character.rarity, held);
  const toNext = copiesToNextRank(character.rarity, held);
  const lore = unlockedLore(character, held);
  const colour = RARITY_COLOURS[character.rarity];
  const bordered = showBorders && rank >= BORDER_RANK;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {failed ? <Text style={styles.error}>Could not read your copies — showing none.</Text> : null}

      {bordered ? (
        <RankBorder colour={colour}>
          <Image
            testID="detail-art"
            source={rank >= ART_RANK ? character.altSprite : character.sprite}
            style={styles.art}
            resizeMode="contain"
          />
        </RankBorder>
      ) : (
        <Image
          testID="detail-art"
          source={rank >= ART_RANK ? character.altSprite : character.sprite}
          style={styles.art}
          resizeMode="contain"
        />
      )}

      <Text style={[styles.name, { color: colour }]}>{character.name}</Text>
      <Text style={[styles.rarity, { color: colour }]}>{'★'.repeat(character.rarity)}</Text>

      <View accessibilityLabel={`Rank ${rank} of ${MAX_RANK}`} style={styles.pips}>
        {Array.from({ length: MAX_RANK }, (_, index) => (
          <View
            key={index}
            style={[styles.pip, index < rank ? { backgroundColor: colour } : styles.pipEmpty]}
          />
        ))}
      </View>

      <Text style={styles.progress}>
        Rank {rank} · {held} {held === 1 ? 'copy' : 'copies'}
      </Text>
      <Text style={styles.progress}>
        {toNext === null ? 'Fully ranked' : `${toNext} more to Rank ${rank + 1}`}
      </Text>

      {character.lore.map((entry, index) => (
        <View key={index} style={styles.loreRow}>
          <Text style={styles.loreRank}>R{index + 1}</Text>
          <Text style={index < lore.length ? styles.lore : styles.loreLocked}>
            {index < lore.length ? entry : 'Locked'}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 24, paddingBottom: 48, alignItems: 'center' },
  error: { color: '#c92a2a', marginBottom: 12, textAlign: 'center' },
  art: { width: 200, height: 200, marginBottom: 12 },
  name: { fontSize: 26, fontWeight: '700' },
  rarity: { fontSize: 18, marginTop: 2 },
  pips: { flexDirection: 'row', marginTop: 12 },
  pip: { width: 14, height: 14, borderRadius: 7, marginHorizontal: 3 },
  pipEmpty: { backgroundColor: '#dee2e6' },
  progress: { marginTop: 8, color: '#495057', fontWeight: '600' },
  loreRow: { flexDirection: 'row', alignSelf: 'stretch', marginTop: 16 },
  loreRank: { width: 32, fontWeight: '700', color: '#adb5bd' },
  lore: { flex: 1, fontSize: 15, lineHeight: 22, color: '#343a40' },
  loreLocked: { flex: 1, fontSize: 15, lineHeight: 22, color: '#ced4da', fontStyle: 'italic' },
});
