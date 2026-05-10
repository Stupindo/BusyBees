import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, PlusCircle, ChevronRight, RefreshCw, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useFamily } from '../contexts/FamilyContext';
import type { Member } from '../contexts/FamilyContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TemplateWithMember {
  template_id: number;
  member_id: number;
  total_reward: number | null;
  penalty_per_task: number | null;
  member_role: 'parent' | 'child';
  member_is_admin: boolean;
  member_custom_name: string | null;
  member_email: string | null;
  member_first_name: string | null;
  member_full_name: string | null;
  chore_count: number;
}

interface MemberWithTemplate {
  member: Member;
  template: TemplateWithMember | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDisplayName(t: TemplateWithMember): string {
  if (t.member_custom_name) return t.member_custom_name;
  if (t.member_first_name) return t.member_first_name;
  if (t.member_full_name) return t.member_full_name!.split(' ')[0];
  if (t.member_email) return t.member_email.split('@')[0];
  return `Member #${t.member_id}`;
}

function getMemberDisplayName(m: Member): string {
  if (m.custom_name) return m.custom_name;
  if (m.first_name) return m.first_name;
  if (m.full_name) return m.full_name!.split(' ')[0];
  if (m.email) return m.email!.split('@')[0];
  return `Member #${m.id}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ReinitiateResult {
  member_name: string;
  inserted: number;
  cancelled: number;
  error?: string;
}

export default function ChoreTemplatesScreen() {
  const navigate = useNavigate();
  const { activeFamily, activeMember } = useFamily();

  const [rows, setRows] = useState<TemplateWithMember[]>([]);
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [creatingFor, setCreatingFor] = useState<number | null>(null); // member_id being created

  // Reinitiate weekly chores state
  const [isReinitConfirmOpen, setIsReinitConfirmOpen] = useState(false);
  const [isReinitRunning, setIsReinitRunning] = useState(false);
  const [reinitiateResults, setReinitiateResults] = useState<ReinitiateResult[] | null>(null);

  const isAdmin = activeMember?.is_admin || activeMember?.role === 'parent';

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    if (!activeFamily) return;
    setIsLoading(true);
    setError('');

    // Fetch all templates (with member info + chore counts) via RPC
    const [{ data: templateData, error: templateError }, { data: memberData, error: memberError }] = await Promise.all([
      supabase.rpc('get_family_templates', { p_family_id: activeFamily.id }),
      supabase.rpc('get_family_members', { p_family_id: activeFamily.id }),
    ]);

    if (templateError) {
      console.error('Error fetching templates:', templateError);
      setError('Could not load chore templates.');
    } else if (memberError) {
      console.error('Error fetching members:', memberError);
      setError('Could not load family members.');
    } else {
      setRows((templateData || []) as TemplateWithMember[]);
      setAllMembers((memberData || []) as Member[]);
    }

    setIsLoading(false);
  }, [activeFamily]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---------------------------------------------------------------------------
  // Build a unified list: members who have a template + members who don't yet
  // ---------------------------------------------------------------------------

  const membersWithTemplates: MemberWithTemplate[] = allMembers.map(m => ({
    member: m,
    template: rows.find(r => r.member_id === m.id) || null,
  }));

  // ---------------------------------------------------------------------------
  // Reinitiate weekly chores for the whole family (admin only)
  // ---------------------------------------------------------------------------

  const handleReinitate = async () => {
    if (!activeFamily) return;
    setIsReinitConfirmOpen(false);
    setIsReinitRunning(true);
    setReinitiateResults(null);

    const results: ReinitiateResult[] = [];

    for (const row of rows) {
      const memberName = getDisplayName(row);
      const { data, error: rpcErr } = await supabase.rpc('generate_week_chores', {
        p_family_id: activeFamily.id,
        p_member_id: row.member_id,
      });

      if (rpcErr) {
        results.push({ member_name: memberName, inserted: 0, cancelled: 0, error: rpcErr.message });
      } else {
        const res = data as { inserted: number; cancelled: number; error?: string };
        results.push({
          member_name: memberName,
          inserted: res.inserted ?? 0,
          cancelled: res.cancelled ?? 0,
          error: res.error,
        });
      }
    }

    setIsReinitRunning(false);
    setReinitiateResults(results);
  };

  // ---------------------------------------------------------------------------
  // Navigate to template editor — auto-creating the record if needed
  // ---------------------------------------------------------------------------

  const handleOpenTemplate = async (item: MemberWithTemplate) => {
    if (item.template) {
      navigate(`/settings/templates/${item.template.template_id}`);
      return;
    }

    // Auto-create an empty template for this member
    if (!activeFamily) return;
    setCreatingFor(item.member.id);

    const { data, error: createError } = await supabase
      .from('weekly_templates')
      .insert({
        family_id: activeFamily.id,
        member_id: item.member.id,
        total_reward: 0,
        penalty_per_task: 0,
      })
      .select()
      .single();

    setCreatingFor(null);

    if (createError || !data) {
      console.error('Error creating template:', createError);
      alert('Could not create template. Please try again.');
      return;
    }

    navigate(`/settings/templates/${data.id}`);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!activeFamily || !activeMember) {
    return (
      <div className="p-6 pt-10 text-center text-stone-500 font-medium">
        No active family selected.
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-stone-50 font-sans text-secondary">
      {/* Header */}
      <div className="bg-white px-6 pt-10 pb-4 border-b border-stone-100 flex items-center sticky top-0 z-10 shadow-sm">
        <button
          id="chore-templates-back-btn"
          onClick={() => navigate('/settings')}
          className="mr-4 p-2 -ml-2 rounded-full hover:bg-stone-100 text-stone-500 transition-colors"
          aria-label="Back to settings"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-extrabold text-secondary tracking-tight">Chore Templates</h1>
          <p className="text-stone-400 text-xs font-medium">{activeFamily.name} Hive</p>
        </div>
        {/* Admin: reinitiate button */}
        {isAdmin && rows.length > 0 && (
          <button
            id="reinitiate-chores-btn"
            onClick={() => setIsReinitConfirmOpen(true)}
            disabled={isReinitRunning}
            className="flex items-center gap-1.5 text-xs font-bold bg-secondary/5 hover:bg-secondary/10 text-secondary px-3 py-2 rounded-xl transition-colors disabled:opacity-50 border border-secondary/10"
            title="Reinitiate this week's chore instances for all members"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isReinitRunning ? 'animate-spin' : ''}`} />
            {isReinitRunning ? 'Running…' : 'Reinitiate'}
          </button>
        )}
      </div>

      <div className="p-6 pb-28 flex-1 overflow-y-auto">
        {/* Info banner */}
        <div className="mb-6 bg-gradient-to-r from-primary/20 to-primary-light/10 border border-primary/20 rounded-2xl p-4">
          <p className="text-sm font-semibold text-secondary/80 leading-relaxed">
            📋 Each family member can have a weekly chore template. Set up rewards and individual tasks for each bee in your hive.
          </p>
        </div>

        {/* Reinitiate results banner */}
        {reinitiateResults && (
          <div className="mb-5 bg-white border border-stone-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-stone-50">
              <p className="text-sm font-extrabold text-secondary">🔄 Weekly Chores Reinitiated</p>
              <button
                id="close-reinitiate-results-btn"
                onClick={() => setReinitiateResults(null)}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-stone-100 text-stone-400 hover:bg-stone-200 transition-colors"
                aria-label="Dismiss results"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="divide-y divide-stone-50">
              {reinitiateResults.map((r, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm font-semibold text-secondary">{r.member_name}</span>
                  {r.error ? (
                    <span className="text-xs text-red-500 font-semibold">{r.error}</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-lime-50 text-lime-700 font-bold px-2 py-0.5 rounded-full">+{r.inserted} added</span>
                      {r.cancelled > 0 && (
                        <span className="text-xs bg-red-50 text-red-500 font-bold px-2 py-0.5 rounded-full">{r.cancelled} cancelled</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center p-12">
            <div
              data-testid="loading-spinner"
              className="w-8 h-8 border-4 border-stone-200 border-t-primary rounded-full animate-spin"
            />
          </div>
        ) : error ? (
          <div className="text-red-500 text-center font-bold p-6">{error}</div>
        ) : membersWithTemplates.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-5xl mb-4">🐝</div>
            <p className="text-stone-500 font-semibold">No members found in this hive yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {membersWithTemplates.map(({ member, template }) => {
              const isCreating = creatingFor === member.id;
              const displayName = template ? getDisplayName(template) : getMemberDisplayName(member);
              const role = template ? template.member_role : member.role;
              const choreCount = template?.chore_count ?? 0;
              const totalReward = template?.total_reward ?? null;
              const hasTemplate = !!template;

              return (
                <div
                  id={`template-card-member-${member.id}`}
                  key={member.id}
                  onClick={() => (isAdmin || member.id === activeMember.id) ? handleOpenTemplate({ member, template }) : undefined}
                  className={`bg-white rounded-3xl border border-stone-100 shadow-sm overflow-hidden transition-all duration-200 ${
                    isAdmin || member.id === activeMember.id
                      ? 'cursor-pointer hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5'
                      : 'opacity-75'
                  }`}
                >
                  <div className="p-5 flex items-center justify-between gap-4">
                    {/* Avatar + Info */}
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-inner flex-shrink-0 ${
                          role === 'parent'
                            ? 'bg-gradient-to-br from-primary-light to-primary'
                            : 'bg-gradient-to-br from-stone-100 to-stone-200'
                        }`}
                      >
                        {role === 'parent' ? '👑' : '🐝'}
                      </div>
                      <div>
                        <h3 className="text-base font-extrabold text-secondary">
                          {displayName}
                          {member.id === activeMember.id && (
                            <span className="ml-2 text-[10px] bg-primary/20 text-primary-dark px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold">
                              You
                            </span>
                          )}
                        </h3>
                        <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mt-0.5">
                          {role}
                        </p>

                        {hasTemplate ? (
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <span className="inline-flex items-center gap-1 text-xs bg-accent/10 text-accent-dark px-2 py-0.5 rounded-full font-bold">
                              💰 {totalReward ?? 0} gems/wk
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full font-semibold">
                              🗒 {choreCount} chore{choreCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                        ) : (
                          <div className="mt-2">
                            <span className="inline-flex items-center gap-1 text-xs bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full font-semibold">
                              <PlusCircle className="w-3 h-3" /> No template yet
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Arrow / spinner */}
                    {(isAdmin || member.id === activeMember.id) && (
                      <div className="flex-shrink-0">
                        {isCreating ? (
                          <div className="w-5 h-5 border-2 border-stone-300 border-t-primary rounded-full animate-spin" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-stone-300 group-hover:text-primary transition-colors" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmation dialog */}
      {isReinitConfirmOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
          onClick={e => { if (e.target === e.currentTarget) setIsReinitConfirmOpen(false); }}
        >
          <div className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl p-6">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center text-3xl mx-auto mb-4">🔄</div>
            <h2 className="text-xl font-black text-secondary text-center mb-2 tracking-tight">Reinitiate Weekly Chores?</h2>
            <p className="text-sm text-stone-400 font-medium text-center mb-6">
              This will sync this week's chore instances for all <strong>{rows.length}</strong> member{rows.length !== 1 ? 's' : ''} with templates — adding missing chores and cancelling removed ones. Existing completed chores are unaffected.
            </p>
            <div className="flex gap-3">
              <button
                id="reinitiate-cancel-btn"
                onClick={() => setIsReinitConfirmOpen(false)}
                className="flex-1 py-3 bg-stone-100 text-stone-500 font-bold rounded-2xl hover:bg-stone-200 transition-colors"
              >
                Cancel
              </button>
              <button
                id="reinitiate-confirm-btn"
                onClick={handleReinitate}
                className="flex-1 py-3 bg-secondary text-primary-light font-bold rounded-2xl hover:bg-black transition-colors"
              >
                Reinitiate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
