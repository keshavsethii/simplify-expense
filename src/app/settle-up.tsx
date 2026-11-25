import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getAllMembers,
  getCurrentUser,
  addSettlement,
  getGroupMembers,
  getFriendLedger,
  getSharedGroups,
} from '../db/queries';
import { Member, Group } from '../db/types';
import { formatMoney, CURRENCY_SYMBOL, CURRENCY_CODE } from '../utils/currency';

export default function SettleUpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    groupId?: string;
    friendId?: string;
    friendName?: string;
    fromMemberId?: string;
    toMemberId?: string;
    amount?: string;
  }>();

  const [members, setMembers] = useState<Member[]>([]);
  const [fromMemberId, setFromMemberId] = useState<string>('');
  const [toMemberId, setToMemberId] = useState<string>('');
  const [amount, setAmount] = useState<string>(params.amount || '');
  const [notes, setNotes] = useState<string>('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(params.groupId || null);
  const [sharedGroups, setSharedGroups] = useState<Group[]>([]);

  // Modals for dropdown selections
  const [showPayerModal, setShowPayerModal] = useState(false);
  const [showRecipientModal, setShowRecipientModal] = useState(false);

  useEffect(() => {
    async function init() {
      const u = await getCurrentUser();
      let mems: Member[] = [];

      if (params.groupId) {
        mems = await getGroupMembers(params.groupId);
      } else {
        mems = await getAllMembers();
      }
      setMembers(mems);

      let pFrom = '';
      let pTo = '';
      let pAmt = params.amount || '';

      if (params.fromMemberId && params.toMemberId) {
        pFrom = params.fromMemberId;
        pTo = params.toMemberId;
      } else if (params.friendId) {
        try {
          const ledger = await getFriendLedger(params.friendId);
          if (ledger.netBalance > 0.01) {
            // Friend owes user: Friend is payer, User is recipient
            pFrom = params.friendId;
            pTo = u.id;
            if (!pAmt) pAmt = String(Math.round(ledger.netBalance * 100) / 100);
          } else if (ledger.netBalance < -0.01) {
            // User owes friend: User is payer, Friend is recipient
            pFrom = u.id;
            pTo = params.friendId;
            if (!pAmt) pAmt = String(Math.round(Math.abs(ledger.netBalance) * 100) / 100);
          } else {
            pFrom = u.id;
            pTo = params.friendId;
          }
        } catch {
          pFrom = u.id;
          pTo = params.friendId;
        }
      } else {
        pFrom = u.id;
        const firstOther = mems.find((m) => m.id !== u.id);
        if (firstOther) pTo = firstOther.id;
      }

      setFromMemberId(pFrom);
      setToMemberId(pTo);
      if (pAmt) setAmount(pAmt);

      if (pFrom && pTo) {
        const mutual = await getSharedGroups(pFrom, pTo);
        setSharedGroups(mutual);
        if (params.groupId) {
          setSelectedGroupId(params.groupId);
        } else if (mutual.length === 1) {
          setSelectedGroupId(mutual[0].id);
        }
      }
    }
    init();
  }, [params.groupId, params.friendId, params.fromMemberId, params.toMemberId, params.amount]);

  useEffect(() => {
    if (!fromMemberId || !toMemberId || fromMemberId === toMemberId) return;
    let cancelled = false;
    async function updateMutual() {
      const mutual = await getSharedGroups(fromMemberId, toMemberId);
      if (cancelled) return;
      setSharedGroups(mutual);
      if (!params.groupId) {
        setSelectedGroupId((prev) => {
          if (mutual.length === 1) return mutual[0].id;
          if (prev && !mutual.some((g) => g.id === prev)) return null;
          return prev;
        });
      }
    }
    updateMutual();
    return () => {
      cancelled = true;
    };
  }, [fromMemberId, toMemberId, params.groupId]);

  const handleSwap = () => {
    const prevFrom = fromMemberId;
    const prevTo = toMemberId;
    setFromMemberId(prevTo);
    setToMemberId(prevFrom);
  };

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
        groupId: selectedGroupId || null,
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

          <TouchableOpacity
            style={styles.arrowCol}
            onPress={handleSwap}
            activeOpacity={0.7}
          >
            <Ionicons name="swap-horizontal" size={26} color="#1cc29f" />
            <Text style={styles.arrowText}>Swap</Text>
          </TouchableOpacity>

          <View style={styles.personCol}>
            <Text style={styles.flowLabel}>Recipient</Text>
            <View style={[styles.avatar, { backgroundColor: recipient?.avatar_color || '#3B82F6' }]}>
              <Text style={styles.avatarText}>{recipient?.name.charAt(0) || '?'}</Text>
            </View>
            <Text style={styles.flowName}>{recipient?.is_user === 1 ? 'You' : recipient?.name}</Text>
          </View>
        </View>

        {/* Shared Groups Selector */}
        {sharedGroups.length > 0 && (
          <View style={styles.groupSection}>
            <Text style={styles.label}>Apply to Group</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
              <TouchableOpacity
                style={[styles.pill, selectedGroupId === null && styles.pillActive]}
                onPress={() => setSelectedGroupId(null)}
              >
                <Text style={[styles.pillText, selectedGroupId === null && styles.pillTextActive]}>
                  Direct (No Group)
                </Text>
              </TouchableOpacity>
              {sharedGroups.map((g) => (
                <TouchableOpacity
                  key={g.id}
                  style={[styles.pill, selectedGroupId === g.id && styles.pillActive]}
                  onPress={() => setSelectedGroupId(g.id)}
                >
                  <Text style={[styles.pillText, selectedGroupId === g.id && styles.pillTextActive]}>
                    {g.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Dropdown: Who Paid */}
        <Text style={styles.label}>Who Paid</Text>
        <TouchableOpacity
          style={styles.dropdownBtn}
          onPress={() => setShowPayerModal(true)}
          activeOpacity={0.8}
        >
          <View style={styles.dropdownLeft}>
            <View style={[styles.avatarDot, { backgroundColor: payer?.avatar_color || '#1cc29f' }]}>
              <Text style={styles.avatarDotText}>{(payer?.name || '?').charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ marginLeft: 10 }}>
              <Text style={styles.dropdownLabelText}>Payer</Text>
              <Text style={styles.dropdownValueText}>{payer?.is_user === 1 ? 'You' : payer?.name}</Text>
            </View>
          </View>
          <Ionicons name="chevron-down" size={20} color="#6B7280" />
        </TouchableOpacity>

        {/* Dropdown: Who Received */}
        <Text style={styles.label}>Who Received</Text>
        <TouchableOpacity
          style={styles.dropdownBtn}
          onPress={() => setShowRecipientModal(true)}
          activeOpacity={0.8}
        >
          <View style={styles.dropdownLeft}>
            <View style={[styles.avatarDot, { backgroundColor: recipient?.avatar_color || '#3B82F6' }]}>
              <Text style={styles.avatarDotText}>{(recipient?.name || '?').charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ marginLeft: 10 }}>
              <Text style={styles.dropdownLabelText}>Recipient</Text>
              <Text style={styles.dropdownValueText}>{recipient?.is_user === 1 ? 'You' : recipient?.name}</Text>
            </View>
          </View>
          <Ionicons name="chevron-down" size={20} color="#6B7280" />
        </TouchableOpacity>

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

        {/* Quick Amount Presets */}
        <View style={styles.presetsRow}>
          {params.amount && parseFloat(params.amount) > 0 && (
            <>
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => setAmount(String(params.amount))}
              >
                <Text style={styles.presetChipText}>Full ({formatMoney(parseFloat(params.amount))})</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() =>
                  setAmount(String(Math.round((parseFloat(params.amount!) / 2) * 100) / 100))
                }
              >
                <Text style={styles.presetChipText}>Half ({formatMoney(parseFloat(params.amount) / 2)})</Text>
              </TouchableOpacity>
            </>
          )}
          {['100', '500', '1000', '2000'].map((val) => (
            <TouchableOpacity
              key={val}
              style={styles.presetChip}
              onPress={() => setAmount(val)}
            >
              <Text style={styles.presetChipText}>₹{val}</Text>
            </TouchableOpacity>
          ))}
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

      {/* Payer Selection Dropdown Modal */}
      <Modal visible={showPayerModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardLarge}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Select Who Paid</Text>
              <TouchableOpacity onPress={() => setShowPayerModal(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Choose the person who made the payment.</Text>

            <ScrollView style={{ maxHeight: 350 }}>
              {members.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={styles.modalMemberRow}
                  onPress={() => {
                    setFromMemberId(m.id);
                    setShowPayerModal(false);
                  }}
                >
                  <View style={styles.modalMemberLeft}>
                    <View style={[styles.avatarDot, { backgroundColor: m.avatar_color || '#1cc29f' }]}>
                      <Text style={styles.avatarDotText}>{m.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <Text style={styles.modalMemberName}>{m.is_user === 1 ? 'You' : m.name}</Text>
                  </View>
                  {fromMemberId === m.id && (
                    <Ionicons name="checkmark-circle" size={22} color="#1cc29f" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Recipient Selection Dropdown Modal */}
      <Modal visible={showRecipientModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardLarge}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Select Who Received</Text>
              <TouchableOpacity onPress={() => setShowRecipientModal(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Choose the person who received the money.</Text>

            <ScrollView style={{ maxHeight: 350 }}>
              {members.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={styles.modalMemberRow}
                  onPress={() => {
                    setToMemberId(m.id);
                    setShowRecipientModal(false);
                  }}
                >
                  <View style={styles.modalMemberLeft}>
                    <View style={[styles.avatarDot, { backgroundColor: m.avatar_color || '#3B82F6' }]}>
                      <Text style={styles.avatarDotText}>{m.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <Text style={styles.modalMemberName}>{m.is_user === 1 ? 'You' : m.name}</Text>
                  </View>
                  {toMemberId === m.id && (
                    <Ionicons name="checkmark-circle" size={22} color="#1cc29f" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  groupSection: {
    marginBottom: 6,
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
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    marginBottom: 4,
  },
  presetChip: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
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
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  dropdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dropdownLabelText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  dropdownValueText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginTop: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCardLarge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 14,
  },
  modalMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  modalMemberLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalMemberName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  avatarDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarDotText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
