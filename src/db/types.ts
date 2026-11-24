export interface Group {
  id: string;
  name: string;
  type: 'home' | 'trip' | 'couple' | 'other';
  currency: string;
  simplify_debts: number; // 1 or 0
  is_archived?: number; // 1 or 0
  created_at: string;
}

export interface Member {
  id: string;
  name: string;
  email?: string;
  is_user: number; // 1 for the current user ("You"), 0 for friends
  avatar_color?: string;
}

export interface GroupMember {
  group_id: string;
  member_id: string;
}

export interface Expense {
  id: string;
  group_id: string | null; // null if direct friend expense
  description: string;
  amount: number;
  currency: string;
  date: string;
  category: string;
  paid_by_member_id: string;
  split_type: 'EQUAL' | 'EXACT' | 'PERCENT' | 'SHARES';
  payers_json?: string; // Optional: [{"member_id": "...", "amount": 100}, ...]
  notes?: string;
  created_at: string;
}

export interface ExpenseSplit {
  id: string;
  expense_id: string;
  member_id: string;
  amount: number;
  percentage?: number;
  shares?: number;
}

export interface Settlement {
  id: string;
  group_id: string | null;
  from_member_id: string;
  to_member_id: string;
  amount: number;
  currency: string;
  date: string;
  notes?: string;
  created_at: string;
}

export interface DefaultGroupSplit {
  id: string;
  group_id: string;
  split_type: 'EQUAL' | 'PERCENT' | 'SHARES';
  splits_json: string;
}

export interface SimplifiedDebt {
  fromMember: Member;
  toMember: Member;
  amount: number;
  currency: string;
}

export interface CustomCategory {
  name: string;
  color: string;
  icon: string;
  is_default?: boolean;
}

export interface ExpenseTemplate {
  id: string;
  title: string;
  description: string;
  amount: number;
  category: string;
  group_id: string | null;
  split_type: 'EQUAL' | 'EXACT' | 'PERCENT' | 'SHARES';
}
