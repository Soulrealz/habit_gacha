import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { HabitRow } from '../components/HabitRow';
import { GYM_HABITS } from '../data/habits';
import { useCurrentDate } from '../lib/useCurrentDate';
import { adjustHabitCount, getTodayLogs } from '../services/habits';
import { getBalance } from '../services/tickets';
import type { Habit, HabitLog } from '../types';

type Notice = { text: string; tone: 'info' | 'error' };

const ROLLOVER_NOTICE = 'It’s a new day — habits reset and your ticket cap is refreshed.';

export function TodayScreen() {
  const [logs, setLogs] = useState<Record<string, HabitLog> | null>(null);
  const [balance, setBalance] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  // Monotonic generation counter: two refreshes can be in flight at once and the
  // slower one must not paint its older snapshot over the newer one.
  const generation = useRef(0);
  const currentDate = useCurrentDate();
  const lastSeenDate = useRef(currentDate);
  // Set while a rollover notice is showing, so the focus effect does not wipe it when
  // the user comes back from another tab.
  const rolloverPending = useRef(false);

  // The balance is re-read from the ledger after every adjustment rather than
  // tracked locally, so the number on screen can never drift from the truth.
  const refresh = useCallback(async () => {
    const mine = ++generation.current;
    const [nextLogs, nextBalance] = await Promise.all([getTodayLogs(), getBalance()]);
    if (mine !== generation.current) {
      return;
    }
    setLogs(nextLogs);
    setBalance(nextBalance);
  }, []);

  // useFocusEffect, not useEffect: tickets are spent on the Summon tab and switching
  // tabs does not remount, so useEffect would leave a stale balance. The callback
  // must not be async — useFocusEffect treats a returned promise as a cleanup
  // function and logs an error.
  useFocusEffect(
    useCallback(() => {
      if (!rolloverPending.current) {
        setNotice(null);
      }
      refresh().catch(() => {
        setNotice({ text: 'Could not load today’s habits.', tone: 'error' });
      });
    }, [refresh]),
  );

  // Re-reads before the user touches anything. Without this the stale counts survive
  // until the next tap, and the reset then looks like the tap destroyed their work.
  useEffect(() => {
    if (lastSeenDate.current === currentDate) {
      return;
    }
    lastSeenDate.current = currentDate;
    rolloverPending.current = true;
    setNotice({ text: ROLLOVER_NOTICE, tone: 'info' });
    refresh().catch(() => {
      setNotice({ text: 'Could not load today’s habits.', tone: 'error' });
    });
  }, [currentDate, refresh]);

  const handleAdd = useCallback(
    async (habit: Habit, amount: number) => {
      // Guards the tap, not the data — adjustHabitCount serialises writes itself.
      // This stops a queue of taps building up behind a slow write and tells the
      // user why the buttons went quiet.
      if (busy) {
        return;
      }
      setBusy(true);
      // The user has acted on the new day, so a rollover notice has served its purpose.
      rolloverPending.current = false;
      setNotice(null);

      try {
        const result = await adjustHabitCount(habit, amount);

        if (result.capReached && result.ticketsAwarded === 0) {
          setNotice({
            text: `${habit.name} complete — but you have hit today’s ticket cap.`,
            tone: 'info',
          });
        } else if (result.ticketsAwarded > 0) {
          const plural = result.ticketsAwarded === 1 ? '' : 's';
          const clipped = result.capReached ? ' (daily cap reached)' : '';
          setNotice({
            text: `${habit.name} complete! +${result.ticketsAwarded} ticket${plural}${clipped}`,
            tone: 'info',
          });
        }

        await refresh();
      } catch (error) {
        // The write either failed outright or committed and then failed to award.
        // Either way the on-screen numbers are now suspect, so re-read rather than
        // leave them stale, and tell the user the tap did not land cleanly.
        console.error('Adjusting habit count failed', error);
        setNotice({ text: `Could not log ${habit.name}. Try again.`, tone: 'error' });
        await refresh().catch(() => undefined);
      } finally {
        setBusy(false);
      }
    },
    [busy, refresh],
  );

  if (!logs) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Today</Text>
        <Text style={styles.balance}>🎟 {balance}</Text>
      </View>

      {notice ? (
        <View style={[styles.notice, notice.tone === 'error' && styles.noticeError]}>
          <Text style={[styles.noticeText, notice.tone === 'error' && styles.noticeErrorText]}>
            {notice.text}
          </Text>
        </View>
      ) : null}

      <ScrollView>
        {GYM_HABITS.map((habit) => {
          const log = logs[habit.id];
          return (
            <HabitRow
              key={habit.id}
              habit={habit}
              count={log?.count ?? 0}
              completed={Boolean(log?.completedAt)}
              disabled={busy}
              onAdd={(amount) => handleAdd(habit, amount)}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: { fontSize: 24, fontWeight: '700' },
  balance: { fontSize: 18, fontWeight: '600' },
  notice: { backgroundColor: '#e7f5ff', paddingVertical: 10, paddingHorizontal: 16 },
  noticeText: { color: '#1864ab' },
  noticeError: { backgroundColor: '#fff5f5' },
  noticeErrorText: { color: '#c92a2a' },
});
