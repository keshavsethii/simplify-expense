import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getExpenses,
  getExpenseSplits,
  getAllMembers,
  getAllGroups,
  deleteExpense,
} from '../../db/queries';
import { Expense, ExpenseSplit, Member, Group } from '../../db/types';
import { formatMoney } from '../../utils/currency';

export default function ExpenseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [expense, setExpense] = useState<Expense | null>(null);
  const [splits, setSplits] = useState<ExpenseSplit[]>([]);
  const [members, setMembers] = useState<Map<string, Member>>(new Map());
  const [group, setGroup] = useState<Group | null>(null);

  useEffect(() => {
    async function load() {
      if (!id) return;
      const allExpenses = await getExpenses();
      const targetExp = allExpenses.find((e) => e.id === id);
      if (!targetExp) return;
      setExpense(targetExp);

      const sp = await getExpenseSplits(id);
      setSplits(sp);

      const mems = await getAllMembers();
      setMembers(new Map(mems.map((m) => [m.id, m])));

      if (targetExp.group_id) {
        const grps = await getAllGroups();
        const grp = grps.find((g) => g.id === targetExp.group_id);
        if (grp) setGroup(grp);
      }
    }
    load();
  }, [id]);

  const handleDelete = () => {
    Alert.alert('Delete Expense', 'Are you sure you want to delete this expense completely?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (id) {
            await deleteExpense(id);
            router.back();
          }
        },
      },
    ]);
  };

  if (!expense) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.notFound}>Expense not found</Text>
      </View>
    );
  }

  const payer = members.get(expense.paid_by_member_id);

  return (
    <ScrollView style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Expense Details',
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <TouchableOpacity
                onPress={() => {
                  router.push({
                    pathname: '/add-expense',
                    params: { expenseId: expense.id },
                  });
                }}
              >
                <Ionicons name="pencil-outline" size={20} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete}>
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      <View style={styles.card}>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryBadgeText}>{expense.category.toUpperCase()}</Text>
        </View>

        <Text style={styles.description}>{expense.description}</Text>
        <Text style={styles.amount}>{formatMoney(expense.amount, expense.currency)}</Text>
        <Text style={styles.subInfo}>
          Added on {expense.date}
          {group ? ` in ${group.name}` : ' (No Group)'}
        </Text>

        <View style={styles.divider} />

        {/* Payer Row */}
        <View style={styles.payerBox}>
          <View style={[styles.avatar, { backgroundColor: payer?.avatar_color || '#1cc29f' }]}>
            <Text style={styles.avatarText}>{payer?.name.charAt(0) || '?'}</Text>
          </View>
          <View style={styles.payerTextContainer}>
            <Text style={styles.payerName}>{payer?.is_user === 1 ? 'You' : payer?.name}</Text>
            <Text style={styles.payerSub}>paid the total bill</Text>
          </View>
          <Text style={styles.payerAmount}>{formatMoney(expense.amount, expense.currency)}</Text>
        </View>

        <View style={styles.divider} />

        {/* Splits breakdown */}
        <View style={styles.splitsHeader}>
          <Text style={styles.splitsTitle}>SPLIT DETAILS ({expense.split_type})</Text>
        </View>

        <View style={styles.splitList}>
          {splits.map((s) => {
            const member = members.get(s.member_id);
            return (
              <View key={s.id} style={styles.splitRow}>
                <View style={styles.splitMemberLeft}>
                  <Text style={styles.splitMemberName}>
                    {member?.is_user === 1 ? 'You' : member?.name}
                  </Text>
                  {s.percentage !== null && s.percentage !== undefined && (
                    <Text style={styles.extraSplitInfo}>{s.percentage}%</Text>
                  )}
                  {s.shares !== null && s.shares !== undefined && (
                    <Text style={styles.extraSplitInfo}>{s.shares} shares</Text>
                  )}
                </View>
                <Text style={styles.splitMemberAmount}>
                  owes {formatMoney(s.amount, expense.currency)}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
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
  card: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 8,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4B5563',
  },
  description: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  amount: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1cc29f',
    marginTop: 4,
  },
  subInfo: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 6,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 18,
  },
  payerBox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  payerTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  payerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  payerSub: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  payerAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  splitsHeader: {
    marginBottom: 12,
  },
  splitsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.5,
  },
  splitList: {
    gap: 12,
  },
  splitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  splitMemberLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  splitMemberName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  extraSplitInfo: {
    fontSize: 12,
    color: '#9CA3AF',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  splitMemberAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
  },
});
