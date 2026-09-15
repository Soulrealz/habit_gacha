import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CharacterDetailScreen } from '../screens/CharacterDetailScreen';
import { CollectionScreen } from '../screens/CollectionScreen';

export type CollectionStackParamList = {
  CollectionGrid: undefined;
  CharacterDetail: { characterId: string };
};

const Stack = createNativeStackNavigator<CollectionStackParamList>();

export function CollectionStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="CollectionGrid" options={{ title: 'Collection' }}>
        {({ navigation }) => (
          <CollectionScreen
            onOpen={(characterId) => navigation.navigate('CharacterDetail', { characterId })}
          />
        )}
      </Stack.Screen>
      <Stack.Screen
        name="CharacterDetail"
        component={CharacterDetailScreen}
        options={{ title: '' }}
      />
    </Stack.Navigator>
  );
}
