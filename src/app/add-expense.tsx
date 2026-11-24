import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import {
  getAllMembers,
  getAllGroups,
  getCurrentUser,
  addExpense,
  getDefaultGroupSplit,
  saveDefaultGroupSplit,
} from '../db/queries';
import { Member, Group } from '../db/types';
import { formatMoney, CURRENCY_SYMBOL, CURRENCY_CODE } from '../utils/currency';

export default function AddExpenseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ groupId?: string }>();

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('General');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(params.groupId || null);

  const [members, setMembers] = useState<Member[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [currentUser, setCurrentUser] = useState<Member | null>(null);

  const [payerId, setPayerId] = useState<string>('');
  const [splitType, setSplitType] = useState<'EQUAL' | 'EXACT' | 'PERCENT' | 'SHARES'>('EQUAL');

  // Included member IDs in this expense
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  // Unequal values map: memberId -> exact amount / percentage / shares
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  const toggleSelectAll = () => {
    if (selectedMemberIds.length === members.length) {
      // Keep only current user
      if (currentUser) {
        setSelectedMemberIds([currentUser.id]);
      }
    } else {
      setSelectedMemberIds(members.map((m) => m.id));
    }
  };

  const parsedTotalAmount = parseFloat(amount) || 0;

  // Real-time split calculations
  const calculateSplitStatus = () => {
    if (splitType === 'EQUAL') {
      const count = selectedMemberIds.length;
      const perPerson = count > 0 ? parsedTotalAmount / count : 0;
      return {
        isValid: count > 0 && parsedTotalAmount > 0,
        text: count > 0 ? `${formatMoney(perPerson)} / person (${count} people)` : 'Select members',
        statusColor: '#1cc29f',
      };
    }

    if (splitType === 'EXACT') {
      let sum = 0;
      selectedMemberIds.forEach((mId) => {
        sum += parseFloat(customValues[mId] || '0') || 0;
      });
      const diff = Math.round((parsedTotalAmount - sum) * 100) / 100;
      if (Math.abs(diff) < 0.01) {
        return { isValid: true, text: `✓ Exactly ${formatMoney(parsedTotalAmount)} allocated`, statusColor: '#1cc29f' };
      } else if (diff > 0) {
        return { isValid: false, text: `${formatMoney(diff)} remaining to assign`, statusColor: '#F59E0B' };
      } else {
        return { isValid: false, text: `${formatMoney(Math.abs(diff))} over assigned!`, statusColor: '#EF4444' };
      }
    }

    if (splitType === 'PERCENT') {
      let totalPct = 0;
      selectedMemberIds.forEach((mId) => {
        totalPct += parseFloat(customValues[mId] || '0') || 0;
      });
      const diff = Math.round((100 - totalPct) * 10) / 10;
      if (Math.abs(diff) < 0.01) {
        return { isValid: true, text: `✓ 100% fully allocated`, statusColor: '#1cc29f' };
      } else if (diff > 0) {
        return { isValid: false, text: `${diff}% remaining (Total: ${totalPct}%)`, statusColor: '#F59E0B' };
      } else {
        return { isValid: false, text: `${Math.abs(diff)}% over 100%!`, statusColor: '#EF4444' };
      }
    }

    if (splitType === 'SHARES') {
      let totalShares = 0;
      selectedMemberIds.forEach((mId) => {
        totalShares += parseFloat(customValues[mId] || '1') || 0;
      });
      return {
        isValid: totalShares > 0 && parsedTotalAmount > 0,
        text: totalShares > 0 ? `Total: ${totalShares} shares` : 'Enter shares',
        statusColor: '#1cc29f',
      };
    }

    return { isValid: true, text: '', statusColor: '#1cc29f' };
  };

  const splitStatus = calculateSplitStatus();

  useEffect(() => {
    async function init() {
      const allMems = await getAllMembers();
      const allGrps = await getAllGroups();
      const u = await getCurrentUser();

      setMembers(allMems);
      setGroups(allGrps);
      setCurrentUser(u);
      setPayerId(u.id);

      // If groupId provided, filter to group members
      if (params.groupId) {
        setSelectedGroupId(params.groupId);
        loadGroupDefaultSplit(params.groupId, allMems);
      } else {
        // default include everyone or at least user
        setSelectedMemberIds(allMems.map((m) => m.id));
      }
    }
    init();
  }, [params.groupId]);

  const loadGroupDefaultSplit = async (grpId: string, allMems: Member[]) => {
    setSelectedMemberIds(allMems.map((m) => m.id));
    const def = await getDefaultGroupSplit(grpId);
    if (def) {
      setSplitType(def.split_type);
      try {
        const parsed = JSON.parse(def.splits_json);
        setCustomValues(parsed);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const toggleMemberSelection = (mId: string) => {
    if (selectedMemberIds.includes(mId)) {
      if (selectedMemberIds.length === 1) {
        Alert.alert('Required', 'At least one person must be part of the expense split.');
        return;
      }
      setSelectedMemberIds(selectedMemberIds.filter((id) => id !== mId));
    } else {
      setSelectedMemberIds([...selectedMemberIds, mId]);
    }
  };

  const handleSaveExpense = async () => {
    const parsedAmount = parseFloat(amount);
    if (!description.trim()) {
      Alert.alert('Missing Description', 'Please enter what this expense was for.');
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid expense amount.');
      return;
    }
    if (selectedMemberIds.length === 0) {
      Alert.alert('No participants', 'Please select who is splitting this bill.');
      return;
    }

    const splits: { memberId: string; amount: number; percentage?: number; shares?: number }[] = [];

    if (splitType === 'EQUAL') {
      const splitAmount = Math.round((parsedAmount / selectedMemberIds.length) * 100) / 100;
      let remaining = parsedAmount;

      selectedMemberIds.forEach((mId, idx) => {
        if (idx === selectedMemberIds.length - 1) {
          splits.push({ memberId: mId, amount: Math.round(remaining * 100) / 100 });
        } else {
          splits.push({ memberId: mId, amount: splitAmount });
          remaining -= splitAmount;
        }
      });
    } else if (splitType === 'EXACT') {
      let totalAssigned = 0;
      for (const mId of selectedMemberIds) {
        const val = parseFloat(customValues[mId] || '0');
        totalAssigned += val;
        splits.push({ memberId: mId, amount: val });
      }

      if (Math.abs(totalAssigned - parsedAmount) > 0.05) {
        Alert.alert(
          'Split Mismatch',
          `The sum of individual amounts (${formatMoney(totalAssigned)}) does not match total amount (${formatMoney(parsedAmount)}).`
        );
        return;
      }
    } else if (splitType === 'PERCENT') {
      let totalPct = 0;
      for (const mId of selectedMemberIds) {
        const pct = parseFloat(customValues[mId] || '0');
        totalPct += pct;
      }
      if (Math.abs(totalPct - 100) > 0.5) {
        Alert.alert('Percentage Error', `Percentages must add up to 100% (currently ${totalPct}%).`);
        return;
      }

      let remaining = parsedAmount;
      selectedMemberIds.forEach((mId, idx) => {
        const pct = parseFloat(customValues[mId] || '0');
        if (idx === selectedMemberIds.length - 1) {
          splits.push({
            memberId: mId,
            amount: Math.round(remaining * 100) / 100,
            percentage: pct,
          });
        } else {
          const shareAmt = Math.round(((parsedAmount * pct) / 100) * 100) / 100;
          splits.push({ memberId: mId, amount: shareAmt, percentage: pct });
          remaining -= shareAmt;
        }
      });
    } else if (splitType === 'SHARES') {
      let totalShares = 0;
      for (const mId of selectedMemberIds) {
        const sh = parseFloat(customValues[mId] || '1');
        totalShares += sh;
      }
      if (totalShares <= 0) {
        Alert.alert('Shares Error', 'Total shares must be greater than 0.');
        return;
      }

      let remaining = parsedAmount;
      selectedMemberIds.forEach((mId, idx) => {
        const sh = parseFloat(customValues[mId] || '1');
        if (idx === selectedMemberIds.length - 1) {
          splits.push({
            memberId: mId,
            amount: Math.round(remaining * 100) / 100,
            shares: sh,
          });
        } else {
          const shareAmt = Math.round(((parsedAmount * sh) / totalShares) * 100) / 100;
          splits.push({ memberId: mId, amount: shareAmt, shares: sh });
          remaining -= shareAmt;
        }
      });
    }

    try {
      await addExpense({
        groupId: selectedGroupId,
        description: description.trim(),
        amount: parsedAmount,
        currency: CURRENCY_CODE,
        date: new Date().toISOString().substring(0, 10),
        category,
        paidByMemberId: payerId,
        splitType,
        splits,
      });

      // If user is in group and wants to save this as default split rule (Pro feature)
      if (selectedGroupId && (splitType === 'PERCENT' || splitType === 'SHARES')) {
        await saveDefaultGroupSplit(selectedGroupId, splitType, JSON.stringify(customValues));
      }

      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save expense');
    }
  };

  const categories = ['General', 'Groceries', 'Food', 'Utilities', 'Travel', 'Entertainment'];
  const currencies = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD'];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView style={styles.container}>
        {/* Basic Fields */}
        <View style={styles.section}>
          <Text style={styles.label}>With you and: Group or Friends</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
            <TouchableOpacity
              style={[
                styles.groupPill,
                selectedGroupId === null && styles.groupPillActive,
              ]}
              onPress={() => setSelectedGroupId(null)}
            >
              <Text
                style={[
                  styles.groupPillText,
                  selectedGroupId === null && styles.groupPillTextActive,
                ]}
              >
                No Group (Friends)
              </Text>
            </TouchableOpacity>
            {groups.map((g) => (
              <TouchableOpacity
                key={g.id}
                style={[
                  styles.groupPill,
                  selectedGroupId === g.id && styles.groupPillActive,
                ]}
                onPress={() => {
                  setSelectedGroupId(g.id);
                }}
              >
                <Text
                  style={[
                    styles.groupPillText,
                    selectedGroupId === g.id && styles.groupPillTextActive,
                  ]}
                >
                  {g.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.inputRow}>
            <Ionicons name="receipt-outline" size={24} color="#6B7280" />
            <TextInput
              style={styles.textInput}
              placeholder="Enter a description (e.g. Dinner, Rent)"
              placeholderTextColor="#9CA3AF"
              value={description}
              onChangeText={setDescription}
            />
          </View>

          <View style={styles.amountRow}>
            <View style={styles.currencySelector}>
              <Text style={styles.currencyCode}>{CURRENCY_SYMBOL}</Text>
            </View>

            <TextInput
              style={styles.amountInput}
              placeholder="0.00"
              placeholderTextColor="#D1D5DB"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
            />
          </View>
        </View>

        {/* Category Picker */}
        <View style={styles.section}>
          <Text style={styles.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryPill,
                  category === cat && styles.categoryPillActive,
                ]}
                onPress={() => setCategory(cat)}
              >
                <Text
                  style={[
                    styles.categoryPillText,
                    category === cat && styles.categoryPillTextActive,
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Paid by selector */}
        <View style={styles.section}>
          <Text style={styles.label}>Paid by</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
            {members.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={[
                  styles.payerPill,
                  payerId === m.id && styles.payerPillActive,
                ]}
                onPress={() => setPayerId(m.id)}
              >
                <Text
                  style={[
                    styles.payerPillText,
                    payerId === m.id && styles.payerPillTextActive,
                  ]}
                >
                  {m.is_user === 1 ? 'You' : m.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Split Mode Selector */}
        <View style={styles.section}>
          <View style={styles.splitHeader}>
            <Text style={styles.label}>Split Options</Text>
            <TouchableOpacity onPress={toggleSelectAll} style={styles.selectAllBtn}>
              <Text style={styles.selectAllText}>
                {selectedMemberIds.length === members.length ? 'Deselect all' : 'Select all'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.splitTypeButtons}>
            {(['EQUAL', 'EXACT', 'PERCENT', 'SHARES'] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={[
                  styles.splitTypeBtn,
                  splitType === t && styles.splitTypeBtnActive,
                ]}
                onPress={() => setSplitType(t)}
              >
                <Text
                  style={[
                    styles.splitTypeBtnText,
                    splitType === t && styles.splitTypeBtnTextActive,
                  ]}
                >
                  {t === 'EQUAL' ? '=' : t === 'EXACT' ? '1.23' : t === 'PERCENT' ? '%' : 'Shares'}
                </Text>
                <Text
                  style={[
                    styles.splitTypeSub,
                    splitType === t && styles.splitTypeSubActive,
                  ]}
                >
                  {t.toLowerCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Real-time Status Banner */}
          {parsedTotalAmount > 0 && (
            <View style={[styles.statusBanner, { borderColor: splitStatus.statusColor }]}>
              <Ionicons
                name={splitStatus.isValid ? 'checkmark-circle' : 'alert-circle'}
                size={16}
                color={splitStatus.statusColor}
              />
              <Text style={[styles.statusBannerText, { color: splitStatus.statusColor }]}>
                {splitStatus.text}
              </Text>
            </View>
          )}

          {/* Members Split Breakdown */}
          <View style={styles.splitMembersList}>
            {members.map((m) => {
              const isSelected = selectedMemberIds.includes(m.id);

              // Calculated share preview for visual clarity
              let previewText = '';
              if (isSelected && parsedTotalAmount > 0) {
                if (splitType === 'EQUAL') {
                  const perPerson = parsedTotalAmount / selectedMemberIds.length;
                  previewText = formatMoney(perPerson);
                } else if (splitType === 'PERCENT') {
                  const pct = parseFloat(customValues[m.id] || '0') || 0;
                  const amt = (parsedTotalAmount * pct) / 100;
                  previewText = formatMoney(amt);
                } else if (splitType === 'SHARES') {
                  let totalShares = 0;
                  selectedMemberIds.forEach((id) => {
                    totalShares += parseFloat(customValues[id] || '1') || 0;
                  });
                  const sh = parseFloat(customValues[m.id] || '1') || 0;
                  const amt = totalShares > 0 ? (parsedTotalAmount * sh) / totalShares : 0;
                  previewText = formatMoney(amt);
                }
              }

              return (
                <View key={m.id} style={styles.memberSplitRow}>
                  <TouchableOpacity
                    style={styles.memberSelectLeft}
                    onPress={() => toggleMemberSelection(m.id)}
                  >
                    <Ionicons
                      name={isSelected ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={isSelected ? '#1cc29f' : '#9CA3AF'}
                    />
                    <View>
                      <Text style={styles.memberSplitName}>
                        {m.is_user === 1 ? 'You' : m.name}
                      </Text>
                      {previewText !== '' && (
                        <Text style={styles.memberPreviewText}>owes {previewText}</Text>
                      )}
                    </View>
                  </TouchableOpacity>

                  {/* Input for custom splits */}
                  {isSelected && splitType !== 'EQUAL' && (
                    <View style={styles.customInputBox}>
                      <TextInput
                        style={styles.customInput}
                        placeholder={
                          splitType === 'EXACT'
                            ? '0.00'
                            : splitType === 'PERCENT'
                            ? '%'
                            : '1'
                        }
                        placeholderTextColor="#9CA3AF"
                        keyboardType="decimal-pad"
                        value={customValues[m.id] || ''}
                        onChangeText={(text) =>
                          setCustomValues({ ...customValues, [m.id]: text })
                        }
                      />
                      <Text style={styles.customInputSuffix}>
                        {splitType === 'PERCENT'
                          ? '%'
                          : splitType === 'SHARES'
                          ? 'sh'
                          : CURRENCY_SYMBOL}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {/* Submit Button */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.saveBtn}
            activeOpacity={0.85}
            onPress={handleSaveExpense}
          >
            <Ionicons name="checkmark" size={20} color="#FFFFFF" />
            <Text style={styles.saveBtnText}>Save Expense</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  section: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  pillScroll: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  groupPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  groupPillActive: {
    backgroundColor: '#1cc29f',
    borderColor: '#1cc29f',
  },
  groupPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  groupPillTextActive: {
    color: '#FFFFFF',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingVertical: 10,
    marginTop: 6,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    marginLeft: 10,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  currencySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  currencyCode: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  amountInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    marginLeft: 14,
  },
  categoryPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
  },
  categoryPillActive: {
    backgroundColor: '#374151',
  },
  categoryPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  categoryPillTextActive: {
    color: '#FFFFFF',
  },
  payerPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
  },
  payerPillActive: {
    backgroundColor: '#1cc29f',
  },
  payerPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
  },
  payerPillTextActive: {
    color: '#FFFFFF',
  },
  splitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  selectAllBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
  },
  selectAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1cc29f',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: '#FAFAFA',
    marginBottom: 12,
    gap: 6,
  },
  statusBannerText: {
    fontSize: 13,
    fontWeight: '700',
  },
  memberPreviewText: {
    fontSize: 12,
    color: '#1cc29f',
    fontWeight: '600',
    marginTop: 2,
  },
  splitTypeButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 14,
  },
  splitTypeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  splitTypeBtnActive: {
    backgroundColor: '#E8F8F5',
    borderColor: '#1cc29f',
  },
  splitTypeBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#4B5563',
  },
  splitTypeBtnTextActive: {
    color: '#1cc29f',
  },
  splitTypeSub: {
    fontSize: 10,
    fontWeight: '600',
    color: '#9CA3AF',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  splitTypeSubActive: {
    color: '#1cc29f',
  },
  splitMembersList: {
    marginTop: 6,
    gap: 10,
  },
  memberSplitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  memberSelectLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  memberSplitName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  customInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    width: 100,
  },
  customInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'right',
  },
  customInputSuffix: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 4,
  },
  buttonContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  saveBtn: {
    backgroundColor: '#1cc29f',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
