import { StyleSheet, Text, View } from 'react-native';

export function TodayScreen() {
  return (
    <View style={styles.container}>
      <Text>Today</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
