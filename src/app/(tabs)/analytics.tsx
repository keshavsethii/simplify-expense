import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getExpenses, getCurrentUser, getExpenseSplits, getAllCategories } from '../../db/queries';
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
  const [selectedMonthTotal, setSelectedMonthTotal] = useState(0);
  const [categoryBreakdown, setCategoryBreakdown] = useState<CategorySpend[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewScope, setViewScope] = useState<'MONTH' | 'ALL'>('MONTH');

  const selectedMonthPrefix = currentDate.toISOString().substring(0, 7); // e.g. '2026-11'
  const monthDisplayTitle = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const handlePrevMonth = () => {
    const prev = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    setCurrentDate(prev);
  };

  const handleNextMonth = () => {
    const next = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    setCurrentDate(next);
  };

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const user = await getCurrentUser();
      const allExpenses = await getExpenses();
      const customCats = await getAllCategories();
      const colorsMap: Record<string, string> = { ...CATEGORY_COLORS };
      customCats.forEach((c) => {
        colorsMap[c.name] = c.color;
      });

      let overallUserShare = 0;
      let monthUserShare = 0;
      const categoryTotals: Record<string, number> = {};

      for (const exp of allExpenses) {
        const splits = await getExpenseSplits(exp.id);
        const userSplit = splits.find((s) => s.member_id === user.id);

        if (userSplit) {
          const amount = userSplit.amount;
          overallUserShare += amount;

          const isTargetMonth = exp.date.startsWith(selectedMonthPrefix);
          if (isTargetMonth) {
            monthUserShare += amount;
          }

          if (exp.category && (viewScope === 'ALL' || isTargetMonth)) {
            const cat = exp.category;
            categoryTotals[cat] = (categoryTotals[cat] || 0) + amount;
          }
        }
      }

      setTotalSpent(Math.round(overallUserShare * 100) / 100);
      setSelectedMonthTotal(Math.round(monthUserShare * 100) / 100);

      const activeScopeTotal = viewScope === 'ALL' ? overallUserShare : monthUserShare;

      const breakdown: CategorySpend[] = Object.keys(categoryTotals).map((cat) => {
        const catAmount = categoryTotals[cat];
        const pct = activeScopeTotal > 0 ? (catAmount / activeScopeTotal) * 100 : 0;
        return {
          category: cat,
          total: Math.round(catAmount * 100) / 100,
          percentage: Math.round(pct * 10) / 10,
          color: colorsMap[cat] || '#9CA3AF',
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
    }, [currentDate, viewScope])
  );

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={loadAnalytics} colors={['#1cc29f']} />}
    >
      {/* Month Navigator Header */}
      <View style={styles.navigatorCard}>
        <View style={styles.monthNavRow}>
          <TouchableOpacity onPress={handlePrevMonth} style={styles.navArrowBtn}>
            <Ionicons name="chevron-back" size={20} color="#111827" />
          </TouchableOpacity>

          <Text style={styles.monthNavTitle}>{monthDisplayTitle}</Text>

          <TouchableOpacity onPress={handleNextMonth} style={styles.navArrowBtn}>
            <Ionicons name="chevron-forward" size={20} color="#111827" />
          </TouchableOpacity>
        </View>

        <View style={styles.scopeToggleRow}>
          <TouchableOpacity
            style={[styles.scopeBtn, viewScope === 'MONTH' && styles.scopeBtnActive]}
            onPress={() => setViewScope('MONTH')}
          >
            <Text style={[styles.scopeBtnText, viewScope === 'MONTH' && styles.scopeBtnTextActive]}>
              Monthly View
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.scopeBtn, viewScope === 'ALL' && styles.scopeBtnActive]}
            onPress={() => setViewScope('ALL')}
          >
            <Text style={[styles.scopeBtnText, viewScope === 'ALL' && styles.scopeBtnTextActive]}>
              All-Time View
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Overview Cards */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>
            {viewScope === 'MONTH' ? `${monthDisplayTitle} Spend` : 'All-Time Total'}
          </Text>
          <Text style={styles.statValue}>
            {formatMoney(viewScope === 'MONTH' ? selectedMonthTotal : totalSpent)}
          </Text>
          <Text style={styles.statSub}>your actual personal share</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>All-Time Total</Text>
          <Text style={styles.statValue}>{formatMoney(totalSpent)}</Text>
          <Text style={styles.statSub}>across all groups & friends</Text>
        </View>
      </View>

      {/* Visual Spending Bar Chart - Only if categories exist */}
      {categoryBreakdown.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.cardHeader}>
            {viewScope === 'MONTH' ? `Spending by Category (${monthDisplayTitle})` : 'All-Time Spending by Category'}
          </Text>

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
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  navigatorCard: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  navArrowBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  monthNavTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  scopeToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 3,
  },
  scopeBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 6,
  },
  scopeBtnActive: {
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
  },
  scopeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  scopeBtnTextActive: {
    color: '#1cc29f',
    fontWeight: '700',
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
