import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Group,
  Member,
  Expense,
  ExpenseSplit,
  Settlement,
  DefaultGroupSplit,
  CustomCategory,
  ExpenseTemplate,
} from './types';

const STORAGE_KEYS = {
  MEMBERS: 'simplify_members',
  GROUPS: 'simplify_groups',
  GROUP_MEMBERS: 'simplify_group_members',
  EXPENSES: 'simplify_expenses',
  EXPENSE_SPLITS: 'simplify_expense_splits',
  SETTLEMENTS: 'simplify_settlements',
  DEFAULT_SPLITS: 'simplify_default_splits',
  CUSTOM_CATEGORIES: 'simplify_custom_categories',
  EXPENSE_TEMPLATES: 'simplify_expense_templates',
  INITIALIZED: 'simplify_db_initialized',
};

async function getItem<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const val = await AsyncStorage.getItem(key);
    return val ? JSON.parse(val) : defaultValue;
  } catch (e) {
    console.error(`Failed to read ${key}:`, e);
    return defaultValue;
  }
}

async function setItem<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Failed to write ${key}:`, e);
  }
}

export async function exportDatabaseBackup(): Promise<string> {
  const members = await getItem(STORAGE_KEYS.MEMBERS, []);
  const groups = await getItem(STORAGE_KEYS.GROUPS, []);
  const groupMembers = await getItem(STORAGE_KEYS.GROUP_MEMBERS, []);
  const expenses = await getItem(STORAGE_KEYS.EXPENSES, []);
  const expenseSplits = await getItem(STORAGE_KEYS.EXPENSE_SPLITS, []);
  const settlements = await getItem(STORAGE_KEYS.SETTLEMENTS, []);
  const defaultSplits = await getItem(STORAGE_KEYS.DEFAULT_SPLITS, []);
  const customCategories = await getItem(STORAGE_KEYS.CUSTOM_CATEGORIES, []);
  const expenseTemplates = await getItem(STORAGE_KEYS.EXPENSE_TEMPLATES, []);

  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      members,
      groups,
      groupMembers,
      expenses,
      expenseSplits,
      settlements,
      defaultSplits,
      customCategories,
      expenseTemplates,
    },
  };

  return JSON.stringify(backup, null, 2);
}

export async function importDatabaseBackup(jsonString: string): Promise<boolean> {
  try {
    const backup = JSON.parse(jsonString);
    if (!backup.data || !backup.data.members) {
      throw new Error('Invalid backup file format');
    }

    const {
      members,
      groups,
      groupMembers,
      expenses,
      expenseSplits,
      settlements,
      defaultSplits,
      customCategories,
      expenseTemplates,
    } = backup.data;

    await setItem(STORAGE_KEYS.MEMBERS, members || []);
    await setItem(STORAGE_KEYS.GROUPS, groups || []);
    await setItem(STORAGE_KEYS.GROUP_MEMBERS, groupMembers || []);
    await setItem(STORAGE_KEYS.EXPENSES, expenses || []);
    await setItem(STORAGE_KEYS.EXPENSE_SPLITS, expenseSplits || []);
    await setItem(STORAGE_KEYS.SETTLEMENTS, settlements || []);
    await setItem(STORAGE_KEYS.DEFAULT_SPLITS, defaultSplits || []);
    if (customCategories) await setItem(STORAGE_KEYS.CUSTOM_CATEGORIES, customCategories);
    if (expenseTemplates) await setItem(STORAGE_KEYS.EXPENSE_TEMPLATES, expenseTemplates);

    return true;
  } catch (e) {
    console.error('Import error:', e);
    throw e;
  }
}

export async function initStorage(): Promise<void> {
  const isInit = await AsyncStorage.getItem(STORAGE_KEYS.INITIALIZED);
  if (isInit) return;

  const now = new Date().toISOString();
  const userId = 'user_self';
  const friend1 = 'member_alex';
  const friend2 = 'member_sam';

  const defaultMembers: Member[] = [
    { id: userId, name: 'You', email: 'me@personal.app', is_user: 1, avatar_color: '#1cc29f' },
    { id: friend1, name: 'Alex', email: 'alex@example.com', is_user: 0, avatar_color: '#FF8200' },
    { id: friend2, name: 'Sam', email: 'sam@example.com', is_user: 0, avatar_color: '#5bc5a7' },
  ];

  const demoGroupId = 'group_apartment';
  const defaultGroups: Group[] = [
    {
      id: demoGroupId,
      name: 'Apartment Roommates',
      type: 'home',
      currency: 'INR',
      simplify_debts: 1,
      created_at: now,
    },
  ];

  const defaultGroupMembers: { group_id: string; member_id: string }[] = [
    { group_id: demoGroupId, member_id: userId },
    { group_id: demoGroupId, member_id: friend1 },
    { group_id: demoGroupId, member_id: friend2 },
  ];

  const expId = 'exp_groceries_1';
  const defaultExpenses: Expense[] = [
    {
      id: expId,
      group_id: demoGroupId,
      description: 'Supermarket Groceries',
      amount: 1500.0,
      currency: 'INR',
      date: now.substring(0, 10),
      category: 'Groceries',
      paid_by_member_id: userId,
      split_type: 'EQUAL',
      created_at: now,
    },
  ];

  const defaultSplits: ExpenseSplit[] = [
    { id: 'split_1', expense_id: expId, member_id: userId, amount: 500.0 },
    { id: 'split_2', expense_id: expId, member_id: friend1, amount: 500.0 },
    { id: 'split_3', expense_id: expId, member_id: friend2, amount: 500.0 },
  ];

  await setItem(STORAGE_KEYS.MEMBERS, defaultMembers);
  await setItem(STORAGE_KEYS.GROUPS, defaultGroups);
  await setItem(STORAGE_KEYS.GROUP_MEMBERS, defaultGroupMembers);
  await setItem(STORAGE_KEYS.EXPENSES, defaultExpenses);
  await setItem(STORAGE_KEYS.EXPENSE_SPLITS, defaultSplits);
  await setItem(STORAGE_KEYS.SETTLEMENTS, []);
  await setItem(STORAGE_KEYS.DEFAULT_SPLITS, []);
  await AsyncStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
}

// ==================== MEMBERS ====================
export async function getAllMembers(): Promise<Member[]> {
  const members = await getItem<Member[]>(STORAGE_KEYS.MEMBERS, []);
  return members.sort((a, b) => b.is_user - a.is_user || a.name.localeCompare(b.name));
}

export async function getCurrentUser(): Promise<Member> {
  const members = await getAllMembers();
  const user = members.find((m) => m.is_user === 1);
  if (!user) throw new Error('User not found');
  return user;
}

export async function addFriend(name: string, email?: string): Promise<Member> {
  const members = await getItem<Member[]>(STORAGE_KEYS.MEMBERS, []);
  const id = 'member_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const colors = ['#FF8200', '#5bc5a7', '#1cc29f', '#3b82f6', '#ec4899', '#8b5cf6', '#10b981'];
  const avatarColor = colors[Math.floor(Math.random() * colors.length)];

  const newMember: Member = {
    id,
    name,
    email: email || undefined,
    is_user: 0,
    avatar_color: avatarColor,
  };

  members.push(newMember);
  await setItem(STORAGE_KEYS.MEMBERS, members);
  return newMember;
}

export async function updateCurrentUser(name: string, email?: string, avatarColor?: string): Promise<Member> {
  const members = await getItem<Member[]>(STORAGE_KEYS.MEMBERS, []);
  const idx = members.findIndex((m) => m.is_user === 1);
  if (idx === -1) throw new Error('User not found');

  members[idx].name = name;
  if (email !== undefined) members[idx].email = email;
  if (avatarColor) members[idx].avatar_color = avatarColor;

  await setItem(STORAGE_KEYS.MEMBERS, members);
  return members[idx];
}

export async function deleteMember(memberId: string): Promise<void> {
  const members = await getItem<Member[]>(STORAGE_KEYS.MEMBERS, []);
  const groupMembers = await getItem<{ group_id: string; member_id: string }[]>(STORAGE_KEYS.GROUP_MEMBERS, []);
  const expenses = await getItem<Expense[]>(STORAGE_KEYS.EXPENSES, []);
  const splits = await getItem<ExpenseSplit[]>(STORAGE_KEYS.EXPENSE_SPLITS, []);
  const settlements = await getItem<Settlement[]>(STORAGE_KEYS.SETTLEMENTS, []);

  await setItem(STORAGE_KEYS.MEMBERS, members.filter((m) => m.id !== memberId));
  await setItem(STORAGE_KEYS.GROUP_MEMBERS, groupMembers.filter((gm) => gm.member_id !== memberId));
  await setItem(STORAGE_KEYS.EXPENSES, expenses.filter((e) => e.paid_by_member_id !== memberId));
  await setItem(STORAGE_KEYS.EXPENSE_SPLITS, splits.filter((s) => s.member_id !== memberId));
  await setItem(STORAGE_KEYS.SETTLEMENTS, settlements.filter((s) => s.from_member_id !== memberId && s.to_member_id !== memberId));
}

export async function deleteGroup(groupId: string): Promise<void> {
  const groups = await getItem<Group[]>(STORAGE_KEYS.GROUPS, []);
  const groupMembers = await getItem<{ group_id: string; member_id: string }[]>(STORAGE_KEYS.GROUP_MEMBERS, []);
  const expenses = await getItem<Expense[]>(STORAGE_KEYS.EXPENSES, []);
  const splits = await getItem<ExpenseSplit[]>(STORAGE_KEYS.EXPENSE_SPLITS, []);
  const settlements = await getItem<Settlement[]>(STORAGE_KEYS.SETTLEMENTS, []);
  const defaultSplits = await getItem<DefaultGroupSplit[]>(STORAGE_KEYS.DEFAULT_SPLITS, []);

  const groupExpenseIds = new Set(expenses.filter((e) => e.group_id === groupId).map((e) => e.id));

  await setItem(STORAGE_KEYS.GROUPS, groups.filter((g) => g.id !== groupId));
  await setItem(STORAGE_KEYS.GROUP_MEMBERS, groupMembers.filter((gm) => gm.group_id !== groupId));
  await setItem(STORAGE_KEYS.EXPENSES, expenses.filter((e) => e.group_id !== groupId));
  await setItem(STORAGE_KEYS.EXPENSE_SPLITS, splits.filter((s) => !groupExpenseIds.has(s.expense_id)));
  await setItem(STORAGE_KEYS.SETTLEMENTS, settlements.filter((s) => s.group_id !== groupId));
  await setItem(STORAGE_KEYS.DEFAULT_SPLITS, defaultSplits.filter((ds) => ds.group_id !== groupId));
}

export async function deleteSettlement(settlementId: string): Promise<void> {
  const settlements = await getItem<Settlement[]>(STORAGE_KEYS.SETTLEMENTS, []);
  await setItem(STORAGE_KEYS.SETTLEMENTS, settlements.filter((s) => s.id !== settlementId));
}

// ==================== GROUPS ====================
export async function getAllGroups(): Promise<Group[]> {
  const groups = await getItem<Group[]>(STORAGE_KEYS.GROUPS, []);
  return groups.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getGroupById(id: string): Promise<Group | null> {
  const groups = await getItem<Group[]>(STORAGE_KEYS.GROUPS, []);
  return groups.find((g) => g.id === id) || null;
}

export async function createGroup(
  name: string,
  type: Group['type'] = 'other',
  currency: string = 'INR',
  memberIds: string[] = []
): Promise<Group> {
  const groups = await getItem<Group[]>(STORAGE_KEYS.GROUPS, []);
  const groupMembers = await getItem<{ group_id: string; member_id: string }[]>(
    STORAGE_KEYS.GROUP_MEMBERS,
    []
  );

  const id = 'group_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const createdAt = new Date().toISOString();

  const newGroup: Group = {
    id,
    name,
    type,
    currency,
    simplify_debts: 1,
    is_archived: 0,
    created_at: createdAt,
  };

  groups.push(newGroup);
  await setItem(STORAGE_KEYS.GROUPS, groups);

  const currentUser = await getCurrentUser();
  const finalMemberIds = Array.from(new Set([currentUser.id, ...memberIds]));

  for (const mId of finalMemberIds) {
    groupMembers.push({ group_id: id, member_id: mId });
  }
  await setItem(STORAGE_KEYS.GROUP_MEMBERS, groupMembers);

  return newGroup;
}

export async function updateGroupSimplifyDebts(groupId: string, simplify: boolean): Promise<void> {
  const groups = await getItem<Group[]>(STORAGE_KEYS.GROUPS, []);
  const idx = groups.findIndex((g) => g.id === groupId);
  if (idx !== -1) {
    groups[idx].simplify_debts = simplify ? 1 : 0;
    await setItem(STORAGE_KEYS.GROUPS, groups);
  }
}

export async function updateGroupArchivedStatus(groupId: string, isArchived: boolean): Promise<void> {
  const groups = await getItem<Group[]>(STORAGE_KEYS.GROUPS, []);
  const idx = groups.findIndex((g) => g.id === groupId);
  if (idx !== -1) {
    groups[idx].is_archived = isArchived ? 1 : 0;
    await setItem(STORAGE_KEYS.GROUPS, groups);
  }
}

export async function getGroupMembers(groupId: string): Promise<Member[]> {
  const allMembers = await getAllMembers();
  const groupMembers = await getItem<{ group_id: string; member_id: string }[]>(
    STORAGE_KEYS.GROUP_MEMBERS,
    []
  );

  const memberIdSet = new Set(
    groupMembers.filter((gm) => gm.group_id === groupId).map((gm) => gm.member_id)
  );

  return allMembers.filter((m) => memberIdSet.has(m.id));
}

export async function addMemberToGroup(groupId: string, memberId: string): Promise<void> {
  const groupMembers = await getItem<{ group_id: string; member_id: string }[]>(
    STORAGE_KEYS.GROUP_MEMBERS,
    []
  );
  const alreadyIn = groupMembers.some((gm) => gm.group_id === groupId && gm.member_id === memberId);
  if (!alreadyIn) {
    groupMembers.push({ group_id: groupId, member_id: memberId });
    await setItem(STORAGE_KEYS.GROUP_MEMBERS, groupMembers);
  }
}

// ==================== DEFAULT SPLITS (PRO) ====================
export async function getDefaultGroupSplit(groupId: string): Promise<DefaultGroupSplit | null> {
  const splits = await getItem<DefaultGroupSplit[]>(STORAGE_KEYS.DEFAULT_SPLITS, []);
  return splits.find((s) => s.group_id === groupId) || null;
}

export async function saveDefaultGroupSplit(
  groupId: string,
  splitType: 'EQUAL' | 'PERCENT' | 'SHARES',
  splitsJson: string
): Promise<void> {
  const splits = await getItem<DefaultGroupSplit[]>(STORAGE_KEYS.DEFAULT_SPLITS, []);
  const idx = splits.findIndex((s) => s.group_id === groupId);
  const item: DefaultGroupSplit = {
    id: 'default_split_' + Date.now(),
    group_id: groupId,
    split_type: splitType,
    splits_json: splitsJson,
  };
  if (idx !== -1) {
    splits[idx] = item;
  } else {
    splits.push(item);
  }
  await setItem(STORAGE_KEYS.DEFAULT_SPLITS, splits);
}

// ==================== EXPENSES ====================
export interface AddExpenseParams {
  groupId: string | null;
  description: string;
  amount: number;
  currency: string;
  date: string;
  category: string;
  paidByMemberId: string;
  splitType: Expense['split_type'];
  payersJson?: string;
  notes?: string;
  splits: {
    memberId: string;
    amount: number;
    percentage?: number;
    shares?: number;
  }[];
}

export async function addExpense(params: AddExpenseParams): Promise<string> {
  const expenses = await getItem<Expense[]>(STORAGE_KEYS.EXPENSES, []);
  const allSplits = await getItem<ExpenseSplit[]>(STORAGE_KEYS.EXPENSE_SPLITS, []);

  const expenseId = 'exp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const now = new Date().toISOString();

  const newExpense: Expense = {
    id: expenseId,
    group_id: params.groupId || null,
    description: params.description,
    amount: params.amount,
    currency: params.currency,
    date: params.date,
    category: params.category || 'General',
    paid_by_member_id: params.paidByMemberId,
    split_type: params.splitType,
    payers_json: params.payersJson,
    notes: params.notes,
    created_at: now,
  };

  expenses.push(newExpense);
  await setItem(STORAGE_KEYS.EXPENSES, expenses);

  for (const s of params.splits) {
    allSplits.push({
      id: 'split_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      expense_id: expenseId,
      member_id: s.memberId,
      amount: s.amount,
      percentage: s.percentage,
      shares: s.shares,
    });
  }
  await setItem(STORAGE_KEYS.EXPENSE_SPLITS, allSplits);

  return expenseId;
}

export interface UpdateExpenseParams {
  id: string;
  groupId: string | null;
  description: string;
  amount: number;
  currency: string;
  date: string;
  category: string;
  paidByMemberId: string;
  splitType: Expense['split_type'];
  payersJson?: string;
  notes?: string;
  splits: {
    memberId: string;
    amount: number;
    percentage?: number;
    shares?: number;
  }[];
}

export async function updateExpense(params: UpdateExpenseParams): Promise<void> {
  const expenses = await getItem<Expense[]>(STORAGE_KEYS.EXPENSES, []);
  const allSplits = await getItem<ExpenseSplit[]>(STORAGE_KEYS.EXPENSE_SPLITS, []);

  const idx = expenses.findIndex((e) => e.id === params.id);
  if (idx === -1) throw new Error('Expense not found');

  expenses[idx] = {
    ...expenses[idx],
    group_id: params.groupId || null,
    description: params.description,
    amount: params.amount,
    currency: params.currency,
    date: params.date,
    category: params.category || 'General',
    paid_by_member_id: params.paidByMemberId,
    split_type: params.splitType,
    payers_json: params.payersJson,
    notes: params.notes,
  };

  await setItem(STORAGE_KEYS.EXPENSES, expenses);

  // Replace splits for this expense
  const otherSplits = allSplits.filter((s) => s.expense_id !== params.id);
  for (const s of params.splits) {
    otherSplits.push({
      id: 'split_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      expense_id: params.id,
      member_id: s.memberId,
      amount: s.amount,
      percentage: s.percentage,
      shares: s.shares,
    });
  }

  await setItem(STORAGE_KEYS.EXPENSE_SPLITS, otherSplits);
}

export async function deleteExpense(expenseId: string): Promise<void> {
  const expenses = await getItem<Expense[]>(STORAGE_KEYS.EXPENSES, []);
  const allSplits = await getItem<ExpenseSplit[]>(STORAGE_KEYS.EXPENSE_SPLITS, []);

  await setItem(
    STORAGE_KEYS.EXPENSES,
    expenses.filter((e) => e.id !== expenseId)
  );
  await setItem(
    STORAGE_KEYS.EXPENSE_SPLITS,
    allSplits.filter((s) => s.expense_id !== expenseId)
  );
}

export async function getExpenses(groupId?: string, memberId?: string): Promise<Expense[]> {
  const expenses = await getItem<Expense[]>(STORAGE_KEYS.EXPENSES, []);
  const allSplits = await getItem<ExpenseSplit[]>(STORAGE_KEYS.EXPENSE_SPLITS, []);

  let filtered = [...expenses];

  if (groupId) {
    filtered = filtered.filter((e) => e.group_id === groupId);
  }
  if (memberId) {
    const expenseIdsWithMember = new Set(
      allSplits.filter((s) => s.member_id === memberId).map((s) => s.expense_id)
    );
    filtered = filtered.filter(
      (e) => e.paid_by_member_id === memberId || expenseIdsWithMember.has(e.id)
    );
  }

  return filtered.sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
}

export async function getExpenseSplits(expenseId: string): Promise<ExpenseSplit[]> {
  const allSplits = await getItem<ExpenseSplit[]>(STORAGE_KEYS.EXPENSE_SPLITS, []);
  return allSplits.filter((s) => s.expense_id === expenseId);
}

// ==================== SETTLEMENTS ====================
export async function addSettlement(params: {
  groupId: string | null;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  currency: string;
  date: string;
  notes?: string;
}): Promise<string> {
  const settlements = await getItem<Settlement[]>(STORAGE_KEYS.SETTLEMENTS, []);
  const id = 'settle_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const now = new Date().toISOString();

  const newSettlement: Settlement = {
    id,
    group_id: params.groupId,
    from_member_id: params.fromMemberId,
    to_member_id: params.toMemberId,
    amount: params.amount,
    currency: params.currency,
    date: params.date,
    notes: params.notes,
    created_at: now,
  };

  settlements.push(newSettlement);
  await setItem(STORAGE_KEYS.SETTLEMENTS, settlements);
  return id;
}

export async function getSettlements(groupId?: string): Promise<Settlement[]> {
  const settlements = await getItem<Settlement[]>(STORAGE_KEYS.SETTLEMENTS, []);
  if (groupId) {
    return settlements.filter((s) => s.group_id === groupId);
  }
  return settlements;
}

// ==================== BALANCES & COMPUTATIONS ====================
export interface MemberBalanceInfo {
  member: Member;
  netBalance: number;
}

export async function getGroupBalances(groupId: string): Promise<MemberBalanceInfo[]> {
  const members = await getGroupMembers(groupId);
  const expenses = await getExpenses(groupId);
  const allSplits = await getItem<ExpenseSplit[]>(STORAGE_KEYS.EXPENSE_SPLITS, []);
  const settlements = await getSettlements(groupId);

  const expenseIdSet = new Set(expenses.map((e) => e.id));
  const splits = allSplits.filter((s) => expenseIdSet.has(s.expense_id));

  const balanceMap: Record<string, number> = {};
  for (const m of members) {
    balanceMap[m.id] = 0;
  }

  // 1. Credit payer(s) of each expense
  for (const exp of expenses) {
    if (exp.payers_json) {
      try {
        const payers: { member_id: string; amount: number }[] = JSON.parse(exp.payers_json);
        for (const p of payers) {
          if (balanceMap[p.member_id] !== undefined) {
            balanceMap[p.member_id] += p.amount;
          }
        }
      } catch {
        if (balanceMap[exp.paid_by_member_id] !== undefined) {
          balanceMap[exp.paid_by_member_id] += exp.amount;
        }
      }
    } else if (balanceMap[exp.paid_by_member_id] !== undefined) {
      balanceMap[exp.paid_by_member_id] += exp.amount;
    }
  }

  // 2. Debit each member for their share
  for (const sp of splits) {
    if (balanceMap[sp.member_id] !== undefined) {
      balanceMap[sp.member_id] -= sp.amount;
    }
  }

  // 3. Apply settlements
  for (const set of settlements) {
    if (balanceMap[set.from_member_id] !== undefined) {
      balanceMap[set.from_member_id] += set.amount;
    }
    if (balanceMap[set.to_member_id] !== undefined) {
      balanceMap[set.to_member_id] -= set.amount;
    }
  }

  return members.map((m) => ({
    member: m,
    netBalance: Math.round((balanceMap[m.id] || 0) * 100) / 100,
  }));
}

export async function getFriendLedger(friendId: string): Promise<{
  friend: Member;
  netBalance: number; // positive = friend owes you, negative = you owe friend
  expenses: { expense: Expense; yourShare: number; friendShare: number; paidByFriend: boolean; paidByYou: boolean }[];
  settlements: Settlement[];
}> {
  const allMembers = await getAllMembers();
  const currentUser = await getCurrentUser();
  const friend = allMembers.find((m) => m.id === friendId);
  if (!friend) throw new Error('Friend not found');

  const allExpenses = await getItem<Expense[]>(STORAGE_KEYS.EXPENSES, []);
  const allSplits = await getItem<ExpenseSplit[]>(STORAGE_KEYS.EXPENSE_SPLITS, []);
  const allSettlements = await getItem<Settlement[]>(STORAGE_KEYS.SETTLEMENTS, []);

  const splitsByExpense: Record<string, ExpenseSplit[]> = {};
  for (const s of allSplits) {
    if (!splitsByExpense[s.expense_id]) splitsByExpense[s.expense_id] = [];
    splitsByExpense[s.expense_id].push(s);
  }

  const mutualExpenses: {
    expense: Expense;
    yourShare: number;
    friendShare: number;
    paidByFriend: boolean;
    paidByYou: boolean;
  }[] = [];

  let balanceWithFriend = 0;

  for (const exp of allExpenses) {
    const splits = splitsByExpense[exp.id] || [];
    const yourSplit = splits.find((s) => s.member_id === currentUser.id);
    const friendSplit = splits.find((s) => s.member_id === friendId);

    const involvesBoth =
      (exp.paid_by_member_id === currentUser.id && friendSplit) ||
      (exp.paid_by_member_id === friendId && yourSplit) ||
      (yourSplit && friendSplit);

    if (involvesBoth) {
      const paidByYou = exp.paid_by_member_id === currentUser.id;
      const paidByFriend = exp.paid_by_member_id === friendId;

      if (paidByYou && friendSplit) {
        balanceWithFriend += friendSplit.amount;
      } else if (paidByFriend && yourSplit) {
        balanceWithFriend -= yourSplit.amount;
      }

      mutualExpenses.push({
        expense: exp,
        yourShare: yourSplit ? yourSplit.amount : 0,
        friendShare: friendSplit ? friendSplit.amount : 0,
        paidByFriend,
        paidByYou,
      });
    }
  }

  // Filter settlements between currentUser and friend
  const mutualSettlements = allSettlements.filter(
    (s) =>
      (s.from_member_id === currentUser.id && s.to_member_id === friendId) ||
      (s.from_member_id === friendId && s.to_member_id === currentUser.id)
  );

  for (const s of mutualSettlements) {
    if (s.from_member_id === currentUser.id) {
      balanceWithFriend += s.amount;
    } else if (s.to_member_id === currentUser.id) {
      balanceWithFriend -= s.amount;
    }
  }

  return {
    friend,
    netBalance: Math.round(balanceWithFriend * 100) / 100,
    expenses: mutualExpenses.sort((a, b) => b.expense.date.localeCompare(a.expense.date)),
    settlements: mutualSettlements.sort((a, b) => b.date.localeCompare(a.date)),
  };
}

export async function getOverallUserBalance(): Promise<{
  totalOwedToYou: number;
  totalYouOwe: number;
  netTotal: number;
  friendBalances: { member: Member; balance: number }[];
}> {
  const allMembers = await getAllMembers();
  const currentUser = await getCurrentUser();
  const friends = allMembers.filter((m) => m.is_user === 0);

  const balanceMap: Record<string, number> = {};
  for (const m of friends) {
    balanceMap[m.id] = 0;
  }

  const expenses = await getItem<Expense[]>(STORAGE_KEYS.EXPENSES, []);
  const splits = await getItem<ExpenseSplit[]>(STORAGE_KEYS.EXPENSE_SPLITS, []);
  const settlements = await getItem<Settlement[]>(STORAGE_KEYS.SETTLEMENTS, []);

  const splitsByExpense: Record<string, ExpenseSplit[]> = {};
  for (const s of splits) {
    if (!splitsByExpense[s.expense_id]) splitsByExpense[s.expense_id] = [];
    splitsByExpense[s.expense_id].push(s);
  }

  for (const exp of expenses) {
    const expSplits = splitsByExpense[exp.id] || [];
    if (exp.payers_json) {
      try {
        const payers: { member_id: string; amount: number }[] = JSON.parse(exp.payers_json);
        const myPaid = payers.find((p) => p.member_id === currentUser.id)?.amount || 0;
        const mySplit = expSplits.find((s) => s.member_id === currentUser.id)?.amount || 0;

        for (const p of payers) {
          if (p.member_id !== currentUser.id && balanceMap[p.member_id] !== undefined && exp.amount > 0) {
            const payerProportion = p.amount / exp.amount;
            balanceMap[p.member_id] -= mySplit * payerProportion;
          }
        }
        for (const sp of expSplits) {
          if (sp.member_id !== currentUser.id && balanceMap[sp.member_id] !== undefined && exp.amount > 0) {
            const myProportion = myPaid / exp.amount;
            balanceMap[sp.member_id] += sp.amount * myProportion;
          }
        }
      } catch {
        if (exp.paid_by_member_id === currentUser.id) {
          for (const sp of expSplits) {
            if (sp.member_id !== currentUser.id && balanceMap[sp.member_id] !== undefined) {
              balanceMap[sp.member_id] += sp.amount;
            }
          }
        } else {
          const payerId = exp.paid_by_member_id;
          const yourSplit = expSplits.find((s) => s.member_id === currentUser.id);
          if (yourSplit && balanceMap[payerId] !== undefined) {
            balanceMap[payerId] -= yourSplit.amount;
          }
        }
      }
    } else if (exp.paid_by_member_id === currentUser.id) {
      for (const sp of expSplits) {
        if (sp.member_id !== currentUser.id && balanceMap[sp.member_id] !== undefined) {
          balanceMap[sp.member_id] += sp.amount;
        }
      }
    } else {
      const payerId = exp.paid_by_member_id;
      const yourSplit = expSplits.find((s) => s.member_id === currentUser.id);
      if (yourSplit && balanceMap[payerId] !== undefined) {
        balanceMap[payerId] -= yourSplit.amount;
      }
    }
  }

  for (const set of settlements) {
    if (set.from_member_id === currentUser.id) {
      if (balanceMap[set.to_member_id] !== undefined) {
        balanceMap[set.to_member_id] += set.amount;
      }
    } else if (set.to_member_id === currentUser.id) {
      if (balanceMap[set.from_member_id] !== undefined) {
        balanceMap[set.from_member_id] -= set.amount;
      }
    }
  }

  let totalOwedToYou = 0;
  let totalYouOwe = 0;
  const friendBalances = friends.map((m) => {
    const bal = Math.round((balanceMap[m.id] || 0) * 100) / 100;
    if (bal > 0) totalOwedToYou += bal;
    if (bal < 0) totalYouOwe += Math.abs(bal);
    return { member: m, balance: bal };
  });

  return {
    totalOwedToYou: Math.round(totalOwedToYou * 100) / 100,
    totalYouOwe: Math.round(totalYouOwe * 100) / 100,
    netTotal: Math.round((totalOwedToYou - totalYouOwe) * 100) / 100,
    friendBalances,
  };
}

// --- Categories Management ---
const DEFAULT_CATEGORIES: CustomCategory[] = [
  { name: 'General', color: '#6B7280', icon: 'dots-horizontal-circle-outline', is_default: true },
  { name: 'Groceries', color: '#10B981', icon: 'cart-outline', is_default: true },
  { name: 'Food', color: '#F59E0B', icon: 'fast-food-outline', is_default: true },
  { name: 'Utilities', color: '#3B82F6', icon: 'flash-outline', is_default: true },
  { name: 'Travel', color: '#8B5CF6', icon: 'airplane-outline', is_default: true },
  { name: 'Entertainment', color: '#EC4899', icon: 'film-outline', is_default: true },
];

export async function getAllCategories(): Promise<CustomCategory[]> {
  const custom = await getItem<CustomCategory[]>(STORAGE_KEYS.CUSTOM_CATEGORIES, []);
  const map = new Map<string, CustomCategory>();
  DEFAULT_CATEGORIES.forEach((c) => map.set(c.name.toLowerCase(), c));
  custom.forEach((c) => map.set(c.name.toLowerCase(), c));
  return Array.from(map.values());
}

export async function addCustomCategory(category: {
  name: string;
  color: string;
  icon: string;
}): Promise<CustomCategory> {
  const trimmed = category.name.trim();
  if (!trimmed) throw new Error('Category name cannot be empty');
  const existing = await getItem<CustomCategory[]>(STORAGE_KEYS.CUSTOM_CATEGORIES, []);
  const newCat: CustomCategory = {
    name: trimmed,
    color: category.color || '#1cc29f',
    icon: category.icon || 'tag-outline',
    is_default: false,
  };
  const filtered = existing.filter((c) => c.name.toLowerCase() !== trimmed.toLowerCase());
  filtered.push(newCat);
  await setItem(STORAGE_KEYS.CUSTOM_CATEGORIES, filtered);
  return newCat;
}

export async function deleteCustomCategory(name: string): Promise<void> {
  const existing = await getItem<CustomCategory[]>(STORAGE_KEYS.CUSTOM_CATEGORIES, []);
  const filtered = existing.filter((c) => c.name.toLowerCase() !== name.toLowerCase());
  await setItem(STORAGE_KEYS.CUSTOM_CATEGORIES, filtered);
}

// --- Expense Templates Management ---
export async function getAllTemplates(): Promise<ExpenseTemplate[]> {
  return await getItem<ExpenseTemplate[]>(STORAGE_KEYS.EXPENSE_TEMPLATES, []);
}

export async function addExpenseTemplate(
  template: Omit<ExpenseTemplate, 'id'>
): Promise<ExpenseTemplate> {
  const templates = await getAllTemplates();
  const newTemplate: ExpenseTemplate = {
    id: `template_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    ...template,
  };
  templates.push(newTemplate);
  await setItem(STORAGE_KEYS.EXPENSE_TEMPLATES, templates);
  return newTemplate;
}

export async function deleteExpenseTemplate(id: string): Promise<void> {
  const templates = await getAllTemplates();
  const updated = templates.filter((t) => t.id !== id);
  await setItem(STORAGE_KEYS.EXPENSE_TEMPLATES, updated);
}
