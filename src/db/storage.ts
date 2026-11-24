import AsyncStorage from '@react-native-async-storage/async-storage';
import { Group, Member, Expense, ExpenseSplit, Settlement, DefaultGroupSplit } from './types';

const STORAGE_KEYS = {
  MEMBERS: 'simplify_members',
  GROUPS: 'simplify_groups',
  GROUP_MEMBERS: 'simplify_group_members',
  EXPENSES: 'simplify_expenses',
  EXPENSE_SPLITS: 'simplify_expense_splits',
  SETTLEMENTS: 'simplify_settlements',
  DEFAULT_SPLITS: 'simplify_default_splits',
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

  // 1. Credit payer of each expense
  for (const exp of expenses) {
    if (balanceMap[exp.paid_by_member_id] !== undefined) {
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
