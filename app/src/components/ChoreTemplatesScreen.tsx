import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, PlusCircle, ChevronRight } from 'lucide-react';
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

export default function ChoreTemplatesScreen() {
  const navigate = useNavigate();
  const { activeFamily, activeMember } = useFamily();

  const [rows, setRows] = useState<TemplateWithMember[]>([]);
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [creatingFor, setCreatingFor] = useState<number | null>(null); // member_id being created

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
        <div>
          <h1 className="text-xl font-extrabold text-secondary tracking-tight">Chore Templates</h1>
          <p className="text-stone-400 text-xs font-medium">{activeFamily.name} Hive</p>
        </div>
      </div>

      <div className="p-6 pb-28 flex-1 overflow-y-auto">
        {/* Info banner */}
        <div className="mb-6 bg-gradient-to-r from-primary/20 to-primary-light/10 border border-primary/20 rounded-2xl p-4">
          <p className="text-sm font-semibold text-secondary/80 leading-relaxed">
            📋 Each family member can have a weekly chore template. Set up rewards and individual tasks for each bee in your hive.
          </p>
        </div>

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
    </div>
  );
}
