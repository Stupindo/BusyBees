import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ShareFamilyCode from './ShareFamilyCode';
import { useFamily } from '../contexts/FamilyContext';

vi.mock('../contexts/FamilyContext', () => ({
  useFamily: vi.fn(),
}));

describe('ShareFamilyCode', () => {
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
      activeFamily: { join_code: 'AABBCC' }, 
      activeMember: { role: 'parent', is_admin: true } 
    });
    
    render(<ShareFamilyCode />);
    expect(screen.getByText('AABBCC')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });
});
