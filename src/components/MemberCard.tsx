import { Member } from '@/types/member';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, Calendar, Phone, CreditCard, Trash2 } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface MemberCardProps {
  member: Member;
  onRecordPayment: (id: string) => void;
  onDelete: (id: string) => void;
  delay?: number;
}

export const MemberCard = ({ member, onRecordPayment, onDelete, delay = 0 }: MemberCardProps) => {
  const isOverdue = member.renewalDate && new Date() > member.renewalDate;

  return (
    <div 
      className={cn(
        "bg-card rounded-xl p-5 card-hover opacity-0 animate-fade-in border border-border/50",
        isOverdue && !member.isPaid && "border-destructive/50"
      )}
      style={{ animationDelay: `${delay * 50}ms` }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold",
            member.isPaid 
              ? "bg-primary/20 text-primary" 
              : "bg-destructive/20 text-destructive"
          )}>
            {member.name.charAt(0).toUpperCase()}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground">{member.name}</h3>
              <Badge 
                variant={member.isPaid ? "default" : "destructive"}
                className={cn(
                  "text-xs",
                  member.isPaid && "bg-primary/20 text-primary hover:bg-primary/30"
                )}
              >
                {member.isPaid ? (
                  <><Check className="w-3 h-3 mr-1" /> Payé</>
                ) : (
                  <><X className="w-3 h-3 mr-1" /> Non payé</>
                )}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="w-3.5 h-3.5" />
              {member.phone}
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:items-end gap-2">
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            {member.renewalDate ? (
              <span className={cn(
                isOverdue ? "text-destructive" : "text-muted-foreground"
              )}>
                Prochaine �ch�ance: {format(member.renewalDate, 'd MMM yyyy', { locale: fr })}
                {isOverdue && " (en retard)"}
              </span>
            ) : (
              <span className="text-muted-foreground">Jamais payé</span>
            )}
          </div>
          
          <div className="flex gap-2">
            {!member.isPaid && (
              <Button 
                variant="moneymaker" 
                size="sm"
                onClick={() => onRecordPayment(member.id)}
              >
                <CreditCard className="w-4 h-4" />
                Enregistrer paiement
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(member.id)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {member.lastPaymentDate && (
        <div className="mt-4 pt-4 border-t border-border/50 text-sm text-muted-foreground">
          Dernier paiement: {format(member.lastPaymentDate, 'd MMMM yyyy', { locale: fr })} 
          <span className="text-primary font-medium"> • 2 000 FCFA</span>
        </div>
      )}
    </div>
  );
};
