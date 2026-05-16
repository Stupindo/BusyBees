import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../components/AuthProvider';

export interface Family {
  id: number;
  name: string;
  join_code?: string;
}

export interface Member {
  id: number;
  family_id: number;
  role: 'parent' | 'child';
  is_admin: boolean;
  custom_name: string | null;
  avatar: string | null;
  families: Family | null;
  email?: string;
  first_name?: string;
  full_name?: string;
}

interface FamilyContextType {
  userMemberships: Member[];
  isLoadingFamilies: boolean;
  activeFamily: Family | null;
  activeMember: Member | null;
  setActiveFamilyId: (id: number) => void;
  refreshFamilies: () => Promise<void>;
}

const FamilyContext = createContext<FamilyContextType | undefined>(undefined);

export function FamilyProvider({ children }: { children: ReactNode }) {
  const { session, isLoading: authLoading } = useAuth();
  
  const [userMemberships, setUserMemberships] = useState<Member[]>([]);
  const [isLoadingFamilies, setIsLoadingFamilies] = useState(true);
  
  // Restore the selected family id from local storage to persist the session
  const [activeFamilyId, _setActiveFamilyId] = useState<number | null>(() => {
    const saved = localStorage.getItem('busybees_active_family_id');
    return saved ? parseInt(saved, 10) : null;
  });

  const setActiveFamilyId = (id: number) => {
    localStorage.setItem('busybees_active_family_id', id.toString());
    _setActiveFamilyId(id);
  };

  const fetchFamilies = async () => {
    if (!session?.user?.id) {
      setUserMemberships([]);
      setIsLoadingFamilies(false);
      return;
    }

    setIsLoadingFamilies(true);
    const { data, error } = await supabase
      .from('members')
      .select('*, families(*)')
      .eq('user_id', session.user.id)
      .not('family_id', 'is', null);
      
    if (error) {
      console.error('Error fetching families:', error);
      setUserMemberships([]);
    } else {
      const memberships = (data || []) as unknown as Member[];
      setUserMemberships(memberships);
      
      // Auto-select logic if they only have exactly 1 family mapped
      if (memberships.length === 1 && memberships[0].families) {
         setActiveFamilyId(memberships[0].families.id);
      } else if (memberships.length > 0 && activeFamilyId) {
         // Verify the cached active family is still valid
         const stillExists = memberships.some(m => m.family_id === activeFamilyId);
         if (!stillExists) {
            _setActiveFamilyId(null);
            localStorage.removeItem('busybees_active_family_id');
         }
      }
    }
    setIsLoadingFamilies(false);
  };

  useEffect(() => {
    if (!authLoading) {
       fetchFamilies();
    }
  }, [session, authLoading]);

  const activeMember = userMemberships.find(m => m.family_id === activeFamilyId) || null;
  const activeFamily = activeMember?.families || null;

  return (
    <FamilyContext.Provider value={{
      userMemberships,
      isLoadingFamilies,
      activeFamily,
      activeMember,
      setActiveFamilyId,
      refreshFamilies: fetchFamilies
    }}>
      {children}
    </FamilyContext.Provider>
  );
}

export function useFamily() {
  const context = useContext(FamilyContext);
  if (context === undefined) {
    throw new Error('useFamily must be used within a FamilyProvider');
  }
  return context;
}
