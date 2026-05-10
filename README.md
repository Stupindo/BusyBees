# 🐝 Busy Bees

Busy Bees is a vibrant, mobile-first web application designed for family use, allowing kids to manage their chores and track their allowance through a gamified rewards system.

## 🌟 Core Features

### For Parents & Administrators
* **Family Member Management**: Add and manage members within your "hive," customize display names, and assign roles (Parent/Admin vs. Child).
* **Chore Templates**: Create personalized weekly schedules for each member, including global rewards and penalty settings.
* **Flexible Recurrence**: Support for both weekly chores and daily recurring tasks with specific weekday selection (e.g., Mon, Wed, Fri).
* **Per-Chore Penalties**: Optionally override global family penalty settings with specific penalty amounts for individual tasks.
* **Early Week Settlement**: Manually close the current week to distribute Gem rewards immediately or revert early completions if needed.
* **Secure Access**: Generate and regenerate unique 6-digit join codes to securely invite family members.

### For Kids & Hive Members
* **Interactive Dashboard**: A daily view of pending chores featuring a time-aware greeting and a real-time progress bar.
* **Chore Interactions**: Mark tasks as "Done" or "Cancelled" with optional notes for parents to review.
* **Bonus & Backlog Tasks**: View and complete optional "Bonus Tasks" that provide extra Gem rewards without penalties for skipping.
* **Live Reward Tracking**: See "Potential Gems" updates on the dashboard, showing the projected reward based on completed and pending tasks.
* **Personal Wallet**: A dedicated tab to view current Gem balances and a complete transaction history of earnings, payouts, and penalties.

## 🛠 Technical Overview
* **Frontend**: Built with **React** and styled using **Tailwind CSS** for a modern, responsive user experience.
* **Backend**: Powered by **Supabase**, utilizing PostgreSQL functions (**RPCs**) for secure data operations and **Row Level Security (RLS)** for family data privacy.
* **Automation**: Uses **Supabase Edge Functions** to handle automated weekly resets and reward distributions.
* **Quality Assurance**: Features a comprehensive test suite using **Vitest** and **React Testing Library**, covering contexts, screens, and layout components.

## 🚀 Future Roadmap
* **Join Code Rotation**: Enhanced security for shared codes.
* **Pending Approvals**: Admin confirmation for new members.
* **Future View**: Dedicated dashboard section to preview upcoming chores.

---
*Busy Bees — Helping your family hive stay productive!*
