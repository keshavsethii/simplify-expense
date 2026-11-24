import { Member, SimplifiedDebt } from '../db/types';
import { CURRENCY_CODE } from './currency';

interface DebtTransaction {
  fromId: string;
  toId: string;
  amount: number;
}

/**
 * Debt Simplification Algorithm
 * Given members and their net balances (positive = gets back, negative = owes),
 * greedy matching solves the minimum number of transactions needed to settle all debts.
 */
export function simplifyDebts(
  members: Member[],
  netBalances: Record<string, number>,
  currency: string = CURRENCY_CODE
): SimplifiedDebt[] {
  const memberMap = new Map<string, Member>();
  members.forEach(m => memberMap.set(m.id, m));

  // Partition into debtors (owe money) and creditors (owed money)
  const debtors: { id: string; amount: number }[] = [];
  const creditors: { id: string; amount: number }[] = [];

  for (const [id, net] of Object.entries(netBalances)) {
    const rounded = Math.round(net * 100) / 100;
    if (rounded < -0.01) {
      debtors.push({ id, amount: -rounded });
    } else if (rounded > 0.01) {
      creditors.push({ id, amount: rounded });
    }
  }

  // Sort descending by amount for efficient matching
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transactions: SimplifiedDebt[] = [];
  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];

    const settledAmount = Math.min(debtor.amount, creditor.amount);
    if (settledAmount > 0.009) {
      const fromMember = memberMap.get(debtor.id) || {
        id: debtor.id,
        name: 'Friend',
        is_user: 0,
      };
      const toMember = memberMap.get(creditor.id) || {
        id: creditor.id,
        name: 'Friend',
        is_user: 0,
      };

      transactions.push({
        fromMember,
        toMember,
        amount: Math.round(settledAmount * 100) / 100,
        currency,
      });
    }

    debtor.amount -= settledAmount;
    creditor.amount -= settledAmount;

    if (debtor.amount <= 0.009) dIdx++;
    if (creditor.amount <= 0.009) cIdx++;
  }

  return transactions;
}
