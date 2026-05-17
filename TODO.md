# Project TODO & Technical Debt

### Family Invitations & Join Codes

- **Join Code Rotation**: Implement a way to reset or regenerate a family's `join_code` if it gets shared with unauthorized people outside the family.
- **Pending Approvals**: Currently, joining with a code grants immediate access. Consider adding a "Pending Approval" state so a new member must be confirmed by an admin/parent before they can see chores and balances.

* make daily penalties different from weekly penalties. Probably need to add individual penalties for each chore to override family settings.

- show future daily chores in a separate section on the dashboard

* add an avatar selector to the profile screen

- add some chore templates so when parents initiate the family setaup from scratch they could select some defaults instead of typing everything from scratch;
- Review the privacy aspect of using a public Supabase Storage bucket for chore photos (consider moving to a private bucket with signed URLs).

Here's the full review — **18 items ordered by importance**:

---

## 🚨 Critical (2 items)

+**#1 — DB schema bug: `cancelled` status missing from CHECK constraint**
The `chore_instances` table schema only allows `('pending', 'done', 'failed')`, but the code writes `'cancelled'` everywhere. The source-of-truth DDL file is wrong — this needs an `ALTER TABLE` migration.

**#2 — Public Supabase Storage for child photos**
Photos are stored with fully-public URLs (already in your TODO). Anyone with the URL pattern can access them. Needs private bucket + signed URL generation.

---

## 🔴 High (5 items)

+**#3 — `Wallet` and `Settings` pages live inside `App.tsx`**
Two full-page components (with data fetching, state, etc.) are crammed into the router file. Extract to `WalletScreen.tsx` and `SettingsScreen.tsx`.

**#4 — `isAdmin` check copy-pasted in 7 files**
The same expression `activeMember?.is_admin || activeMember?.role === 'parent'` appears everywhere. Should be derived once in `FamilyContext` and exposed.

**#5 — `getDisplayName` logic duplicated in 4 files**
Even exists as two separate functions within `ChoreTemplatesScreen.tsx`. Move to `src/lib/memberUtils.ts`.

**#6 — `getMondayOfCurrentWeek` exists 3 times with different names/return types**
`DashboardScreen`, `HiveReportScreen`, and `App.tsx` each have their own version. Move to `src/lib/dateUtils.ts`.

**#7 — `get_today_chores` SQL doesn't return `completed_at`**
The Dashboard's `ChoreInstance` type has `completed_at?` as optional, meaning it's never populated from the RPC. The HiveReport works around this by querying the table directly.

---

## 🟠 Medium (6 items)

**#8** — No success feedback after "Sync" chores on the Dashboard  
**#9** — HiveReport expanded view shows no "Still Pending" chores (misleading empty state)  
**#10** — No shortcut from the Dashboard for a child to view their own template  
**#11** — `💰` icon used in `EditTemplateScreen` vs `💎` everywhere else (terminology drift)  
**#12** — All Supabase calls are inline in components — no service/API layer  
**#13** — `alert()` / `confirm()` used ~10 times instead of a styled toast/modal system

---

## 🟡 Low (5 items)

**#14** — No "pending approval" join flow (already in TODO)  
**#15** — Back buttons inconsistently use `navigate('/settings')` vs `navigate(-1)`  
**#16** — `reportData` in `HiveReportScreen` typed as `any[]`  
**#17** — No indexes on `chore_instances(member_id, week_start_date)`  
**#18** — Dashboard chore cards could show "completed at X:XX" once #7 is fixed

The full plan with file references and SQL/code snippets is in the artifact. Want me to start executing any of these?
