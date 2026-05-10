## 20260425:

1.  Awesome! Since it works perfectly, here is a concise markdown summary of the entire task. You can copy and paste this directly into your `Steps.md` or `TODO.md` documentation:

```markdown
### Implemented Family Member Management

- **Created `ManageMembersScreen` UI**: Built a dedicated screen allowing users to view all current members inside the active family, utilizing the overarching `BusyBees` vibrant UI design and style tokens.
- **Added Admin Actions**: Gave family administrators the ability to perform crucial lifecycle actions for members, including:
  - Editing member display names (`custom_name`).
  - Promoting/demoting user roles (`parent` versus `child`).
  - Toggling their Admin privileges (with protections against removing the final family admin).
  - Removing members from the family entirety.
- **Wired Sub-Navigation (`App.tsx`)**: Built the `/settings/members` frontend route and added drill-down `useNavigate` connectivity from the main `Settings` screen.
- **Added Secure DB Lookups (`auth.users`)**: Since standard member tables only store unidentifiable UUIDs, created a `SECURITY DEFINER` Postgres function named `get_family_members`. This exposes a safe API allowing the frontend via `.rpc()` to securely join and resolve true identities using `first_name`, `full_name`, and `email` tags from `auth.users.raw_user_meta_data`.
- **Display Name Fallback Hierarchy**: Implemented frontend fallback logic within the component that resolves user display names via the hierarchy: `custom_name` → `first_name` → `full_name` → `email` → `Member #ID`.
```

2.

### Implemented Comprehensive Test Suites

Built out a complete foundation of isolated unit and component tests utilizing **Vitest** and the **React Testing Library**. The test suite executes in a simulated `jsdom` environment without requiring network connectivity to the Supabase backend.

- **Mocking Strategy**:
  - Leveraged `vi.mock` at the module level to simulate the `supabase.auth` and `supabase.rpc()` APIs to ensure predictable, fast execution.
  - Successfully mocked top-level React Contexts (`useAuth` and `useFamily`) to test internal screen components securely without requiring full DOM tree wrappers.
- **10 Test Suites Created (17 Total Tests)**:
  - **Contexts**: `AuthProvider.test.tsx`, `FamilyContext.test.tsx` (Validating initialization and state derivations).
  - **Core Screens**: `ManageMembersScreen.test.tsx`, `CreateFamilyScreen.test.tsx`, `FamilySelectionScreen.test.tsx` (Testing list rendering, tab switching, and interactions based on mocked DB returns).
  - **Layout & Auth**: `LoginScreen.test.tsx`, `MobileLayout.test.tsx`, `ShareFamilyCode.test.tsx`.
  - **External Integrations**: `GoogleOneTap.test.tsx` (Validating the global `window.google` API loading sequence).

- **Coverage Milestones**:
  - Reached ~50% global branch and statement coverage for the entire frontend application via `npm run test:coverage`.

3. 
---

## 20260425 — Implemented Chore Templates Feature

### Summary

Built out the full **Chore Templates** management flow for BusyBees, covering the database layer, two new frontend screens, route wiring, and comprehensive test coverage.

---

### Database

- **New SQL function `get_family_templates`** (`db_schema/02_functions/11_get_family_templates.sql`):  
  A `SECURITY DEFINER` RPC that joins `weekly_templates` with `members` and `auth.users` to return enriched template records (member display names, roles, chore counts) in a single round-trip.  
  Callable via `supabase.rpc('get_family_templates', { p_family_id })`.

---

### Frontend

#### `ChoreTemplatesScreen.tsx` — `/settings/templates`

- Lists all family members in **one card each**, showing:
  - Role icon (👑 parent / 🐝 child)
  - "💰 N gems/wk · 🗒 N chores" reward summary for members who already have a template
  - "No template yet" badge for members without one
- **Auto-creates** a blank `weekly_templates` record (total_reward=0, penalty_per_task=0) the first time an admin taps a member without a template, then navigates into the editor — zero friction UX.
- Only admins/parents can open templates; children see a read-only view of their own card.

#### `EditTemplateScreen.tsx` — `/settings/templates/:templateId`

- **Reward Settings** section: editable `total_reward` and `penalty_per_task` inputs with a single save button that shows a ✅ "Saved!" confirmation flash on success.
- **Chores list** section with full CRUD:
  - Add Chore → modal with: Title (required), Description (optional), Extra Reward (gem bonus), Backlog toggle (no penalty if skipped)
  - Edit Chore → same modal pre-filled; includes Delete button with confirmation dialog
  - Changes update local state immediately (optimistic) — no page reload required
- Admin/Parent role gate: all edit controls are hidden for child members; they see the chore list read-only.

#### `App.tsx` — Route Wiring

- Wired the "Chore Templates" Settings list item with `onClick={() => navigate('/settings/templates')}`.
- Registered two new child routes under the `MobileLayout`:
  - `settings/templates` → `<ChoreTemplatesScreen />`
  - `settings/templates/:templateId` → `<EditTemplateScreen />`

---

### Tests

**2 new test files, 18 new tests** (all 35 total tests pass ✅):

#### `ChoreTemplatesScreen.test.tsx` — 7 tests
- Loading spinner displayed during fetch
- Screen title and family name rendered
- One card per family member rendered
- Reward summary (gems/wk + chore count) shown for members with templates
- "No template yet" badge shown for members without templates
- Error message shown when RPC fails
- Auto-create insert called with correct payload when clicking member without template

#### `EditTemplateScreen.test.tsx` — 11 tests
- Loading spinner displayed during fetch
- Reward input fields rendered with correct values from DB
- Existing chores list rendered
- Backlog badge shown for backlog chores
- Extra reward badge shown for chores with `extra_reward > 0`
- Add Chore modal opens on toolbar button click
- Modal closes on ✕ button click
- Edit modal opens with pre-filled values
- Add chore form submits correctly, closes modal, and adds chore to list
- Error state shown when template not found
- Empty chores state shown with prompt

---

### Notes

- All unique interactive elements are assigned `id` attributes for reliable DOM querying in tests and browser automation.
- The `get_family_members` RPC (built in the Manage Members milestone) is reused in `ChoreTemplatesScreen` for fetching member display names — no duplication.
- Existing RLS policies already cover `weekly_templates` and `chores` (Parents/Admins: ALL; Children: SELECT only) — no schema changes needed.

---

## 20260425 — Implemented Dashboard: Today's Chores

### Summary

Replaced the placeholder `Dashboard` component with a full-featured **DashboardScreen** that shows the current member's chore instances for the active week, allows marking chores done or cancelled, and supports per-instance notes. Added two new DB functions and a schema migration.

---

### Database

#### Migration: `db_schema/scripts/20260425_dashboard_chore_instances.sql`

A single deployable migration file covering all three changes below.

#### Schema change: `chore_instances.status` extended

- Dropped and recreated the `CHECK` constraint on `chore_instances.status` to add `'cancelled'` as a valid 4th value (`pending | done | failed | cancelled`).

#### New function: `get_today_chores(p_member_id BIGINT)` (`db_schema/02_functions/12_get_today_chores.sql`)

- `SECURITY DEFINER` RPC that calculates the current ISO week's Monday and returns all `chore_instances` for that week for the given member.
- Joins with `chores` to enrich results with `title`, `description`, `is_backlog`, `extra_reward`.
- Ordered: pending → done → cancelled/failed; regular before backlog; alphabetical by title.
- Callable via `supabase.rpc('get_today_chores', { p_member_id })`.

#### New function: `generate_week_chores(p_family_id BIGINT, p_member_id BIGINT)` (`db_schema/02_functions/13_generate_week_chores.sql`)

- **Merge strategy** for the current ISO week:
  - **(a) INSERT** `pending` `chore_instances` for any template chore that doesn't yet have an instance this week.
  - **(b) UPDATE** any existing `pending` instance to `cancelled` if its chore was removed from the member's active template, appending a system note: `[System] Chore was removed from the weekly template.`
- Returns `JSON { inserted: N, cancelled: N }`.
- Callable via `supabase.rpc('generate_week_chores', { p_family_id, p_member_id })`.

---

### Frontend

#### `DashboardScreen.tsx` — `/` (Dashboard tab)

Replaced the placeholder with a full feature screen:

- **Greeting header**: Time-aware greeting ("Good morning/afternoon/evening, [Name]! 🐝") + family name + today's date + current week's Monday.
- **Progress bar**: Shows `X / Y done` with an animated gradient fill; turns full green with a confetti message at 100%.
- **Pending chores section**:
  - Each chore rendered as a card with a colour-coded left border (amber=pending, blue=backlog bonus).
  - ✅ **Mark Done** button (green circle) → opens note sheet → saves `status='done'`.
  - ❌ **Cancel** button (red circle) → opens note sheet → saves `status='cancelled'`.
  - Badges for "Bonus" (backlog) and extra gem reward (+N 💎).
- **Completed & Cancelled section**: Collapsed by default with a count badge; tap to expand. Resolved cards show a ✅/❌ icon and a truncated note preview. Tapping opens the note sheet to view/edit.
- **Bottom-sheet note modal**: Contextual title, placeholder text, and confirm button colour differ per mode (done/cancel/view).
- **Empty state**: Friendly illustration + copy. Admins with a template see a **"Generate Chores"** button; those without a template are directed to Family Setup.
- **Admin "Sync" button**: Small refresh icon in the Pending section header triggers `generate_week_chores` merge and reloads the list.
- Optimistic UI: status and note update locally immediately after a successful Supabase write.

#### `App.tsx`

- Imported `DashboardScreen` and replaced the inline `Dashboard` placeholder component.
- `/` index route now renders `<DashboardScreen />`.

---

### Tests

**1 new test file, 16 new tests** (all 51 total tests pass ✅):

#### `DashboardScreen.test.tsx` — 16 tests

- Loading spinner displayed during fetch
- Greeting with user name rendered
- Family name and date rendered
- Empty state shown when no chores returned
- "Generate Chores" button shown for admin with a template on empty state
- Pending chore card rendered with ✅ / ❌ action buttons
- Chore description rendered
- Progress bar shown with correct X/Y counter when chores exist
- Extra reward badge (+N 💎) shown on qualifying chores
- Note modal opens in "done" mode when ✅ is clicked
- Note modal opens in "cancel" mode when ❌ is clicked (heading disambiguated via `getByRole`)
- Note modal closes when ✕ button is clicked
- Supabase `update` called with correct `instance_id` on confirm
- Resolved section collapsed by default (count badge visible, chores hidden)
- Resolved section expands on toggle click
- Error message shown when RPC fails

---

### Notes

- `cancelled` is now a first-class status in the DB schema, not a convention hack.
- `generate_week_chores` is idempotent — safe to call multiple times per week; only inserts truly missing rows.
- The "Sync" button is admin-only and visible even when chores already exist, making it easy to add new template chores mid-week.
- All interactive elements carry unique `id` attributes for test and automation reliability.

---

## 20260425 — Security Patch: Privilege Escalation Fix

### Summary
Addressed a critical privilege escalation vulnerability where the client-side `INSERT` policy on the `members` table allowed any user to guess a `family_id` and assign themselves as an admin of that family.

### Database
- **Migration**: `db_schema/scripts/20260425_fix_member_insert_privilege.sql`
- **Dropped Policy**: Removed the `"Insert own member record"` policy from `public.members`.
- **New RPC**: Created `public.create_family(p_name TEXT)` (`db_schema/02_functions/14_create_family.sql`). This `SECURITY DEFINER` function securely creates the family and assigns the user as a parent/admin on the server side, bypassing the need for client-side insert permissions on `members`. It also correctly updates the user's dummy member record if one exists, fixing a secondary logic bug.

### Frontend
- **`CreateFamilyScreen.tsx`**: Refactored `handleCreate` to call `supabase.rpc('create_family')` instead of directly inserting into the `families` and `members` tables from the client.

---

## 20260425 — Security Patch: Unauthenticated Edge Function Fix

### Summary
Secured the `weekly-hive-reset` Edge function by implementing an authentication check, preventing arbitrary public execution.

### Edge Functions
- **`weekly-hive-reset/index.ts`**: Added a validation step at the beginning of the request handler that checks for a `Bearer` token in the `Authorization` header. It compares this token against a configured `CRON_SECRET` environment variable, immediately returning a `401 Unauthorized` response if the caller is unauthenticated.

---

## 20260425 — Security Patch: NPM Vulnerabilities Fix

### Summary
Resolved 5 NPM audit vulnerabilities (4 High, 1 Moderate) related to `serialize-javascript` and `postcss` within the frontend application.

### Frontend
- **`app/package.json`**: Upgraded vulnerable packages to their latest secure versions (`postcss@latest`, `serialize-javascript@latest`, `vite-plugin-pwa@latest`).
- **NPM Overrides**: Added an explicit override for `"serialize-javascript": "^7.0.5"` to force nested dependencies (like `@rollup/plugin-terser` inside `vite-plugin-pwa`) to use a version immune to RCE and CPU Exhaustion attacks. The application now reports `0 vulnerabilities`.

---

## 20260502 — Chore Generation & Soft Deletes Implementation

### Summary
Addressed a bug where the weekly chore "Reinitiate" button skipped members who did not have an active `auth.users` account (e.g. young children added by their parents). We also implemented soft deletion for chores so that when a chore is removed from a template, any existing pending instances for that week are cleanly marked as `cancelled` rather than being entirely wiped out by cascade deletes.

### Database
- **Migration**: `db_schema/scripts/20260502_unified_migration.sql`
- **Schema Change**: Added `is_deleted BOOLEAN DEFAULT FALSE` to `public.chores`.
- **RPC `get_family_members`**: Changed from `INNER JOIN` to `LEFT JOIN` on `auth.users` to ensure members without an account are still returned.
- **RPC `get_family_templates`**: Changed `auth.users` join to `LEFT JOIN` and updated `chore_count` to ignore soft-deleted chores (`is_deleted = false`).
- **RPC `generate_week_chores`**: Updated to generate chore instances only for `is_deleted = false AND is_backlog = false`. Pending instances whose chore was deleted, moved to a different template, or flagged as a backlog task are now correctly transitioned to a `cancelled` state.

### Frontend
- **`EditTemplateScreen.tsx`**: 
  - Updated `fetchTemplate` to filter out deleted chores (`eq('is_deleted', false)`).
  - Modified `handleDeleteChore` to perform a soft-delete (`update({ is_deleted: true })`) instead of a hard `.delete()` request.

### Edge Functions
- **`weekly-hive-reset`**: Updated the background cron job to gracefully ignore soft-deleted tasks (`eq('is_deleted', false)`) alongside its existing backlog filters when auto-generating new weeks.

---

## 20260502 — Backlog Chore Separation on Dashboard

### Summary
Separated "Bonus Tasks" (backlog chore instances) from standard pending chores on the dashboard into a dedicated collapsible section, consistent with the existing "Completed & Cancelled" slide-out.

### Frontend
- **`DashboardScreen.tsx`**:
  - Pending chores and pending backlog chores are now filtered into two separate lists.
  - A new **"Bonus Tasks"** section with a toggle-able slide-out displays backlog items below the main pending list.
  - The progress bar continues to track only mandatory (non-backlog) chores.

---

## 20260502 — Family Join Code Regeneration

### Summary
Added the ability for family administrators to regenerate the family's 6-digit `join_code` on demand.

### Database
- **Migration**: `db_schema/scripts/20260502_02_regenerate_join_code_migration.sql`
- **New RPC `regenerate_join_code(p_family_id BIGINT)`** (`db_schema/02_functions/09_join_code_functions.sql`): `SECURITY DEFINER` function that verifies the caller is an admin, then generates a new unique 6-digit alphanumeric code and updates the `families` table.

### Frontend
- **`ShareFamilyCode.tsx`**: Added a "Regenerate Code" button (admin-only) that calls the new RPC and refreshes the displayed code on success.

---

## 20260502 — Early Week Completion Feature

### Summary
Added admin-controlled ability to manually close the current week on-demand, distributing gem rewards to all hive members immediately. The action is fully reversible.

### Database

#### New table: `weekly_settlements` (`db_schema/01_tables/08_weekly_settlements.sql`)
- Tracks finalised weeks per family with `(family_id, week_start_date)` as a composite primary key.
- `is_early BOOLEAN` distinguishes manually settled weeks from automated cron-job completions.
- Prevents double-processing: the `weekly-hive-reset` cron job skips any family already present in this table for the current week.
- **Migration**: `db_schema/scripts/20260502_04_weekly_settlements.sql`
- **RLS policy**: `db_schema/scripts/20260502_06_weekly_settlements_rls.sql` — authenticated family members can SELECT their family's settlement records; writes are restricted to the `SECURITY DEFINER` RPCs.

#### New RPC `complete_week_early(p_family_id BIGINT)` (`db_schema/02_functions/15_complete_week_early.sql`)
- Verifies the caller is a family admin.
- Guards against double-processing via `weekly_settlements`.
- Loops over all family members who have a weekly template (not just `role = 'child'`).
- For each member: counts still-pending mandatory chores, applies `total_reward - (unfinished × penalty)` formula, adds `extra_reward` from completed backlog chores, inserts an `[Early] Weekly allowance harvest` transaction if reward > 0, and marks remaining pending chores as `failed` with a `[System] Week completed early` note.
- Inserts a `weekly_settlements` record to block the cron job.
- Uses `COALESCE` throughout for NULL-safe arithmetic.

#### New RPC `revert_week_early(p_family_id BIGINT)` (`db_schema/02_functions/16_revert_week_early.sql`)
- Verifies the caller is a family admin.
- Deletes `[Early] Weekly allowance harvest` transactions (with a 7-day safety boundary).
- Reverts chore instances tagged `[System] Week completed early` back to `pending`, cleaning up the system note.
- Removes the `weekly_settlements` record so the week is fully open again.

#### Fix migration: `db_schema/scripts/20260502_05_fix_complete_week_early.sql`
Deployed iteratively; final version includes all three fixes:
1. Loop over all members with a template (not `role = 'child'` only).
2. `COALESCE` for nullable `total_reward`/`penalty_per_task` (PostgreSQL `GREATEST(0, NULL)` = NULL, so no transaction was inserted without this fix).
3. Backlog bonus `extra_reward` included in total reward.

### Edge Functions
- **`weekly-hive-reset/index.ts`**: Checks `weekly_settlements` before processing any family. If the family was already settled (early or by a prior cron run) for the current week it is skipped. On successful automated processing it inserts a record into `weekly_settlements`.
- Reward calculation updated to: `max(0, total_reward - unfinished_mandatory × penalty) + sum(extra_reward for done backlog chores)`.

### Frontend

#### `DashboardScreen.tsx`
- Added **Potential Gems** display inside the `ProgressBar` component, showing the currently projected gem reward using the same formula as the backend.
- Bonus reward from completed backlog chores (`extra_reward`) is now included in the Potential Gems calculation.

#### `App.tsx` — Settings → App Preferences
- Removed the "Complete Week Early" button from the dashboard (too prominent for an infrequent action).
- Added an **App Preferences** section to the Settings tab, visible to admins only.
- **Weekly Settlement card** shows a contextual description and toggles between:
  - **⚡ Complete Week Early** — triggers `complete_week_early` RPC.
  - **↩ Revert Early Completion** — triggers `revert_week_early` RPC.
- Settlement status is loaded from `weekly_settlements` on mount and updated directly after each action for immediate UI feedback.

#### `App.tsx` — Wallet (Gems tab)
- Replaced the hardcoded `0` placeholder with a real implementation:
  - Fetches all transactions for the active member from the `transactions` table.
  - Computes live balance: `sum(earning amounts) - sum(penalty/payout amounts)`.
  - Shows a full **History** list with icon, description, date, and colour-coded amount.
  - Shows a friendly empty state when no transactions exist.

### Script Naming Convention
All 12 existing migration scripts in `db_schema/scripts/` were renamed to follow a `YYYYMMDD_NN_description.sql` pattern (sequence number after the date) to preserve creation order when multiple scripts share the same date prefix.

---

## 20260510 — Daily Recurring Chores

### Summary

Extended the chore system to support **daily recurrence** in addition to the existing weekly model. Admins can now configure any chore to recur on specific days of the week (or every day), and the dashboard shows only that day's instance rather than the full weekly view.

### Database

#### Migration: `db_schema/scripts/20260510_01_daily_chores.sql`

- **`chores.frequency TEXT DEFAULT 'weekly'`** — new column accepting `'weekly'` or `'daily'`.
- **`chores.recurrence_days INT[]  DEFAULT NULL`** — ISO weekday numbers (1=Mon … 7=Sun). `NULL` means the chore runs every day (only meaningful when `frequency = 'daily'`).
- **`chore_instances.instance_date DATE DEFAULT NULL`** — the specific calendar date for daily instances; `NULL` for weekly instances.

#### Updated RPC `get_today_chores` (`db_schema/02_functions/12_get_today_chores.sql`)

- Weekly chores: returned for the whole week (no date filter, `instance_date IS NULL`).
- Daily chores: only the **today** instance is returned (`instance_date = CURRENT_DATE`).
- Returns the new `frequency`, `recurrence_days`, and `instance_date` columns.

#### Updated RPC `generate_week_chores` (`db_schema/02_functions/13_generate_week_chores.sql`)

Extended with two additional steps:

- **(c) INSERT** one `pending` daily instance per applicable day of the ISO week that doesn't already exist (keyed on `chore_id + member_id + week_start_date + instance_date`). "Applicable" = `recurrence_days IS NULL` (all days) or the day's ISO DOW is in the array.
- **(d) CANCEL** pending daily instances whose chore was removed from the template, switched back to weekly, or whose `instance_date` is no longer in the (narrowed) `recurrence_days`.

### Frontend

#### `EditTemplateScreen.tsx`

- **Chore interface** extended with `frequency` and `recurrence_days` fields.
- **Chore modal**: new **"Daily Chore"** toggle; when enabled, a weekday-picker grid appears (Mon–Sun buttons) — leaving all unchecked means every day.
- Backlog toggle is hidden while "Daily Chore" is active (daily chores cannot be backlog tasks).
- Chore list cards show a teal **Daily** badge and the active-days summary (e.g. "Mon, Wed, Fri") for daily chores.

#### `DashboardScreen.tsx`

- `ChoreInstance` type extended with `frequency`, `recurrence_days`, `instance_date`.
- Daily chore cards display a teal **Daily** badge for visual distinction.

---

## 20260510 — Per-Chore Penalty Override

### Summary

Introduced an optional per-chore `penalty_per_task` override on the `chores` table. When set, it takes precedence over the global `weekly_templates.penalty_per_task` for that specific chore. When `NULL`, the template-level global penalty continues to apply — fully backward-compatible.

### Database

#### Migration: `db_schema/scripts/20260510_02_per_chore_penalty.sql`

- **`chores.penalty_per_task INT DEFAULT NULL`** — new nullable column. `NULL` = inherit from template; a value = per-chore override.

#### Updated RPC `get_today_chores` (`db_schema/02_functions/12_get_today_chores.sql`)

- `penalty_per_task` is now resolved as `COALESCE(c.penalty_per_task, wt.penalty_per_task)` so the effective value (chore-level or template-level) is returned per row. The frontend does not need to perform any extra lookup.

#### Updated RPC `complete_week_early` (`db_schema/02_functions/15_complete_week_early.sql`)

- Reward deduction formula changed from `count × fixed_penalty` to a `SUM(COALESCE(c.penalty_per_task, template.penalty_per_task))` over still-pending mandatory chores, so each chore contributes its own effective penalty.

### Frontend

#### `EditTemplateScreen.tsx`

- `Chore` interface: added `penalty_per_task: number | null`.
- `ChoreFormState`: added `penalty_per_task: string` (empty string = `null`/inherit; numeric = override).
- Chore modal: new **"⚠️ Penalty Override (gems)"** numeric input (non-backlog chores only). Placeholder shows the template global (e.g. `global: 5`). Leave blank to inherit.
- Chore list cards: displays an orange **`−N 💎 override`** badge when a per-chore penalty is set.

#### `DashboardScreen.tsx`

- Potential-reward calculation updated: instead of `total_reward - unfinishedCount × templateDetails.penalty_per_task`, it now sums each pending chore's `penalty_per_task` directly (`pendingPenaltySum`). Because the SQL already resolves the effective value via `COALESCE`, no extra lookup is needed on the frontend.
