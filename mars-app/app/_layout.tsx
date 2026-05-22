import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Mars' }} />
      <Stack.Screen name="customer" options={{ title: 'Customer' }} />
      <Stack.Screen name="merchant" options={{ title: 'Merchant' }} />
      <Stack.Screen name="rider" options={{ title: 'Rider' }} />
    </Stack>
  );
}
