import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FamilyProvider, useFamily } from './FamilyContext';
import { supabase } from '../lib/supabase';
import { useAuth } from '../components/AuthProvider';

// Mock Supabase
vi.mock('../lib/supabase', () => {
  const selectMock = vi.fn();
  const eqMock = vi.fn().mockReturnValue({ not: selectMock });
  selectMock.mockReturnValue({ eq: eqMock });
  
  return {
    supabase: {
      from: vi.fn().mockReturnValue({ select: selectMock })
    }
  };
});

// Mock AuthProvider
vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

const TestComponent = () => {
  const { isLoadingFamilies, userMemberships, activeFamily, setActiveFamilyId } = useFamily();
  if (isLoadingFamilies) return <div data-testid="loading">Loading...</div>;
  return (
    <div>
      <div data-testid="memberships-count">{userMemberships.length}</div>
      <div data-testid="active-family">{activeFamily?.name || 'None'}</div>
      <button onClick={() => setActiveFamilyId(2)} data-testid="set-active">Set Active 2</button>
    </div>
  );
};

describe('FamilyContext', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  it('handles unauthenticated state gracefully', async () => {
    (useAuth as any).mockReturnValue({ session: null, isLoading: false });

    render(
      <FamilyProvider>
        <TestComponent />
      </FamilyProvider>
    );

    // Should load out of the gate empty
    await waitFor(() => {
      expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
    });

    expect(screen.getByTestId('memberships-count')).toHaveTextContent('0');
  });

  it('fetches families and auto-selects if there is exactly one family', async () => {
    (useAuth as any).mockReturnValue({ 
      session: { user: { id: 'user-1' } }, 
      isLoading: false 
    });

    const mockFamiliesData = [
      {
        id: 10,
        family_id: 1,
        role: 'parent',
        families: { id: 1, name: 'The Smiths' }
      }
    ];

    // Setup nested mock for supabase.from().select().eq().not()
    const notMock = vi.fn().mockResolvedValue({ data: mockFamiliesData, error: null });
    const eqMock = vi.fn().mockReturnValue({ not: notMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    (supabase.from as any).mockReturnValue({ select: selectMock });

    render(
      <FamilyProvider>
        <TestComponent />
      </FamilyProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('memberships-count')).toHaveTextContent('1');
    });

    // Verify auto select worked
    expect(screen.getByTestId('active-family')).toHaveTextContent('The Smiths');
  });
});
