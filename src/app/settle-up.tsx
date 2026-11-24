import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { getAllMembers, getAllGroups, getCurrentUser, addSettlement } from '../db/queries';
import { Member, Group } from '../db/types';
import { formatMoney, CURRENCY_SYMBOL, CURRENCY_CODE } from '../utils/currency';

export default function SettleUpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ groupId?: string; friendId?: string; friendName?: string }>();

  const [members, setMembers] = useState<Member[]>([]);
  const [currentUser, setCurrentUser] = useState<Member | null>(null);

  const [fromMemberId, setFromMemberId] = useState<string>('');
  const [toMemberId, setToMemberId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    async function init() {
      const allMems = await getAllMembers();
      const u = await getCurrentUser();
      setMembers(allMems);
      setCurrentUser(u);

      if (params.friendId) {
        // Default: You pay friend or Friend pays you
        setFromMemberId(u.id);
        setToMemberId(params.friendId);
      } else {
        setFromMemberId(u.id);
        const firstOther = allMems.find((m) => m.id !== u.id);
        if (firstOther) setToMemberId(firstOther.id);
      }
    }
    init();
  }, [params.friendId]);

  const handleSettle = async () => {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid settlement amount.');
      return;
    }
    if (fromMemberId === toMemberId) {
      Alert.alert('Invalid Members', 'Payer and recipient cannot be the same person.');
      return;
    }

    try {
      await addSettlement({
        groupId: params.groupId || null,
        fromMemberId,
        toMemberId,
        amount: parsedAmount,
        currency: CURRENCY_CODE,
        date: new Date().toISOString().substring(0, 10),
        notes: notes.trim() || undefined,
      });

      Alert.alert('Payment Recorded', 'Your settlement has been recorded and balances updated.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to record settlement.');
    }
  };

  const payer = members.find((m) => m.id === fromMemberId);
  const recipient = members.find((m) => m.id === toMemberId);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.sectionHeader}>Record a Cash or Online Payment</Text>
        <Text style={styles.subHeader}>
          Record a payment to settle balances between group members or friends.
        </Text>

        {/* Payer and Recipient visual card */}
        <View style={styles.flowCard}>
          <View style={styles.personCol}>
            <Text style={styles.flowLabel}>Payer</Text>
            <View style={[styles.avatar, { backgroundColor: payer?.avatar_color || '#1cc29f' }]}>
              <Text style={styles.avatarText}>{payer?.name.charAt(0) || '?'}</Text>
            </View>
            <Text style={styles.flowName}>{payer?.is_user === 1 ? 'You' : payer?.name}</Text>
          </View>

          <View style={styles.arrowCol}>
            <Ionicons name="arrow-forward" size={28} color="#1cc29f" />
            <Text style={styles.arrowText}>paid</Text>
          </View>

          <View style={styles.personCol}>
            <Text style={styles.flowLabel}>Recipient</Text>
            <View style={[styles.avatar, { backgroundColor: recipient?.avatar_color || '#3B82F6' }]}>
              <Text style={styles.avatarText}>{recipient?.name.charAt(0) || '?'}</Text>
            </View>
            <Text style={styles.flowName}>{recipient?.is_user === 1 ? 'You' : recipient?.name}</Text>
          </View>
        </View>

        {/* Change Payer / Recipient options */}
        <Text style={styles.label}>Select Who Paid</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
          {members.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[styles.pill, fromMemberId === m.id && styles.pillActive]}
              onPress={() => setFromMemberId(m.id)}
            >
              <Text style={[styles.pillText, fromMemberId === m.id && styles.pillTextActive]}>
                {m.is_user === 1 ? 'You' : m.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.label}>Select Who Received</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
          {members.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[styles.pill, toMemberId === m.id && styles.pillActive]}
              onPress={() => setToMemberId(m.id)}
            >
              <Text style={[styles.pillText, toMemberId === m.id && styles.pillTextActive]}>
                {m.is_user === 1 ? 'You' : m.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Amount */}
        <Text style={styles.label}>Amount Paid</Text>
        <View style={styles.amountInputRow}>
          <Text style={styles.currencyPrefix}>{CURRENCY_SYMBOL}</Text>
          <TextInput
            style={styles.amountInput}
            placeholder="0.00"
            placeholderTextColor="#D1D5DB"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
          />
        </View>

        {/* Notes */}
        <Text style={styles.label}>Notes (Optional)</Text>
        <TextInput
          style={styles.notesInput}
          placeholder="e.g. Venmo, Zelle, Cash, UPI"
          placeholderTextColor="#9CA3AF"
          value={notes}
          onChangeText={setNotes}
        />

        {/* Save Button */}
        <TouchableOpacity style={styles.settleBtn} onPress={handleSettle} activeOpacity={0.85}>
          <Ionicons name="checkmark-done" size={20} color="#FFFFFF" />
          <Text style={styles.settleBtnText}>Save Payment</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  card: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  subHeader: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
    marginBottom: 20,
  },
  flowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 20,
  },
  personCol: {
    alignItems: 'center',
  },
  flowLabel: {
    fontSize: 11,
    color: '#6B7280',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  flowName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  arrowCol: {
    alignItems: 'center',
    gap: 4,
  },
  arrowText: {
    fontSize: 11,
    color: '#1cc29f',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 8,
  },
  pillScroll: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
  },
  pillActive: {
    backgroundColor: '#1cc29f',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },
  currencyPrefix: {
    fontSize: 20,
    fontWeight: '700',
    color: '#6B7280',
    marginRight: 10,
  },
  amountInput: {
    flex: 1,
    fontSize: 26,
    fontWeight: '800',
    color: '#111827',
  },
  notesInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#FFFFFF',
    marginTop: 4,
    marginBottom: 24,
  },
  settleBtn: {
    backgroundColor: '#1cc29f',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  settleBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
