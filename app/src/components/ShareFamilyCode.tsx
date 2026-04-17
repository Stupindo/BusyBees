import { useState } from 'react';
import { useFamily } from '../contexts/FamilyContext';

export default function ShareFamilyCode() {
  const { activeFamily, activeMember } = useFamily();
  const [copied, setCopied] = useState(false);

  // We rely on RLS allowing parents/admins to see the code, and child roles probably can't see the code depending on SELECT policy.
  // Wait, our RLS 'View own family' allows any member to SELECT the family, so any member can see the code.
  // That's fine, kids can share the code with other family members, but let's just make sure only parents or admins can easily click to copy it for peace of mind. Or anyone can.
  // Actually, let's just restrict it to Admins/Parents for better control.

  if (!activeFamily || !activeFamily.join_code) {
    return null;
  }

  const isParentOrAdmin = activeMember?.role === 'parent' || activeMember?.is_admin;

  if (!isParentOrAdmin) {
    return null;
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(activeFamily.join_code || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-100 flex flex-col mb-6">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-secondary flex items-center">
          <span className="mr-2">🐝</span> Invite to Hive
        </h3>
        <p className="text-sm font-medium text-stone-500">
          Share this code with your family members so they can join your hive.
        </p>
      </div>

      <div className="flex bg-stone-50 rounded-2xl border border-stone-200 p-2 items-center">
        <div className="flex-1 text-center font-black tracking-[0.2em] text-xl text-primary-dark">
          {activeFamily.join_code}
        </div>
        <button
          onClick={handleCopy}
          className={`px-4 py-3 rounded-xl font-bold transition-all text-sm ${
            copied 
              ? 'bg-green-100 text-green-700' 
              : 'bg-primary text-secondary hover:bg-primary-dark hover:scale-[1.02]'
          }`}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
