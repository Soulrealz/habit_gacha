import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { RARITY_COLOURS } from '../data/characters';
import { performSummon } from '../services/gacha';
import { getBalance } from '../services/tickets';
import type { Character, Rarity } from '../types';

type LastPull = {
  character: Character;
  rarity: Rarity;
  isNew: boolean;
  pityTriggered: boolean;
};

export function SummonScreen() {
  const [balance, setBalance] = useState<number | null>(null);
  const [pulling, setPulling] = useState(false);
  const [lastPull, setLastPull] = useState<LastPull | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // Two balance reads can be in flight at once; the slower one must not paint its
  // older number over the newer one.
  const generation = useRef(0);
  // The re-entry guard is a ref, not the `pulling` state. State does not apply until
  // the next render, so two taps in one frame would both enter handleSummon — the
  // second would return 'busy' and its own finally would re-enable the button while
  // the first pull was still awaiting SQLite.
  const pullingRef = useRef(false);

  const refreshBalance = useCallback(async () => {
    const mine = ++generation.current;
    const next = await getBalance();
    if (mine === generation.current) {
      setLoadFailed(false);
      setBalance(next);
    }
  }, []);

  // useFocusEffect, not useEffect: tickets are earned on the Today tab and switching
  // tabs does not remount, so useEffect would leave the balance reading 0 and the
  // Summon button stuck disabled. The callback must not be async — useFocusEffect
  // treats a returned promise as a cleanup function.
  useFocusEffect(
    useCallback(() => {
      refreshBalance().catch((error) => {
        // Deliberately not setBalance(0): a failed read is not an empty wallet, and
        // showing it as one would be a lie the user cannot tell apart.
        console.error('Reading the ticket balance failed', error);
        setLoadFailed(true);
      });
    }, [refreshBalance]),
  );

  const handleSummon = useCallback(async () => {
    if (pullingRef.current) {
      return;
    }
    pullingRef.current = true;
    setPulling(true);
    setMessage(null);

    try {
      const outcome = await performSummon();

      if (outcome.status === 'no_tickets') {
        setMessage('No tickets yet — go complete a habit.');
      } else if (outcome.status === 'busy') {
        setMessage('Already summoning.');
      } else if (outcome.status === 'failed') {
        setMessage(
          outcome.ticketSpent
            ? 'Something went wrong and your ticket was spent. Sorry — please report this.'
            : 'Something went wrong. Your ticket was not spent; try again.',
        );
      } else {
        // Cleared so a leftover message cannot end up captioning a successful pull.
        setMessage(null);
        setLastPull({
          character: outcome.character,
          rarity: outcome.rarity,
          isNew: outcome.isNew,
          pityTriggered: outcome.pityTriggered,
        });
      }
    } finally {
      // Always re-read from the ledger rather than adjusting a local count, so the
      // number on screen cannot drift from the truth even when a pull fails midway.
      // Re-enabling happens after the read, or the button would briefly be live
      // against a pre-spend balance.
      await refreshBalance().catch((error) => {
        console.error('Reading the ticket balance failed', error);
        setLoadFailed(true);
      });
      pullingRef.current = false;
      setPulling(false);
    }
  }, [refreshBalance]);

  if (balance === null) {
    return (
      <View style={styles.container}>
        {loadFailed ? (
          <Text style={styles.message}>
            Could not read your ticket balance. Switch tabs and back to retry.
          </Text>
        ) : (
          <ActivityIndicator size="large" />
        )}
      </View>
    );
  }

  const disabled = pulling || balance <= 0;

  return (
    <View style={styles.container}>
      <Text style={styles.balance}>🎟 {balance}</Text>

      {lastPull ? (
        <View style={styles.result}>
          <Image source={lastPull.character.sprite} style={styles.sprite} resizeMode="contain" />
          <Text style={[styles.name, { color: RARITY_COLOURS[lastPull.rarity] }]}>
            {lastPull.character.name}
          </Text>
          <Text style={[styles.rarity, { color: RARITY_COLOURS[lastPull.rarity] }]}>
            {'★'.repeat(lastPull.rarity)}
          </Text>
          {lastPull.isNew ? <Text style={styles.badge}>NEW</Text> : null}
          {lastPull.pityTriggered ? <Text style={styles.badge}>GUARANTEED</Text> : null}
        </View>
      ) : (
        <Text style={styles.placeholder}>Spend a ticket to summon.</Text>
      )}

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <Pressable
        style={[styles.button, disabled && styles.buttonDisabled]}
        onPress={handleSummon}
        disabled={disabled}
        accessibilityLabel="Summon one character"
      >
        <Text style={styles.buttonText}>{pulling ? 'Summoning…' : 'Summon (1 🎟)'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  balance: { fontSize: 20, fontWeight: '600', marginBottom: 24 },
  result: { alignItems: 'center', marginBottom: 24 },
  sprite: { width: 160, height: 160, marginBottom: 12 },
  name: { fontSize: 24, fontWeight: '700' },
  rarity: { fontSize: 20, marginTop: 4 },
  badge: { marginTop: 8, fontWeight: '700', color: '#2b8a3e' },
  placeholder: { color: '#868e96', marginBottom: 24 },
  message: { color: '#c92a2a', marginBottom: 16, textAlign: 'center' },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
    backgroundColor: '#4c6ef5',
  },
  buttonDisabled: { backgroundColor: '#ced4da' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
