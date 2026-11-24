import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { initStorage } from '../db';

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    initStorage()
      .then(() => setIsReady(true))
      .catch((err) => {
        console.error('Failed to init storage:', err);
        setIsReady(true);
      });
  }, []);

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' }}>
        <ActivityIndicator size="large" color="#1cc29f" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#1cc29f' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: '#F8F9FA' },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="group/[id]"
          options={{
            title: 'Group Details',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="add-expense"
          options={{
            title: 'Add an Expense',
            presentation: 'modal',
            headerStyle: { backgroundColor: '#1cc29f' },
          }}
        />
        <Stack.Screen
          name="settle-up"
          options={{
            title: 'Settle Up',
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="create-group"
          options={{
            title: 'Create a Group',
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="add-friend"
          options={{
            title: 'Add a Friend',
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="expense-detail/[id]"
          options={{
            title: 'Expense Details',
          }}
        />
      </Stack>
    </>
  );
}
