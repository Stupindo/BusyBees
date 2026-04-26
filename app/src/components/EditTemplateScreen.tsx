import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useFamily } from '../contexts/FamilyContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Chore {
  id: number;
  title: string;
  template_id: number;
  is_backlog: boolean;
  extra_reward: number;
  description: string | null;
}

interface Template {
  id: number;
  family_id: number;
  member_id: number;
  total_reward: number;
  penalty_per_task: number;
}

interface ChoreFormState {
  title: string;
  description: string;
  extra_reward: string;
  is_backlog: boolean;
}

const defaultChoreForm = (): ChoreFormState => ({
  title: '',
  description: '',
  extra_reward: '0',
  is_backlog: false,
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EditTemplateScreen() {
  const navigate = useNavigate();
  const { templateId } = useParams<{ templateId: string }>();
  const { activeMember } = useFamily();

  const [template, setTemplate] = useState<Template | null>(null);
  const [chores, setChores] = useState<Chore[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Reward editing
  const [totalReward, setTotalReward] = useState('');
  const [penaltyPerTask, setPenaltyPerTask] = useState('');
  const [isSavingRewards, setIsSavingRewards] = useState(false);
  const [rewardSaved, setRewardSaved] = useState(false);

  // Chore modal state
  const [choreModal, setChoreModal] = useState<'add' | 'edit' | null>(null);
  const [editingChore, setEditingChore] = useState<Chore | null>(null);
  const [choreForm, setChoreForm] = useState<ChoreFormState>(defaultChoreForm());
  const [isSavingChore, setIsSavingChore] = useState(false);

  const isAdmin = activeMember?.is_admin || activeMember?.role === 'parent';
  const numericId = parseInt(templateId || '', 10);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchTemplate = useCallback(async () => {
    if (!numericId) return;
    setIsLoading(true);
    setError('');

    const [{ data: tData, error: tErr }, { data: cData }] = await Promise.all([
      supabase.from('weekly_templates').select('*').eq('id', numericId).single(),
      supabase.from('chores').select('*').eq('template_id', numericId).order('id'),
    ]);

    if (tErr || !tData) {
      setError('Template not found.');
    } else {
      const t = tData as Template;
      setTemplate(t);
      setTotalReward(String(t.total_reward ?? 0));
      setPenaltyPerTask(String(t.penalty_per_task ?? 0));
      setChores((cData || []) as Chore[]);
    }

    setIsLoading(false);
  }, [numericId]);

  useEffect(() => {
    fetchTemplate();
  }, [fetchTemplate]);

  // ---------------------------------------------------------------------------
  // Reward save
  // ---------------------------------------------------------------------------

  const handleSaveRewards = async () => {
    if (!template) return;
    setIsSavingRewards(true);

    const { error: updErr } = await supabase
      .from('weekly_templates')
      .update({
        total_reward: parseInt(totalReward, 10) || 0,
        penalty_per_task: parseInt(penaltyPerTask, 10) || 0,
      })
      .eq('id', template.id);

    setIsSavingRewards(false);

    if (updErr) {
      console.error('Error saving rewards:', updErr);
      alert('Failed to save reward settings.');
    } else {
      setRewardSaved(true);
      setTimeout(() => setRewardSaved(false), 2000);
    }
  };

  // ---------------------------------------------------------------------------
  // Chore modal handlers
  // ---------------------------------------------------------------------------

  const openAddModal = () => {
    setChoreForm(defaultChoreForm());
    setEditingChore(null);
    setChoreModal('add');
  };

  const openEditModal = (chore: Chore) => {
    setChoreForm({
      title: chore.title,
      description: chore.description || '',
      extra_reward: String(chore.extra_reward),
      is_backlog: chore.is_backlog,
    });
    setEditingChore(chore);
    setChoreModal('edit');
  };

  const closeModal = () => {
    setChoreModal(null);
    setEditingChore(null);
    setChoreForm(defaultChoreForm());
  };

  const handleSaveChore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!template || !choreForm.title.trim()) return;
    setIsSavingChore(true);

    const payload = {
      title: choreForm.title.trim(),
      description: choreForm.description.trim() || null,
      extra_reward: parseInt(choreForm.extra_reward, 10) || 0,
      is_backlog: choreForm.is_backlog,
    };

    if (choreModal === 'add') {
      const { data, error: insErr } = await supabase
        .from('chores')
        .insert({ ...payload, template_id: template.id })
        .select()
        .single();

      if (insErr || !data) {
        console.error('Error adding chore:', insErr);
        alert('Could not add chore. Please try again.');
      } else {
        setChores(prev => [...prev, data as Chore]);
        closeModal();
      }
    } else if (choreModal === 'edit' && editingChore) {
      const { error: updErr } = await supabase
        .from('chores')
        .update(payload)
        .eq('id', editingChore.id);

      if (updErr) {
        console.error('Error updating chore:', updErr);
        alert('Could not update chore. Please try again.');
      } else {
        setChores(prev =>
          prev.map(c => (c.id === editingChore.id ? { ...c, ...payload } : c))
        );
        closeModal();
      }
    }

    setIsSavingChore(false);
  };

  const handleDeleteChore = async (choreId: number) => {
    if (!window.confirm('Delete this chore? This cannot be undone.')) return;

    const { error: delErr } = await supabase.from('chores').delete().eq('id', choreId);

    if (delErr) {
      console.error('Error deleting chore:', delErr);
      alert('Could not delete chore.');
    } else {
      setChores(prev => prev.filter(c => c.id !== choreId));
      closeModal();
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col min-h-screen bg-stone-50 font-sans text-secondary">
      {/* Header */}
      <div className="bg-white px-6 pt-10 pb-4 border-b border-stone-100 flex items-center sticky top-0 z-10 shadow-sm">
        <button
          id="edit-template-back-btn"
          onClick={() => navigate('/settings/templates')}
          className="mr-4 p-2 -ml-2 rounded-full hover:bg-stone-100 text-stone-500 transition-colors"
          aria-label="Back to templates"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-xl font-extrabold text-secondary tracking-tight">Edit Template</h1>
          <p className="text-stone-400 text-xs font-medium">Weekly chore configuration</p>
        </div>
      </div>

      <div className="p-6 pb-28 flex-1 overflow-y-auto space-y-6">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <div
              data-testid="loading-spinner"
              className="w-8 h-8 border-4 border-stone-200 border-t-primary rounded-full animate-spin"
            />
          </div>
        ) : error ? (
          <div className="text-red-500 text-center font-bold p-6">{error}</div>
        ) : (
          <>
            {/* Reward Settings Card */}
            <section>
              <h2 className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-3 px-1">
                Weekly Reward Settings
              </h2>
              <div className="bg-white rounded-3xl border border-stone-100 shadow-sm p-5 space-y-4">
                {/* Total Reward */}
                <div>
                  <label
                    htmlFor="total-reward-input"
                    className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2"
                  >
                    💰 Total Reward (gems)
                  </label>
                  <input
                    id="total-reward-input"
                    type="number"
                    min="0"
                    value={totalReward}
                    onChange={e => setTotalReward(e.target.value)}
                    disabled={!isAdmin}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all font-bold text-secondary text-lg disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Penalty per task */}
                <div>
                  <label
                    htmlFor="penalty-input"
                    className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2"
                  >
                    ⚠️ Penalty per Missed Chore (gems)
                  </label>
                  <input
                    id="penalty-input"
                    type="number"
                    min="0"
                    value={penaltyPerTask}
                    onChange={e => setPenaltyPerTask(e.target.value)}
                    disabled={!isAdmin}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all font-bold text-secondary text-lg disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                {isAdmin && (
                  <button
                    id="save-rewards-btn"
                    onClick={handleSaveRewards}
                    disabled={isSavingRewards}
                    className={`w-full font-bold py-3 rounded-2xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
                      rewardSaved
                        ? 'bg-accent text-white'
                        : 'bg-secondary text-primary-light hover:bg-black'
                    }`}
                  >
                    {isSavingRewards ? (
                      'Saving…'
                    ) : rewardSaved ? (
                      <>
                        <Check className="w-4 h-4" /> Saved!
                      </>
                    ) : (
                      'Save Reward Settings'
                    )}
                  </button>
                )}
              </div>
            </section>

            {/* Chores List */}
            <section>
              <div className="flex items-center justify-between mb-3 px-1">
                <h2 className="text-xs font-bold text-stone-400 uppercase tracking-widest">
                  Chores ({chores.length})
                </h2>
                {isAdmin && (
                  <button
                    id="add-chore-btn"
                    onClick={openAddModal}
                    className="flex items-center gap-1.5 text-xs font-bold text-primary-dark bg-primary/20 hover:bg-primary/30 px-3 py-1.5 rounded-full transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Chore
                  </button>
                )}
              </div>

              {chores.length === 0 ? (
                <div className="bg-white rounded-3xl border border-stone-100 shadow-sm p-8 text-center">
                  <div className="text-4xl mb-3">🗒️</div>
                  <p className="text-stone-400 font-semibold text-sm">No chores yet.</p>
                  {isAdmin && (
                    <p className="text-stone-400 text-xs mt-1">
                      Tap "Add Chore" above to get started.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {chores.map(chore => (
                    <div
                      key={chore.id}
                      id={`chore-item-${chore.id}`}
                      className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 flex items-start justify-between gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-bold text-secondary truncate">{chore.title}</span>
                          {chore.is_backlog && (
                            <span className="text-[10px] bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex-shrink-0">
                              Backlog
                            </span>
                          )}
                          {chore.extra_reward > 0 && (
                            <span className="text-[10px] bg-accent/10 text-accent-dark px-2 py-0.5 rounded-full font-bold flex-shrink-0">
                              +{chore.extra_reward} 💰
                            </span>
                          )}
                        </div>
                        {chore.description && (
                          <p className="text-xs text-stone-400 font-medium leading-relaxed">
                            {chore.description}
                          </p>
                        )}
                      </div>
                      {isAdmin && (
                        <button
                          onClick={() => openEditModal(chore)}
                          className="flex-shrink-0 p-2 text-stone-300 hover:text-primary hover:bg-primary/10 rounded-xl transition-colors"
                          aria-label={`Edit ${chore.title}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* Chore Add / Edit Modal */}
      {choreModal && (
        <div
          data-testid="chore-modal"
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
        >
          <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl p-6 relative">
            {/* Close button */}
            <button
              id="close-chore-modal-btn"
              onClick={closeModal}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-stone-100 text-stone-500 rounded-full hover:bg-stone-200 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <h2 className="text-2xl font-black text-secondary mb-6 tracking-tight">
              {choreModal === 'add' ? 'Add Chore' : 'Edit Chore'}
            </h2>

            <form id="chore-form" onSubmit={handleSaveChore} className="space-y-4">
              {/* Title */}
              <div>
                <label
                  htmlFor="chore-title-input"
                  className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2"
                >
                  Chore Title *
                </label>
                <input
                  id="chore-title-input"
                  type="text"
                  required
                  value={choreForm.title}
                  onChange={e => setChoreForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Clean the kitchen"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary transition-all font-medium text-secondary"
                />
              </div>

              {/* Description */}
              <div>
                <label
                  htmlFor="chore-description-input"
                  className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2"
                >
                  Description (optional)
                </label>
                <textarea
                  id="chore-description-input"
                  value={choreForm.description}
                  onChange={e => setChoreForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  placeholder="Any extra details about the chore…"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary transition-all font-medium text-secondary resize-none"
                />
              </div>

              {/* Extra reward */}
              <div>
                <label
                  htmlFor="chore-extra-reward-input"
                  className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2"
                >
                  Extra Reward (gems)
                </label>
                <input
                  id="chore-extra-reward-input"
                  type="number"
                  min="0"
                  value={choreForm.extra_reward}
                  onChange={e => setChoreForm(f => ({ ...f, extra_reward: e.target.value }))}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary transition-all font-bold text-secondary"
                />
              </div>

              {/* Is Backlog toggle */}
              <div className="flex items-center justify-between p-4 bg-stone-50 rounded-xl border border-stone-100">
                <div>
                  <span className="block text-sm font-bold text-secondary">Backlog Chore</span>
                  <span className="text-xs font-medium text-stone-500">
                    Optional task (no penalty if skipped)
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    id="chore-backlog-toggle"
                    type="checkbox"
                    className="sr-only peer"
                    checked={choreForm.is_backlog}
                    onChange={e => setChoreForm(f => ({ ...f, is_backlog: e.target.checked }))}
                  />
                  <div className="w-11 h-6 bg-stone-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-dark" />
                </label>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                {choreModal === 'edit' && editingChore && (
                  <button
                    id="delete-chore-btn"
                    type="button"
                    onClick={() => handleDeleteChore(editingChore.id)}
                    className="flex items-center gap-1.5 px-4 py-3 bg-red-50 text-red-500 hover:bg-red-100 rounded-2xl font-bold transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                )}
                <button
                  id="save-chore-btn"
                  type="submit"
                  disabled={isSavingChore || !choreForm.title.trim()}
                  className="flex-1 bg-secondary hover:bg-black text-primary-light font-bold py-3 rounded-2xl transition-colors disabled:opacity-50"
                >
                  {isSavingChore ? 'Saving…' : choreModal === 'add' ? 'Add Chore' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
