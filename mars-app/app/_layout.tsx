import { PrivyProvider } from '@privy-io/expo';
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <PrivyProvider appId="cmoujygcp003p0cjyxm4fohts" clientId="client-WY6Yhw2voxvxgR7RsnX9E7ZThvbSgMZ8PC8nYNtiKefrm">
      <Stack>
        <Stack.Screen name="index" options={{ title: '选择角色' }} />
        <Stack.Screen name="login" options={{ title: 'Login' }} />
        <Stack.Screen name="customer" options={{ title: 'Customer' }} />
        <Stack.Screen name="merchant" options={{ title: 'Merchant' }} />
        <Stack.Screen name="rider" options={{ title: 'Rider' }} />
      </Stack>
    </PrivyProvider>
  );
}
