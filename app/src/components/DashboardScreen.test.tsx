import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DashboardScreen from './DashboardScreen';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUser = {
  email: 'test@example.com',
  user_metadata: { first_name: 'Alice' },
};

const mockMember = {
  id: 1,
  family_id: 10,
  role: 'parent' as const,
  is_admin: true,
  custom_name: null,
  families: { id: 10, name: 'The Bees' },
};

const mockFamily = { id: 10, name: 'The Bees' };

vi.mock('./AuthProvider', () => ({
  useAuth: () => ({ user: mockUser }),
}));

vi.mock('../contexts/FamilyContext', () => ({
  useFamily: () => ({
    activeFamily: mockFamily,
    activeMember: mockMember,
  }),
}));

const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const pendingChore = {
  instance_id: 1,
  chore_id: 101,
  title: 'Wash dishes',
  description: 'Use hot water',
  is_backlog: false,
  extra_reward: 0,
  status: 'pending',
  notes: null,
  week_start_date: '2026-04-21',
  penalty_per_task: 5,
};

const doneChore = {
  instance_id: 2,
  chore_id: 102,
  title: 'Take out trash',
  description: '',
  is_backlog: false,
  extra_reward: 0,
  status: 'done',
  notes: 'Easy peasy!',
  week_start_date: '2026-04-21',
  penalty_per_task: 5,
};

const cancelledChore = {
  instance_id: 3,
  chore_id: 103,
  title: 'Clean windows',
  description: '',
  is_backlog: false,
  extra_reward: 0,
  status: 'cancelled',
  notes: 'No supplies',
  week_start_date: '2026-04-21',
  penalty_per_task: 5,
};

const backlogChore = {
  instance_id: 4,
  chore_id: 104,
  title: 'Extra reading',
  description: 'Read 20 pages',
  is_backlog: true,
  extra_reward: 10,
  status: 'pending',
  notes: null,
  week_start_date: '2026-04-21',
  penalty_per_task: 0,
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function mockNoChores() {
  mockRpc.mockImplementation((fn: string) => {
    if (fn === 'get_today_chores') return Promise.resolve({ data: [], error: null });
    return Promise.resolve({ data: { inserted: 0, cancelled: 0 }, error: null });
  });
  mockFrom.mockReturnValue({
    select: () => ({ eq: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }),
  });
}

function mockWithChores(chores: any[]) {
  mockRpc.mockImplementation((fn: string) => {
    if (fn === 'get_today_chores') return Promise.resolve({ data: chores, error: null });
    return Promise.resolve({ data: { inserted: 2, cancelled: 0 }, error: null });
  });
  mockFrom.mockReturnValue({
    select: () => ({ eq: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: [{ id: 99 }], error: null }) }) }) }),
    update: () => ({ eq: () => Promise.resolve({ error: null }) }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DashboardScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading spinner initially', () => {
    // Keep the promise pending so the spinner stays
    mockRpc.mockReturnValue(new Promise(() => {}));
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ limit: () => new Promise(() => {}) }) }) }),
    });

    render(<DashboardScreen />);
    expect(screen.getByTestId('loading-spinner')).toBeTruthy();
  });

  it('renders greeting with user name', async () => {
    mockWithChores([pendingChore]);
    render(<DashboardScreen />);
    await waitFor(() => {
      expect(screen.getByText(/alice/i)).toBeTruthy();
    });
  });

  it('renders family name and date', async () => {
    mockWithChores([pendingChore]);
    render(<DashboardScreen />);
    await waitFor(() => {
      expect(screen.getByText(/The Bees/)).toBeTruthy();
    });
  });

  it('shows empty state when no chores exist', async () => {
    mockNoChores();
    render(<DashboardScreen />);
    await waitFor(() => {
      expect(screen.getByText(/no chores this week/i)).toBeTruthy();
    });
  });

  it('shows Generate Chores button for admin on empty state', async () => {
    // Need a template to exist for the button to appear
    mockRpc.mockImplementation((fn: string) => {
      if (fn === 'get_today_chores') return Promise.resolve({ data: [], error: null });
      return Promise.resolve({ data: { inserted: 0, cancelled: 0 }, error: null });
    });
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            limit: () => Promise.resolve({ data: [{ id: 99 }], error: null }),
          }),
        }),
      }),
    });

    render(<DashboardScreen />);
    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).toBeNull();
    });
    await waitFor(() => {
      expect(screen.getByText(/Generate Chores/i)).toBeTruthy();
    });
  });

  it('renders pending chore card with action buttons', async () => {
    mockWithChores([pendingChore]);
    render(<DashboardScreen />);
    await waitFor(() => {
      expect(screen.getByText('Wash dishes')).toBeTruthy();
      expect(screen.getByLabelText(/Complete Wash dishes/i)).toBeTruthy();
      expect(screen.getByLabelText(/Cancel Wash dishes/i)).toBeTruthy();
    });
  });

  it('renders chore description', async () => {
    mockWithChores([pendingChore]);
    render(<DashboardScreen />);
    await waitFor(() => {
      expect(screen.getByText('Use hot water')).toBeTruthy();
    });
  });

  it('shows progress bar when chores exist', async () => {
    mockWithChores([pendingChore, doneChore]);
    render(<DashboardScreen />);
    await waitFor(() => {
      expect(screen.getByText(/week progress/i)).toBeTruthy();
      expect(screen.getByText('1/2 done')).toBeTruthy();
    });
  });

  it('shows extra reward badge on chore with bonus', async () => {
    mockWithChores([doneChore]);
    render(<DashboardScreen />);
    // Expand the resolved section
    await waitFor(() => {
      const toggleBtn = screen.getByText(/Completed & Cancelled/i);
      fireEvent.click(toggleBtn);
    });
    await waitFor(() => {
      expect(screen.getByText(/\+5/)).toBeTruthy();
    });
  });

  it('opens note modal when mark-done button is clicked', async () => {
    mockWithChores([pendingChore]);
    render(<DashboardScreen />);
    await waitFor(() => {
      fireEvent.click(screen.getByLabelText(/Complete Wash dishes/i));
    });
    expect(screen.getByTestId('note-modal')).toBeTruthy();
    expect(screen.getByText(/Mark as Done/i)).toBeTruthy();
  });

  it('opens cancel modal when cancel button is clicked', async () => {
    mockWithChores([pendingChore]);
    render(<DashboardScreen />);
    await waitFor(() => {
      fireEvent.click(screen.getByLabelText(/Cancel Wash dishes/i));
    });
    expect(screen.getByTestId('note-modal')).toBeTruthy();
    // Use heading role to disambiguate from the confirm button text
    expect(screen.getByRole('heading', { name: /Cancel Chore/i })).toBeTruthy();
  });

  it('closes note modal when X button is clicked', async () => {
    mockWithChores([pendingChore]);
    render(<DashboardScreen />);
    await waitFor(() => {
      fireEvent.click(screen.getByLabelText(/Complete Wash dishes/i));
    });
    fireEvent.click(screen.getByLabelText('Close'));
    await waitFor(() => {
      expect(screen.queryByTestId('note-modal')).toBeNull();
    });
  });

  it('calls supabase update with done status on confirm', async () => {
    const updateMock = vi.fn().mockReturnValue({ eq: () => Promise.resolve({ error: null }) });
    mockRpc.mockImplementation((fn: string) => {
      if (fn === 'get_today_chores') return Promise.resolve({ data: [pendingChore], error: null });
      return Promise.resolve({ data: { inserted: 0, cancelled: 0 }, error: null });
    });
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: [{ id: 99 }], error: null }) }) }) }),
      update: () => ({ eq: updateMock }),
    });

    render(<DashboardScreen />);
    await waitFor(() => {
      fireEvent.click(screen.getByLabelText(/Complete Wash dishes/i));
    });
    fireEvent.click(screen.getByText('Mark Done'));
    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith('id', pendingChore.instance_id);
    });
  });

  it('shows backlog section collapsed by default with count', async () => {
    mockWithChores([pendingChore, backlogChore]);
    render(<DashboardScreen />);
    await waitFor(() => {
      expect(screen.getByText(/Bonus Tasks/i)).toBeTruthy();
      // backlog chores should not be visible until expanded
      expect(screen.queryByText('Read 20 pages')).toBeNull();
    });
  });

  it('expands backlog section when toggled', async () => {
    mockWithChores([pendingChore, backlogChore]);
    render(<DashboardScreen />);
    await waitFor(() => {
      const btn = screen.getByText(/Bonus Tasks/i);
      fireEvent.click(btn);
    });
    await waitFor(() => {
      expect(screen.getByText('Extra reading')).toBeTruthy();
    });
  });

  it('shows resolved section collapsed by default with count', async () => {
    mockWithChores([pendingChore, doneChore, cancelledChore]);
    render(<DashboardScreen />);
    await waitFor(() => {
      expect(screen.getByText(/Completed & Cancelled/i)).toBeTruthy();
      // resolved chores should not be visible until expanded
      expect(screen.queryByText('Easy peasy!')).toBeNull();
    });
  });

  it('expands resolved section when toggled', async () => {
    mockWithChores([pendingChore, doneChore]);
    render(<DashboardScreen />);
    await waitFor(() => {
      const btn = screen.getByText(/Completed & Cancelled/i);
      fireEvent.click(btn);
    });
    await waitFor(() => {
      expect(screen.getByText('Take out trash')).toBeTruthy();
    });
  });

  it('shows error message on RPC failure', async () => {
    mockRpc.mockImplementation((fn: string) => {
      if (fn === 'get_today_chores') return Promise.resolve({ data: null, error: { message: 'DB error' } });
      return Promise.resolve({ data: null, error: null });
    });
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }),
    });

    render(<DashboardScreen />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeTruthy();
    });
  });
});
