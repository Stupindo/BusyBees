import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { useFamily } from '../contexts/FamilyContext';
import ShareFamilyCode from './ShareFamilyCode';
import { supabase } from '../lib/supabase';

const SettingsScreen = () => {
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

export default SettingsScreen;
