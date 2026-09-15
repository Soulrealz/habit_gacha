import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CHARACTERS, RARITY_COLOURS } from '../data/characters';
import { getCollection } from '../services/collection';
import { countOwned, toOwnedCopies, type OwnedCopies } from '../services/collection/owned';
import { MAX_RANK, rankFor } from '../services/collection/rank';

type CollectionScreenProps = {
  /** Optional so the screen still renders standalone in tests and before the stack exists. */
  onOpen?: (characterId: string) => void;
};

export function CollectionScreen({ onOpen }: CollectionScreenProps) {
  const [owned, setOwned] = useState<OwnedCopies | null>(null);
  const [failed, setFailed] = useState(false);

  // useFocusEffect, not useEffect: the collection changes on the Summon tab, and
  // switching tabs does not remount, so useEffect would show a stale grid.
  useFocusEffect(
    useCallback(() => {
      let active = true;

      getCollection()
        .then((rows) => {
          if (!active) {
            return;
          }
          setFailed(false);
          setOwned(toOwnedCopies(rows));
        })
        .catch((error) => {
          console.error('Loading the collection failed', error);
          if (!active) {
            return;
          }
          // Show the locked roster rather than an endless spinner — it is static, so
          // the screen stays readable, and the banner says the owned rows are missing.
          setFailed(true);
          setOwned({});
        });

      return () => {
        active = false;
      };
    }, []),
  );

  if (!owned) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const ownedCount = countOwned(CHARACTERS, owned);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Collection {ownedCount} / {CHARACTERS.length}
      </Text>

      {failed ? (
        <Text style={styles.error}>
          Could not load your collection — switch tabs and back to retry.
        </Text>
      ) : null}

      <ScrollView contentContainerStyle={styles.grid}>
        {CHARACTERS.map((character) => {
          const copies = owned[character.id] ?? 0;
          const isOwned = copies > 0;
          const rank = rankFor(character.rarity, copies);

          return (
            <Pressable
              key={character.id}
              style={styles.cell}
              // Locked cells are not pressable: there is nothing to show, and an
              // accessibility label on one would announce a character the player has
              // not met.
              disabled={!isOwned || !onOpen}
              accessibilityLabel={isOwned ? `Open ${character.name}` : undefined}
              onPress={isOwned && onOpen ? () => onOpen(character.id) : undefined}
            >
              {/* Unowned characters render as silhouettes rather than being hidden:
                  the visible gap is most of what drives a collection loop. */}
              <Image
                source={character.sprite}
                style={[styles.sprite, !isOwned && styles.spriteLocked]}
                resizeMode="contain"
              />
              <Text
                style={[
                  styles.name,
                  { color: isOwned ? RARITY_COLOURS[character.rarity] : '#ced4da' },
                ]}
              >
                {isOwned ? character.name : '???'}
              </Text>
              {copies > 1 ? <Text style={styles.copies}>×{copies}</Text> : null}
              {isOwned ? (
                <View
                  testID={`pips-${character.id}`}
                  accessibilityLabel={`Rank ${rank} of ${MAX_RANK}`}
                  style={styles.pips}
                >
                  {Array.from({ length: MAX_RANK }, (_, index) => (
                    <View
                      key={index}
                      style={[
                        styles.pip,
                        index < rank
                          ? { backgroundColor: RARITY_COLOURS[character.rarity] }
                          : styles.pipEmpty,
                      ]}
                    />
                  ))}
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700', padding: 16 },
  error: { color: '#c92a2a', paddingHorizontal: 16, paddingBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8 },
  cell: { width: '33.33%', alignItems: 'center', paddingVertical: 12 },
  sprite: { width: 80, height: 80 },
  spriteLocked: { opacity: 0.15 },
  name: { marginTop: 6, fontWeight: '600' },
  copies: { color: '#868e96', fontSize: 12 },
  pips: { flexDirection: 'row', marginTop: 4 },
  pip: { width: 6, height: 6, borderRadius: 3, marginHorizontal: 1.5 },
  pipEmpty: { backgroundColor: '#dee2e6' },
});
