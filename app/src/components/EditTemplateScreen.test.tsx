import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EditTemplateScreen from './EditTemplateScreen';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../contexts/FamilyContext', () => ({
  useFamily: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { useFamily } from '../contexts/FamilyContext';
import { supabase } from '../lib/supabase';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_TEMPLATE = {
  id: 1,
  family_id: 10,
  member_id: 100,
  total_reward: 500,
  penalty_per_task: 50,
};

const MOCK_CHORES = [
  {
    id: 11,
    title: 'Wash dishes',
    template_id: 1,
    is_backlog: false,
    extra_reward: 0,
    description: null,
  },
  {
    id: 12,
    title: 'Vacuum living room',
    template_id: 1,
    is_backlog: true,
    extra_reward: 20,
    description: 'Every corner!',
  },
];

const ADMIN_MEMBER = { id: 200, role: 'parent', is_admin: true };

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildFromChain(template = MOCK_TEMPLATE, chores = MOCK_CHORES) {
  // We need to handle chained calls: supabase.from(table).select(...).eq(...).single()
  // and                              supabase.from(table).select(...).eq(...).order(...)
  const makeSingleChain = (data: unknown) => ({
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({ data, error: null }),
        order: () => Promise.resolve({ data: chores, error: null }),
      }),
    }),
    update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    insert: () => ({
      select: () => ({
        single: () => Promise.resolve({ data: { id: 99, ...MOCK_CHORES[0] }, error: null }),
      }),
    }),
    delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
  });

  (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
    if (table === 'weekly_templates') return makeSingleChain(template);
    if (table === 'chores') return makeSingleChain(chores);
    return makeSingleChain(null);
  });
}

function renderScreen(templateId = '1') {
  return render(
    <MemoryRouter initialEntries={[`/settings/templates/${templateId}`]}>
      <Routes>
        <Route path="/settings/templates/:templateId" element={<EditTemplateScreen />} />
        <Route path="/settings/templates" element={<div>Templates List</div>} />
      </Routes>
    </MemoryRouter>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EditTemplateScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useFamily as ReturnType<typeof vi.fn>).mockReturnValue({
      activeMember: ADMIN_MEMBER,
    });
  });

  it('shows loading spinner while fetching', () => {
    // Return a never-resolving promise
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => new Promise(() => {}),
          order: () => new Promise(() => {}),
        }),
      }),
    });
    renderScreen();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('renders reward input fields with template values', async () => {
    buildFromChain();
    renderScreen();

    await waitFor(() => {
      expect(document.getElementById('total-reward-input')).toBeInTheDocument();
      expect(document.getElementById('penalty-input')).toBeInTheDocument();
    });

    expect((document.getElementById('total-reward-input') as HTMLInputElement).value).toBe('500');
    expect((document.getElementById('penalty-input') as HTMLInputElement).value).toBe('50');
  });

  it('renders existing chores', async () => {
    buildFromChain();
    renderScreen();

    await waitFor(() => {
      expect(screen.getByText('Wash dishes')).toBeInTheDocument();
      expect(screen.getByText('Vacuum living room')).toBeInTheDocument();
    });
  });

  it('shows Backlog badge for backlog chores', async () => {
    buildFromChain();
    renderScreen();

    await waitFor(() => {
      expect(screen.getByText('Backlog')).toBeInTheDocument();
    });
  });

  it('shows extra reward badge for chores with extra_reward > 0', async () => {
    buildFromChain();
    renderScreen();

    await waitFor(() => {
      expect(screen.getByText(/\+20/)).toBeInTheDocument();
    });
  });

  it('opens add chore modal when "Add Chore" button is clicked', async () => {
    buildFromChain();
    renderScreen();

    await waitFor(() => screen.getByText('Wash dishes'));

    // Click the toolbar button by its unique id
    fireEvent.click(document.getElementById('add-chore-btn')!);
    expect(screen.getByTestId('chore-modal')).toBeInTheDocument();
    // The modal heading should be an h2 with "Add Chore"
    expect(screen.getByRole('heading', { name: 'Add Chore' })).toBeInTheDocument();
  });

  it('closes modal when close button is clicked', async () => {
    buildFromChain();
    renderScreen();

    await waitFor(() => screen.getByText('Wash dishes'));
    fireEvent.click(screen.getByText('Add Chore'));
    expect(screen.getByTestId('chore-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Close'));
    await waitFor(() => {
      expect(screen.queryByTestId('chore-modal')).not.toBeInTheDocument();
    });
  });

  it('opens edit modal when edit button is clicked', async () => {
    buildFromChain();
    renderScreen();

    await waitFor(() => screen.getByText('Wash dishes'));

    const editButtons = screen.getAllByLabelText(/Edit/i);
    fireEvent.click(editButtons[0]);

    expect(screen.getByTestId('chore-modal')).toBeInTheDocument();
    expect(screen.getByText('Edit Chore')).toBeInTheDocument();
    // The title should be pre-filled
    expect((screen.getByLabelText(/Chore Title/i) as HTMLInputElement).value).toBe('Wash dishes');
  });

  it('submits add chore form and adds chore to list', async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: 99, title: 'Mop the floor', template_id: 1, is_backlog: false, extra_reward: 0, description: null },
      error: null,
    });
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });

    // Template and chores fetched normally, then insert goes through
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === 'weekly_templates') {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: MOCK_TEMPLATE, error: null }) }) }),
        };
      }
      if (table === 'chores') {
        return {
          select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
          insert: mockInsert,
        };
      }
      return {};
    });

    renderScreen();

    await waitFor(() => screen.getByText('Add Chore'));
    fireEvent.click(screen.getByText('Add Chore'));

    // Fill in the title
    const titleInput = screen.getByLabelText(/Chore Title/i);
    fireEvent.change(titleInput, { target: { value: 'Mop the floor' } });

    // Submit via the modal's save button (unique id avoids ambiguity with toolbar button)
    const saveBtn = document.getElementById('save-chore-btn') as HTMLButtonElement;
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Mop the floor', template_id: 1 })
      );
    });

    // Modal should close and new chore should appear
    await waitFor(() => {
      expect(screen.queryByTestId('chore-modal')).not.toBeInTheDocument();
      expect(screen.getByText('Mop the floor')).toBeInTheDocument();
    });
  });

  it('shows error when template not found', async () => {
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: { message: 'Not found' } }),
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    });
    renderScreen();

    await waitFor(() => {
      expect(screen.getByText('Template not found.')).toBeInTheDocument();
    });
  });

  it('shows empty chores state with prompt', async () => {
    buildFromChain(MOCK_TEMPLATE, []);
    renderScreen();

    await waitFor(() => {
      expect(screen.getByText(/No chores yet/i)).toBeInTheDocument();
    });
  });
});
