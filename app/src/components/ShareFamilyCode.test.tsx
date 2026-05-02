import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ShareFamilyCode from './ShareFamilyCode';
import { useFamily } from '../contexts/FamilyContext';
import { supabase } from '../lib/supabase';

vi.mock('../contexts/FamilyContext', () => ({
  useFamily: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

describe('ShareFamilyCode', () => {
  const mockRefreshFamilies = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('does not render if there is no active family', () => {
    (useFamily as any).mockReturnValue({ activeFamily: null, activeMember: null });
    const { container } = render(<ShareFamilyCode />);
    expect(container).toBeEmptyDOMElement();
  });

  it('does not render if member is not a parent or admin', () => {
    (useFamily as any).mockReturnValue({ 
      activeFamily: { join_code: 'AABBCC' }, 
      activeMember: { role: 'child', is_admin: false } 
    });
    const { container } = render(<ShareFamilyCode />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the share code widget if parent or admin', () => {
    (useFamily as any).mockReturnValue({ 
      activeFamily: { id: 1, join_code: 'AABBCC' }, 
      activeMember: { role: 'parent', is_admin: true },
      refreshFamilies: mockRefreshFamilies
    });
    
    render(<ShareFamilyCode />);
    expect(screen.getByText('AABBCC')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(screen.getByTitle('Regenerate code')).toBeInTheDocument();
  });

  it('shows confirmation dialog when regenerate button is clicked', () => {
    (useFamily as any).mockReturnValue({ 
      activeFamily: { id: 1, join_code: 'AABBCC' }, 
      activeMember: { role: 'parent', is_admin: true },
      refreshFamilies: mockRefreshFamilies
    });
    
    render(<ShareFamilyCode />);
    const regenerateBtn = screen.getByTitle('Regenerate code');
    fireEvent.click(regenerateBtn);
    
    expect(screen.getByText(/Are you sure you want to regenerate the join code\?/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes, Regenerate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('calls rpc and refreshes family when regeneration is confirmed', async () => {
    (useFamily as any).mockReturnValue({ 
      activeFamily: { id: 1, join_code: 'AABBCC' }, 
      activeMember: { role: 'parent', is_admin: true },
      refreshFamilies: mockRefreshFamilies
    });
    
    (supabase.rpc as any).mockResolvedValue({ error: null });

    render(<ShareFamilyCode />);
    
    // Open confirmation
    fireEvent.click(screen.getByTitle('Regenerate code'));
    
    // Confirm
    fireEvent.click(screen.getByRole('button', { name: 'Yes, Regenerate' }));

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('regenerate_family_join_code', { p_family_id: 1 });
      expect(mockRefreshFamilies).toHaveBeenCalled();
    });
  });
});
