import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useFamily } from '../contexts/FamilyContext';
import { Shield, Zap, ArrowLeft, Loader2, Award, ChevronDown, ChevronUp, CheckCircle2, XCircle, Camera } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function getMondayOfCurrentWeek(): string {
  const today = new Date();
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  // Return YYYY-MM-DD
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const d = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function HiveReportScreen() {
  const { activeFamily, activeMember } = useFamily();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(true);
  const [reportData, setReportData] = useState<any[]>([]);
  const [expandedMemberId, setExpandedMemberId] = useState<number | null>(null);

  const isAdmin = activeMember?.is_admin || activeMember?.role === 'parent';

  const fetchReport = useCallback(async () => {
    if (!activeFamily?.id) return;
    setIsLoading(true);

    const weekStartStr = getMondayOfCurrentWeek();
    const weekStartMs = new Date(weekStartStr).getTime();

    // 1. Fetch members
    const { data: members, error: membersErr } = await supabase
      .from('members')
      .select('*')
      .eq('family_id', activeFamily.id)
      .order('id');

    if (membersErr || !members) {
      console.error('Failed to load members', membersErr);
      setIsLoading(false);
      return;
    }

    const memberIds = members.map(m => m.id);

    if (memberIds.length === 0) {
      setReportData([]);
      setIsLoading(false);
      return;
    }

    // 2. Fetch weekly chore instances (joined with chores to know if it's backlog)
    const { data: choreInstances, error: choresErr } = await supabase
      .from('chore_instances')
      .select('id, member_id, status, notes, photo_url, instance_date, completed_at, chores (title, is_backlog)')
      .in('member_id', memberIds)
      .eq('week_start_date', weekStartStr);

    if (choresErr) {
      console.error('Failed to load chore instances', choresErr);
    }

    // 3. Fetch transactions
    const { data: transactions, error: txErr } = await supabase
      .from('transactions')
      .select('*')
      .in('member_id', memberIds);

    if (txErr) {
      console.error('Failed to load transactions', txErr);
    }

    // Process data per member
    const processed = members.map(m => {
      const mChores = (choreInstances || []).filter(c => c.member_id === m.id);
      
      // Filter out backlog chores for the progress calculation
      const regularChores = mChores.filter(c => !c.chores?.is_backlog);
      const totalRegular = regularChores.length;
      const doneRegular = regularChores.filter(c => c.status !== 'pending').length;

      const mTx = (transactions || []).filter(t => t.member_id === m.id);
      
      let totalBalance = 0;
      let weeklyEarnings = 0;

      mTx.forEach(t => {
        if (t.type === 'earning') {
          totalBalance += t.amount;
          
          const txTime = new Date(t.created_at).getTime();
          if (txTime >= weekStartMs) {
            weeklyEarnings += t.amount;
          }
        } else {
          totalBalance -= t.amount;
        }
      });

      return {
        ...m,
        totalRegular,
        doneRegular,
        totalBalance,
        weeklyEarnings,
        chores: mChores.filter(c => c.status === 'done' || c.status === 'failed' || c.status === 'cancelled')
      };
    });

    setReportData(processed);
    setIsLoading(false);
  }, [activeFamily?.id]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-secondary flex flex-col">
      {/* Header */}
      <div className="bg-white px-6 pt-12 pb-4 shadow-sm border-b border-stone-200 sticky top-0 z-10 flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 flex items-center justify-center bg-stone-100 text-stone-600 rounded-full hover:bg-stone-200 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-extrabold text-secondary tracking-tight">Hive Report</h1>
          <p className="text-xs font-semibold text-stone-400">Weekly Summary & Gems</p>
        </div>
      </div>

      <div className="flex-1 p-6 pb-28 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : reportData.length === 0 ? (
          <div className="text-center py-20 text-stone-400 font-medium">
            No members found in this family.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {reportData.map(member => {
              const isExpanded = expandedMemberId === member.id;
              return (
              <div key={member.id} className="bg-white rounded-[2rem] shadow-sm border border-stone-100 overflow-hidden relative">
                <div 
                  className={`p-5 flex items-center gap-4 border-b border-stone-50 ${isAdmin ? 'cursor-pointer hover:bg-stone-50 transition-colors' : ''}`}
                  onClick={() => isAdmin && setExpandedMemberId(isExpanded ? null : member.id)}
                >
                  <div className="w-14 h-14 bg-gradient-to-br from-amber-100 to-amber-200 rounded-full flex items-center justify-center text-2xl shadow-inner border border-amber-300 flex-shrink-0">
                    {member.avatar || '🐝'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold text-secondary truncate flex items-center gap-2">
                      {member.custom_name || 'Family Member'}
                      {(member.role === 'parent' || member.is_admin) && (
                        <Shield className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      )}
                    </h3>
                    <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mt-0.5">
                      {member.role === 'parent' ? 'Parent' : 'Child'}
                    </p>
                  </div>
                  {isAdmin && (
                    <div className="flex-shrink-0 text-stone-400">
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  )}
                </div>

                <div className="p-5 grid grid-cols-2 gap-4 bg-stone-50/50">
                  {/* Progress Card */}
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-stone-100 flex flex-col justify-center">
                    <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-blue-400" />
                      This Week's Chores
                    </div>
                    {member.totalRegular > 0 ? (
                      <div>
                        <div className="flex items-end gap-1 mb-1.5">
                          <span className="text-2xl font-black text-secondary leading-none">{member.doneRegular}</span>
                          <span className="text-sm font-bold text-stone-400 leading-tight">/ {member.totalRegular}</span>
                        </div>
                        <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-blue-500 rounded-full transition-all duration-700 ease-out"
                            style={{ width: `${Math.round((member.doneRegular / member.totalRegular) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm font-semibold text-stone-400 py-1">No chores</p>
                    )}
                  </div>

                  {/* Earnings Card */}
                  <div className="bg-gradient-to-br from-accent to-accent-dark p-4 rounded-2xl shadow-sm border border-accent flex flex-col justify-center text-white relative overflow-hidden">
                    <div className="absolute -right-2 -bottom-2 opacity-20">
                      <Award className="w-16 h-16" />
                    </div>
                    <div className="relative z-10">
                      <div className="text-[10px] font-bold text-white/80 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <Zap className="w-3 h-3 text-amber-300 fill-amber-300" />
                        Gems Balance
                      </div>
                      <div className="text-3xl font-black drop-shadow-md mb-2">{member.totalBalance}</div>
                      
                      <div className="text-xs font-semibold bg-black/10 inline-flex px-2 py-0.5 rounded flex items-center gap-1">
                        <span className="text-lime-300">+{member.weeklyEarnings}</span> this week
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded Chores List */}
                {isAdmin && isExpanded && (
                  <div className="bg-white border-t border-stone-100 p-5">
                    <h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-4">Completed & Failed Chores</h4>
                    {member.chores.length === 0 ? (
                      <p className="text-sm text-stone-400 italic">No completed or failed chores yet this week.</p>
                    ) : (
                      <div className="space-y-3">
                        {member.chores.map((chore: any) => {
                          const isDone = chore.status === 'done';
                          const leftBorderColor = isDone ? 'border-l-lime-500' : 'border-l-red-400';
                          return (
                            <div key={chore.id} className={`bg-stone-50 rounded-xl border border-stone-200 border-l-4 ${leftBorderColor} p-4`}>
                              <div className="flex items-start gap-3">
                                <div className="mt-0.5 flex-shrink-0">
                                  {isDone ? <CheckCircle2 className="w-5 h-5 text-lime-500" /> : <XCircle className="w-5 h-5 text-red-400" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-bold text-sm text-secondary truncate">{chore.chores?.title || 'Unknown Chore'}</span>
                                    {chore.chores?.is_backlog && (
                                      <span className="text-[10px] bg-blue-50 text-blue-500 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Bonus</span>
                                    )}
                                  </div>
                                  
                                  {chore.completed_at && (
                                    <p className="text-[10px] font-medium text-stone-400 mb-1">
                                      <span className="font-bold text-stone-500">Completion time:</span> {new Date(chore.completed_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                  )}
                                  
                                  {chore.notes && (
                                    <div className="bg-white rounded-lg p-2 mt-2 border border-stone-100">
                                      <p className="text-xs text-stone-500 italic">💬 "{chore.notes}"</p>
                                    </div>
                                  )}

                                  {chore.photo_url && (
                                    <div className="mt-3">
                                      <div className="text-[10px] font-bold text-stone-400 flex items-center gap-1 mb-1.5 uppercase tracking-wider">
                                        <Camera className="w-3 h-3" /> Evidence Photo
                                      </div>
                                      <div className="rounded-lg overflow-hidden border border-stone-200 bg-black inline-block">
                                        <img src={chore.photo_url} alt="Chore evidence" className="max-w-full h-32 object-contain" />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )})}
          </div>
        )}
      </div>
    </div>
  );
}
