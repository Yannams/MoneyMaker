import { useEffect, useState } from 'react';
import { useMembersStore } from '@/hooks/useMembersStore';
import { StatCard } from '@/components/StatCard';
import { MemberCard } from '@/components/MemberCard';
import { AddMemberDialog } from '@/components/AddMemberDialog';
import { PaymentHistory } from '@/components/PaymentHistory';
import { MoneyMakerLogo } from '@/components/MoneyMakerLogo';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Users, 
  CreditCard, 
  TrendingUp, 
  AlertCircle,
  CheckCircle,
  XCircle,
  History,
  Music2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const Index = () => {
  const { 
    members, 
    payments,
    isLoading,
    addMember, 
    deleteMember, 
    recordPayment,
    checkPaymentStatus,
    getPaidMembers,
    getUnpaidMembers,
    getMonthlyRevenue,
  } = useMembersStore();

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!isLoading) {
      checkPaymentStatus();
    }
  }, [isLoading]);

  const handleRecordPayment = (memberId: string) => {
    recordPayment(memberId);
    const member = members.find(m => m.id === memberId);
    toast({
      title: "Paiement enregistré",
      description: `Le paiement de ${member?.name} a été enregistré`,
    });
  };

  const handleDeleteMember = () => {
    if (deleteConfirm) {
      const member = members.find(m => m.id === deleteConfirm);
      deleteMember(deleteConfirm);
      toast({
        title: "Client supprim�",
        description: `${member?.name} a été retiré de la liste`,
        variant: "destructive",
      });
      setDeleteConfirm(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <MoneyMakerLogo className="w-16 h-16 text-primary" />
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  const paidCount = getPaidMembers().length;
  const unpaidCount = getUnpaidMembers().length;
  const monthlyRevenue = getMonthlyRevenue();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 sticky top-0 bg-background/95 backdrop-blur-sm z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10">
                <MoneyMakerLogo className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">MoneyMaker</h1>
                <p className="text-sm text-muted-foreground">Gestion de petit business</p>
              </div>
            </div>
            <AddMemberDialog onAddMember={addMember} />
          </div>
        </div>
      </header>

      {/* Hero gradient */}
      <div className="absolute top-0 left-0 right-0 h-96 pointer-events-none" 
        style={{ background: 'var(--gradient-hero)' }} 
      />

      <main className="container mx-auto px-4 py-8 relative">
        {/* Stats Grid */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            title="Total clients"
            value={members.length}
            icon={<Users className="w-6 h-6" />}
            subtitle="/ base clients"
            delay={0}
          />
          <StatCard
            title="Clients à jour"
            value={paidCount}
            icon={<CheckCircle className="w-6 h-6" />}
            subtitle={paidCount === members.length ? "Tous les clients sont � jour !" : undefined}
            trend={paidCount === members.length ? "up" : "neutral"}
            delay={1}
          />
          <StatCard
            title="En attente"
            value={unpaidCount}
            icon={unpaidCount > 0 ? <AlertCircle className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
            subtitle={unpaidCount > 0 ? "Paiements en retard" : "Aucun retard"}
            trend={unpaidCount > 0 ? "down" : "up"}
            delay={2}
          />
          <StatCard
            title="Revenus du mois"
            value={`${monthlyRevenue.toLocaleString()} FCFA`}
            icon={<TrendingUp className="w-6 h-6" />}
            subtitle={`${payments.length} paiements`}
            trend="up"
            delay={3}
          />
        </section>

        {/* Tabs */}
        <Tabs defaultValue="members" className="space-y-6">
          <TabsList className="bg-card border border-border/50 p-1">
            <TabsTrigger value="members" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2">
              <Users className="w-4 h-4" />
              Clients
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2">
              <History className="w-4 h-4" />
              Historique
            </TabsTrigger>
          </TabsList>

          <TabsContent value="members" className="space-y-4">
            {members.length === 0 ? (
              <div className="bg-card rounded-xl p-12 text-center">
                <Music2 className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  Aucun client pour l'instant
                </h3>
                <p className="text-muted-foreground mb-6">
                  Commencez par ajouter vos premiers clients
                </p>
                <AddMemberDialog onAddMember={addMember} />
              </div>
            ) : (
              <div className="space-y-3">
                {members.map((member, index) => (
                  <MemberCard
                    key={member.id}
                    member={member}
                    onRecordPayment={handleRecordPayment}
                    onDelete={(id) => setDeleteConfirm(id)}
                    delay={index}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="history">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">Historique des paiements</h2>
                <p className="text-sm text-muted-foreground">
                  {payments.length} paiement{payments.length > 1 ? 's' : ''} enregistré{payments.length > 1 ? 's' : ''}
                </p>
              </div>
              <PaymentHistory payments={payments} />
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce client ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le client sera d�finitivement retir� de votre liste.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Annuler</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteMember}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Index;
