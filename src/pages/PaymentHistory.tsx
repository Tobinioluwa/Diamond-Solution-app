import React, { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { Receipt, Clock, CheckCircle2, XCircle, Printer, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

function describePayment(p: any): string {
  if (p.type === 'department_access' || p.dept_name || p.department) {
    return `${p.dept_name || p.department} — Department Access`;
  }
  if (p.purpose === 'device_reactivation') return 'Device Reactivation Fee';
  if (p.purpose === 'reactivation') return 'Account Reactivation Fee';
  return 'Payment';
}

function currencySymbol(currency: string): string {
  return currency === 'USD' ? '$' : '₦';
}

export default function PaymentHistory() {
  const { user } = useAuth();
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [receipt, setReceipt] = useState<any | null>(null);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, 'payments'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'payments');
      setLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  return (
    <Layout>
      <div className="px-6 py-10 space-y-8">
        <div className="space-y-2">
          <h2 className="text-3xl font-serif font-black text-[#0B1E3D] tracking-tight">Payment History</h2>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] leading-none">Every payment tied to your account</p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-6">
            <div className="w-10 h-10 border-[3px] border-blue-200 border-t-[#1B3FA0] rounded-full animate-spin" />
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Loading...</p>
          </div>
        ) : payments.length === 0 ? (
          <div className="text-center py-24 card-luxury border-dashed border-[#DDE5F5] bg-white rounded-3xl">
            <Receipt className="w-12 h-12 text-blue-200 mx-auto mb-4" />
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest italic">No payments on record yet</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {payments.map((p) => (
              <button
                key={p.id}
                onClick={() => setReceipt(p)}
                className="card-luxury p-4 sm:p-6 flex items-center justify-between gap-4 border border-[#DDE5F5] bg-white rounded-2xl shadow-xs hover:border-[#1B3FA0]/40 transition-all text-left cursor-pointer"
              >
                <div className="flex items-center gap-4 sm:gap-5 min-w-0">
                  <div className="w-12 h-12 bg-[#EEF3FF] rounded-2xl flex items-center justify-center text-[#1B3FA0] border border-[#D4E0FC] shrink-0">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#0B1E3D] truncate">{describePayment(p)}</p>
                    <p className="text-[9px] text-slate-500 uppercase font-black tracking-widest mt-1">
                      {p.createdAt ? new Date(p.createdAt).toLocaleString() : 'Unknown date'}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0 space-y-1.5">
                  <p className="text-[14px] font-black text-[#0B1E3D] font-mono tracking-tight">
                    {currencySymbol(p.currency)}{(p.amount || 0).toLocaleString()}
                  </p>
                  <StatusBadge status={p.status} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {receipt && <ReceiptModal payment={receipt} onClose={() => setReceipt(null)} />}
      </AnimatePresence>
    </Layout>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isSuccess = status === 'success' || status === 'paid';
  const isFailed = status === 'failed';
  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border text-[9px] font-black uppercase tracking-widest w-fit ml-auto",
      isSuccess ? "text-emerald-700 bg-emerald-50 border-emerald-200" :
      isFailed ? "text-red-700 bg-red-50 border-red-200" :
      "text-[#1B3FA0] bg-[#EEF3FF] border-[#D4E0FC]"
    )}>
      {isSuccess ? <CheckCircle2 className="w-3 h-3" /> : isFailed ? <XCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
      {status}
    </div>
  );
}

function ReceiptModal({ payment, onClose }: { payment: any; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 print:p-0">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-md print:hidden"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="w-full max-w-md bg-white border border-[#DDE5F5] rounded-3xl p-8 shadow-xl relative z-10 space-y-6 print:shadow-none print:border-none print:rounded-none print:max-w-full"
      >
        <button
          onClick={onClose}
          className="absolute top-6 right-6 w-8 h-8 rounded-xl bg-[#EEF3FF] flex items-center justify-center text-slate-500 hover:text-[#1B3FA0] transition-colors print:hidden cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-[#EEF3FF] rounded-2xl flex items-center justify-center text-[#1B3FA0] mx-auto border border-[#D4E0FC] mb-2">
            <Receipt className="w-7 h-7" />
          </div>
          <h3 className="text-xl font-serif font-black text-[#0B1E3D] tracking-tight">Diamond Solution</h3>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Payment Receipt</p>
        </div>

        <div className="bg-[#EEF3FF] border border-[#D4E0FC] rounded-2xl p-5 space-y-3">
          <ReceiptRow label="Description" value={describePayment(payment)} />
          <ReceiptRow label="Amount" value={`${currencySymbol(payment.currency)}${(payment.amount || 0).toLocaleString()}`} />
          <ReceiptRow label="Status" value={payment.status} />
          <ReceiptRow label="Reference" value={payment.reference || payment.id} mono />
          <ReceiptRow label="Date" value={payment.createdAt ? new Date(payment.createdAt).toLocaleString() : 'Unknown'} />
        </div>

        <p className="text-[9px] text-center text-slate-400 uppercase tracking-widest">
          Keep this receipt for your records
        </p>

        <button
          onClick={() => window.print()}
          className="w-full h-14 bg-[#1B3FA0] text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-md shadow-[#1B3FA0]/20 hover:bg-[#143282] active:scale-95 transition-all flex items-center justify-center gap-3 cursor-pointer print:hidden"
        >
          <Printer className="w-4 h-4" />
          Print / Save as PDF
        </button>
      </motion.div>
    </div>
  );
}

function ReceiptRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest shrink-0">{label}</span>
      <span className={cn("text-[12px] font-bold text-[#0B1E3D] text-right", mono && "font-mono text-[10px] tracking-tight break-all")}>{value}</span>
    </div>
  );
}
