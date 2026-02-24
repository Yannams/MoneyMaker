import { Payment } from '@/types/member';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { CreditCard, Smartphone, Building } from 'lucide-react';

interface PaymentHistoryProps {
  payments: Payment[];
}

const methodIcons = {
  cash: CreditCard,
  mobile_money: Smartphone,
  transfer: Building,
};

const methodLabels = {
  cash: 'Espèces',
  mobile_money: 'Mobile Money',
  transfer: 'Virement',
};

export const PaymentHistory = ({ payments }: PaymentHistoryProps) => {
  const sortedPayments = [...payments].sort((a, b) => b.date.getTime() - a.date.getTime());

  if (sortedPayments.length === 0) {
    return (
      <div className="bg-card rounded-xl p-8 text-center">
        <p className="text-muted-foreground">Aucun paiement enregistré</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl overflow-hidden">
      <div className="divide-y divide-border/50">
        {sortedPayments.slice(0, 10).map((payment, index) => {
          const Icon = methodIcons[payment.method];
          return (
            <div 
              key={payment.id} 
              className="p-4 flex items-center justify-between hover:bg-secondary/50 transition-colors opacity-0 animate-fade-in"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{payment.memberName}</p>
                  <p className="text-sm text-muted-foreground">
                    {format(payment.date, "d MMM yyyy 'à' HH:mm", { locale: fr })}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold text-primary">
                  +{payment.amount.toLocaleString()} FCFA
                </p>
                <p className="text-xs text-muted-foreground">
                  {methodLabels[payment.method]}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
