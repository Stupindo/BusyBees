import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import MobileLayout from './components/MobileLayout';
import { AuthProvider, useAuth } from './components/AuthProvider';
import LoginScreen from './components/LoginScreen';
import { FamilyProvider, useFamily } from './contexts/FamilyContext';
import FamilySelectionScreen from './components/FamilySelectionScreen';
import CreateFamilyScreen from './components/CreateFamilyScreen';
import ShareFamilyCode from './components/ShareFamilyCode';
import ManageMembersScreen from './components/ManageMembersScreen';
import ChoreTemplatesScreen from './components/ChoreTemplatesScreen';
import EditTemplateScreen from './components/EditTemplateScreen';
import DashboardScreen from './components/DashboardScreen';
import HiveReportScreen from './components/HiveReportScreen';
import { supabase } from './lib/supabase';

// Wallet Page

interface Transaction {
  id: number;
  amount: number;
  type: 'earning' | 'penalty' | 'payout';
  description: string;
  created_at: string;
}

const Wallet = () => {
  const { activeMember } = useFamily();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!activeMember?.id) return;
    setIsLoading(true);
    supabase
      .from('transactions')
      .select('id, amount, type, description, created_at')
      .eq('member_id', activeMember.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setTransactions((data || []) as Transaction[]);
        setIsLoading(false);
      });
  }, [activeMember?.id]);

  // Balance: sum of earnings minus penalties and payouts
  const balance = transactions.reduce((sum, t) => {
    if (t.type === 'earning') return sum + t.amount;
    return sum - t.amount;
  }, 0);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const typeIcon = (type: string) => {
    if (type === 'earning') return '💎';
    if (type === 'payout') return '💸';
    return '⚠️';
  };

  const typeColor = (type: string) => {
    if (type === 'earning') return 'text-lime-600';
    return 'text-red-500';
  };

  return (
    <div className="p-6 pt-10 pb-28">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-secondary tracking-tight mb-1">Gems</h1>
        <p className="text-stone-500 font-medium text-sm">Your rewards balance.</p>
      </div>

      {/* Balance card */}
      <div className="bg-gradient-to-br from-accent to-accent-dark p-8 rounded-3xl shadow-lg border border-accent flex flex-col items-center justify-center min-h-[200px] text-white overflow-hidden relative mb-6">
        <div className="absolute top-0 right-0 p-8 opacity-20">
          <span className="text-9xl">💎</span>
        </div>
        <div className="relative z-10 flex flex-col items-center">
          {isLoading ? (
            <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin mb-2" />
          ) : (
            <div className="text-6xl font-black drop-shadow-md mb-2">{balance}</div>
          )}
          <p className="text-white/80 font-semibold uppercase tracking-wider text-sm bg-black/10 px-4 py-1 rounded-full">
            Current Balance
          </p>
        </div>
      </div>

      {/* Transaction history */}
      {!isLoading && transactions.length > 0 && (
        <div>
          <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-3 px-1">History</p>
          <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden">
            <ul className="divide-y divide-stone-50">
              {transactions.map(t => (
                <li key={t.id} className="px-5 py-4 flex items-center gap-3">
                  <span className="text-xl flex-shrink-0">{typeIcon(t.type)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-secondary truncate">{t.description}</p>
                    <p className="text-xs text-stone-400 font-medium">{formatDate(t.created_at)}</p>
                  </div>
                  <span className={`text-sm font-black flex-shrink-0 ${typeColor(t.type)}`}>
                    {t.type === 'earning' ? '+' : '-'}{t.amount}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {!isLoading && transactions.length === 0 && (
        <div className="bg-white rounded-3xl border border-stone-100 shadow-sm p-8 flex flex-col items-center text-center">
          <span className="text-4xl mb-3">🐝</span>
          <p className="text-stone-500 font-semibold text-sm">No gems yet — complete your chores to earn some!</p>
        </div>
      )}
    </div>
  );
};

const Settings = () => {
  const { signOut } = useAuth();
  const { activeFamily, activeMember } = useFamily();
  const navigate = useNavigate();

  const isAdmin = activeMember?.is_admin || activeMember?.role === 'parent';

  // ---------------------------------------------------------------------------
  // Week settlement state
  // ---------------------------------------------------------------------------
  const [isWeekSettledEarly, setIsWeekSettledEarly] = useState(false);
  const [isProcessingWeek, setIsProcessingWeek] = useState(false);

  const getWeekStartStr = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff);
    const y = monday.getFullYear();
    const m = String(monday.getMonth() + 1).padStart(2, '0');
    const d = String(monday.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const checkWeekStatus = useCallback(async () => {
    if (!activeFamily?.id) return;
    const { data, error } = await supabase
      .from('weekly_settlements')
      .select('is_early')
      .eq('family_id', activeFamily.id)
      .eq('week_start_date', getWeekStartStr())
      .limit(1);
    if (error) {
      console.warn('checkWeekStatus error:', error);
      return;
    }
    setIsWeekSettledEarly(data && data.length > 0 ? data[0].is_early : false);
  }, [activeFamily?.id]);

  useEffect(() => {
    checkWeekStatus();
  }, [checkWeekStatus]);

  const handleCompleteWeek = async () => {
    if (!activeFamily?.id) return;
    if (!confirm('Complete this week early for all hive members? Rewards will be calculated and recorded now.')) return;
    setIsProcessingWeek(true);
    const { data, error } = await supabase.rpc('complete_week_early', { p_family_id: activeFamily.id });
    setIsProcessingWeek(false);
    if (error) {
      alert('Failed to complete week: ' + error.message);
    } else if ((data as any)?.error) {
      alert((data as any).error);
    } else {
      setIsWeekSettledEarly(true);
      await checkWeekStatus();
    }
  };

  const handleRevertWeek = async () => {
    if (!activeFamily?.id) return;
    if (!confirm('Revert the early completion? Rewards will be removed and chores reopened.')) return;
    setIsProcessingWeek(true);
    const { data, error } = await supabase.rpc('revert_week_early', { p_family_id: activeFamily.id });
    setIsProcessingWeek(false);
    if (error) {
      alert('Failed to revert: ' + error.message);
    } else if ((data as any)?.error) {
      alert((data as any).error);
    } else {
      setIsWeekSettledEarly(false);
      await checkWeekStatus();
    }
  };

  return (
    <div className="p-6 pt-10">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-secondary tracking-tight mb-1">Family Setup</h1>
        <p className="text-stone-500 font-medium text-sm">Manage the {activeFamily?.name || ''} hive settings.</p>
      </div>

      <ShareFamilyCode />
      
      <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden mb-6">
        <ul className="divide-y divide-stone-100">
          <li 
            onClick={() => navigate('/settings/members')}
            className="p-5 flex items-center justify-between text-stone-700 font-semibold cursor-pointer hover:bg-stone-50 transition-colors group"
          >
            <span>Manage Members</span>
            <span className="text-stone-400 group-hover:text-primary transition-colors">→</span>
          </li>
          <li
            onClick={() => navigate('/settings/templates')}
            className="p-5 flex items-center justify-between text-stone-700 font-semibold cursor-pointer hover:bg-stone-50 transition-colors group"
          >
            <span>Chore Templates</span>
            <span className="text-stone-400 group-hover:text-primary transition-colors">→</span>
          </li>
          {isAdmin && (
            <li
              onClick={() => navigate('/settings/report')}
              className="p-5 flex items-center justify-between text-stone-700 font-semibold cursor-pointer hover:bg-stone-50 transition-colors group border-t border-stone-100"
            >
              <span>Hive Report</span>
              <span className="text-stone-400 group-hover:text-primary transition-colors">→</span>
            </li>
          )}
        </ul>
      </div>

      {/* App Preferences — admin-only week controls */}
      {isAdmin && (
        <div className="mb-6">
          <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-3 px-1">App Preferences</p>
          <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden">
            <div className="p-5">
              <p className="text-sm font-semibold text-stone-700 mb-1">Weekly Settlement</p>
              <p className="text-xs text-stone-400 font-medium mb-4">
                {isWeekSettledEarly
                  ? 'This week was completed early. You can reopen it if needed.'
                  : 'Close the current week ahead of schedule and calculate rewards for all hive members now.'}
              </p>
              {!isWeekSettledEarly ? (
                <button
                  id="complete-week-btn"
                  onClick={handleCompleteWeek}
                  disabled={isProcessingWeek}
                  className="w-full flex items-center justify-center gap-2 bg-secondary text-white font-bold py-3 rounded-2xl hover:bg-black transition-colors disabled:opacity-50 text-sm"
                >
                  {isProcessingWeek ? 'Processing…' : '⚡ Complete Week Early'}
                </button>
              ) : (
                <button
                  id="revert-week-btn"
                  onClick={handleRevertWeek}
                  disabled={isProcessingWeek}
                  className="w-full flex items-center justify-center gap-2 bg-stone-100 text-stone-600 font-bold py-3 rounded-2xl hover:bg-stone-200 transition-colors disabled:opacity-50 text-sm"
                >
                  {isProcessingWeek ? 'Processing…' : '↩ Revert Early Completion'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <button 
        onClick={() => signOut()}
        className="w-full bg-stone-100 text-stone-500 font-bold py-4 rounded-2xl hover:bg-stone-200 transition-colors"
      >
        Sign Out
      </button>
    </div>
  );
};

const FamilyGuardedApp = () => {
  const { userMemberships, activeFamily, isLoadingFamilies } = useFamily();

  if (isLoadingFamilies) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="w-12 h-12 border-4 border-stone-200 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  // If the user has zero mappings, they need to create a Hive first
  if (userMemberships.length === 0) {
    return <CreateFamilyScreen />;
  }

  // If the user has mappings but hasn't activated one (or selected one), prompt them
  if (!activeFamily) {
    return <FamilySelectionScreen />;
  }

  return (
    <Routes>
      <Route path="/" element={<MobileLayout />}>
        <Route index element={<DashboardScreen />} />
        <Route path="wallet" element={<Wallet />} />
        <Route path="settings" element={<Settings />} />
        <Route path="settings/members" element={<ManageMembersScreen />} />
        <Route path="settings/templates" element={<ChoreTemplatesScreen />} />
        <Route path="settings/templates/:templateId" element={<EditTemplateScreen />} />
        <Route path="settings/report" element={<HiveReportScreen />} />
      </Route>
    </Routes>
  );
};

// Root navigator to handle auth routing wrapper
const AppNavigator = () => {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="w-12 h-12 border-4 border-stone-200 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  // Completely block the user with LoginScreen if there is no active session
  if (!session) {
    return <LoginScreen />;
  }

  return (
    <FamilyProvider>
      <FamilyGuardedApp />
    </FamilyProvider>
  );
};

function App() {
  return (
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  );
}

export default App;
