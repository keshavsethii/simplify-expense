import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { getOverallUserBalance } from '../../db/queries';
import { Member } from '../../db/types';
import { formatMoney } from '../../utils/currency';

export default function FriendsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    totalOwedToYou: number;
    totalYouOwe: number;
    netTotal: number;
    friendBalances: { member: Member; balance: number }[];
  }>({
    totalOwedToYou: 0,
    totalYouOwe: 0,
    netTotal: 0,
    friendBalances: [],
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await getOverallUserBalance();
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const renderFriendItem = ({ item }: { item: { member: Member; balance: number } }) => {
    const isPositive = item.balance > 0;
    const isSettled = Math.abs(item.balance) < 0.01;

    return (
      <TouchableOpacity
        style={styles.friendCard}
        activeOpacity={0.7}
        onPress={() => {
          router.push({
            pathname: '/settle-up',
            params: { friendId: item.member.id, friendName: item.member.name },
          });
        }}
      >
        <View style={[styles.avatar, { backgroundColor: item.member.avatar_color || '#1cc29f' }]}>
          <Text style={styles.avatarText}>{item.member.name.charAt(0).toUpperCase()}</Text>
        </View>

        <View style={styles.friendInfo}>
          <Text style={styles.friendName}>{item.member.name}</Text>
          <Text style={styles.friendSub}>
            {isSettled
              ? 'settled up'
              : isPositive
              ? `owes you ${formatMoney(item.balance)}`
              : `you owe ${formatMoney(Math.abs(item.balance))}`}
          </Text>
        </View>

        <View style={styles.balanceContainer}>
          <Text
            style={[
              styles.balanceAmount,
              isSettled
                ? styles.textNeutral
                : isPositive
                ? styles.textPositive
                : styles.textNegative,
            ]}
          >
            {isSettled ? '—' : formatMoney(item.balance)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Top Balance Summary Card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>Total balance</Text>
            <Text
              style={[
                styles.summaryTotal,
                data.netTotal >= 0 ? styles.textPositive : styles.textNegative,
              ]}
            >
              {data.netTotal >= 0 ? '+' : '-'}
              {formatMoney(data.netTotal)}
            </Text>
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={() => router.push('/add-friend')}
            >
              <Ionicons name="person-add" size={18} color="#1cc29f" />
              <Text style={styles.headerActionText}>Add Friend</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.subSummaryRow}>
          <View style={styles.subStat}>
            <Text style={styles.subStatLabel}>you are owed</Text>
            <Text style={[styles.subStatValue, styles.textPositive]}>
              {formatMoney(data.totalOwedToYou)}
            </Text>
          </View>
          <View style={styles.subStatDivider} />
          <View style={styles.subStat}>
            <Text style={styles.subStatLabel}>you owe</Text>
            <Text style={[styles.subStatValue, styles.textNegative]}>
              {formatMoney(data.totalYouOwe)}
            </Text>
          </View>
        </View>
      </View>

      {/* Friends List */}
      <View style={styles.listSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>FRIENDS</Text>
        </View>

        <FlatList
          data={data.friendBalances}
          keyExtractor={(item) => item.member.id}
          renderItem={renderFriendItem}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={loadData} colors={['#1cc29f']} />}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="account-group-outline" size={56} color="#C7C7CC" />
              <Text style={styles.emptyTitle}>No friends added yet</Text>
              <Text style={styles.emptySub}>
                Tap the "+ Add Friend" button above to start sharing expenses!
              </Text>
            </View>
          }
        />
      </View>

      {/* Floating Action Button for Add Expense */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => router.push('/add-expense')}
      >
        <Ionicons name="add" size={26} color="#FFFFFF" />
        <Text style={styles.fabText}>Add expense</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryCol: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  summaryTotal: {
    fontSize: 26,
    fontWeight: '800',
    marginTop: 4,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  headerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F8F5',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 5,
  },
  headerActionText: {
    color: '#1cc29f',
    fontWeight: '700',
    fontSize: 13,
  },
  subSummaryRow: {
    flexDirection: 'row',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  subStat: {
    flex: 1,
  },
  subStatDivider: {
    width: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 12,
  },
  subStatLabel: {
    fontSize: 12,
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  subStatValue: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  textPositive: {
    color: '#1cc29f',
  },
  textNegative: {
    color: '#FF5252',
  },
  textNeutral: {
    color: '#9CA3AF',
  },
  listSection: {
    flex: 1,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.5,
  },
  listContent: {
    paddingBottom: 90,
  },
  friendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  friendInfo: {
    flex: 1,
    marginLeft: 14,
  },
  friendName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  friendSub: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  balanceContainer: {
    alignItems: 'flex-end',
  },
  balanceAmount: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#374151',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
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
});
