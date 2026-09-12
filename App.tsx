import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { initDatabase } from './src/services/db';
import { RootNavigator } from './src/navigation';

type InitState = 'loading' | 'ready' | 'failed';

export default function App() {
  const [state, setState] = useState<InitState>('loading');

  useEffect(() => {
    initDatabase()
      .then(() => setState('ready'))
      .catch((error) => {
        console.error('Database initialisation failed', error);
        setState('failed');
      });
  }, []);

  if (state === 'loading') {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (state === 'failed') {
    return (
      <View style={styles.centred}>
        <Text style={styles.errorTitle}>Could not load your data</Text>
        <Text style={styles.errorBody}>
          Daily Summoner could not open its local database. Restarting the app usually fixes this.
        </Text>
      </View>
    );
  }

  return <RootNavigator />;
}

const styles = StyleSheet.create({
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  errorBody: {
    textAlign: 'center',
    color: '#555',
  },
});
