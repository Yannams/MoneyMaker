export interface Member {
  id: string;
  name: string;
  phone: string;
  email?: string;
  joinDate: Date;
  lastPaymentDate: Date | null;
  renewalDate: Date | null;
  isPaid: boolean;
  amount: number;
}

export interface Payment {
  id: string;
  memberId: string;
  memberName: string;
  amount: number;
  date: Date;
  method: 'cash' | 'mobile_money' | 'transfer';
}
