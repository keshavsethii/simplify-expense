import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  Platform,
  Share,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect, Stack } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getFriendLedger, deleteMember, deleteSettlement, getCurrentUser, getSharedGroups } from '../../db/queries';
import { Member, Expense, Settlement } from '../../db/types';
import { formatMoney } from '../../utils/currency';

export default function FriendDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [friend, setFriend] = useState<Member | null>(null);
  const [netBalance, setNetBalance] = useState<number>(0);
  const [expenses, setExpenses] = useState<{
    expense: Expense;
    yourShare: number;
    friendShare: number;
    paidByFriend: boolean;
    paidByYou: boolean;
  }[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [activeTab, setActiveTab] = useState<'expenses' | 'settlements'>('expenses');

  // Export & Share
  const [showExportModal, setShowExportModal] = useState(false);
  const [showTextPreviewModal, setShowTextPreviewModal] = useState(false);
  const [previewSummaryText, setPreviewSummaryText] = useState('');

  const generateFriendCsv = (): string => {
    if (!friend) return '';
    const rows = [
      ['Date', 'Type', 'Description', 'Total Amount (INR)', 'Your Share', `${friend.name}'s Share`, 'Paid By'],
    ];
    expenses.forEach((item) => {
      const cleanDesc = `"${(item.expense.description || '').replace(/"/g, '""')}"`;
      const payer = item.paidByYou ? 'You' : item.paidByFriend ? friend.name : 'Other';
      rows.push([
        item.expense.date,
        'Expense',
        cleanDesc,
        String(item.expense.amount),
        String(item.yourShare),
        String(item.friendShare),
        `"${payer}"`,
      ]);
    });
    settlements.forEach((s) => {
      const payer = s.from_member_id === friend.id ? friend.name : 'You';
      rows.push([
        s.date,
        'Settlement',
        `"Payment via ${s.notes || 'Cash'}"`,
        String(s.amount),
        '-',
        '-',
        `"${payer}"`,
      ]);
    });
    return rows.map((r) => r.join(',')).join('\n');
  };

  const generateFriendTextSummary = (): string => {
    if (!friend) return '';
    let text = `📊 Simplify Expense: Balance with ${friend.name}\n`;
    if (Math.abs(netBalance) < 0.01) {
      text += `Status: You and ${friend.name} are completely settled up! (₹0.00)\n\n`;
    } else if (netBalance > 0) {
      text += `Status: ${friend.name} owes you ${formatMoney(netBalance)}\n\n`;
    } else {
      text += `Status: You owe ${friend.name} ${formatMoney(Math.abs(netBalance))}\n\n`;
    }

    if (expenses.length > 0) {
      text += `📝 Recent Shared Expenses (${expenses.length}):\n`;
      expenses.slice(0, 10).forEach(({ expense, paidByYou }) => {
        text += `• ${expense.date}: ${expense.description} - ${formatMoney(expense.amount)} (${
          paidByYou ? 'You paid' : `${friend.name} paid`
        })\n`;
      });
      if (expenses.length > 10) {
        text += `... and ${expenses.length - 10} more expenses.\n`;
      }
    }

    if (settlements.length > 0) {
      text += `\n🤝 Payments Recorded:\n`;
      settlements.slice(0, 5).forEach((s) => {
        const payer = s.from_member_id === friend.id ? friend.name : 'You';
        text += `• ${s.date}: ${payer} paid ${formatMoney(s.amount)}\n`;
      });
    }

    return text;
  };

  const handleExportCsv = async () => {
    if (!friend) return;
    const csvContent = generateFriendCsv();
    const safeTitle = friend.name.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${safeTitle}_ledger_${new Date().toISOString().slice(0, 10)}.csv`;

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
        await FileSystem.writeAsStringAsync(fileUri, csvContent, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'text/csv',
            dialogTitle: `Export ${friend.name} Ledger CSV`,
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
    if (!friend) return;
    const summary = generateFriendTextSummary();
    try {
      await Share.share({
        title: `Ledger with ${friend.name}`,
        message: summary,
      });
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to share summary');
    }
  };

  const loadData = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const res = await getFriendLedger(id);
      setFriend(res.friend);
      setNetBalance(res.netBalance);
      setExpenses(res.expenses);
      setSettlements(res.settlements);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [id])
  );

  const handleDeleteFriend = () => {
    if (!friend) return;
    Alert.alert(
      'Remove Friend',
      `Are you sure you want to remove ${friend.name}? This will remove all personal transactions with them.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await deleteMember(friend.id);
            router.back();
          },
        },
      ]
    );
  };

  const handleDeleteSettlement = (settlementId: string) => {
    Alert.alert('Delete Payment', 'Are you sure you want to delete this payment record?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteSettlement(settlementId);
          loadData();
        },
      },
    ]);
  };

  if (!friend) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.notFound}>Friend not found</Text>
      </View>
    );
  }

  const isPositive = netBalance > 0.01;
  const isSettled = Math.abs(netBalance) < 0.01;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: friend.name,
          headerRight: () => (
            <View style={styles.headerRightRow}>
              <TouchableOpacity
                onPress={() => setShowExportModal(true)}
                style={styles.headerActionBtn}
              >
                <Ionicons name="share-social-outline" size={20} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDeleteFriend}
                style={styles.headerActionBtn}
              >
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      {/* Header Balance Card */}
      <View style={styles.headerCard}>
        <View style={styles.profileRow}>
          <View style={[styles.avatar, { backgroundColor: friend.avatar_color || '#1cc29f' }]}>
            <Text style={styles.avatarText}>{friend.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.friendName}>{friend.name}</Text>
            <Text style={styles.friendEmail}>{friend.email || 'No email added'}</Text>
          </View>
        </View>

        <View style={styles.balanceStatusRow}>
          <View>
            <Text style={styles.balanceStatusLabel}>
              {isSettled
                ? 'All settled up'
                : isPositive
                ? `${friend.name} owes you`
                : `You owe ${friend.name}`}
            </Text>
            <Text
              style={[
                styles.balanceAmount,
                isSettled ? styles.textNeutral : isPositive ? styles.textPositive : styles.textNegative,
              ]}
            >
              {isSettled ? '₹0.00' : formatMoney(Math.abs(netBalance))}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.settleBtn}
            onPress={async () => {
              const u = await getCurrentUser();
              const shared = await getSharedGroups(u.id, friend.id);
              // If netBalance > 0, friend owes you => friend is payer, you are receiver.
              // If netBalance < 0, you owe friend => you are payer, friend is receiver.
              const pFrom = netBalance > 0.01 ? friend.id : u.id;
              const pTo = netBalance > 0.01 ? u.id : friend.id;
              router.push({
                pathname: '/settle-up',
                params: {
                  friendId: friend.id,
                  friendName: friend.name,
                  fromMemberId: pFrom,
                  toMemberId: pTo,
                  amount: !isSettled ? String(Math.abs(netBalance)) : '',
                  groupId: shared.length === 1 ? shared[0].id : undefined,
                },
              });
            }}
          >
            <Ionicons name="checkmark-done" size={16} color="#FFFFFF" />
            <Text style={styles.settleBtnText}>Settle up</Text>
          </TouchableOpacity>
        </View>

        {/* Tab Toggle */}
        <View style={styles.tabToggleRow}>
          <TouchableOpacity
            style={[styles.tabToggleBtn, activeTab === 'expenses' && styles.tabToggleBtnActive]}
            onPress={() => setActiveTab('expenses')}
          >
            <Text
              style={[styles.tabToggleText, activeTab === 'expenses' && styles.tabToggleTextActive]}
            >
              Shared Expenses ({expenses.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabToggleBtn, activeTab === 'settlements' && styles.tabToggleBtnActive]}
            onPress={() => setActiveTab('settlements')}
          >
            <Text
              style={[
                styles.tabToggleText,
                activeTab === 'settlements' && styles.tabToggleTextActive,
              ]}
            >
              Payments ({settlements.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tab Content */}
      {activeTab === 'expenses' ? (
        <FlatList
          data={expenses}
          keyExtractor={(item) => item.expense.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={loadData} colors={['#1cc29f']} />}
          contentContainerStyle={styles.listPadding}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.expenseCard}
              activeOpacity={0.7}
              onPress={() => router.push(`/expense-detail/${item.expense.id}`)}
            >
              <View style={styles.dateBox}>
                <Text style={styles.dateMonth}>
                  {new Date(item.expense.date).toLocaleDateString('en-US', { month: 'short' })}
                </Text>
                <Text style={styles.dateDay}>
                  {new Date(item.expense.date).toLocaleDateString('en-US', { day: 'numeric' })}
                </Text>
              </View>

              <View style={styles.expenseInfo}>
                <Text style={styles.expenseDesc}>{item.expense.description}</Text>
                <Text style={styles.expensePayer}>
                  {item.paidByYou
                    ? 'You paid ' + formatMoney(item.expense.amount)
                    : item.paidByFriend
                    ? `${friend.name} paid ` + formatMoney(item.expense.amount)
                    : 'Group expense: ' + formatMoney(item.expense.amount)}
                </Text>
              </View>

              <View style={styles.splitResultBox}>
                <Text
                  style={[
                    styles.splitResultText,
                    item.paidByYou
                      ? styles.textPositive
                      : item.paidByFriend
                      ? styles.textNegative
                      : styles.textNeutral,
                  ]}
                >
                  {item.paidByYou
                    ? `you lent ${formatMoney(item.friendShare)}`
                    : item.paidByFriend
                    ? `you borrowed ${formatMoney(item.yourShare)}`
                    : `your share ${formatMoney(item.yourShare)}`}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="receipt-outline" size={50} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>No shared expenses with {friend.name}</Text>
              <Text style={styles.emptySub}>
                Add an expense with this friend to start tracking shared costs!
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={settlements}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={loadData} colors={['#1cc29f']} />}
          contentContainerStyle={styles.listPadding}
          renderItem={({ item }) => {
            const isPayerYou = item.from_member_id !== friend.id;
            return (
              <View style={styles.settlementCard}>
                <Ionicons name="checkmark-circle" size={26} color="#1cc29f" />
                <View style={styles.settlementInfo}>
                  <Text style={styles.settlementTitle}>
                    {isPayerYou ? `You paid ${friend.name}` : `${friend.name} paid you`}
                  </Text>
                  <Text style={styles.settlementDate}>
                    {item.date} {item.notes ? `• ${item.notes}` : ''}
                  </Text>
                </View>
                <Text style={styles.settlementAmount}>{formatMoney(item.amount)}</Text>
                <TouchableOpacity
                  onPress={() => handleDeleteSettlement(item.id)}
                  style={styles.deleteSettlementBtn}
                >
                  <Ionicons name="trash-outline" size={16} color="#EF4444" />
                </TouchableOpacity>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="checkmark-done-circle-outline" size={50} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>No payments recorded yet</Text>
              <Text style={styles.emptySub}>
                {'Use the "Settle up" button above to record payments between you and ' + friend.name + '!'}
              </Text>
            </View>
          }
        />
      )}
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
              Export statements or share a formatted balance summary with {friend.name}.
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
                  Send current balance, debts, and recent transactions via messaging apps.
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
                  Download or share an itemized .csv statement of all shared expenses and payments.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </TouchableOpacity>

            {/* Option 3: Preview text summary */}
            <TouchableOpacity
              style={styles.exportOptionCard}
              onPress={() => {
                setShowExportModal(false);
                const summary = generateFriendTextSummary();
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
                    title: `Balance with ${friend.name}`,
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
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFound: {
    fontSize: 16,
    color: '#6B7280',
  },
  headerCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  profileInfo: {
    marginLeft: 14,
    flex: 1,
  },
  friendName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  friendEmail: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  balanceStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  balanceStatusLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  balanceAmount: {
    fontSize: 24,
    fontWeight: '800',
    marginTop: 2,
  },
  settleBtn: {
    backgroundColor: '#1cc29f',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  settleBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  tabToggleRow: {
    flexDirection: 'row',
    marginTop: 16,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 3,
  },
  tabToggleBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 6,
  },
  tabToggleBtnActive: {
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
  },
  tabToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  tabToggleTextActive: {
    color: '#1cc29f',
    fontWeight: '700',
  },
  listPadding: {
    paddingVertical: 10,
    paddingBottom: 40,
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
  splitResultBox: {
    alignItems: 'flex-end',
  },
  splitResultText: {
    fontSize: 13,
    fontWeight: '700',
  },
  settlementCard: {
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
  settlementInfo: {
    flex: 1,
    marginLeft: 12,
  },
  settlementTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  settlementDate: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  settlementAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1cc29f',
    marginRight: 12,
  },
  deleteSettlementBtn: {
    padding: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
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
    textAlign: 'center',
    marginTop: 4,
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
  headerRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerActionBtn: {
    padding: 4,
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
    maxHeight: '85%',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
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
