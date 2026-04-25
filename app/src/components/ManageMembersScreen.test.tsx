import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ManageMembersScreen from './ManageMembersScreen';
import { useAuth } from './AuthProvider';
import { useFamily } from '../contexts/FamilyContext';
import { supabase } from '../lib/supabase';
import { MemoryRouter } from 'react-router-dom';

vi.mock('./AuthProvider', () => ({
  useAuth: vi.fn(() => ({ session: { user: { id: 'admin1' } } })),
}));

vi.mock('../contexts/FamilyContext', () => ({
  useFamily: vi.fn(() => ({ 
    activeFamily: { id: 1, name: 'The Smiths' },
    activeMember: { role: 'parent', is_admin: true }
  })),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn()
  }
}));

describe('ManageMembersScreen', () => {
  beforeEach(() => {
    (useAuth as any).mockReturnValue({ session: { user: { id: 'admin1' } } });
    (useFamily as any).mockReturnValue({ 
      activeFamily: { id: 1, name: 'The Smiths' },
      activeMember: { role: 'parent', is_admin: true }
    });
    vi.resetAllMocks();
  });

  it('renders correctly and fetches members', async () => {
    const mockMembers = [
      {
        member_id: 1,
        user_id: 'admin1',
        role: 'parent',
        is_admin: true,
        custom_name: 'Daddy',
        first_name: null,
        full_name: null,
        email: 'daddy@example.com'
      }
    ];

    (supabase.rpc as any).mockResolvedValue({ data: mockMembers, error: null });

    render(
      <MemoryRouter>
        <ManageMembersScreen />
      </MemoryRouter>
    );

    // Initial render might show loading or title
    expect(screen.getByText('Manage Members')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Daddy')).toBeInTheDocument();
    });

    // Verify role / admin badges
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });
});
