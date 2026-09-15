import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { grantTickets, resetCollection, resetPity } from '../services/dev';

/** How long a destructive button stays armed before it forgets it was tapped. */
const CONFIRM_WINDOW_MS = 4000;

const GRANT_AMOUNTS = [10, 50];

type Armed = 'collection' | 'pity' | null;

/**
 * Dev-only controls for testing the gacha loop at volume: grant tickets past the daily
 * cap, wipe the collection, reset the pity counter.
 *
 * Render this behind `__DEV__`. That gate is not the safety mechanism, though —
 * `src/services/dev` refuses every operation outside a dev build, because a UI gate is
 * one misplaced edit away from failing open and all of this is destructive.
 *
 * The two resets need two taps. They sit on a screen people open to read the pull rates,
 * so a stray tap must not cost a test session. Deliberately not a native `Alert`: this
 * stays testable with the existing `press` helper and adds no native dependency.
 */
export function DevPanel() {
  const [status, setStatus] = useState<{ text: string; failed: boolean } | null>(null);
  const [armed, setArmed] = useState<Armed>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A pending timer keeps the jest worker alive long after the tests pass — the same
  // trap `useCurrentDate` documents — so it has to be cleared on unmount.
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  const disarm = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setArmed(null);
  }, []);

  const arm = useCallback(
    (which: Exclude<Armed, null>) => {
      // Clears any existing timer first, so arming the other button cannot leave a stray
      // one running that would disarm this one early.
      if (timer.current) {
        clearTimeout(timer.current);
      }
      setArmed(which);
      timer.current = setTimeout(() => {
        timer.current = null;
        setArmed(null);
      }, CONFIRM_WINDOW_MS);
    },
    [setArmed],
  );

  // Takes both wordings rather than decorating the success one. Reusing it produced
  // "Granted 10 tickets. — failed", which claims the grant happened and then denies it.
  const run = useCallback(
    async (done: string, failed: string, action: () => Promise<void>) => {
      try {
        await action();
        setStatus({ text: done, failed: false });
      } catch (error) {
        console.error('Dev action failed', error);
        setStatus({ text: failed, failed: true });
      }
    },
    [setStatus],
  );

  const confirmable = useCallback(
    (which: Exclude<Armed, null>, done: string, failed: string, action: () => Promise<void>) => {
      return async () => {
        if (armed !== which) {
          arm(which);
          return;
        }
        disarm();
        await run(done, failed, action);
      };
    },
    [armed, arm, disarm, run],
  );

  return (
    <View style={styles.panel}>
      <Text style={styles.heading}>Developer</Text>
      <Text style={styles.note}>
        Dev builds only. Grants ignore the daily cap and are dated outside it, so they cannot stop
        habits paying out.
      </Text>

      <View style={styles.row}>
        {GRANT_AMOUNTS.map((amount) => (
          <Pressable
            key={amount}
            style={styles.button}
            accessibilityLabel={`Grant ${amount} tickets`}
            onPress={() => {
              disarm();
              void run(
                `Granted ${amount} tickets.`,
                `Could not grant tickets — the write failed, see the console.`,
                () => grantTickets(amount),
              );
            }}
          >
            <Text style={styles.buttonText}>+{amount} 🎟</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={[styles.button, styles.destructive, armed === 'collection' && styles.armed]}
        accessibilityLabel="Reset collection"
        onPress={confirmable(
          'collection',
          'Collection reset.',
          'Could not reset the collection — the write failed, see the console.',
          resetCollection,
        )}
      >
        <Text style={styles.buttonText}>
          {armed === 'collection' ? 'Tap again to confirm' : 'Reset collection'}
        </Text>
      </Pressable>

      <Pressable
        style={[styles.button, styles.destructive, armed === 'pity' && styles.armed]}
        accessibilityLabel="Reset pity counter"
        onPress={confirmable(
          'pity',
          'Pity counter reset.',
          'Could not reset the pity counter — the write failed, see the console.',
          resetPity,
        )}
      >
        <Text style={styles.buttonText}>
          {armed === 'pity' ? 'Tap again to confirm' : 'Reset pity counter'}
        </Text>
      </Pressable>

      {status ? (
        <Text style={[styles.status, status.failed && styles.statusFailed]}>{status.text}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: 28,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffd43b',
    backgroundColor: '#fff9db',
  },
  heading: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  note: { fontSize: 13, lineHeight: 19, color: '#5c5f66', marginBottom: 12 },
  row: { flexDirection: 'row', marginBottom: 8 },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: '#4c6ef5',
    marginRight: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  destructive: { backgroundColor: '#e03131' },
  armed: { backgroundColor: '#f08c00' },
  buttonText: { color: '#fff', fontWeight: '700' },
  status: { marginTop: 4, color: '#2b8a3e', fontWeight: '600' },
  statusFailed: { color: '#c92a2a' },
});
