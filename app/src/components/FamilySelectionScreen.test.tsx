import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FamilySelectionScreen from './FamilySelectionScreen';
import { useFamily } from '../contexts/FamilyContext';

vi.mock('../contexts/FamilyContext', () => ({
  useFamily: vi.fn(() => ({
    isLoadingFamilies: false,
    userMemberships: [],
    setActiveFamilyId: vi.fn()
  })),
}));

describe('FamilySelectionScreen', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders loading spinner when loading families', () => {
    (useFamily as any).mockReturnValue({ isLoadingFamilies: true });
    const { container } = render(<FamilySelectionScreen />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders a list of families and handles selection', () => {
    const setActiveFamilyId = vi.fn();
    (useFamily as any).mockReturnValue({
      isLoadingFamilies: false,
      userMemberships: [
        { id: 1, family_id: 10, role: 'parent', families: { name: 'Family A' } },
        { id: 2, family_id: 20, role: 'child', families: { name: 'Family B' } },
      ],
      setActiveFamilyId
    });

    render(<FamilySelectionScreen />);
    
    expect(screen.getByText('Family A')).toBeInTheDocument();
    expect(screen.getByText('Family B')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Family A'));
    expect(setActiveFamilyId).toHaveBeenCalledWith(10);
  });
});
