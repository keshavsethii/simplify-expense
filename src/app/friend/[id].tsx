import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect, Stack } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { getFriendLedger, deleteMember, deleteSettlement } from '../../db/queries';
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
            <TouchableOpacity onPress={handleDeleteFriend}>
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
            </TouchableOpacity>
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
            onPress={() => {
              router.push({
                pathname: '/settle-up',
                params: {
                  friendId: friend.id,
                  friendName: friend.name,
                  amount: !isSettled ? String(Math.abs(netBalance)) : '',
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
});
