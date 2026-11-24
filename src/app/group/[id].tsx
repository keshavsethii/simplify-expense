import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Switch,
  RefreshControl,
  ScrollView,
  Modal,
  Alert,
  TextInput,
  Platform,
  Share,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect, Stack } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  getGroupById,
  getGroupMembers,
  getGroupBalances,
  getExpenses,
  updateGroupSimplifyDebts,
  deleteGroup,
  getAllMembers,
  addMemberToGroup,
} from '../../db/queries';
import { Group, Member, Expense, SimplifiedDebt } from '../../db/types';
import { simplifyDebts } from '../../utils/simplifyDebts';
import { formatMoney } from '../../utils/currency';

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [balances, setBalances] = useState<{ member: Member; netBalance: number }[]>([]);
  const [simplifiedDebtsList, setSimplifiedDebtsList] = useState<SimplifiedDebt[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'expenses' | 'balances' | 'totals'>('expenses');
  const [allAvailableFriends, setAllAvailableFriends] = useState<Member[]>([]);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  // Export & Share
  const [showExportModal, setShowExportModal] = useState(false);
  const [showTextPreviewModal, setShowTextPreviewModal] = useState(false);
  const [previewSummaryText, setPreviewSummaryText] = useState('');

  const generateGroupCsv = (grp: Group, exps: Expense[], mems: Member[]): string => {
    const memberMap = new Map(mems.map((m) => [m.id, m.is_user ? 'You' : m.name]));
    const rows = [
      ['Date', 'Description', 'Category', 'Amount (INR)', 'Paid By', 'Split Type']
    ];
    exps.forEach((e) => {
      const payerName = memberMap.get(e.paid_by_member_id) || 'Unknown';
      const cleanDesc = `"${(e.description || '').replace(/"/g, '""')}"`;
      const cleanCat = `"${(e.category || 'General').replace(/"/g, '""')}"`;
      rows.push([e.date, cleanDesc, cleanCat, String(e.amount), `"${payerName}"`, e.split_type]);
    });
    return rows.map((r) => r.join(',')).join('\n');
  };

  const generateGroupTextSummary = (
    grp: Group,
    exps: Expense[],
    mems: Member[],
    debts: SimplifiedDebt[],
    bals: { member: Member; netBalance: number }[]
  ): string => {
    const memberMap = new Map(mems.map((m) => [m.id, m.is_user ? 'You' : m.name]));
    const totalSpend = exps.reduce((sum, e) => sum + e.amount, 0);

    let text = `📊 Simplify Expense: ${grp.name}\n`;
    text += `Total Expenses: ${formatMoney(totalSpend, grp.currency)} (${exps.length} expenses)\n\n`;

    if (debts.length > 0) {
      text += `🤝 Final Settlement Plan:\n`;
      debts.forEach((d) => {
        const fromName = d.fromMember.is_user ? 'You' : d.fromMember.name;
        const toName = d.toMember.is_user ? 'You' : d.toMember.name;
        text += `• ${fromName} pays ${toName} ${formatMoney(d.amount, d.currency)}\n`;
      });
      text += `\n`;
    } else {
      text += `🤝 All balances are settled up!\n\n`;
    }

    text += `📋 Member Balances:\n`;
    bals.forEach((b) => {
      const name = b.member.is_user ? 'You' : b.member.name;
      if (Math.abs(b.netBalance) < 0.01) {
        text += `• ${name}: Settled\n`;
      } else if (b.netBalance > 0) {
        text += `• ${name}: Gets back ${formatMoney(b.netBalance, grp.currency)}\n`;
      } else {
        text += `• ${name}: Owes ${formatMoney(Math.abs(b.netBalance), grp.currency)}\n`;
      }
    });

    if (exps.length > 0) {
      text += `\n📝 Recent Expenses:\n`;
      exps.slice(0, 10).forEach((e) => {
        const payer = memberMap.get(e.paid_by_member_id) || 'Unknown';
        text += `• ${e.date}: ${e.description} - ${formatMoney(e.amount, e.currency)} (${payer})\n`;
      });
      if (exps.length > 10) {
        text += `... and ${exps.length - 10} more expenses.\n`;
      }
    }

    return text;
  };

  const handleExportCsv = async () => {
    if (!group) return;
    const csvContent = generateGroupCsv(group, expenses, members);
    const safeTitle = group.name.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${safeTitle}_expenses_${new Date().toISOString().slice(0, 10)}.csv`;

    if (Platform.OS === 'web') {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      Alert.alert('CSV Downloaded', `Saved ${filename} to your device.`);
    } else {
      try {
        const fileUri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'text/csv',
            dialogTitle: `Export ${group.name} Expenses CSV`,
            UTI: 'public.comma-separated-values-text',
          });
        } else {
          Alert.alert('Sharing Unavailable', 'Unable to open share sheet on this device.');
        }
      } catch (e: any) {
        Alert.alert('Export Error', e?.message || 'Could not export CSV.');
      }
    }
  };

  const handleShareTextSummary = async () => {
    if (!group) return;
    const summary = generateGroupTextSummary(group, expenses, members, simplifiedDebtsList, balances);
    try {
      await Share.share({
        title: `${group.name} Expense Summary`,
        message: summary,
      });
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to share summary');
    }
  };

  const loadGroupDetails = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const grp = await getGroupById(id);
      if (!grp) return;
      setGroup(grp);

      const mems = await getGroupMembers(id);
      setMembers(mems);

      const all = await getAllMembers();
      const currentIds = new Set(mems.map((m) => m.id));
      setAllAvailableFriends(all.filter((m) => !currentIds.has(m.id)));

      const bals = await getGroupBalances(id);
      setBalances(bals);

      const exps = await getExpenses(id);
      setExpenses(exps);

      // Compute simplified debts
      const netBalancesMap: Record<string, number> = {};
      bals.forEach((b) => {
        netBalancesMap[b.member.id] = b.netBalance;
      });
      const simplified = simplifyDebts(mems, netBalancesMap, grp.currency);
      setSimplifiedDebtsList(simplified);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadGroupDetails();
    }, [id])
  );

  const handleAddMember = async (memberId: string) => {
    if (!group) return;
    try {
      await addMemberToGroup(group.id, memberId);
      setShowAddMemberModal(false);
      loadGroupDetails();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to add member to group');
    }
  };

  const toggleSimplifyDebts = async (val: boolean) => {
    if (!group) return;
    await updateGroupSimplifyDebts(group.id, val);
    setGroup({ ...group, simplify_debts: val ? 1 : 0 });
  };

  const handleDeleteGroup = () => {
    Alert.alert(
      'Delete Group',
      `Are you sure you want to delete "${group?.name}"? All associated expenses and balances will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (group?.id) {
              await deleteGroup(group.id);
              router.back();
            }
          },
        },
      ]
    );
  };

  const groupCategories = [
    'ALL',
    ...Array.from(
      new Set([
        'General',
        'Food',
        'Groceries',
        'Travel',
        'Utilities',
        'Entertainment',
        ...expenses.map((e) => e.category || 'General'),
      ])
    ),
  ];

  const filteredExpenses = expenses.filter((e) => {
    const matchesSearch = e.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === 'ALL' ||
      (e.category || 'General').toLowerCase() === selectedCategory.toLowerCase();
    return matchesSearch && matchesCategory;
  });

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: group?.name || 'Group',
          headerRight: () => (
            <View style={styles.headerRightRow}>
              <TouchableOpacity
                onPress={() => setShowExportModal(true)}
                style={styles.headerActionBtn}
              >
                <Ionicons name="share-social-outline" size={20} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDeleteGroup}
                style={styles.headerActionBtn}
              >
                <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      {/* Header Info */}
      <View style={styles.headerCard}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.groupTitle}>{group?.name}</Text>
            <View style={styles.subTitleRow}>
              <Text style={styles.groupSub}>
                {members.length} members
              </Text>
              <TouchableOpacity
                style={styles.addMemberBadge}
                onPress={() => setShowAddMemberModal(true)}
              >
                <Ionicons name="person-add" size={12} color="#1cc29f" />
                <Text style={styles.addMemberBadgeText}>+ Add</Text>
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity
            style={styles.settleBtn}
            onPress={() => {
              router.push({
                pathname: '/settle-up',
                params: { groupId: group?.id },
              });
            }}
          >
            <Text style={styles.settleBtnText}>Settle up</Text>
          </TouchableOpacity>
        </View>

        {/* Simplify debts toggle */}
        <View style={styles.simplifyRow}>
          <View style={styles.simplifyInfo}>
            <View style={styles.proRow}>
              <Text style={styles.simplifyTitle}>Simplify Group Debts</Text>
            </View>
            <Text style={styles.simplifySub}>
              Combines debts to reduce the total number of payments needed.
            </Text>
          </View>
          <Switch
            value={group?.simplify_debts === 1}
            onValueChange={toggleSimplifyDebts}
            trackColor={{ false: '#D1D5DB', true: '#A7F3D0' }}
            thumbColor={group?.simplify_debts === 1 ? '#1cc29f' : '#F3F4F6'}
          />
        </View>

        {/* Inner Tabs */}
        <View style={styles.innerTabs}>
          <TouchableOpacity
            style={[styles.innerTab, activeTab === 'expenses' && styles.innerTabActive]}
            onPress={() => setActiveTab('expenses')}
          >
            <Text
              style={[styles.innerTabText, activeTab === 'expenses' && styles.innerTabTextActive]}
            >
              Expenses
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.innerTab, activeTab === 'balances' && styles.innerTabActive]}
            onPress={() => setActiveTab('balances')}
          >
            <Text
              style={[styles.innerTabText, activeTab === 'balances' && styles.innerTabTextActive]}
            >
              Balances
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.innerTab, activeTab === 'totals' && styles.innerTabActive]}
            onPress={() => setActiveTab('totals')}
          >
            <Text
              style={[styles.innerTabText, activeTab === 'totals' && styles.innerTabTextActive]}
            >
              Simplified Plan
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tab Content */}
      {activeTab === 'expenses' && (
        <View style={{ flex: 1 }}>
          {/* Search Bar & Category Filter */}
          <View style={styles.filterSection}>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color="#9CA3AF" />
              <TextInput
                placeholder="Search expenses in this group..."
                placeholderTextColor="#9CA3AF"
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryChipsRow}
            >
              {groupCategories.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryChip,
                    selectedCategory === cat && styles.categoryChipActive,
                  ]}
                  onPress={() => setSelectedCategory(cat)}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      selectedCategory === cat && styles.categoryChipTextActive,
                    ]}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <FlatList
            data={filteredExpenses}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={loadGroupDetails}
                colors={['#1cc29f']}
              />
            }
            contentContainerStyle={styles.listPadding}
            renderItem={({ item }) => {
              const payer = members.find((m) => m.id === item.paid_by_member_id);
              return (
                <TouchableOpacity
                  style={styles.expenseCard}
                  activeOpacity={0.7}
                  onPress={() => router.push(`/expense-detail/${item.id}`)}
                >
                  <View style={styles.dateBox}>
                    <Text style={styles.dateMonth}>
                      {new Date(item.date).toLocaleDateString('en-US', { month: 'short' })}
                    </Text>
                    <Text style={styles.dateDay}>
                      {new Date(item.date).toLocaleDateString('en-US', { day: 'numeric' })}
                    </Text>
                  </View>

                  <View style={styles.expenseInfo}>
                    <Text style={styles.expenseDesc}>{item.description}</Text>
                    <Text style={styles.expensePayer}>
                      {payer?.is_user === 1 ? 'You' : payer?.name} paid{' '}
                      {formatMoney(item.amount, item.currency)}
                    </Text>
                  </View>

                  <View style={styles.expenseSplitType}>
                    <Text style={styles.splitTypeBadge}>{item.split_type}</Text>
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <MaterialCommunityIcons name="receipt-text-outline" size={54} color="#D1D5DB" />
                <Text style={styles.emptyTitle}>
                  {searchQuery || selectedCategory !== 'ALL'
                    ? 'No matching expenses'
                    : 'No expenses yet'}
                </Text>
                <Text style={styles.emptySub}>
                  {searchQuery || selectedCategory !== 'ALL'
                    ? 'Try clearing your search or category filter.'
                    : "Tap '+ Add Expense' below to add your first expense!"}
                </Text>
              </View>
            }
          />
        </View>
      )}

      {activeTab === 'balances' && (
        <FlatList
          data={balances}
          keyExtractor={(item) => item.member.id}
          contentContainerStyle={styles.listPadding}
          renderItem={({ item }) => {
            const isSettled = Math.abs(item.netBalance) < 0.01;
            const isPositive = item.netBalance > 0;
            return (
              <View style={styles.balanceRow}>
                <View style={[styles.memberAvatar, { backgroundColor: item.member.avatar_color || '#1cc29f' }]}>
                  <Text style={styles.memberAvatarText}>
                    {item.member.name.charAt(0).toUpperCase()}
                  </Text>
                </View>

                <View style={styles.memberDetails}>
                  <Text style={styles.memberName}>
                    {item.member.is_user === 1 ? 'You' : item.member.name}
                  </Text>
                  <Text style={styles.memberStatus}>
                    {isSettled
                      ? 'settled up'
                      : isPositive
                      ? 'gets back'
                      : 'owes'}
                  </Text>
                </View>

                <Text
                  style={[
                    styles.balanceAmountText,
                    isSettled
                      ? styles.textNeutral
                      : isPositive
                      ? styles.textPositive
                      : styles.textNegative,
                  ]}
                >
                  {isSettled
                    ? 'settled'
                    : formatMoney(Math.abs(item.netBalance), group?.currency)}
                </Text>
              </View>
            );
          }}
        />
      )}

      {activeTab === 'totals' && (
        <ScrollView style={styles.totalsContainer}>
          <View style={styles.simplifiedCard}>
            <View style={styles.simplifiedHeader}>
              <Ionicons name="sparkles" size={20} color="#1cc29f" />
              <Text style={styles.simplifiedHeaderText}>Debt Minimization Plan</Text>
            </View>
            <Text style={styles.simplifiedDesc}>
              Using the graph-based simplification algorithm, this shows the fewest payments needed
              for everyone in this group to be completely square.
            </Text>

            {simplifiedDebtsList.length > 0 ? (
              <View style={styles.transList}>
                {simplifiedDebtsList.map((debt, index) => (
                  <View key={index} style={styles.transCard}>
                    <View style={styles.transRow}>
                      <Text style={styles.transPayer}>
                        {debt.fromMember.is_user === 1 ? 'You' : debt.fromMember.name}
                      </Text>
                      <View style={styles.transArrow}>
                        <Text style={styles.arrowLabel}>pays</Text>
                        <Ionicons name="arrow-forward" size={16} color="#9CA3AF" />
                      </View>
                      <Text style={styles.transReceiver}>
                        {debt.toMember.is_user === 1 ? 'You' : debt.toMember.name}
                      </Text>
                      <Text style={styles.transAmount}>
                        {formatMoney(debt.amount, debt.currency)}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={styles.transSettleBtn}
                      activeOpacity={0.8}
                      onPress={() => {
                        router.push({
                          pathname: '/settle-up',
                          params: {
                            groupId: group?.id,
                            fromMemberId: debt.fromMember.id,
                            toMemberId: debt.toMember.id,
                            amount: String(debt.amount),
                          },
                        });
                      }}
                    >
                      <Ionicons name="checkmark-done" size={14} color="#1cc29f" />
                      <Text style={styles.transSettleBtnText}>Settle this payment</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.allSettledBox}>
                <Ionicons name="checkmark-circle" size={44} color="#1cc29f" />
                <Text style={styles.allSettledText}>All group debts are completely settled!</Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* Floating Add Expense Button */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => {
          router.push({
            pathname: '/add-expense',
            params: { groupId: group?.id },
          });
        }}
      >
        <Ionicons name="add" size={26} color="#FFFFFF" />
        <Text style={styles.fabText}>Add expense</Text>
      </TouchableOpacity>

      {/* Add Member Modal */}
      <Modal visible={showAddMemberModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Add Member to {group?.name}</Text>
              <TouchableOpacity onPress={() => setShowAddMemberModal(false)}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {allAvailableFriends.length > 0 ? (
              <FlatList
                data={allAvailableFriends}
                keyExtractor={(item) => item.id}
                style={{ maxHeight: 280 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.availableFriendRow}
                    onPress={() => handleAddMember(item.id)}
                  >
                    <View
                      style={[
                        styles.availableFriendAvatar,
                        { backgroundColor: item.avatar_color || '#1cc29f' },
                      ]}
                    >
                      <Text style={styles.availableFriendAvatarText}>
                        {item.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.availableFriendName}>{item.name}</Text>
                    <Ionicons name="add-circle" size={22} color="#1cc29f" />
                  </TouchableOpacity>
                )}
              />
            ) : (
              <View style={styles.noFriendsContainer}>
                <Text style={styles.noFriendsText}>
                  All your added friends are already part of this group!
                </Text>
                <TouchableOpacity
                  style={styles.createNewFriendBtn}
                  onPress={() => {
                    setShowAddMemberModal(false);
                    router.push('/add-friend');
                  }}
                >
                  <Text style={styles.createNewFriendBtnText}>+ Create New Friend</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Export / Share Modal */}
      <Modal visible={showExportModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardLarge}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Export & Share</Text>
              <TouchableOpacity onPress={() => setShowExportModal(false)}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.exportSubtitle}>
              Export {group?.name} statements or share a formatted summary directly to WhatsApp.
            </Text>

            {/* Option 1: WhatsApp / Messaging text summary */}
            <TouchableOpacity
              style={styles.exportOptionCard}
              onPress={() => {
                setShowExportModal(false);
                handleShareTextSummary();
              }}
            >
              <View style={[styles.exportIconCircle, { backgroundColor: '#E8F8F5' }]}>
                <Ionicons name="logo-whatsapp" size={22} color="#1cc29f" />
              </View>
              <View style={styles.exportOptionInfo}>
                <Text style={styles.exportOptionTitle}>Share WhatsApp / Text Summary</Text>
                <Text style={styles.exportOptionSub}>
                  Share a clean breakdown of balances, debts, and recent expenses via messaging apps.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </TouchableOpacity>

            {/* Option 2: Export CSV Spreadsheet */}
            <TouchableOpacity
              style={styles.exportOptionCard}
              onPress={() => {
                setShowExportModal(false);
                handleExportCsv();
              }}
            >
              <View style={[styles.exportIconCircle, { backgroundColor: '#EFF6FF' }]}>
                <Ionicons name="document-text" size={22} color="#3B82F6" />
              </View>
              <View style={styles.exportOptionInfo}>
                <Text style={styles.exportOptionTitle}>Export to CSV (Excel)</Text>
                <Text style={styles.exportOptionSub}>
                  Download or share an itemized .csv spreadsheet of all expenses in this group.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </TouchableOpacity>

            {/* Option 3: Preview text summary */}
            <TouchableOpacity
              style={styles.exportOptionCard}
              onPress={() => {
                setShowExportModal(false);
                const summary = generateGroupTextSummary(
                  group!,
                  expenses,
                  members,
                  simplifiedDebtsList,
                  balances
                );
                setPreviewSummaryText(summary);
                setShowTextPreviewModal(true);
              }}
            >
              <View style={[styles.exportIconCircle, { backgroundColor: '#F3F4F6' }]}>
                <Ionicons name="eye-outline" size={22} color="#6B7280" />
              </View>
              <View style={styles.exportOptionInfo}>
                <Text style={styles.exportOptionTitle}>Preview Summary Text</Text>
                <Text style={styles.exportOptionSub}>
                  Inspect or copy the formatted text directly to your clipboard.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Preview Summary Modal */}
      <Modal visible={showTextPreviewModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardLarge}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Summary Preview</Text>
              <TouchableOpacity onPress={() => setShowTextPreviewModal(false)}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.summaryPreviewInput}
              value={previewSummaryText}
              multiline
              editable={false}
              selectTextOnFocus
            />

            <View style={styles.previewBtnRow}>
              <TouchableOpacity
                style={styles.shareBtn}
                onPress={() => {
                  Share.share({
                    title: `${group?.name} Expense Summary`,
                    message: previewSummaryText,
                  });
                }}
              >
                <Ionicons name="share-social-outline" size={18} color="#FFFFFF" />
                <Text style={styles.shareBtnText}>Share Text</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  headerCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  groupTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  groupSub: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  subTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  addMemberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#E8F8F5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  addMemberBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1cc29f',
  },
  settleBtn: {
    backgroundColor: '#1cc29f',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  settleBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  simplifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  simplifyInfo: {
    flex: 1,
    paddingRight: 10,
  },
  proRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  simplifyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
  proBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  proBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#B45309',
  },
  simplifySub: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  innerTabs: {
    flexDirection: 'row',
    marginTop: 16,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 3,
  },
  innerTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  innerTabActive: {
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
  },
  innerTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  innerTabTextActive: {
    color: '#1cc29f',
    fontWeight: '700',
  },
  listPadding: {
    paddingVertical: 10,
    paddingBottom: 90,
  },
  expenseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  dateBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: 12,
    borderRightWidth: 1,
    borderRightColor: '#E5E7EB',
    width: 44,
  },
  dateMonth: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
  },
  dateDay: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1F2937',
  },
  expenseInfo: {
    flex: 1,
    marginLeft: 12,
  },
  expenseDesc: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  expensePayer: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  expenseSplitType: {
    alignItems: 'flex-end',
  },
  splitTypeBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B7280',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberAvatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  memberDetails: {
    flex: 1,
    marginLeft: 12,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
  },
  memberStatus: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  balanceAmountText: {
    fontSize: 16,
    fontWeight: '700',
  },
  textPositive: {
    color: '#1cc29f',
  },
  textNegative: {
    color: '#EF4444',
  },
  textNeutral: {
    color: '#9CA3AF',
  },
  totalsContainer: {
    padding: 12,
    paddingBottom: 90,
  },
  simplifiedCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  simplifiedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  simplifiedHeaderText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  simplifiedDesc: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 6,
    lineHeight: 18,
    marginBottom: 16,
  },
  transList: {
    gap: 12,
  },
  transCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  transRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  transPayer: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
    flex: 1,
  },
  transArrow: {
    alignItems: 'center',
    marginHorizontal: 8,
  },
  arrowLabel: {
    fontSize: 10,
    color: '#9CA3AF',
    textTransform: 'uppercase',
  },
  transReceiver: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
    flex: 1,
    textAlign: 'center',
  },
  transAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1cc29f',
    marginLeft: 10,
  },
  transSettleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    backgroundColor: '#E8F8F5',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  transSettleBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1cc29f',
  },
  allSettledBox: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  allSettledText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1cc29f',
    marginTop: 8,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
    marginTop: 10,
  },
  emptySub: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    backgroundColor: '#1cc29f',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 28,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    gap: 6,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 15,
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
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  availableFriendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  availableFriendAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  availableFriendAvatarText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  availableFriendName: {
    flex: 1,
    marginLeft: 12,
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  noFriendsContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  noFriendsText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  createNewFriendBtn: {
    marginTop: 14,
    backgroundColor: '#1cc29f',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  createNewFriendBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  headerRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerActionBtn: {
    padding: 4,
  },
  filterSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 38,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: '#111827',
  },
  categoryChipsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
  },
  categoryChipActive: {
    backgroundColor: '#1cc29f',
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
  },
  modalCardLarge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    maxHeight: '85%',
  },
  exportSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
    marginBottom: 16,
  },
  exportOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  exportIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  exportOptionInfo: {
    flex: 1,
  },
  exportOptionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  exportOptionSub: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
  },
  summaryPreviewInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#111827',
    height: 220,
    backgroundColor: '#F9FAFB',
    marginBottom: 16,
    textAlignVertical: 'top',
  },
  previewBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1cc29f',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  shareBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
