import { useState, useEffect } from 'react';
import { Member, Payment } from '@/types/member';
import { addMonths, isAfter, isBefore, startOfDay } from 'date-fns';

const STORAGE_KEY = 'moneymaker-business-members';
const PAYMENTS_KEY = 'moneymaker-business-payments';

const initialMembers: Member[] = [
  {
    id: '1',
    name: 'Amadou Diallo',
    phone: '+221 77 123 45 67',
    email: 'amadou@email.com',
    joinDate: new Date('2024-01-15'),
    lastPaymentDate: new Date('2024-12-01'),
    renewalDate: new Date('2025-01-01'),
    isPaid: true,
    amount: 2000,
  },
  {
    id: '2',
    name: 'Fatou Sow',
    phone: '+221 78 234 56 78',
    joinDate: new Date('2024-02-20'),
    lastPaymentDate: new Date('2024-11-20'),
    renewalDate: new Date('2024-12-20'),
    isPaid: false,
    amount: 2000,
  },
  {
    id: '3',
    name: 'Moussa Ndiaye',
    phone: '+221 76 345 67 89',
    email: 'moussa@email.com',
    joinDate: new Date('2024-03-10'),
    lastPaymentDate: new Date('2024-12-10'),
    renewalDate: new Date('2025-01-10'),
    isPaid: true,
    amount: 2000,
  },
  {
    id: '4',
    name: 'Awa Diop',
    phone: '+221 70 456 78 90',
    joinDate: new Date('2024-04-05'),
    lastPaymentDate: null,
    renewalDate: null,
    isPaid: false,
    amount: 2000,
  },
];

export const useMembersStore = () => {
  const [members, setMembers] = useState<Member[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedMembers = localStorage.getItem(STORAGE_KEY);
    const storedPayments = localStorage.getItem(PAYMENTS_KEY);

    if (storedMembers) {
      const parsed = JSON.parse(storedMembers);
      setMembers(parsed.map((m: any) => ({
        ...m,
        joinDate: new Date(m.joinDate),
        lastPaymentDate: m.lastPaymentDate ? new Date(m.lastPaymentDate) : null,
        renewalDate: m.renewalDate ? new Date(m.renewalDate) : null,
      })));
    } else {
      setMembers(initialMembers);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initialMembers));
    }

    if (storedPayments) {
      const parsed = JSON.parse(storedPayments);
      setPayments(parsed.map((p: any) => ({
        ...p,
        date: new Date(p.date),
      })));
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!isLoading) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(members));
    }
  }, [members, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      localStorage.setItem(PAYMENTS_KEY, JSON.stringify(payments));
    }
  }, [payments, isLoading]);

  const addMember = (member: Omit<Member, 'id' | 'isPaid' | 'lastPaymentDate' | 'renewalDate'>) => {
    const newMember: Member = {
      ...member,
      id: Date.now().toString(),
      isPaid: false,
      lastPaymentDate: null,
      renewalDate: null,
    };
    setMembers(prev => [...prev, newMember]);
  };

  const updateMember = (id: string, updates: Partial<Member>) => {
    setMembers(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  const deleteMember = (id: string) => {
    setMembers(prev => prev.filter(m => m.id !== id));
  };

  const recordPayment = (memberId: string, method: Payment['method'] = 'mobile_money') => {
    const member = members.find(m => m.id === memberId);
    if (!member) return;

    const paymentDate = new Date();
    const renewalDate = addMonths(paymentDate, 1);

    const payment: Payment = {
      id: Date.now().toString(),
      memberId,
      memberName: member.name,
      amount: member.amount,
      date: paymentDate,
      method,
    };

    setPayments(prev => [...prev, payment]);
    updateMember(memberId, {
      lastPaymentDate: paymentDate,
      renewalDate,
      isPaid: true,
    });
  };

  const checkPaymentStatus = () => {
    const today = startOfDay(new Date());
    setMembers(prev => prev.map(member => {
      if (member.renewalDate && isBefore(member.renewalDate, today)) {
        return { ...member, isPaid: false };
      }
      return member;
    }));
  };

  const getPaidMembers = () => members.filter(m => m.isPaid);
  const getUnpaidMembers = () => members.filter(m => !m.isPaid);
  const getTotalRevenue = () => payments.reduce((sum, p) => sum + p.amount, 0);
  const getMonthlyRevenue = () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return payments
      .filter(p => isAfter(p.date, startOfMonth))
      .reduce((sum, p) => sum + p.amount, 0);
  };

  return {
    members,
    payments,
    isLoading,
    addMember,
    updateMember,
    deleteMember,
    recordPayment,
    checkPaymentStatus,
    getPaidMembers,
    getUnpaidMembers,
    getTotalRevenue,
    getMonthlyRevenue,
  };
};
