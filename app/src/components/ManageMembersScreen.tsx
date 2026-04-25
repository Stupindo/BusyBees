import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useFamily } from '../contexts/FamilyContext';
import type { Member } from '../contexts/FamilyContext';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Edit2, Trash2 } from 'lucide-react';

export default function ManageMembersScreen() {
  const { activeFamily, activeMember, refreshFamilies } = useFamily();
  const navigate = useNavigate();
  
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<'parent' | 'child'>('child');
  const [editIsAdmin, setEditIsAdmin] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch all members of the active family
  useEffect(() => {
    async function fetchFamilyMembers() {
      if (!activeFamily) return;
      setIsLoading(true);
      
      const { data, error: fetchError } = await supabase
        .rpc('get_family_members', { p_family_id: activeFamily.id });
        
      if (fetchError) {
        console.error('Error fetching members:', fetchError);
        setError('Could not load members.');
      } else {
        setMembers((data || []) as Member[]);
      }
      setIsLoading(false);
    }
    
    fetchFamilyMembers();
  }, [activeFamily]);

  const getDisplayName = (member: Member) => {
    if (member.custom_name) return member.custom_name;
    if (member.first_name) return member.first_name;
    if (member.full_name) return member.full_name.split(' ')[0];
    if (member.email) return member.email.split('@')[0];
    return `Member #${member.id}`;
  };

  const handleEditClick = (member: Member) => {
    setEditingMember(member);
    setEditName(member.custom_name || '');
    setEditRole(member.role);
    setEditIsAdmin(member.is_admin);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    
    setIsSaving(true);
    const { error: updateError } = await supabase
      .from('members')
      .update({
        custom_name: editName.trim() || null,
        role: editRole,
        is_admin: editIsAdmin,
      })
      .eq('id', editingMember.id);
      
    if (updateError) {
      console.error(updateError);
      alert('Failed to update member.');
    } else {
      // Update local state to reflect changes without reloading immediately
      setMembers(prev => prev.map(m => m.id === editingMember.id ? {
        ...m,
        custom_name: editName.trim() || null,
        role: editRole,
        is_admin: editIsAdmin,
      } : m));
      setEditingMember(null);
      
      // If we edited ourselves, we should refresh the auth context mapping
      if (editingMember.id === activeMember?.id) {
        await refreshFamilies();
      }
    }
    setIsSaving(false);
  };

  const handleRemove = async (memberId: number) => {
    const confirmation = window.confirm('Are you sure you want to remove this member? This action cannot be undone.');
    if (!confirmation) return;
    
    // Check if we are removing the last admin
    if (members.find(m => m.id === memberId)?.is_admin) {
      const adminCount = members.filter(m => m.is_admin).length;
      if (adminCount <= 1) {
        alert('Cannot remove the last admin of the family.');
        return;
      }
    }

    const { error: deleteError } = await supabase
      .from('members')
      .delete()
      .eq('id', memberId);

    if (deleteError) {
      console.error(deleteError);
      alert('Failed to remove member.');
    } else {
      setMembers(prev => prev.filter(m => m.id !== memberId));
      if (memberId === activeMember?.id) {
        // If we removed ourselves, let's refresh to get kicked out
        await refreshFamilies();
        navigate('/');
      }
    }
  };

  if (!activeFamily || !activeMember) {
    return (
        <div className="p-6 pt-10 text-center">
            <p>No active family.</p>
        </div>
    );
  }

  const isAdmin = activeMember?.is_admin || activeMember?.role === 'parent';

  return (
    <div className="flex flex-col min-h-screen bg-stone-50 font-sans text-secondary">
      {/* Header element to act as Title + Back Navigation */}
      <div className="bg-white px-6 pt-10 pb-4 border-b border-stone-100 flex items-center sticky top-0 z-10 shadow-sm">
        <button 
          onClick={() => navigate('/settings')}
          className="mr-4 p-2 -ml-2 rounded-full hover:bg-stone-100 text-stone-500 transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-xl font-extrabold text-secondary tracking-tight">Manage Members</h1>
          <p className="text-stone-400 text-xs font-medium">{activeFamily.name} Hive</p>
        </div>
      </div>

      <div className="p-6 pb-24 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center p-8">
            <div className="w-8 h-8 border-4 border-stone-200 border-t-primary rounded-full animate-spin"></div>
          </div>
        ) : error ? (
          <div className="text-red-500 text-center font-bold">{error}</div>
        ) : (
          <div className="space-y-4">
            {members.map(member => (
              <div key={member.id} className="bg-white p-5 rounded-3xl shadow-sm border border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl shadow-inner ${member.role === 'parent' ? 'bg-gradient-to-br from-primary-light to-primary' : 'bg-stone-100'}`}>
                     {member.role === 'parent' ? '👑' : '🐝'}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-secondary flex items-center gap-2">
                      {getDisplayName(member)}
                      {member.id === activeMember.id && (
                        <span className="text-[10px] bg-primary/20 text-primary-dark px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold ml-1">You</span>
                      )}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-semibold text-stone-500 uppercase tracking-widest">{member.role}</span>
                      {member.is_admin && (
                         <span className="flex items-center text-[10px] bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full font-bold">
                           <Shield className="w-3 h-3 mr-1" /> Admin
                         </span>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Actions allowed if current user is admin, or if it's our own record */}
                {(isAdmin || member.id === activeMember.id) && (
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button 
                      onClick={() => handleEditClick(member)}
                      className="p-2 text-stone-400 hover:text-primary hover:bg-primary-light/30 rounded-xl transition-colors"
                      title="Edit Member"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    {isAdmin && member.id !== activeMember.id && (
                      <button 
                        onClick={() => handleRemove(member.id)}
                        className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                        title="Remove Member"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {editingMember && (
         <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl p-6 relative animate-in fade-in zoom-in-95 duration-200">
             <div className="absolute top-4 right-4">
                <button 
                  onClick={() => setEditingMember(null)}
                  className="w-8 h-8 flex items-center justify-center bg-stone-100 text-stone-500 rounded-full hover:bg-stone-200 transition-colors"
                >
                  ✕
                </button>
             </div>
             
             <h2 className="text-2xl font-black text-secondary mb-6 tracking-tight">Edit Member</h2>
             
             <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Display Name</label>
                  <input 
                    type="text" 
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="e.g. Mom, Dad, Timmy"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all font-medium text-secondary"
                  />
                </div>

                {isAdmin && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Role</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setEditRole('parent')}
                          className={`flex-1 py-3 rounded-xl font-bold transition-all ${editRole === 'parent' ? 'bg-primary text-secondary shadow-sm' : 'bg-stone-50 text-stone-500 hover:bg-stone-100'}`}
                        >
                          Parent
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditRole('child')}
                          className={`flex-1 py-3 rounded-xl font-bold transition-all ${editRole === 'child' ? 'bg-primary text-secondary shadow-sm' : 'bg-stone-50 text-stone-500 hover:bg-stone-100'}`}
                        >
                          Child
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between p-4 bg-stone-50 rounded-xl border border-stone-100 mt-2">
                      <div>
                        <span className="block text-sm font-bold text-secondary">Admin Privileges</span>
                        <span className="text-xs font-medium text-stone-500">Can manage settings & members</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="sr-only peer"
                          checked={editIsAdmin}
                          onChange={(e) => setEditIsAdmin(e.target.checked)}
                          disabled={editingMember.id === activeMember.id && members.filter(m => m.is_admin).length <= 1}
                        />
                        <div className="w-11 h-6 bg-stone-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-dark"></div>
                      </label>
                    </div>
                  </>
                )}
                
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="w-full bg-secondary hover:bg-black text-primary-light font-bold py-4 rounded-2xl transition-colors disabled:opacity-50 mt-6"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
             </form>
           </div>
         </div>
      )}
    </div>
  );
}
