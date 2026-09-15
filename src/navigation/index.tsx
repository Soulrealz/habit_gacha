import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { CollectionScreen } from '../screens/CollectionScreen';
import { HowItWorksScreen } from '../screens/HowItWorksScreen';
import { SummonScreen } from '../screens/SummonScreen';
import { TodayScreen } from '../screens/TodayScreen';

const Tab = createBottomTabNavigator();

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator>
        <Tab.Screen name="Today" component={TodayScreen} />
        <Tab.Screen name="Summon" component={SummonScreen} />
        <Tab.Screen name="Collection" component={CollectionScreen} />
        <Tab.Screen name="How it works" component={HowItWorksScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
