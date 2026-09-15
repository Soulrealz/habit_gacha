import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Habit } from '../types';

type HabitRowProps = {
  habit: Habit;
  count: number;
  completed: boolean;
  disabled?: boolean;
  onAdd: (amount: number) => void;
};

export function HabitRow({ habit, count, completed, disabled = false, onAdd }: HabitRowProps) {
  const progress = Math.min(1, habit.target === 0 ? 0 : count / habit.target);
  const undoAmount = habit.quickAdd[0] ?? 1;

  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <Text style={styles.name}>
          {habit.name}
          {completed ? ' ✓' : ''}
        </Text>
        <Text style={styles.progressText}>
          {count} / {habit.target} {habit.unit}
        </Text>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      </View>

      <View style={styles.buttons}>
        {habit.quickAdd.map((amount) => (
          <Pressable
            key={amount}
            style={[styles.button, disabled && styles.buttonDisabled]}
            disabled={disabled}
            onPress={() => onAdd(amount)}
            accessibilityLabel={`Add ${amount} ${habit.unit} to ${habit.name}`}
          >
            <Text style={styles.buttonText}>+{amount}</Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.button, styles.undoButton, disabled && styles.buttonDisabled]}
          disabled={disabled}
          onPress={() => onAdd(-undoAmount)}
          accessibilityLabel={`Remove ${undoAmount} ${habit.unit} from ${habit.name}`}
        >
          <Text style={styles.buttonText}>−{undoAmount}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  name: { fontSize: 16, fontWeight: '600' },
  progressText: { fontSize: 14, color: '#666' },
  track: { height: 6, borderRadius: 3, backgroundColor: '#eee', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#4c6ef5' },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 10 },
  button: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: '#4c6ef5',
  },
  buttonDisabled: { opacity: 0.4 },
  undoButton: { backgroundColor: '#adb5bd', marginLeft: 'auto' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
