import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ChoreTemplatesScreen from './ChoreTemplatesScreen';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../contexts/FamilyContext', () => ({
  useFamily: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

// Pull the mocked modules so we can set return values per test
import { useFamily } from '../contexts/FamilyContext';
import { supabase } from '../lib/supabase';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ACTIVE_FAMILY = { id: 10, name: 'Smith Family' };

const MOCK_TEMPLATES = [
  {
    template_id: 1,
    member_id: 100,
    total_reward: 500,
    penalty_per_task: 50,
    member_role: 'child',
    member_is_admin: false,
    member_custom_name: 'Timmy',
    member_email: 'timmy@example.com',
    member_first_name: null,
    member_full_name: null,
    chore_count: 3,
  },
];

const MOCK_MEMBERS = [
  {
    id: 100,
    family_id: 10,
    role: 'child',
    is_admin: false,
    custom_name: 'Timmy',
    families: ACTIVE_FAMILY,
  },
  {
    id: 200,
    family_id: 10,
    role: 'parent',
    is_admin: true,
    custom_name: 'Mom',
    families: ACTIVE_FAMILY,
  },
];

const ACTIVE_MEMBER_ADMIN = { id: 200, role: 'parent', is_admin: true };

function setupMocks(templates = MOCK_TEMPLATES, members = MOCK_MEMBERS) {
  (useFamily as ReturnType<typeof vi.fn>).mockReturnValue({
    activeFamily: ACTIVE_FAMILY,
    activeMember: ACTIVE_MEMBER_ADMIN,
  });

  // supabase.rpc resolves differently per call name
  (supabase.rpc as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
    if (name === 'get_family_templates')
      return Promise.resolve({ data: templates, error: null });
    if (name === 'get_family_members')
      return Promise.resolve({ data: members, error: null });
    return Promise.resolve({ data: [], error: null });
  });
}

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/settings/templates']}>
      <ChoreTemplatesScreen />
    </MemoryRouter>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ChoreTemplatesScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading spinner while fetching', () => {
    (useFamily as ReturnType<typeof vi.fn>).mockReturnValue({
      activeFamily: ACTIVE_FAMILY,
      activeMember: ACTIVE_MEMBER_ADMIN,
    });

    // Never resolve to keep loading state
    (supabase.rpc as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    renderScreen();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('renders screen title and family name', async () => {
    setupMocks();
    renderScreen();

    expect(screen.getByText('Chore Templates')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Smith Family Hive')).toBeInTheDocument();
    });
  });

  it('renders a card for each family member', async () => {
    setupMocks();
    renderScreen();

    await waitFor(() => {
      expect(screen.getByText('Timmy')).toBeInTheDocument();
      expect(screen.getByText('Mom')).toBeInTheDocument();
    });
  });

  it('shows reward summary and chore count for members with templates', async () => {
    setupMocks();
    renderScreen();

    await waitFor(() => {
      expect(screen.getByText(/500 gems\/wk/i)).toBeInTheDocument();
      expect(screen.getByText(/3 chores/i)).toBeInTheDocument();
    });
  });

  it('shows "No template yet" badge for members without templates', async () => {
    setupMocks([], MOCK_MEMBERS); // no templates returned
    renderScreen();

    await waitFor(() => {
      const badges = screen.getAllByText(/No template yet/i);
      expect(badges.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('displays an error message when RPC fails', async () => {
    (useFamily as ReturnType<typeof vi.fn>).mockReturnValue({
      activeFamily: ACTIVE_FAMILY,
      activeMember: ACTIVE_MEMBER_ADMIN,
    });

    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { message: 'Something went wrong' },
    });

    renderScreen();

    await waitFor(() => {
      expect(screen.getByText(/Could not load chore templates/i)).toBeInTheDocument();
    });
  });

  it('shows the Reinitiate button for admin when templates exist', async () => {
    setupMocks();
    renderScreen();

    await waitFor(() => {
      expect(document.getElementById('reinitiate-chores-btn')).toBeInTheDocument();
    });
  });

  it('does not show the Reinitiate button when there are no templates', async () => {
    setupMocks([], MOCK_MEMBERS); // no templates
    renderScreen();

    await waitFor(() => {
      expect(screen.getByText('Timmy')).toBeInTheDocument();
    });

    expect(document.getElementById('reinitiate-chores-btn')).toBeNull();
  });

  it('opens confirmation dialog when Reinitiate is clicked', async () => {
    setupMocks();
    renderScreen();

    await waitFor(() => {
      expect(document.getElementById('reinitiate-chores-btn')).toBeInTheDocument();
    });

    fireEvent.click(document.getElementById('reinitiate-chores-btn')!);

    expect(screen.getByText('Reinitiate Weekly Chores?')).toBeInTheDocument();
    expect(document.getElementById('reinitiate-confirm-btn')).toBeInTheDocument();
    expect(document.getElementById('reinitiate-cancel-btn')).toBeInTheDocument();
  });

  it('calls generate_week_chores for each template member and shows results', async () => {
    setupMocks();

    // Override the rpc mock so generate_week_chores returns a result
    (supabase.rpc as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === 'get_family_templates')
        return Promise.resolve({ data: MOCK_TEMPLATES, error: null });
      if (name === 'get_family_members')
        return Promise.resolve({ data: MOCK_MEMBERS, error: null });
      if (name === 'generate_week_chores')
        return Promise.resolve({ data: { inserted: 2, cancelled: 0 }, error: null });
      return Promise.resolve({ data: [], error: null });
    });

    renderScreen();

    await waitFor(() => {
      expect(document.getElementById('reinitiate-chores-btn')).toBeInTheDocument();
    });

    fireEvent.click(document.getElementById('reinitiate-chores-btn')!);
    fireEvent.click(document.getElementById('reinitiate-confirm-btn')!);

    await waitFor(() => {
      expect(screen.getByText('🔄 Weekly Chores Reinitiated')).toBeInTheDocument();
      expect(screen.getByText(/\+2 added/i)).toBeInTheDocument();
    });
  });

  it('auto-creates template and navigates when member has no template', async () => {
    setupMocks([], MOCK_MEMBERS); // no templates for any member

    // Mock the insert chain: supabase.from('weekly_templates').insert(...).select().single()
    const mockSingle = vi.fn().mockResolvedValue({ data: { id: 99 }, error: null });
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({ insert: mockInsert });

    renderScreen();

    await waitFor(() => {
      expect(screen.getByText('Timmy')).toBeInTheDocument();
    });

    // Click the first member card by its unique id
    const card = document.getElementById(`template-card-member-${MOCK_MEMBERS[0].id}`);
    expect(card).not.toBeNull();
    fireEvent.click(card!);

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ family_id: ACTIVE_FAMILY.id, member_id: 100 })
      );
    });
  });
});
