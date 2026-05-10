import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, XCircle, ChevronDown, ChevronUp, Zap, RefreshCw, X, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthProvider';
import { useFamily } from '../contexts/FamilyContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChoreInstance {
  instance_id: number;
  chore_id: number;
  title: string;
  description: string | null;
  is_backlog: boolean;
  extra_reward: number;
  status: 'pending' | 'done' | 'cancelled' | 'failed';
  notes: string | null;
  week_start_date: string;
  penalty_per_task: number;
  frequency: 'weekly' | 'daily';
  recurrence_days: number[] | null;
  instance_date: string | null; // ISO date string for daily instances, null for weekly
}

type NoteModalMode = 'done' | 'cancel' | 'view';

interface NoteModalState {
  mode: NoteModalMode;
  instance: ChoreInstance;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function getMondayOfCurrentWeek(): Date {
  const today = new Date();
  const day = today.getDay(); // 0=Sun … 6=Sat
  const diff = (day === 0 ? -6 : 1 - day); // shift so Mon=0
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  return monday;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProgressBar({ total, done, potentialReward }: { total: number; done: number; potentialReward: number | null }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-bold text-stone-500 uppercase tracking-wider flex items-center">
          Week Progress
          {potentialReward !== null && (
            <span className="bg-amber-50 text-amber-600 text-[10px] font-black px-2 py-0.5 rounded-full ml-2 flex items-center gap-0.5" title="Potential Gems this week">
              <Zap className="w-3 h-3" /> {potentialReward}
            </span>
          )}
        </span>
        <span className="text-xs font-extrabold text-secondary">
          {done}/{total} done
        </span>
      </div>
      <div className="w-full h-3 bg-stone-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${pct}%`,
            background:
              pct === 100
                ? 'linear-gradient(90deg, #84cc16, #65a30d)'
                : 'linear-gradient(90deg, #fbbf24, #d97706)',
          }}
        />
      </div>
      {pct === 100 && (
        <p className="text-center text-xs font-bold text-accent mt-2 animate-pulse">
          🎉 All done for this week!
        </p>
      )}
    </div>
  );
}

interface ChoreCardProps {
  instance: ChoreInstance;
  onMarkDone: (instance: ChoreInstance) => void;
  onMarkCancelled: (instance: ChoreInstance) => void;
  onViewNote: (instance: ChoreInstance) => void;
}

function ChoreCard({ instance, onMarkDone, onMarkCancelled, onViewNote }: ChoreCardProps) {
  const isPending = instance.status === 'pending';
  const isDone = instance.status === 'done';
  const isCancelled = instance.status === 'cancelled' || instance.status === 'failed';

  let leftBorderColor = 'border-l-amber-400';
  if (isDone) leftBorderColor = 'border-l-lime-500';
  if (isCancelled) leftBorderColor = 'border-l-red-400';
  if (instance.is_backlog && isPending) leftBorderColor = 'border-l-blue-400';

  return (
    <div
      id={`chore-card-${instance.instance_id}`}
      onClick={() => !isPending && onViewNote(instance)}
      className={`bg-white rounded-2xl border border-stone-100 border-l-4 ${leftBorderColor} shadow-sm p-4 flex items-start gap-3 transition-all ${
        !isPending ? 'cursor-pointer hover:bg-stone-50 opacity-80' : ''
      }`}
    >
      {/* Status icon */}
      <div className="flex-shrink-0 mt-0.5">
        {isDone && <CheckCircle2 className="w-5 h-5 text-lime-500" />}
        {isCancelled && <XCircle className="w-5 h-5 text-red-400" />}
        {isPending && (
          <div className="w-5 h-5 rounded-full border-2 border-stone-300 bg-stone-50" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-0.5">
          <span
            className={`font-bold text-sm ${
              isDone ? 'text-stone-400 line-through' : isCancelled ? 'text-stone-400 line-through' : 'text-secondary'
            }`}
          >
            {instance.title}
          </span>
          {instance.frequency === 'daily' && (
            <span className="text-[10px] bg-teal-50 text-teal-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex-shrink-0">
              Daily
            </span>
          )}
          {instance.is_backlog && (
            <span className="text-[10px] bg-blue-50 text-blue-500 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex-shrink-0">
              Bonus
            </span>
          )}
          {/* Gems Display */}
          {/* Backlog / bonus chores: show extra reward */}
          {instance.is_backlog && instance.extra_reward > 0 && (
            isCancelled ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 flex items-center gap-0.5 bg-stone-100 text-stone-400 line-through" title="Bonus missed">
                +{instance.extra_reward} 💎
              </span>
            ) : (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 flex items-center gap-0.5 ${isDone ? 'bg-lime-50 text-lime-600' : 'bg-emerald-50 text-emerald-600'}`} title={isDone ? 'Bonus earned!' : 'Bonus reward for completing this'}>
                +{instance.extra_reward} 💎 {isDone ? '✓' : 'bonus'}
              </span>
            )
          )}
          {/* Regular chores: show penalty risk / outcome */}
          {!instance.is_backlog && instance.penalty_per_task > 0 && (
            isCancelled ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 flex items-center gap-0.5 bg-red-50 text-red-400" title="Gems lost for missing this chore">
                −{instance.penalty_per_task} 💎 missed
              </span>
            ) : isDone ? null : (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 flex items-center gap-0.5 bg-orange-50 text-orange-500" title="You'll lose this many gems if you skip this chore">
                −{instance.penalty_per_task} 💎 if skipped
              </span>
            )
          )}
        </div>
        {instance.description && (
          <p className="text-xs text-stone-400 font-medium leading-relaxed">
            {instance.description}
          </p>
        )}
        {instance.notes && !isPending && (
          <p className="text-xs text-stone-400 italic mt-1 truncate">
            💬 {instance.notes}
          </p>
        )}
        {!isPending && (
          <p className="text-[10px] text-stone-300 font-medium mt-1">
            Tap to {instance.notes ? 'edit' : 'add a'} note…
          </p>
        )}
      </div>

      {/* Action buttons — only for pending */}
      {isPending && (
        <div className="flex-shrink-0 flex items-center gap-2 ml-auto">
          <button
            id={`cancel-chore-${instance.instance_id}`}
            onClick={e => { e.stopPropagation(); onMarkCancelled(instance); }}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors"
            aria-label={`Cancel ${instance.title}`}
          >
            <X className="w-4 h-4" />
          </button>
          <button
            id={`done-chore-${instance.instance_id}`}
            onClick={e => { e.stopPropagation(); onMarkDone(instance); }}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-lime-50 text-lime-500 hover:bg-lime-100 hover:text-lime-700 transition-colors"
            aria-label={`Complete ${instance.title}`}
          >
            <Check className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Note modal (bottom sheet)
// ---------------------------------------------------------------------------

interface NoteModalProps {
  modal: NoteModalState;
  onClose: () => void;
  onConfirm: (note: string) => void;
  isSaving: boolean;
}

function NoteModal({ modal, onClose, onConfirm, isSaving }: NoteModalProps) {
  const [note, setNote] = useState(modal.instance.notes || '');

  const isDone = modal.mode === 'done';
  const isCancel = modal.mode === 'cancel';
  const isView = modal.mode === 'view';

  const title = isDone
    ? '✅ Mark as Done'
    : isCancel
    ? '❌ Cancel Chore'
    : '📝 Chore Note';

  const placeholder = isDone
    ? 'e.g. Done in 10 min — easy!'
    : isCancel
    ? 'e.g. Ran out of supplies…'
    : 'Add a note…';

  const confirmLabel = isDone ? 'Mark Done' : isCancel ? 'Cancel Chore' : 'Save Note';

  const confirmClass = isDone
    ? 'bg-lime-500 hover:bg-lime-600 text-white'
    : isCancel
    ? 'bg-red-500 hover:bg-red-600 text-white'
    : 'bg-secondary hover:bg-black text-primary-light';

  return (
    <div
      data-testid="note-modal"
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl p-6 relative">
        {/* Close */}
        <button
          id="close-note-modal-btn"
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-stone-100 text-stone-500 rounded-full hover:bg-stone-200 transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-xl font-black text-secondary mb-1 tracking-tight">{title}</h2>
        <p className="text-sm text-stone-400 font-medium mb-5">
          {modal.instance.title}
        </p>

        <textarea
          id="note-textarea"
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={3}
          placeholder={placeholder}
          className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary transition-all font-medium text-secondary resize-none mb-4"
        />

        <div className="flex gap-3">
          <button
            id="cancel-note-modal-btn"
            onClick={onClose}
            className="px-5 py-3 bg-stone-100 text-stone-500 font-bold rounded-2xl hover:bg-stone-200 transition-colors"
          >
            {isView ? 'Close' : 'Skip'}
          </button>
          <button
            id="confirm-note-modal-btn"
            onClick={() => onConfirm(note.trim())}
            disabled={isSaving}
            className={`flex-1 font-bold py-3 rounded-2xl transition-colors disabled:opacity-50 ${confirmClass}`}
          >
            {isSaving ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  isAdmin: boolean;
  isGenerating: boolean;
  onGenerate: () => void;
  hasTemplate: boolean;
}

function EmptyState({ isAdmin, isGenerating, onGenerate, hasTemplate }: EmptyStateProps) {
  return (
    <div className="bg-white rounded-3xl border border-stone-100 shadow-sm p-8 flex flex-col items-center text-center">
      <div className="w-20 h-20 bg-gradient-to-br from-amber-100 to-amber-200 rounded-full flex items-center justify-center mb-4 shadow-inner">
        <span className="text-4xl">🐝</span>
      </div>
      <h3 className="text-lg font-bold text-secondary mb-1">No chores this week!</h3>
      <p className="text-stone-400 text-sm font-medium mb-6 max-w-xs">
        {hasTemplate
          ? 'Your hive is quiet. Generate this week\'s chores from your template.'
          : 'Set up a chore template in Family Setup to get started.'}
      </p>
      {isAdmin && hasTemplate && (
        <button
          id="generate-chores-btn"
          onClick={onGenerate}
          disabled={isGenerating}
          className="flex items-center gap-2 bg-secondary hover:bg-black text-primary-light font-bold px-6 py-3 rounded-2xl transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
          {isGenerating ? 'Generating…' : 'Generate Chores'}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DashboardScreen() {
  const { user } = useAuth();
  const { activeFamily, activeMember } = useFamily();

  const [chores, setChores] = useState<ChoreInstance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [noteModal, setNoteModal] = useState<NoteModalState | null>(null);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasTemplate, setHasTemplate] = useState(false);
  const [templateDetails, setTemplateDetails] = useState<{ total_reward: number, penalty_per_task: number } | null>(null);
  // All family templates — used by handleGenerate to regenerate for every member
  const [familyTemplates, setFamilyTemplates] = useState<{ member_id: number }[]>([]);

  const [showBacklog, setShowBacklog] = useState(false);

  const isAdmin = activeMember?.is_admin || activeMember?.role === 'parent';

  // Resolve display name
  let displayName = '';
  if (activeMember?.custom_name) {
    displayName = activeMember.custom_name;
  } else if (user?.user_metadata?.first_name) {
    displayName = user.user_metadata.first_name;
  } else if (user?.user_metadata?.full_name || user?.user_metadata?.name) {
    const full = user.user_metadata.full_name || user.user_metadata.name;
    displayName = full.split(' ')[0];
  } else if (user?.email) {
    displayName = user.email.split('@')[0];
  }

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchChores = useCallback(async () => {
    if (!activeMember?.id) return;
    setIsLoading(true);
    setError('');

    const { data, error: rpcErr } = await supabase.rpc('get_today_chores', {
      p_member_id: activeMember.id,
    });

    if (rpcErr) {
      setError('Failed to load today\'s chores.');
      console.error(rpcErr);
    } else {
      setChores((data || []) as ChoreInstance[]);
    }

    setIsLoading(false);
  }, [activeMember?.id]);

  const checkTemplate = useCallback(async () => {
    if (!activeFamily?.id || !activeMember?.id) return;

    // Fetch all family templates via RPC (same data the settings screen uses)
    const { data: allTemplates } = await supabase.rpc('get_family_templates', {
      p_family_id: activeFamily.id,
    });

    if (allTemplates && allTemplates.length > 0) {
      setFamilyTemplates(allTemplates as { member_id: number }[]);

      // Determine whether the current member has a template (for EmptyState)
      const myTemplate = (allTemplates as { member_id: number; total_reward: number; penalty_per_task: number }[])
        .find(t => t.member_id === activeMember.id);

      if (myTemplate) {
        setHasTemplate(true);
        setTemplateDetails({
          total_reward: myTemplate.total_reward,
          penalty_per_task: myTemplate.penalty_per_task,
        });
      } else {
        setHasTemplate(false);
        setTemplateDetails(null);
      }
    } else {
      setFamilyTemplates([]);
      setHasTemplate(false);
      setTemplateDetails(null);
    }
  }, [activeFamily?.id, activeMember?.id]);

  useEffect(() => {
    fetchChores();
    checkTemplate();
  }, [fetchChores, checkTemplate]);

  // ---------------------------------------------------------------------------
  // Generate chores (admin merge)
  // ---------------------------------------------------------------------------

  const handleGenerate = async () => {
    if (!activeFamily?.id || !activeMember?.id) return;
    setIsGenerating(true);

    // Generate chores for every family member who has a template,
    // mirroring the "Reinitiate" button in Settings › Chore Templates.
    const targets = familyTemplates.length > 0
      ? familyTemplates
      : [{ member_id: activeMember.id }]; // fallback: at least generate for self

    let anyError = false;
    for (const t of targets) {
      const { data, error: genErr } = await supabase.rpc('generate_week_chores', {
        p_family_id: activeFamily.id,
        p_member_id: t.member_id,
      });

      if (genErr) {
        console.error('generate_week_chores error for member', t.member_id, genErr);
        anyError = true;
        continue;
      }

      const result = data as { inserted: number; cancelled: number; error?: string };
      if (result?.error) {
        console.warn('generate_week_chores returned error for member', t.member_id, result.error);
      }
    }

    setIsGenerating(false);

    if (anyError) {
      alert('Some members\' chores could not be generated. Please try again.');
    }

    await fetchChores();
  };


  // ---------------------------------------------------------------------------
  // Status update helpers
  // ---------------------------------------------------------------------------

  const updateInstance = async (instanceId: number, status: ChoreInstance['status'], notes: string) => {
    setIsSavingNote(true);
    const { error: updErr } = await supabase
      .from('chore_instances')
      .update({ status, notes: notes || null })
      .eq('id', instanceId);

    setIsSavingNote(false);

    if (updErr) {
      console.error('Error updating chore instance:', updErr);
      alert('Could not save. Please try again.');
      return false;
    }

    // Optimistic update
    setChores(prev =>
      prev.map(c =>
        c.instance_id === instanceId
          ? { ...c, status, notes: notes || null }
          : c
      )
    );
    return true;
  };

  const handleMarkDone = (instance: ChoreInstance) => {
    setNoteModal({ mode: 'done', instance });
  };

  const handleMarkCancelled = (instance: ChoreInstance) => {
    setNoteModal({ mode: 'cancel', instance });
  };

  const handleViewNote = (instance: ChoreInstance) => {
    setNoteModal({ mode: 'view', instance });
  };

  const handleModalConfirm = async (note: string) => {
    if (!noteModal) return;

    const { mode, instance } = noteModal;

    if (mode === 'done') {
      const ok = await updateInstance(instance.instance_id, 'done', note);
      if (ok) setNoteModal(null);
    } else if (mode === 'cancel') {
      const ok = await updateInstance(instance.instance_id, 'cancelled', note);
      if (ok) setNoteModal(null);
    } else {
      // view/edit note — keep existing status, just update note
      const ok = await updateInstance(instance.instance_id, instance.status, note);
      if (ok) setNoteModal(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const pendingChores = chores.filter(c => c.status === 'pending' && !c.is_backlog);
  const pendingBacklogChores = chores.filter(c => c.status === 'pending' && c.is_backlog);
  const resolvedChores = chores.filter(c => c.status !== 'pending');
  
  // Progress bar only tracks mandatory (non-backlog) chores
  const regularChores = chores.filter(c => !c.is_backlog);
  const totalCount = regularChores.length;
  // Any resolved mandatory chore counts toward weekly completion progress
  const doneCount = regularChores.filter(c => c.status !== 'pending').length;

  // Calculate potential reward based on unfinished mandatory chores + earned bonus chores
  const unfinishedCount = regularChores.filter(c => c.status === 'pending' || c.status === 'failed').length;
  const bonusEarned = chores
    .filter(c => c.is_backlog && c.status === 'done')
    .reduce((sum, c) => sum + (c.extra_reward || 0), 0);
  let potentialReward: number | null = null;
  if (templateDetails) {
    potentialReward = Math.max(0, templateDetails.total_reward - (unfinishedCount * templateDetails.penalty_per_task)) + bonusEarned;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-secondary">
      {/* Header */}
      <div className="px-6 pt-10 pb-5">
        <div className="mb-1">
          <h1 className="text-3xl font-extrabold text-secondary tracking-tight">
            {getGreeting()}{displayName ? `, ${displayName}` : ''}! 🐝
          </h1>
        </div>
        <p className="text-stone-400 font-medium text-sm">
          {activeFamily?.name} · {formatDate(new Date())}
        </p>
        <p className="text-stone-400 font-medium text-xs mt-0.5">
          Week of {formatDate(getMondayOfCurrentWeek())}
        </p>
      </div>

      <div className="px-6 pb-28 space-y-5">
        {/* Loading */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div
              data-testid="loading-spinner"
              className="w-10 h-10 border-4 border-stone-200 border-t-primary rounded-full animate-spin"
            />
          </div>
        ) : error ? (
          <div className="bg-red-50 text-red-500 font-bold text-sm p-5 rounded-2xl border border-red-100">
            {error}
          </div>
        ) : (
          <>
            {/* Progress bar — only show when there are chores */}
            {totalCount > 0 && (
              <ProgressBar total={totalCount} done={doneCount} potentialReward={potentialReward} />
            )}

            {/* Pending section */}
            <section>
              <div className="flex items-center justify-between mb-3 px-1">
                <h2 className="text-xs font-bold text-stone-400 uppercase tracking-widest">
                  Pending
                  {pendingChores.length > 0 && (
                    <span className="ml-2 bg-amber-100 text-amber-600 text-[10px] font-black px-2 py-0.5 rounded-full">
                      {pendingChores.length}
                    </span>
                  )}
                </h2>
                {isAdmin && (
                  <button
                    id="refresh-chores-btn"
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="flex items-center gap-1 text-[11px] font-bold text-stone-400 hover:text-primary transition-colors"
                    title="Merge & refresh chores from template"
                  >
                    <RefreshCw className={`w-3 h-3 ${isGenerating ? 'animate-spin' : ''}`} />
                    Sync
                  </button>
                )}
              </div>

              {pendingChores.length === 0 && pendingBacklogChores.length === 0 && totalCount === 0 ? (
                <EmptyState
                  isAdmin={isAdmin}
                  isGenerating={isGenerating}
                  onGenerate={handleGenerate}
                  hasTemplate={hasTemplate}
                />
              ) : pendingChores.length === 0 ? (
                <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 flex items-center gap-3">
                  <span className="text-2xl">🎉</span>
                  <p className="text-stone-500 font-semibold text-sm">
                    All pending chores resolved for this week!
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingChores.map(instance => (
                    <ChoreCard
                      key={instance.instance_id}
                      instance={instance}
                      onMarkDone={handleMarkDone}
                      onMarkCancelled={handleMarkCancelled}
                      onViewNote={handleViewNote}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Backlog section */}
            {pendingBacklogChores.length > 0 && (
              <section>
                <button
                  id="toggle-backlog-btn"
                  onClick={() => setShowBacklog(p => !p)}
                  className="w-full flex items-center justify-between px-1 mb-3 group"
                >
                  <h2 className="text-xs font-bold text-stone-400 uppercase tracking-widest flex items-center gap-1">
                    Bonus Tasks
                    <Zap className="w-3 h-3 text-blue-500" />
                    <span className="bg-blue-100 text-blue-600 text-[10px] font-black px-2 py-0.5 rounded-full ml-1">
                      {pendingBacklogChores.length}
                    </span>
                  </h2>
                  {showBacklog ? (
                    <ChevronUp className="w-4 h-4 text-stone-400 group-hover:text-secondary transition-colors" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-stone-400 group-hover:text-secondary transition-colors" />
                  )}
                </button>

                {showBacklog && (
                  <div className="space-y-3">
                    {pendingBacklogChores.map(instance => (
                      <ChoreCard
                        key={instance.instance_id}
                        instance={instance}
                        onMarkDone={handleMarkDone}
                        onMarkCancelled={handleMarkCancelled}
                        onViewNote={handleViewNote}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Completed / Cancelled section */}
            {resolvedChores.length > 0 && (
              <section>
                <button
                  id="toggle-resolved-btn"
                  onClick={() => setShowCompleted(p => !p)}
                  className="w-full flex items-center justify-between px-1 mb-3 group"
                >
                  <h2 className="text-xs font-bold text-stone-400 uppercase tracking-widest">
                    Completed & Cancelled
                    <span className="ml-2 bg-stone-100 text-stone-500 text-[10px] font-black px-2 py-0.5 rounded-full">
                      {resolvedChores.length}
                    </span>
                  </h2>
                  {showCompleted ? (
                    <ChevronUp className="w-4 h-4 text-stone-400 group-hover:text-secondary transition-colors" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-stone-400 group-hover:text-secondary transition-colors" />
                  )}
                </button>

                {showCompleted && (
                  <div className="space-y-3">
                    {resolvedChores.map(instance => (
                      <ChoreCard
                        key={instance.instance_id}
                        instance={instance}
                        onMarkDone={handleMarkDone}
                        onMarkCancelled={handleMarkCancelled}
                        onViewNote={handleViewNote}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>

      {/* Note / Action modal */}
      {noteModal && (
        <NoteModal
          modal={noteModal}
          onClose={() => setNoteModal(null)}
          onConfirm={handleModalConfirm}
          isSaving={isSavingNote}
        />
      )}
    </div>
  );
}
