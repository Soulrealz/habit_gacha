import { StyleSheet, Text, View } from 'react-native';

export function SummonScreen() {
  return (
    <View style={styles.container}>
      <Text>Summon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
