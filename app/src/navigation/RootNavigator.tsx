import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { useAuth } from '../auth/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import RiderHomeScreen from '../screens/RiderHomeScreen';
import DriverHomeScreen from '../screens/DriverHomeScreen';
import RideStatusScreen from '../screens/RideStatusScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0B5FFF" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {user == null ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Sign in' }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Create account' }} />
          </>
        ) : user.role === 'DRIVER' ? (
          <>
            <Stack.Screen name="DriverHome" component={DriverHomeScreen} options={{ title: 'Driver' }} />
            <Stack.Screen name="RideStatus" component={RideStatusScreen} options={{ title: 'Ride' }} />
          </>
        ) : (
          <>
            <Stack.Screen name="RiderHome" component={RiderHomeScreen} options={{ title: 'TVDEPT' }} />
            <Stack.Screen name="RideStatus" component={RideStatusScreen} options={{ title: 'Your ride' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
