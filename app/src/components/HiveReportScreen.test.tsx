import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import HiveReportScreen from './HiveReportScreen';
import { useFamily } from '../contexts/FamilyContext';
import { supabase } from '../lib/supabase';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../contexts/FamilyContext', () => ({
  useFamily: vi.fn(() => ({
    activeFamily: { id: 1, name: 'The Bees' },
    activeMember: { id: 10, role: 'parent', is_admin: true },
  })),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('HiveReportScreen', () => {
  const mockFamily = { id: 1, name: 'The Bees' };
  const mockMember = { id: 10, role: 'parent', is_admin: true };

  beforeEach(() => {
    vi.clearAllMocks();
    (useFamily as any).mockReturnValue({
      activeFamily: mockFamily,
      activeMember: mockMember,
    });
  });

  it('renders hive report, expands a member, and displays chore day and date', async () => {
    const mockMembers = [
      {
        id: 10,
        family_id: 1,
        role: 'parent',
        is_admin: true,
        custom_name: 'Parent Bee',
        avatar: '👑',
      },
    ];

    const mockChoreInstances = [
      {
        id: 101,
        member_id: 10,
        status: 'pending',
        notes: null,
        photo_url: null,
        instance_date: '2026-06-15', // Monday
        completed_at: null,
        chores: {
          title: 'Wash the dishes',
          is_backlog: false,
        },
      },
      {
        id: 102,
        member_id: 10,
        status: 'done',
        notes: 'Done!',
        photo_url: null,
        instance_date: null, // Weekly chore
        completed_at: '2026-06-16T10:00:00Z',
        chores: {
          title: 'Mow the lawn',
          is_backlog: true,
        },
      },
    ];

    const mockTransactions = [
      {
        id: 201,
        member_id: 10,
        type: 'earning',
        amount: 10,
        created_at: '2026-06-15T09:00:00Z',
      },
    ];

    // Mock supabase calls
    const mockFrom = vi.fn((table: string) => {
      if (table === 'members') {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: mockMembers, error: null }),
            }),
          }),
        };
      }
      if (table === 'chore_instances') {
        return {
          select: () => ({
            in: () => ({
              eq: () => Promise.resolve({ data: mockChoreInstances, error: null }),
            }),
          }),
        };
      }
      if (table === 'transactions') {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: mockTransactions, error: null }),
          }),
        };
      }
      return { select: () => Promise.resolve({ data: [], error: null }) };
    });

    (supabase.from as any).mockImplementation(mockFrom);

    render(
      <MemoryRouter>
        <HiveReportScreen />
      </MemoryRouter>
    );

    // Verify loader transitions and report renders
    expect(screen.getByText('Hive Report')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Parent Bee')).toBeInTheDocument();
    });

    // Expand Parent Bee's details
    const memberRow = screen.getByText('Parent Bee');
    fireEvent.click(memberRow);

    // Verify chore titles are shown
    expect(screen.getByText('Wash the dishes')).toBeInTheDocument();
    expect(screen.getByText('Mow the lawn')).toBeInTheDocument();

    // Verify daily chore displays day of week and date (Mon, Jun 15)
    // Since 2026-06-15 is a Monday:
    expect(screen.getByText('Mon, Jun 15')).toBeInTheDocument();

    // Verify weekly chore displays 'Weekly'
    expect(screen.getByText('Weekly')).toBeInTheDocument();
  });
});
