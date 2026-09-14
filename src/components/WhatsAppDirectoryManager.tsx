import React, { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { downloadCSV } from '../lib/csvUtils';
import { MessageCircle, Download, Search, Copy, CheckCircle2, ExternalLink } from 'lucide-react';
import { formatUniversityName } from '../utils/university';

interface WhatsAppUser {
  id: string;
  whatsappNumber: string;
  displayName: string;
  username: string;
  email: string;
  department: string;
  institutionalName: string;
  createdAt: string;
}

export function WhatsAppDirectoryManager() {
  const [users, setUsers] = useState<WhatsAppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const loaded: WhatsAppUser[] = [];
        snap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const rawNumber = data.whatsapp || data.whatsappNumber || data.phone || data.phoneNumber || '';
          if (rawNumber && typeof rawNumber === 'string' && rawNumber.trim().length > 0) {
            // Keep WhatsApp number exactly as written during registration without altering characters
            const exactRegisteredNumber = rawNumber.trim();
            const rawUsername = data.username || (data.displayName && !data.displayName.includes('@') ? data.displayName.toLowerCase().replace(/\s+/g, '_') : '') || 'scholar';
            const rawUniversity = formatUniversityName(data.institutionalName || data.university || data.institution || data.school || data.college);

            loaded.push({
              id: docSnap.id,
              whatsappNumber: exactRegisteredNumber,
              displayName: data.displayName || 'Scholar',
              username: rawUsername,
              email: data.email || '',
              department: data.department || '',
              institutionalName: rawUniversity,
              createdAt: data.createdAt || ''
            });
          }
        });
        setUsers(loaded);
        setLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'users');
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const filtered = users.filter((u) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      u.whatsappNumber.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      u.displayName.toLowerCase().includes(q) ||
      u.department.toLowerCase().includes(q) ||
      u.institutionalName.toLowerCase().includes(q)
    );
  });

  const handleCopySingle = (id: string, number: string) => {
    navigator.clipboard.writeText(number);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyAll = () => {
    if (filtered.length === 0) return;
    const allNumbers = filtered.map((u) => u.whatsappNumber).join(', ');
    navigator.clipboard.writeText(allNumbers);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2500);
  };

  // Download CSV file containing full WhatsApp number exactly as registered, names, and university
  const handleDownloadCSV = () => {
    if (filtered.length === 0) return;
    const data = filtered.map((u) => ({
      'WhatsApp Number': u.whatsappNumber,
      'Full Name': u.displayName || 'Scholar',
      'Username': u.username || 'scholar',
      'University': formatUniversityName(u.institutionalName),
      'Department': u.department || 'General'
    }));
    const dateStr = new Date().toISOString().split('T')[0];
    downloadCSV(data, `users_whatsapp_numbers_${dateStr}`);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-[#D8E3FF] rounded-3xl p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold uppercase tracking-wider">
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
              WhatsApp Directory
            </div>
            <h2 className="text-2xl font-black text-slate-900 font-serif">
              Users WhatsApp Numbers
            </h2>
            <p className="text-xs text-slate-500 max-w-xl leading-relaxed">
              Dedicated repository of verified WhatsApp contact numbers for all registered scholars. Download as CSV with full registered WhatsApp numbers, names, and universities for announcements and scholar outreach.
            </p>
          </div>

          {/* Quick Stats */}
          <div className="flex items-center gap-3">
            <div className="bg-[#EEF3FF] border border-[#D8E3FF] rounded-2xl p-4 min-w-[130px] text-center">
              <div className="text-2xl font-black text-[#2563EB] font-mono">
                {users.length}
              </div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                WhatsApp Contacts
              </div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 min-w-[130px] text-center">
              <div className="text-2xl font-black text-emerald-700 font-mono">
                {new Set(users.map((u) => u.whatsappNumber)).size}
              </div>
              <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mt-1">
                Unique Numbers
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Search */}
        <div className="flex-1 min-w-[280px] max-w-md relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by WhatsApp number, username, or university..."
            className="w-full bg-white border border-[#D8E3FF] text-slate-900 rounded-xl pl-10 pr-4 py-2.5 text-[13px] focus:border-[#2563EB] outline-none transition-all shadow-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleCopyAll}
            disabled={filtered.length === 0}
            className="bg-white border border-[#D8E3FF] text-slate-700 px-4 py-2.5 rounded-xl text-[12px] font-black uppercase tracking-wider hover:border-[#2563EB] hover:text-[#2563EB] transition-all flex items-center gap-2 shadow-xs disabled:opacity-40 cursor-pointer"
            title="Copy all WhatsApp numbers separated by commas for broadcast"
          >
            {copiedAll ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-emerald-700">All Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-slate-400" />
                Copy All WhatsApp Numbers
              </>
            )}
          </button>

          {/* Primary Download: full number written, names and university */}
          <button
            onClick={handleDownloadCSV}
            disabled={filtered.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-[12px] font-black uppercase tracking-wider transition-all flex items-center gap-2 shadow-sm shadow-emerald-600/20 disabled:opacity-40 cursor-pointer active:scale-95"
            title="Download CSV containing full WhatsApp number, names, and university"
          >
            <Download className="w-4 h-4" />
            Download WhatsApp Numbers (CSV)
          </button>
        </div>
      </div>

      {/* Directory Table */}
      <div className="bg-white border border-[#D8E3FF] rounded-2xl overflow-hidden shadow-xs">
        <div className="px-6 py-4 bg-[#EEF3FF]/60 border-b border-[#D8E3FF] flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">
            Showing {filtered.length} of {users.length} WhatsApp Numbers
          </span>
          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/70 border border-emerald-200 px-2.5 py-0.5 rounded-full font-mono">
            Exact Registered Numbers
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 font-mono text-sm">
            Loading WhatsApp directory...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <MessageCircle className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-600">No WhatsApp numbers found</p>
            <p className="text-xs text-slate-400">
              {search ? 'Try adjusting your search query.' : 'Users will appear here once they register with their WhatsApp number.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#EEF3FF]/30 border-b border-[#D8E3FF]">
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">#</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">WhatsApp Number</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">Names & Username</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">University</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono">Department</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-widest font-mono text-right">WhatsApp Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D8E3FF]">
                {filtered.map((u, index) => {
                  const isCopied = copiedId === u.id;
                  const cleanDigits = u.whatsappNumber.replace(/[^0-9]/g, '');
                  const whatsAppChatLink = `https://wa.me/${cleanDigits}`;

                  return (
                    <tr key={u.id} className="hover:bg-[#EEF3FF]/40 transition-colors group">
                      <td className="px-6 py-4 text-xs font-mono text-slate-400 font-semibold">
                        {index + 1}
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
                            <MessageCircle className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-mono text-base font-black text-slate-900 tracking-wide">
                              {u.whatsappNumber}
                            </span>
                            <span className="block text-[10px] text-emerald-600 font-bold uppercase tracking-wider mt-0.5">
                              WhatsApp Registered
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900 text-sm">
                          {u.displayName}
                        </div>
                        <div className="text-xs text-slate-500 font-medium font-mono">
                          @{u.username}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="text-xs font-bold text-slate-800">
                          {formatUniversityName(u.institutionalName)}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="text-xs font-medium text-slate-600">
                          {u.department || 'General'}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Copy WhatsApp Number */}
                          <button
                            onClick={() => handleCopySingle(u.id, u.whatsappNumber)}
                            className="bg-white border border-[#D8E3FF] hover:border-[#2563EB] hover:text-[#2563EB] text-slate-600 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                            title="Copy WhatsApp Number"
                          >
                            {isCopied ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="text-emerald-700 font-semibold">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5 text-slate-400" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>

                          {/* Direct WhatsApp Chat Link */}
                          <a
                            href={whatsAppChatLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                            title="Open WhatsApp Chat"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>Chat</span>
                            <ExternalLink className="w-3 h-3 opacity-60" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
