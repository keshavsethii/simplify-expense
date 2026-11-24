import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { getExpenses, getAllMembers, getAllGroups, getExpenseSplits } from '../../db/queries';
import { Expense, Member, Group } from '../../db/types';
import { formatMoney } from '../../utils/currency';

interface ExpenseItemWithDetails {
  expense: Expense;
  payerName: string;
  groupName?: string;
  userInvolvement: string;
  userAmount: number;
}

export default function ActivityScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [timeFilter, setTimeFilter] = useState<'ALL' | 'MONTH' | 'WEEK'>('ALL');
  const [expenses, setExpenses] = useState<ExpenseItemWithDetails[]>([]);

  const loadData = async () => {
    try {
      setLoading(true);
      const allExpenses = await getExpenses();
      const allMembers = await getAllMembers();
      const allGroups = await getAllGroups();
      const memberMap = new Map(allMembers.map((m) => [m.id, m]));
      const groupMap = new Map(allGroups.map((g) => [g.id, g]));
      const currentUser = allMembers.find((m) => m.is_user === 1);

      const items: ExpenseItemWithDetails[] = [];

      for (const exp of allExpenses) {
        const splits = await getExpenseSplits(exp.id);
        const payer = memberMap.get(exp.paid_by_member_id);
        const group = exp.group_id ? groupMap.get(exp.group_id) : undefined;

        let userInvolvement = 'not involved';
        let userAmount = 0;

        const userSplit = currentUser ? splits.find((s) => s.member_id === currentUser.id) : undefined;

        if (currentUser && exp.paid_by_member_id === currentUser.id) {
          // You paid
          const otherSplitsTotal = splits
            .filter((s) => s.member_id !== currentUser.id)
            .reduce((sum, s) => sum + s.amount, 0);
          userInvolvement = `you lent`;
          userAmount = otherSplitsTotal;
        } else if (userSplit) {
          userInvolvement = `you borrowed`;
          userAmount = userSplit.amount;
        }

        items.push({
          expense: exp,
          payerName: payer?.name || 'Unknown',
          groupName: group?.name,
          userInvolvement,
          userAmount,
        });
      }

      setExpenses(items);
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

  const categories = ['ALL', 'General', 'Food', 'Groceries', 'Utilities', 'Travel', 'Entertainment'];

  const now = new Date();
  const currentMonthStr = now.toISOString().substring(0, 7);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);

  const filteredExpenses = expenses.filter((item) => {
    const matchesSearch =
      item.expense.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.payerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.groupName && item.groupName.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory =
      selectedCategory === 'ALL' ||
      item.expense.category?.toLowerCase() === selectedCategory.toLowerCase();

    let matchesTime = true;
    if (timeFilter === 'MONTH') {
      matchesTime = item.expense.date.startsWith(currentMonthStr);
    } else if (timeFilter === 'WEEK') {
      matchesTime = item.expense.date >= oneWeekAgo;
    }

    return matchesSearch && matchesCategory && matchesTime;
  });

  const getCategoryIcon = (category: string) => {
    switch (category?.toLowerCase()) {
      case 'groceries':
      case 'food':
        return <MaterialCommunityIcons name="food-fork-drink" size={24} color="#1cc29f" />;
      case 'utilities':
        return <MaterialCommunityIcons name="lightning-bolt" size={24} color="#F59E0B" />;
      case 'travel':
        return <MaterialCommunityIcons name="airplane" size={24} color="#3B82F6" />;
      case 'entertainment':
        return <MaterialCommunityIcons name="movie-open" size={24} color="#8B5CF6" />;
      default:
        return <MaterialCommunityIcons name="receipt" size={24} color="#6B7280" />;
    }
  };

  return (
    <View style={styles.container}>
      {/* Advanced Pro Search & Filters */}
      <View style={styles.searchHeader}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={20} color="#9CA3AF" />
          <TextInput
            placeholder="Search expenses, groups, or payers..."
            placeholderTextColor="#9CA3AF"
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        {/* Time Filter Tabs */}
        <View style={styles.timeFilterRow}>
          {(['ALL', 'MONTH', 'WEEK'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              style={[
                styles.timeChip,
                timeFilter === t && styles.timeChipActive,
              ]}
              onPress={() => setTimeFilter(t)}
            >
              <Text
                style={[
                  styles.timeChipText,
                  timeFilter === t && styles.timeChipTextActive,
                ]}
              >
                {t === 'ALL' ? 'All Time' : t === 'MONTH' ? 'This Month' : 'Past 7 Days'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Filter Pills */}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={categories}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterChip,
                selectedCategory === item && styles.filterChipActive,
              ]}
              onPress={() => setSelectedCategory(item)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedCategory === item && styles.filterChipTextActive,
                ]}
              >
                {item}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      <FlatList
        data={filteredExpenses}
        keyExtractor={(item) => item.expense.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadData} colors={['#1cc29f']} />}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.expenseCard}
            activeOpacity={0.7}
            onPress={() => router.push(`/expense-detail/${item.expense.id}`)}
          >
            <View style={styles.iconCircle}>{getCategoryIcon(item.expense.category)}</View>

            <View style={styles.details}>
              <Text style={styles.description}>{item.expense.description}</Text>
              <Text style={styles.subtext}>
                {item.groupName ? `${item.groupName} • ` : ''}
                {item.payerName} paid {formatMoney(item.expense.amount, item.expense.currency)}
              </Text>
              <Text style={styles.dateText}>{item.expense.date}</Text>
            </View>

            <View style={styles.involvementContainer}>
              <Text
                style={[
                  styles.involvementLabel,
                  item.userInvolvement.includes('lent')
                    ? styles.textPositive
                    : item.userInvolvement.includes('borrowed')
                    ? styles.textNegative
                    : styles.textNeutral,
                ]}
              >
                {item.userInvolvement}
              </Text>
              <Text
                style={[
                  styles.involvementAmount,
                  item.userInvolvement.includes('lent')
                    ? styles.textPositive
                    : item.userInvolvement.includes('borrowed')
                    ? styles.textNegative
                    : styles.textNeutral,
                ]}
              >
                {item.userAmount > 0
                  ? formatMoney(item.userAmount, item.expense.currency)
                  : '—'}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={54} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No matching expenses found</Text>
            <Text style={styles.emptySub}>
              {searchQuery ? 'Try clearing your search query or filters' : 'Record an expense to see activity here!'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  searchHeader: {
    backgroundColor: '#FFFFFF',
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    height: 42,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    color: '#1F2937',
  },
  timeFilterRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 10,
    gap: 8,
  },
  timeChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  timeChipActive: {
    backgroundColor: '#1cc29f',
  },
  timeChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
  },
  timeChipTextActive: {
    color: '#FFFFFF',
  },
  filterList: {
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    marginRight: 6,
  },
  filterChipActive: {
    backgroundColor: '#1cc29f',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingVertical: 10,
  },
  expenseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  details: {
    flex: 1,
    marginLeft: 12,
  },
  description: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  subtext: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  dateText: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  involvementContainer: {
    alignItems: 'flex-end',
  },
  involvementLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  involvementAmount: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
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
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
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
});
