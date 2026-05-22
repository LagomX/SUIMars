import { useEmbeddedSolanaWallet, useLoginWithEmail, usePrivy } from '@privy-io/expo';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { getUserRole } from '@/services/identity';
import { useAuthStore, UserRole } from '@/store/authStore';

const ROLE_TITLES: Record<UserRole, string> = {
  customer: 'Customer Login',
  merchant: 'Merchant Login',
  rider: 'Rider Login',
};

const HOME_BY_ROLE: Record<UserRole, '/customer' | '/merchant' | '/rider'> = {
  customer: '/customer',
  merchant: '/merchant',
  rider: '/rider',
};

export default function LoginScreen() {
  const params = useLocalSearchParams<{ role?: string }>();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const navigatedRef = useRef(false);

  const { selectedRole, setSelectedRole, login } = useAuthStore();
  const { user } = usePrivy();
  const embeddedWallet = useEmbeddedSolanaWallet();

  const role = useMemo<UserRole>(() => {
    if (
      params.role === 'customer' ||
      params.role === 'merchant' ||
      params.role === 'rider'
    ) {
      return params.role;
    }
    return selectedRole ?? 'customer';
  }, [params.role, selectedRole]);

  useEffect(() => {
    setSelectedRole(role);
  }, [role, setSelectedRole]);

  const { sendCode, loginWithCode, state } = useLoginWithEmail({
    onError(error) {
      Alert.alert('登录失败', error.message);
    },
  });

  const getEmailAddress = () => {
    const emailAccount = user!.linked_accounts.find((a) => a.type === 'email');
    return emailAccount && 'address' in emailAccount
      ? (emailAccount as { address: string }).address
      : '';
  };

  const syncOnChainIdentity = async (walletAddress: string, selectedLoginRole: UserRole) => {
    try {
      const resolvedRole = await getUserRole(walletAddress);
      if (!resolvedRole) return;

      if (resolvedRole !== selectedLoginRole) {
        const emailAddress = getEmailAddress();
        login({
          id: walletAddress,
          privyId: user!.id,
          walletAddress,
          name: emailAddress.split('@')[0] || 'User',
          phone: emailAddress,
          role: resolvedRole,
        });
        router.replace(HOME_BY_ROLE[resolvedRole]);
      }
    } catch (error) {
      console.warn('On-chain identity sync failed', error);
    }
  };

  // Privy 登录和链上身份同步分开：RPC 限流不能阻塞进入 App。
  const doPostLogin = (walletAddress: string) => {
    const emailAddress = getEmailAddress();
    login({
      id: walletAddress,
      privyId: user!.id,
      walletAddress,
      name: emailAddress.split('@')[0] || 'User',
      phone: emailAddress,
      role,
    });

    navigatedRef.current = true;
    router.replace(HOME_BY_ROLE[role]);
    void syncOnChainIdentity(walletAddress, role);
  };

  useEffect(() => {
    if (navigatedRef.current) return;
    if (!user) return;

    const { status } = embeddedWallet;

    if (status === 'connecting' || status === 'creating' || status === 'reconnecting') {
      return; // 等待 Privy 完成 wallet 初始化，status 变化后 effect 会再次触发
    }

    if (status === 'not-created') {
      // Auto-create 虽开启但本次 session 还未创建，主动触发
      embeddedWallet.create().catch((error) => {
        console.warn('Embedded Solana wallet creation failed', error);
        Alert.alert('钱包创建失败', '请稍后重试或检查 Privy 钱包配置。');
      });
      return;
    }

    if (status === 'error') {
      Alert.alert('钱包加载失败', '请重启 App 后重试');
      return;
    }

    if (status === 'needs-recovery') {
      Alert.alert('钱包需要恢复', '请完成 Privy 钱包恢复后继续。');
      return;
    }

    if (status !== 'connected') return;

    const walletAddress = embeddedWallet.wallets?.[0]?.address;
    if (!walletAddress) return;

    doPostLogin(walletAddress);
  }, [user, embeddedWallet.status, embeddedWallet.wallets, role]);

  const sending = state.status === 'sending-code';
  const verifying = state.status === 'submitting-code';

  const handleSendCode = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      Alert.alert('提示', '请输入邮箱');
      return;
    }
    try {
      await sendCode({ email: trimmed });
      setCodeSent(true);
    } catch {
      Alert.alert('错误', '发送验证码失败');
    }
  };

  const handleVerifyCode = async () => {
    if (!code.trim()) {
      Alert.alert('提示', '请输入验证码');
      return;
    }
    try {
      await loginWithCode({ code: code.trim() });
    } catch {
      Alert.alert('登录失败', '验证码错误');
    }
  };

  // 已有 Privy session（上次登录未过期）—— 不显示表单，等 wallet 就绪后自动跳转
  if (user) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.brand}>Mars</Text>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Loading your wallet...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.brand}>Mars</Text>
        <Text style={styles.title}>{ROLE_TITLES[role]}</Text>
        <Text style={styles.subtitle}>Sign in with your email.</Text>
      </View>

      <View style={styles.card}>
        {!codeSent ? (
          <>
            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="your@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.input}
            />
            <TouchableOpacity
              style={[styles.button, sending ? styles.disabled : null]}
              onPress={handleSendCode}
              disabled={sending}
            >
              <Text style={styles.buttonText}>
                {sending ? '发送中...' : '发送验证码'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.label}>验证码</Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="输入 6 位验证码"
              keyboardType="number-pad"
              style={styles.input}
            />
            <TouchableOpacity
              style={[styles.button, verifying ? styles.disabled : null]}
              onPress={handleVerifyCode}
              disabled={verifying}
            >
              <Text style={styles.buttonText}>
                {verifying ? '验证中...' : 'Login'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setCodeSent(false);
                setCode('');
              }}
            >
              <Text style={styles.back}>← 重新输入邮箱</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f7f7',
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 34,
    borderBottomWidth: 1,
    borderBottomColor: '#eeeeee',
  },
  brand: {
    color: '#e11d2e',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 12,
  },
  title: {
    color: '#191919',
    fontSize: 32,
    fontWeight: '900',
  },
  subtitle: {
    color: '#71717a',
    fontSize: 16,
    marginTop: 8,
  },
  card: {
    margin: 16,
    backgroundColor: '#fff',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#ededed',
    padding: 18,
    gap: 12,
  },
  label: {
    color: '#191919',
    fontWeight: '900',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e4e4e7',
    backgroundColor: '#fafafa',
    borderRadius: 16,
    padding: 14,
    fontSize: 18,
  },
  button: {
    backgroundColor: '#e11d2e',
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  disabled: {
    backgroundColor: '#a1a1aa',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  back: {
    color: '#71717a',
    textAlign: 'center',
    marginTop: 4,
  },
});
