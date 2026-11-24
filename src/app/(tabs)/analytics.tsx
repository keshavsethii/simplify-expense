import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getExpenses, getCurrentUser, getExpenseSplits } from '../../db/queries';
import { formatMoney } from '../../utils/currency';

interface CategorySpend {
  category: string;
  total: number;
  percentage: number;
  color: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  Groceries: '#1cc29f',
  Food: '#F59E0B',
  Utilities: '#3B82F6',
  Travel: '#8B5CF6',
  Entertainment: '#EC4899',
  General: '#6B7280',
};

export default function AnalyticsScreen() {
  const [loading, setLoading] = useState(true);
  const [totalSpent, setTotalSpent] = useState(0);
  const [monthlyTotal, setMonthlyTotal] = useState(0);
  const [categoryBreakdown, setCategoryBreakdown] = useState<CategorySpend[]>([]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const user = await getCurrentUser();
      const allExpenses = await getExpenses();

      let overallUserShare = 0;
      let thisMonthUserShare = 0;
      const categoryTotals: Record<string, number> = {};

      const currentMonthPrefix = new Date().toISOString().substring(0, 7);

      for (const exp of allExpenses) {
        const splits = await getExpenseSplits(exp.id);
        const userSplit = splits.find((s) => s.member_id === user.id);

        if (userSplit) {
          const amount = userSplit.amount;
          overallUserShare += amount;

          if (exp.date.startsWith(currentMonthPrefix)) {
            thisMonthUserShare += amount;
          }

          const cat = exp.category || 'General';
          categoryTotals[cat] = (categoryTotals[cat] || 0) + amount;
        }
      }

      setTotalSpent(Math.round(overallUserShare * 100) / 100);
      setMonthlyTotal(Math.round(thisMonthUserShare * 100) / 100);

      const breakdown: CategorySpend[] = Object.keys(categoryTotals).map((cat) => {
        const catAmount = categoryTotals[cat];
        const pct = overallUserShare > 0 ? (catAmount / overallUserShare) * 100 : 0;
        return {
          category: cat,
          total: Math.round(catAmount * 100) / 100,
          percentage: Math.round(pct * 10) / 10,
          color: CATEGORY_COLORS[cat] || '#9CA3AF',
        };
      });

      breakdown.sort((a, b) => b.total - a.total);
      setCategoryBreakdown(breakdown);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadAnalytics();
    }, [])
  );

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={loadAnalytics} colors={['#1cc29f']} />}
    >
      {/* Overview Cards */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>This Month's Spending</Text>
          <Text style={styles.statValue}>{formatMoney(monthlyTotal)}</Text>
          <Text style={styles.statSub}>your actual personal share</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>All-Time Total</Text>
          <Text style={styles.statValue}>{formatMoney(totalSpent)}</Text>
          <Text style={styles.statSub}>across all groups & friends</Text>
        </View>
      </View>

      {/* Visual Spending Bar Chart */}
      <View style={styles.chartCard}>
        <Text style={styles.cardHeader}>Spending by Category</Text>

        {categoryBreakdown.length > 0 ? (
          <>
            {/* Horizontal Stacked Ratio Bar */}
            <View style={styles.stackedBar}>
              {categoryBreakdown.map((item, index) => (
                <View
                  key={index}
                  style={{
                    backgroundColor: item.color,
                    flex: item.percentage,
                    height: '100%',
                  }}
                />
              ))}
            </View>

            {/* Category breakdown itemized rows */}
            <View style={styles.breakdownList}>
              {categoryBreakdown.map((item, index) => (
                <View key={index} style={styles.categoryRow}>
                  <View style={styles.categoryLeft}>
                    <View style={[styles.dot, { backgroundColor: item.color }]} />
                    <Text style={styles.categoryName}>{item.category}</Text>
                  </View>
                  <View style={styles.categoryRight}>
                    <Text style={styles.categoryAmount}>{formatMoney(item.total)}</Text>
                    <Text style={styles.categoryPercent}>{item.percentage}%</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="chart-pie" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>No expenses recorded for breakdown yet</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 12,
    marginTop: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginTop: 4,
  },
  statSub: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
  },
  chartCard: {
    backgroundColor: '#FFFFFF',
    margin: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 14,
  },
  stackedBar: {
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    marginBottom: 18,
  },
  breakdownList: {
    gap: 12,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  categoryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  categoryAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  categoryPercent: {
    fontSize: 12,
    color: '#9CA3AF',
    width: 40,
    textAlign: 'right',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyText: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 8,
  },
});
