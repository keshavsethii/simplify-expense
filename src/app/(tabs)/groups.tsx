import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { getAllGroups, getGroupBalances } from '../../db/queries';
import { Group } from '../../db/types';
import { formatMoney } from '../../utils/currency';

interface GroupCardData {
  group: Group;
  userBalance: number;
}

export default function GroupsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<GroupCardData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');

  const loadGroups = async () => {
    try {
      setLoading(true);
      const allGroups = await getAllGroups();
      const cardData: GroupCardData[] = [];

      for (const g of allGroups) {
        const balances = await getGroupBalances(g.id);
        const userBal = balances.find((b) => b.member.is_user === 1)?.netBalance || 0;
        cardData.push({
          group: g,
          userBalance: userBal,
        });
      }

      setGroups(cardData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadGroups();
    }, [])
  );

  const getGroupIcon = (type: Group['type']) => {
    switch (type) {
      case 'home':
        return <Ionicons name="home" size={22} color="#1cc29f" />;
      case 'trip':
        return <Ionicons name="airplane" size={22} color="#3b82f6" />;
      case 'couple':
        return <Ionicons name="heart" size={22} color="#ec4899" />;
      default:
        return <Ionicons name="receipt" size={22} color="#FF8200" />;
    }
  };

  const renderGroupItem = ({ item }: { item: GroupCardData }) => {
    const isPositive = item.userBalance > 0;
    const isSettled = Math.abs(item.userBalance) < 0.01;

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => router.push(`/group/${item.group.id}`)}
      >
        <View style={styles.iconContainer}>{getGroupIcon(item.group.type)}</View>

        <View style={styles.groupInfo}>
          <Text style={styles.groupName}>{item.group.name}</Text>
          <View style={styles.badgeRow}>
            <Text style={styles.groupTypeBadge}>{item.group.type.toUpperCase()}</Text>
            {item.group.simplify_debts === 1 && (
              <View style={styles.proPill}>
                <Text style={styles.proPillText}>Simplified Debts</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.balanceContainer}>
          <Text
            style={[
              styles.balanceText,
              isSettled
                ? styles.textNeutral
                : isPositive
                ? styles.textPositive
                : styles.textNegative,
            ]}
          >
            {isSettled
              ? 'settled'
              : isPositive
              ? `+${formatMoney(item.userBalance, item.group.currency)}`
              : `-${formatMoney(item.userBalance, item.group.currency)}`}
          </Text>
          <Text style={styles.balanceSub}>
            {isSettled ? 'all even' : isPositive ? 'you are owed' : 'you owe'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const groupTypes = ['ALL', 'home', 'trip', 'couple', 'other'];

  const filteredGroups = groups.filter((item) => {
    const matchesSearch = item.group.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = selectedType === 'ALL' || item.group.type.toLowerCase() === selectedType.toLowerCase();
    return matchesSearch && matchesType;
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Your Groups</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => router.push('/create-group')}
        >
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={styles.createButtonText}>Start a new group</Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar & Type Chips */}
      <View style={styles.filterSection}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color="#9CA3AF" />
          <TextInput
            placeholder="Search your groups..."
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

        <View style={styles.typeChipsRow}>
          {groupTypes.map((type) => (
            <TouchableOpacity
              key={type}
              style={[styles.typeChip, selectedType === type && styles.typeChipActive]}
              onPress={() => setSelectedType(type)}
            >
              <Text style={[styles.typeChipText, selectedType === type && styles.typeChipTextActive]}>
                {type === 'ALL'
                  ? 'All'
                  : type === 'home'
                  ? 'Home'
                  : type === 'trip'
                  ? 'Trip'
                  : type === 'couple'
                  ? 'Couple'
                  : 'Other'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        data={filteredGroups}
        keyExtractor={(item) => item.group.id}
        renderItem={renderGroupItem}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadGroups} colors={['#1cc29f']} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="account-group" size={60} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>
              {searchQuery || selectedType !== 'ALL' ? 'No groups match your search' : 'You are not in any groups yet'}
            </Text>
            <Text style={styles.emptySub}>
              {searchQuery || selectedType !== 'ALL'
                ? 'Try clearing your search filters'
                : 'Groups are the easiest way to track expenses for trips, roommates, or events!'}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1cc29f',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    gap: 4,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  filterSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingBottom: 10,
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
  typeChipsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  typeChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
  },
  typeChipActive: {
    backgroundColor: '#1cc29f',
  },
  typeChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
  },
  typeChipTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingVertical: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    marginBottom: 8,
    marginHorizontal: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupInfo: {
    flex: 1,
    marginLeft: 14,
  },
  groupName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  groupTypeBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B7280',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  proPill: {
    backgroundColor: '#E8F8F5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  proPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1cc29f',
  },
  balanceContainer: {
    alignItems: 'flex-end',
  },
  balanceText: {
    fontSize: 15,
    fontWeight: '700',
  },
  balanceSub: {
    fontSize: 11,
    color: '#6B7280',
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
});
