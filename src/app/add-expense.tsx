import React, { useState, useEffect, useCallback } from 'react';
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
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getAllMembers,
  getAllGroups,
  getCurrentUser,
  getGroupMembers,
  addExpense,
  updateExpense,
  getExpenses,
  getExpenseSplits,
  getDefaultGroupSplit,
  saveDefaultGroupSplit,
  getAllCategories,
  getAllTemplates,
  addExpenseTemplate,
  deleteExpenseTemplate,
} from '../db/queries';
import { Member, Group, CustomCategory, ExpenseTemplate } from '../db/types';
import { formatMoney, CURRENCY_SYMBOL, CURRENCY_CODE } from '../utils/currency';

export default function AddExpenseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ groupId?: string; expenseId?: string }>();

  const isEditing = !!params.expenseId;

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().substring(0, 10));
  const [category, setCategory] = useState('');
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

  // Categories & Templates
  const [categories, setCategories] = useState<CustomCategory[]>([]);
  const [templates, setTemplates] = useState<ExpenseTemplate[]>([]);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [templateTitle, setTemplateTitle] = useState('');

  // Dropdown Modals
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showPayerModal, setShowPayerModal] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);

  // Multi-Payer
  const [isMultiPayer, setIsMultiPayer] = useState(false);
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>({});

  const toggleSelectAll = () => {
    if (selectedMemberIds.length === members.length) {
      setSelectedMemberIds([]);
    } else {
      setSelectedMemberIds(members.map((m) => m.id));
    }
  };

  const parsedTotalAmount = parseFloat(amount) || 0;

  const calculateMultiPayerStatus = () => {
    if (!isMultiPayer) return { isValid: true, text: '', color: '#1cc29f' };
    const sum = Object.values(payerAmounts).reduce((acc, val) => acc + (parseFloat(val) || 0), 0);
    const diff = Math.round((parsedTotalAmount - sum) * 100) / 100;
    if (Math.abs(diff) < 0.01 && parsedTotalAmount > 0) {
      return { isValid: true, text: `✓ Total of ${formatMoney(sum)} matches bill`, color: '#1cc29f' };
    }
    if (diff > 0) {
      return { isValid: false, text: `${formatMoney(diff)} remaining to assign`, color: '#EF4444' };
    }
    return { isValid: false, text: `${formatMoney(Math.abs(diff))} over total amount`, color: '#EF4444' };
  };

  const multiPayerStatus = calculateMultiPayerStatus();

  const handleApplyTemplate = (tmpl: ExpenseTemplate) => {
    setDescription(tmpl.description);
    setAmount(String(tmpl.amount));
    setCategory(tmpl.category);
    setSplitType(tmpl.split_type);
    if (tmpl.group_id) setSelectedGroupId(tmpl.group_id);
    setShowTemplatesModal(false);
  };

  const handleSaveAsTemplate = () => {
    if (!description.trim() || parsedTotalAmount <= 0) {
      Alert.alert('Incomplete Form', 'Please enter a description and amount before saving as a template.');
      return;
    }
    setTemplateTitle(description.trim());
    setShowSaveTemplateModal(true);
  };

  const handleConfirmSaveTemplate = async () => {
    if (!templateTitle.trim()) {
      Alert.alert('Required', 'Please enter a template title.');
      return;
    }
    try {
      await addExpenseTemplate({
        title: templateTitle.trim(),
        description: description.trim(),
        amount: parsedTotalAmount,
        category,
        group_id: selectedGroupId,
        split_type: splitType,
      });
      const updatedTmpls = await getAllTemplates();
      setTemplates(updatedTmpls);
      setShowSaveTemplateModal(false);
      Alert.alert('Template Saved', `"${templateTitle.trim()}" saved for 1-tap entry!`);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save template');
    }
  };

  const handleDeleteTemplate = async (tmplId: string, tmplTitle: string) => {
    Alert.alert('Delete Template', `Remove template "${tmplTitle}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteExpenseTemplate(tmplId);
          const updatedTmpls = await getAllTemplates();
          setTemplates(updatedTmpls);
        },
      },
    ]);
  };

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

  const loadMembersForGroup = useCallback(async (grpId: string | null) => {
    let grpMems: Member[] = [];
    if (grpId) {
      grpMems = await getGroupMembers(grpId);
    } else {
      grpMems = await getAllMembers();
    }
    setMembers(grpMems);
    setSelectedMemberIds([]);

    // Ensure payerId is a valid member of this group
    const u = currentUser || (await getCurrentUser());
    if (u && grpMems.some((m) => m.id === u.id)) {
      setPayerId(u.id);
    } else if (grpMems.length > 0) {
      setPayerId(grpMems[0].id);
    }

    // Reset payer amounts for multi-payer
    const pMap: Record<string, string> = {};
    grpMems.forEach((m) => {
      pMap[m.id] = '';
    });
    setPayerAmounts(pMap);

    if (grpId) {
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
    }
  }, [currentUser]);

  useEffect(() => {
    async function init() {
      const allGrps = await getAllGroups();
      const u = await getCurrentUser();
      const allCats = await getAllCategories();
      const allTmpls = await getAllTemplates();

      setGroups(allGrps);
      setCurrentUser(u);
      setCategories(allCats);
      if (allCats.length > 0) {
        setCategory(allCats[0].name);
      } else {
        setCategory('');
      }
      setTemplates(allTmpls);

      // If editing existing expense, load its data
      if (params.expenseId) {
        const allExpenses = await getExpenses();
        const existing = allExpenses.find((e) => e.id === params.expenseId);
        if (existing) {
          setDescription(existing.description);
          setAmount(String(existing.amount));
          setDate(existing.date);
          setCategory(existing.category || (allCats.length > 0 ? allCats[0].name : ''));
          setSelectedGroupId(existing.group_id);
          setPayerId(existing.paid_by_member_id);
          setSplitType(existing.split_type);

          let expMems: Member[] = [];
          if (existing.group_id) {
            expMems = await getGroupMembers(existing.group_id);
          } else {
            expMems = await getAllMembers();
          }
          setMembers(expMems);

          if (existing.payers_json) {
            try {
              const payers: { member_id: string; amount: number }[] = JSON.parse(existing.payers_json);
              setIsMultiPayer(true);
              const pMap: Record<string, string> = {};
              payers.forEach((p) => {
                pMap[p.member_id] = String(p.amount);
              });
              setPayerAmounts(pMap);
            } catch (e) {
              console.error(e);
            }
          }

          const splits = await getExpenseSplits(existing.id);
          setSelectedMemberIds(splits.map((s) => s.member_id));

          const vals: Record<string, string> = {};
          splits.forEach((s) => {
            if (existing.split_type === 'EXACT') vals[s.member_id] = String(s.amount);
            else if (existing.split_type === 'PERCENT') vals[s.member_id] = String(s.percentage || '');
            else if (existing.split_type === 'SHARES') vals[s.member_id] = String(s.shares || '1');
          });
          setCustomValues(vals);
          return;
        }
      }

      // If groupId provided, filter to group members
      if (params.groupId) {
        setSelectedGroupId(params.groupId);
        await loadMembersForGroup(params.groupId);
      } else {
        setSelectedGroupId(null);
        await loadMembersForGroup(null);
      }
    }
    init();
  }, [params.groupId, params.expenseId, loadMembersForGroup]);

  const toggleMemberSelection = (mId: string) => {
    if (selectedMemberIds.includes(mId)) {
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

    if (isMultiPayer) {
      if (!multiPayerStatus.isValid) {
        Alert.alert('Multi-Payer Error', multiPayerStatus.text || 'Assigned payments must match total bill amount.');
        return;
      }
    }

    let payersJson: string | undefined = undefined;
    if (isMultiPayer) {
      const payersList = Object.entries(payerAmounts)
        .map(([mId, amt]) => ({ member_id: mId, amount: parseFloat(amt) || 0 }))
        .filter((p) => p.amount > 0);
      payersJson = JSON.stringify(payersList);
    }

    try {
      if (isEditing && params.expenseId) {
        await updateExpense({
          id: params.expenseId,
          groupId: selectedGroupId,
          description: description.trim(),
          amount: parsedAmount,
          currency: CURRENCY_CODE,
          date: date.trim() || new Date().toISOString().substring(0, 10),
          category,
          paidByMemberId: payerId || currentUser?.id || '',
          splitType,
          payersJson,
          splits,
        });
      } else {
        await addExpense({
          groupId: selectedGroupId,
          description: description.trim(),
          amount: parsedAmount,
          currency: CURRENCY_CODE,
          date: date.trim() || new Date().toISOString().substring(0, 10),
          category,
          paidByMemberId: payerId || currentUser?.id || '',
          splitType,
          payersJson,
          splits,
        });
      }

      // If user is in group and wants to save this as default split rule (Pro feature)
      if (selectedGroupId && (splitType === 'PERCENT' || splitType === 'SHARES')) {
        await saveDefaultGroupSplit(selectedGroupId, splitType, JSON.stringify(customValues));
      }

      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save expense');
    }
  };

  const currentPayer = members.find((m) => m.id === payerId) || currentUser;
  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView style={styles.container}>
        {/* 1. Group or Friends Selection */}
        <View style={styles.section}>
          {/* Template Actions Row - ONLY visible if templates exist OR user can save current form as template */}
          {(templates.length > 0 || (description.trim().length > 0 && parsedTotalAmount > 0 && !isEditing)) && (
            <View style={styles.topActionRow}>
              {templates.length > 0 && (
                <TouchableOpacity
                  style={styles.templateShortcutBtn}
                  onPress={() => setShowTemplatesModal(true)}
                >
                  <Ionicons name="flash-outline" size={15} color="#1cc29f" />
                  <Text style={styles.templateShortcutText}>
                    Templates ({templates.length})
                  </Text>
                </TouchableOpacity>
              )}

              {description.trim().length > 0 && parsedTotalAmount > 0 && !isEditing && (
                <TouchableOpacity
                  style={styles.saveTemplateBtn}
                  onPress={handleSaveAsTemplate}
                >
                  <Ionicons name="bookmark-outline" size={15} color="#3B82F6" />
                  <Text style={styles.saveTemplateText}>Save as Template</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <Text style={styles.label}>Group or Friends</Text>
          <TouchableOpacity
            style={styles.dropdownBtn}
            onPress={() => setShowGroupModal(true)}
            activeOpacity={0.8}
          >
            <View style={styles.dropdownLeft}>
              <View style={styles.iconCircleSmall}>
                <Ionicons
                  name={selectedGroup ? 'folder-outline' : 'people-outline'}
                  size={18}
                  color="#1cc29f"
                />
              </View>
              <View style={{ marginLeft: 10 }}>
                <Text style={styles.dropdownLabelText}>With you and</Text>
                <Text style={styles.dropdownValueText}>
                  {selectedGroup ? selectedGroup.name : 'No Group (Friends)'}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-down" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* 2. Split Options & Split with People (Immediately after group menu) */}
        <View style={styles.section}>
          <View style={styles.splitHeader}>
            <Text style={styles.label}>Split Options</Text>
            <TouchableOpacity onPress={() => setShowSplitModal(true)} style={styles.selectAllBtn}>
              <Text style={styles.selectAllText}>
                {selectedMemberIds.length === 0 ? 'Select people' : 'Edit people'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Split Type Tabs */}
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
                    splitType === t && styles.splitTypeBtnActive,
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

          {/* Split with (People) Dropdown */}
          <TouchableOpacity
            style={styles.dropdownBtn}
            onPress={() => setShowSplitModal(true)}
            activeOpacity={0.8}
          >
            <View style={styles.dropdownLeft}>
              <View style={styles.iconCircleSmall}>
                <Ionicons name="people" size={18} color="#1cc29f" />
              </View>
              <View style={{ marginLeft: 10 }}>
                <Text style={styles.dropdownLabelText}>Split with (People)</Text>
                <Text style={styles.dropdownValueText}>
                  {selectedMemberIds.length === 0
                    ? 'Select people (None selected)'
                    : selectedMemberIds.length === members.length
                    ? `Everyone (${members.length} people)`
                    : `${selectedMemberIds.length} of ${members.length} people selected`}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-down" size={20} color="#6B7280" />
          </TouchableOpacity>

          {/* Real-time Status Banner */}
          {parsedTotalAmount > 0 && selectedMemberIds.length > 0 && (
            <View style={[styles.statusBanner, { borderColor: splitStatus.statusColor, marginTop: 12 }]}>
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

          {/* Members Split Breakdown: only selected members appear afterwards */}
          <View style={styles.splitMembersList}>
            {members
              .filter((m) => selectedMemberIds.includes(m.id))
              .map((m) => {
                let previewText = '';
                if (parsedTotalAmount > 0) {
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
                  <View key={m.id} style={styles.memberSplitCard}>
                    <View style={styles.memberSplitLeft}>
                      <View
                        style={[
                          styles.memberAvatarDot,
                          { backgroundColor: m.avatar_color || '#1cc29f' },
                        ]}
                      >
                        <Text style={styles.memberAvatarText}>
                          {m.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ marginLeft: 10 }}>
                        <Text style={styles.memberSplitName}>
                          {m.is_user === 1 ? 'You' : m.name}
                        </Text>
                        {previewText !== '' && (
                          <Text style={styles.memberPreviewText}>owes {previewText}</Text>
                        )}
                      </View>
                    </View>

                    <View style={styles.memberSplitRight}>
                      {/* Input for custom splits */}
                      {splitType !== 'EQUAL' && (
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

                      {/* Remove Button */}
                      <TouchableOpacity
                        style={styles.removeMemberBtn}
                        onPress={() => toggleMemberSelection(m.id)}
                      >
                        <Ionicons name="close-circle-outline" size={22} color="#9CA3AF" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}

            {selectedMemberIds.length === 0 && (
              <TouchableOpacity
                style={styles.emptySelectedBox}
                onPress={() => setShowSplitModal(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="person-add-outline" size={28} color="#1cc29f" />
                <Text style={styles.emptySelectedText}>
                  No one selected yet. Tap here or &apos;Split with&apos; above to select who is splitting this expense.
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* 3. Expense Details: Description, Amount, Date */}
        <View style={styles.section}>
          <Text style={styles.label}>Expense Details</Text>
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

          {/* Date Selector Row */}
          <View style={styles.dateInputRow}>
            <Ionicons name="calendar-outline" size={18} color="#6B7280" />
            <Text style={styles.dateLabel}>Date:</Text>
            <TextInput
              style={styles.dateInput}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9CA3AF"
              value={date}
              onChangeText={setDate}
            />
            <TouchableOpacity
              style={styles.todayBtn}
              onPress={() => setDate(new Date().toISOString().substring(0, 10))}
            >
              <Text style={styles.todayBtnText}>Today</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Category Picker - only visible when categories exist */}
        {categories.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.label}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.name}
                  style={[
                    styles.categoryPill,
                    category === cat.name && {
                      backgroundColor: cat.color || '#1cc29f',
                      borderColor: cat.color || '#1cc29f',
                    },
                  ]}
                  onPress={() => setCategory(cat.name)}
                >
                  <View style={styles.catPillInner}>
                    <View
                      style={[
                        styles.catColorDotSmall,
                        { backgroundColor: category === cat.name ? '#FFFFFF' : cat.color },
                      ]}
                    />
                    <Text
                      style={[
                        styles.categoryPillText,
                        category === cat.name && styles.categoryPillTextActive,
                      ]}
                    >
                      {cat.name}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Paid by selector */}
        <View style={styles.section}>
          <View style={styles.splitHeader}>
            <Text style={styles.label}>Paid by</Text>
            <TouchableOpacity
              style={[styles.multiPayerToggleBtn, isMultiPayer && styles.multiPayerToggleBtnActive]}
              onPress={() => setIsMultiPayer(!isMultiPayer)}
            >
              <Ionicons
                name={isMultiPayer ? 'people' : 'person-outline'}
                size={14}
                color={isMultiPayer ? '#FFFFFF' : '#1cc29f'}
              />
              <Text
                style={[
                  styles.multiPayerToggleText,
                  isMultiPayer && styles.multiPayerToggleTextActive,
                ]}
              >
                {isMultiPayer ? 'Multiple People Paid' : 'Multiple Payers?'}
              </Text>
            </TouchableOpacity>
          </View>

          {!isMultiPayer ? (
            <TouchableOpacity
              style={styles.dropdownBtn}
              onPress={() => setShowPayerModal(true)}
              activeOpacity={0.8}
            >
              <View style={styles.dropdownLeft}>
                <View
                  style={[
                    styles.avatarDot,
                    { backgroundColor: currentPayer?.avatar_color || '#1cc29f' },
                  ]}
                >
                  <Text style={styles.avatarDotText}>
                    {(currentPayer?.name || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ marginLeft: 10 }}>
                  <Text style={styles.dropdownLabelText}>Paid by</Text>
                  <Text style={styles.dropdownValueText}>
                    {currentPayer?.is_user === 1 ? 'You' : currentPayer?.name || 'Select payer'}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-down" size={20} color="#6B7280" />
            </TouchableOpacity>
          ) : (
            <View style={styles.multiPayerBox}>
              <Text style={styles.multiPayerSubtitle}>
                Enter each person&apos;s contribution towards the total bill:
              </Text>
              {members.map((m) => (
                <View key={m.id} style={styles.multiPayerRow}>
                  <Text style={styles.multiPayerMemberName}>
                    {m.is_user === 1 ? 'You' : m.name}
                  </Text>
                  <View style={styles.multiPayerInputWrap}>
                    <Text style={styles.multiPayerCurrency}>{CURRENCY_SYMBOL}</Text>
                    <TextInput
                      style={styles.multiPayerInput}
                      placeholder="0.00"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="decimal-pad"
                      value={payerAmounts[m.id] || ''}
                      onChangeText={(val) =>
                        setPayerAmounts((prev) => ({ ...prev, [m.id]: val }))
                      }
                    />
                  </View>
                </View>
              ))}
              <View style={styles.multiPayerStatusBox}>
                <Text style={[styles.multiPayerStatusText, { color: multiPayerStatus.color }]}>
                  {multiPayerStatus.text}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Submit Button */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.saveBtn}
            activeOpacity={0.85}
            onPress={handleSaveExpense}
          >
            <Ionicons name="checkmark" size={20} color="#FFFFFF" />
            <Text style={styles.saveBtnText}>{isEditing ? 'Update Expense' : 'Save Expense'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Templates List Modal */}
      <Modal visible={showTemplatesModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardLarge}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Expense Templates</Text>
              <TouchableOpacity onPress={() => setShowTemplatesModal(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Tap any template to instantly prefill this expense.
            </Text>

            {templates.length > 0 ? (
              <ScrollView style={{ maxHeight: 300, marginBottom: 12 }}>
                {templates.map((tmpl) => (
                  <View key={tmpl.id} style={styles.templateRow}>
                    <TouchableOpacity
                      style={styles.templateRowInfo}
                      onPress={() => handleApplyTemplate(tmpl)}
                    >
                      <Text style={styles.templateRowTitle}>{tmpl.title}</Text>
                      <Text style={styles.templateRowDesc}>
                        {tmpl.description} • {tmpl.category}
                      </Text>
                      <Text style={styles.templateRowAmount}>
                        {formatMoney(tmpl.amount)} ({tmpl.split_type})
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.deleteTemplateBtn}
                      onPress={() => handleDeleteTemplate(tmpl.id, tmpl.title)}
                    >
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.emptyTemplatesBox}>
                <Ionicons name="flash-outline" size={40} color="#D1D5DB" />
                <Text style={styles.emptyTemplatesText}>
                  No saved templates yet. Fill out an expense and tap &quot;Save as Template&quot; to reuse it!
                </Text>
              </View>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowTemplatesModal(false)}
              >
                <Text style={styles.modalCancelBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Save Template Modal */}
      <Modal visible={showSaveTemplateModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Save as Template</Text>
            <Text style={styles.modalSubtitle}>
              Give this template a name for quick 1-tap entry in the future.
            </Text>

            <Text style={styles.modalLabel}>Template Name</Text>
            <TextInput
              style={styles.modalInput}
              value={templateTitle}
              onChangeText={setTemplateTitle}
              placeholder="e.g. WiFi Bill, Apartment Rent, Maid"
              placeholderTextColor="#9CA3AF"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowSaveTemplateModal(false)}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleConfirmSaveTemplate}
              >
                <Text style={styles.modalSaveBtnText}>Save Template</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Payer Selection Dropdown Modal */}
      <Modal visible={showPayerModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardLarge}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Who Paid?</Text>
              <TouchableOpacity onPress={() => setShowPayerModal(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Select who covered this bill.
            </Text>

            <ScrollView style={{ maxHeight: 350 }}>
              {members.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={styles.modalMemberRow}
                  onPress={() => {
                    setPayerId(m.id);
                    setShowPayerModal(false);
                  }}
                >
                  <View style={styles.modalMemberLeft}>
                    <View
                      style={[
                        styles.avatarDot,
                        { backgroundColor: m.avatar_color || '#1cc29f' },
                      ]}
                    >
                      <Text style={styles.avatarDotText}>
                        {m.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.modalMemberName}>
                      {m.is_user === 1 ? 'You' : m.name}
                    </Text>
                  </View>
                  {payerId === m.id && (
                    <Ionicons name="checkmark-circle" size={22} color="#1cc29f" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Split With Multi-Select Dropdown Modal */}
      <Modal visible={showSplitModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardLarge}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Split With</Text>
              <TouchableOpacity onPress={toggleSelectAll} style={styles.selectAllBtn}>
                <Text style={styles.selectAllText}>
                  {selectedMemberIds.length === members.length ? 'Deselect all' : 'Select all'}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Select everyone who should share this bill.
            </Text>

            <ScrollView style={{ maxHeight: 350 }}>
              {members.map((m) => {
                const isSelected = selectedMemberIds.includes(m.id);
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={styles.modalMemberRow}
                    onPress={() => toggleMemberSelection(m.id)}
                  >
                    <View style={styles.modalMemberLeft}>
                      <Ionicons
                        name={isSelected ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={isSelected ? '#1cc29f' : '#9CA3AF'}
                      />
                      <View
                        style={[
                          styles.avatarDot,
                          { backgroundColor: m.avatar_color || '#1cc29f' },
                        ]}
                      >
                        <Text style={styles.avatarDotText}>
                          {m.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <Text style={styles.modalMemberName}>
                        {m.is_user === 1 ? 'You' : m.name}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={{ marginTop: 16 }}>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={() => setShowSplitModal(false)}
              >
                <Text style={styles.saveBtnText}>
                  Done ({selectedMemberIds.length} selected)
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Group Selection Dropdown Modal */}
      <Modal visible={showGroupModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardLarge}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Select Group or Friends</Text>
              <TouchableOpacity onPress={() => setShowGroupModal(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Select where this expense belongs.
            </Text>

            <ScrollView style={{ maxHeight: 350 }}>
              {/* Option: Non-group (Friends) */}
              <TouchableOpacity
                style={styles.modalMemberRow}
                onPress={() => {
                  setSelectedGroupId(null);
                  loadMembersForGroup(null);
                  setShowGroupModal(false);
                }}
              >
                <View style={styles.modalMemberLeft}>
                  <View style={[styles.avatarDot, { backgroundColor: '#6B7280' }]}>
                    <Ionicons name="people" size={16} color="#FFFFFF" />
                  </View>
                  <View>
                    <Text style={styles.modalMemberName}>No Group (Friends)</Text>
                    <Text style={{ fontSize: 12, color: '#6B7280' }}>
                      Split between individual friends
                    </Text>
                  </View>
                </View>
                {!selectedGroupId && (
                  <Ionicons name="checkmark-circle" size={22} color="#1cc29f" />
                )}
              </TouchableOpacity>

              {/* Group Options */}
              {groups.map((g) => (
                <TouchableOpacity
                  key={g.id}
                  style={styles.modalMemberRow}
                  onPress={() => {
                    setSelectedGroupId(g.id);
                    loadMembersForGroup(g.id);
                    setShowGroupModal(false);
                  }}
                >
                  <View style={styles.modalMemberLeft}>
                    <View style={[styles.avatarDot, { backgroundColor: '#1cc29f' }]}>
                      <Ionicons name="folder" size={16} color="#FFFFFF" />
                    </View>
                    <View>
                      <Text style={styles.modalMemberName}>{g.name}</Text>
                      <Text style={{ fontSize: 12, color: '#6B7280' }}>
                        {g.type}
                      </Text>
                    </View>
                  </View>
                  {selectedGroupId === g.id && (
                    <Ionicons name="checkmark-circle" size={22} color="#1cc29f" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  dateInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  dateLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  dateInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    fontWeight: '700',
  },
  todayBtn: {
    backgroundColor: '#E8F8F5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  todayBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1cc29f',
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
  topActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  templateShortcutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E8F8F5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  templateShortcutText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1cc29f',
  },
  saveTemplateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  saveTemplateText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3B82F6',
  },
  catPillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  catColorDotSmall: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  multiPayerToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E8F8F5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  multiPayerToggleBtnActive: {
    backgroundColor: '#1cc29f',
  },
  multiPayerToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1cc29f',
  },
  multiPayerToggleTextActive: {
    color: '#FFFFFF',
  },
  multiPayerBox: {
    marginTop: 8,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  multiPayerSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 10,
  },
  multiPayerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  multiPayerMemberName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  multiPayerInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    paddingHorizontal: 8,
    width: 120,
  },
  multiPayerCurrency: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
    marginRight: 4,
  },
  multiPayerInput: {
    flex: 1,
    height: 36,
    fontSize: 14,
    color: '#111827',
    textAlign: 'right',
  },
  multiPayerStatusBox: {
    marginTop: 6,
    padding: 6,
    borderRadius: 6,
    alignItems: 'center',
  },
  multiPayerStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
  },
  modalCardLarge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
    marginBottom: 14,
  },
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  templateRowInfo: {
    flex: 1,
  },
  templateRowTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  templateRowDesc: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  templateRowAmount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1cc29f',
    marginTop: 2,
  },
  deleteTemplateBtn: {
    padding: 6,
    marginLeft: 8,
  },
  emptyTemplatesBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
  },
  emptyTemplatesText: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
    paddingHorizontal: 20,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#111827',
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  modalCancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  modalSaveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#1cc29f',
  },
  modalSaveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
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
    paddingVertical: 12,
    marginTop: 6,
  },
  dropdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarDotText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  iconCircleSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E8F8F5',
    alignItems: 'center',
    justifyContent: 'center',
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
  memberSplitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  memberSplitLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  memberAvatarDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  memberSplitRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  removeMemberBtn: {
    padding: 4,
  },
  emptySelectedBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D1D5DB',
  },
  emptySelectedText: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    paddingHorizontal: 20,
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
});
