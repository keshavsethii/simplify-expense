# Simplify (Splitwise Pro Clone)

A cross-platform mobile application replicating Splitwise with full **Pro features** unlocked for personal, private, and offline-first use.

---

## 🚀 Features Included

### Standard Features
- **Friends & Groups**: Track IOUs with individual friends or create customized groups (Apartment / Home, Trip / Vacation, Couple, etc.).
- **Flexible Expense Logging**:
  - Split equally
  - Split by exact dollar amounts
  - Split by percentage (%)
  - Split by shares / parts
- **Settle Up Payments**: Record cash, Venmo, Zelle, UPI, or bank payments between any two members.
- **Detailed History & Breakdown**: View full payer breakdowns, individual shares, dates, and categories.

### Splitwise Pro Features (Unlocked & Free)
1. **Debt Simplification Engine (`simplifyDebts`)**:
   - Calculates the minimum number of transactions needed across any group using a greedy net-balance matching graph algorithm.
   - Per-group toggle to turn debt simplification on or off anytime.
2. **Multi-Currency Auto Conversion**:
   - Real-time converted values across USD, EUR, GBP, INR, CAD, AUD, JPY, and more.
3. **Advanced Charts & Spending Breakdown**:
   - Monthly and all-time personal spending metrics.
   - Interactive category ratio breakdown (Groceries, Food, Utilities, Travel, Entertainment, etc.).
4. **Saved Default Splits**:
   - Save custom percentage or shares configurations for recurring group bills.
5. **Advanced Activity Search & Filtering**:
   - Real-time search across expenses, notes, group names, and payers with category filter chips.
6. **100% Ad-Free & Offline Privacy**:
   - Embedded SQLite database (`expo-sqlite`). No artificial daily limits, subscriptions, or wait timers.

---

## 🛠️ Tech Stack
- **Framework**: [Expo](https://expo.dev) (SDK 58) + React Native 0.88 + TypeScript
- **Navigation**: [Expo Router](https://docs.expo.dev/router/introduction/) (File-based tabs + stack modals)
- **Database**: Local SQLite via `expo-sqlite`
- **Icons**: `@expo/vector-icons`

---

## 📱 Running the Project

```bash
# Start development server
npx expo start

# Run on Android
npx expo start --android

# Run on iOS simulator (macOS required)
npx expo start --ios

# Type check
npx tsc --noEmit
```
