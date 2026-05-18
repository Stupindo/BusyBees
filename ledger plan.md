# Feature Spec & Implementation Plan: Gem Redemptions & Cash Payouts

## 💡 Product & UX Polish

1. **The Exchange Rate Rule**: The system will utilize the existing `currency_rate` column in `family_settings`. This rate is defined as "Gems per 1 Unit of Currency" (for example, if `currency_rate = 10`, then 10 Gems = $1.00, meaning 1 Gem = $0.10).
2. **Preventing Double Spending**: When a child requests a payout, the gems must be subtracted immediately from their available balance so they cannot spend the same gems twice.
3. **The Ledger Lifecycle**:

- **On Request**: A pending redemption record is created, and a payout transaction is immediately logged to deduct the gems.
- **On Approval (Paid)**: The redemption status changes to `approved`. The user's balance is already correct.
- **On Rejection (Declined)**: The redemption status changes to `declined`, and an earning transaction is automatically generated to refund the gems safely.

4. **UX Enhancements**:

- **Child UI**: A modal on the `WalletScreen` with an easy incrementor/slider showing real-time conversion rates (e.g., "Convert 50 Gems to $5.00").
- **Parent UI**: A unified fulfillment dashboard where they can see who to pay, how much cash to hand out in real life, and action buttons to approve or decline.

---

## 🛠️ Step 1: Database Migration

Create a new migration script (`xxxx_add_reward_redemptions.sql`) to introduce the redemptions tracking table and setup Row Level Security (RLS).

---

## 🛠️ Step 2: Update Child Wallet Experience (`WalletScreen.tsx`)

Modify `app/src/components/WalletScreen.tsx` to handle payout requests:

1. **Fetch Family Settings**: Grab the current `currency_rate` from the `family_settings` context/table to dynamically display values.
2. **Add "Redeem Cash" UI**: Add a modal or form section.
3. **Transaction Submission Workflow**: When a user submits a cash out request for `$X` (costing `Y` gems):

- Insert a row into `reward_redemptions` with `status: 'pending'`, `gem_cost: Y`, and `cash_amount: X`.
- Insert a row into `transactions` with `type: 'payout'`, `amount: Y`, and `description: '💵 Cash Payout Request (Pending)'`.
- **Note**: This guarantees the existing balance reducer logic instantly down-calculates the remaining balance without rewriting legacy code!

---

## 🛠️ Step 3: Create Parent Management UI (`ManagePayoutsScreen.tsx`)

Create a new view for administrators to process requests, and place this link inside `SettingsScreen.tsx`.

### Key Features to Implement:

- Query all `reward_redemptions` where `family_id = activeFamily.id` and `status = 'pending'`.
- Join with the `members` table to render names cleanly.
- Display a clean breakdown card: `"🌟 [Child Name] requested a cash payout of $[X.XX] (Costs [Y] Gems)"`.

### Action Triggers to Implement:

1. **Action: Approve & Mark Paid**

- Update `reward_redemptions` record: Set `status = 'approved'`.
- Find the matching payout entry in `transactions` and change its description from `'💵 Cash Payout Request (Pending)'` to `'💵 Cash Payout Approved & Paid'`.

2. **Action: Decline Request**

- Update `reward_redemptions` record: Set `status = 'declined'`.
- Insert a new corrective entry into `transactions` with the following parameters:
- `member_id`: child's ID
- `amount`: original gem cost
- `type`: `'earning'`
- `description`: `'↩️ Refund: Cancelled Cash Payout Request'`

- This instantly refunds the child's wallet accurately while retaining an audit trail.

---

## 🛠️ Step 4: Hook Up Navigation (`SettingsScreen.tsx`)

Modify `app/src/components/SettingsScreen.tsx` to display the new interface to administrators:

- Append an interactive row item to the layout navigation list.

---

## 🛑 Critical Edge Cases for the Agent to Code Against

- **Zero or Negative Submissions**: Enforce input checks ensuring the redemption quantity cannot be 0, negative values, or exceed the calculated balance.
- **Rate Limits**: Disable submission buttons with a loading spinner instantly during transaction execution to prevent double submission anomalies.
- **Fallback Exchange Rates**: If a family hasn't specified a custom `currency_rate` or it is corrupted, fall back gracefully to a hardcoded default rule of 10 (10 gems = $1).
