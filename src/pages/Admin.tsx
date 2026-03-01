import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { StatCard } from '@/components/StatCard';
import { MoneyMakerLogo } from '@/components/MoneyMakerLogo';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { 
  Users, 
  CreditCard, 
  TrendingUp, 
  AlertCircle,
  CheckCircle,
  XCircle,
  History,
  Music2,
  LogOut,
  Trash2,
  Loader2,
  UserPlus,
  Clock
} from 'lucide-react';
import { format, addMonths, isPast, startOfMonth, endOfMonth } from 'date-fns';
import { fr } from 'date-fns/locale';
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

interface Member {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  join_date: string;
  amount: number;
  user_id: string | null;
}

interface Payment {
  id: string;
  member_id: string;
  amount: number;
  payment_date: string;
  method: string;
}

interface SubscriptionRequest {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  email: string | null;
  amount: number;
  status: string;
  created_at: string;
}

const Admin = () => {
  const navigate = useNavigate();
  const { user, isLoading: authLoading, isAdmin, signOut, signIn } = useAuth();
  const { toast } = useToast();
  
  const [members, setMembers] = useState<Member[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [subscriptionRequests, setSubscriptionRequests] = useState<SubscriptionRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [processingRequest, setProcessingRequest] = useState<string | null>(null);
  
  // Admin login state
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    if (!authLoading) {
      if (user && isAdmin) {
        fetchData();
      } else if (user && !isAdmin) {
        // User is logged in but not admin
        setIsLoading(false);
      } else {
        setIsLoading(false);
      }
    }
  }, [user, isAdmin, authLoading]);

  const fetchData = async () => {
    try {
      const [membersRes, paymentsRes, requestsRes] = await Promise.all([
        supabase.from('members').select('*').order('join_date', { ascending: false }),
        supabase.from('payments').select('*').order('payment_date', { ascending: false }),
        supabase.from('subscription_requests').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
      ]);

      if (membersRes.error) throw membersRes.error;
      if (paymentsRes.error) throw paymentsRes.error;
      if (requestsRes.error) throw requestsRes.error;

      setMembers(membersRes.data || []);
      setPayments(paymentsRes.data || []);
      setSubscriptionRequests(requestsRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    
    const { error } = await signIn(adminEmail, adminPassword);
    
    if (error) {
      toast({
        title: "Erreur de connexion",
        description: "Email ou mot de passe incorrect",
        variant: "destructive",
      });
    }
    setLoginLoading(false);
  };

  const handleRecordPayment = async (memberId: string) => {
    const member = members.find(m => m.id === memberId);
    if (!member) return;

    try {
      const { error } = await supabase
        .from('payments')
        .insert({
          member_id: memberId,
          amount: member.amount,
          method: 'cash',
        });

      if (error) throw error;

      toast({
        title: "Paiement enregistré",
        description: `Le paiement de ${member.name} a été enregistré`,
      });

      await fetchData();
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteMember = async () => {
    if (!deleteConfirm) return;
    
    const member = members.find(m => m.id === deleteConfirm);
    
    try {
      const { error } = await supabase
        .from('members')
        .delete()
        .eq('id', deleteConfirm);

      if (error) throw error;

      toast({
        title: "Client supprimé",
        description: `${member?.name} a été retiré`,
        variant: "destructive",
      });

      setDeleteConfirm(null);
      await fetchData();
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const handleApproveRequest = async (request: SubscriptionRequest) => {
    setProcessingRequest(request.id);
    try {
      // Create member record
      const { error: memberError } = await supabase
        .from('members')
        .insert({
          user_id: request.user_id,
          name: request.name,
          phone: request.phone,
          email: request.email,
          amount: request.amount,
        });

      if (memberError) throw memberError;

      // Update request status
      const { error: updateError } = await supabase
        .from('subscription_requests')
        .update({ 
          status: 'approved', 
          processed_at: new Date().toISOString(),
          processed_by: user?.id,
        })
        .eq('id', request.id);

      if (updateError) throw updateError;

      toast({
        title: "Demande validée",
        description: `${request.name} est maintenant client`,
      });

      await fetchData();
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setProcessingRequest(null);
    }
  };

  const handleRejectRequest = async (request: SubscriptionRequest) => {
    setProcessingRequest(request.id);
    try {
      const { error } = await supabase
        .from('subscription_requests')
        .update({ 
          status: 'rejected', 
          processed_at: new Date().toISOString(),
          processed_by: user?.id,
        })
        .eq('id', request.id);

      if (error) throw error;

      toast({
        title: "Demande rejetée",
        description: `La demande de ${request.name} a été rejetée`,
        variant: "destructive",
      });

      await fetchData();
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setProcessingRequest(null);
    }
  };

  const getMemberPaymentStatus = (memberId: string) => {
    const memberPayments = payments.filter(p => p.member_id === memberId);
    if (memberPayments.length === 0) return { isPaid: false, renewalDate: null };
    
    const lastPayment = memberPayments[0];
    const renewalDate = addMonths(new Date(lastPayment.payment_date), 1);
    return { isPaid: !isPast(renewalDate), renewalDate };
  };

  const getMonthlyRevenue = () => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    
    return payments
      .filter(p => {
        const date = new Date(p.payment_date);
        return date >= monthStart && date <= monthEnd;
      })
      .reduce((sum, p) => sum + p.amount, 0);
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <MoneyMakerLogo className="w-16 h-16 text-primary" />
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  // Show login form if not authenticated or not admin
  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="absolute top-0 left-0 right-0 h-96 pointer-events-none" 
          style={{ background: 'var(--gradient-hero)' }} 
        />
        
        <div className="relative w-full max-w-md space-y-8">
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 rounded-2xl bg-primary/10 moneymaker-glow">
              <MoneyMakerLogo className="w-12 h-12 text-primary" />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold text-foreground">Administration</h1>
              <p className="text-muted-foreground">Accès réservé aux administrateurs</p>
            </div>
          </div>

          <div className="bg-card border border-border/50 rounded-2xl p-6 shadow-xl">
            {user && !isAdmin ? (
              <div className="text-center space-y-4">
                <XCircle className="w-12 h-12 mx-auto text-destructive" />
                <p className="text-muted-foreground">
                  Vous n'avez pas les droits d'administration
                </p>
                <Button variant="outline" onClick={handleSignOut}>
                  Se déconnecter
                </Button>
              </div>
            ) : (
              <form onSubmit={handleAdminLogin} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm text-foreground">Email admin</label>
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    className="w-full px-4 py-2 bg-background/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-foreground">Mot de passe</label>
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="w-full px-4 py-2 bg-background/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                </div>
                <Button type="submit" variant="moneymaker" className="w-full" disabled={loginLoading}>
                  {loginLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Connexion admin
                </Button>
              </form>
            )}
          </div>

          <div className="text-center">
            <Button 
              variant="link" 
              className="text-muted-foreground hover:text-primary"
              onClick={() => navigate('/auth')}
            >
              Retour à l'espace business
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const paidMembers = members.filter(m => getMemberPaymentStatus(m.id).isPaid);
  const unpaidMembers = members.filter(m => !getMemberPaymentStatus(m.id).isPaid);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 sticky top-0 bg-background/95 backdrop-blur-sm z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10">
                <MoneyMakerLogo className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Tableau admin</h1>
                <p className="text-sm text-muted-foreground">Pilotage MoneyMaker</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Déconnexion
            </Button>
          </div>
        </div>
      </header>

      <div className="absolute top-0 left-0 right-0 h-96 pointer-events-none" 
        style={{ background: 'var(--gradient-hero)' }} 
      />

      <main className="container mx-auto px-4 py-8 relative">
        {/* Stats */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            title="Total clients"
            value={members.length}
            icon={<Users className="w-6 h-6" />}
            subtitle="/ 5 places"
            delay={0}
          />
          <StatCard
            title="Clients à jour"
            value={paidMembers.length}
            icon={<CheckCircle className="w-6 h-6" />}
            trend={paidMembers.length === members.length ? "up" : "neutral"}
            delay={1}
          />
          <StatCard
            title="En attente"
            value={unpaidMembers.length}
            icon={<AlertCircle className="w-6 h-6" />}
            trend={unpaidMembers.length > 0 ? "down" : "up"}
            delay={2}
          />
          <StatCard
            title="Revenus du mois"
            value={`${getMonthlyRevenue().toLocaleString()} FCFA`}
            icon={<TrendingUp className="w-6 h-6" />}
            trend="up"
            delay={3}
          />
        </section>

        {/* Tabs */}
        <Tabs defaultValue="requests" className="space-y-6">
          <TabsList className="bg-card border border-border/50 p-1">
            <TabsTrigger value="requests" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2">
              <UserPlus className="w-4 h-4" />
              Demandes
              {subscriptionRequests.length > 0 && (
                <span className="ml-1 px-2 py-0.5 text-xs bg-destructive text-destructive-foreground rounded-full">
                  {subscriptionRequests.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="members" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2">
              <Users className="w-4 h-4" />
              Clients
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2">
              <History className="w-4 h-4" />
              Historique
            </TabsTrigger>
          </TabsList>

          {/* Subscription Requests Tab */}
          <TabsContent value="requests" className="space-y-4">
            {subscriptionRequests.length === 0 ? (
              <div className="bg-card rounded-xl p-12 text-center">
                <CheckCircle className="w-16 h-16 mx-auto text-primary mb-4" />
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  Aucune demande en attente
                </h3>
                <p className="text-muted-foreground">
                  Les nouvelles demandes d'accès apparaîtront ici
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {subscriptionRequests.map((request) => (
                  <div 
                    key={request.id}
                    className="bg-card border border-yellow-500/30 rounded-xl p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-500 font-bold">
                          {request.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground">{request.name}</h3>
                          <p className="text-sm text-muted-foreground">{request.phone}</p>
                          {request.email && (
                            <p className="text-xs text-muted-foreground">{request.email}</p>
                          )}
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                            <Clock className="w-3 h-3" />
                            {format(new Date(request.created_at), 'dd MMM yyyy à HH:mm', { locale: fr })}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-500">
                          {request.amount.toLocaleString()} FCFA
                        </span>
                        
                        <Button 
                          variant="moneymaker" 
                          size="sm"
                          onClick={() => handleApproveRequest(request)}
                          disabled={processingRequest === request.id}
                        >
                          {processingRequest === request.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Valider
                            </>
                          )}
                        </Button>
                        
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleRejectRequest(request)}
                          disabled={processingRequest === request.id}
                          className="text-destructive hover:bg-destructive/10"
                        >
                          <XCircle className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="members" className="space-y-4">
            {members.length === 0 ? (
              <div className="bg-card rounded-xl p-12 text-center">
                <Music2 className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  Aucun client inscrit
                </h3>
                <p className="text-muted-foreground">
                  Les utilisateurs peuvent s'inscrire via la page d'authentification
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {members.map((member) => {
                  const { isPaid, renewalDate } = getMemberPaymentStatus(member.id);
                  return (
                    <div 
                      key={member.id}
                      className="bg-card border border-border/50 rounded-xl p-4 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground">{member.name}</h3>
                          <p className="text-sm text-muted-foreground">{member.phone}</p>
                          <p className="text-xs text-muted-foreground">
                            {renewalDate 
                              ? `Prochaine échéance: ${format(renewalDate, 'dd MMM yyyy', { locale: fr })}`
                              : 'Aucun paiement'
                            }
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          isPaid 
                            ? 'bg-primary/20 text-primary' 
                            : 'bg-destructive/20 text-destructive'
                        }`}>
                          {isPaid ? 'À jour' : 'En attente'}
                        </span>
                        
                        <Button 
                          variant="moneymaker" 
                          size="sm"
                          onClick={() => handleRecordPayment(member.id)}
                        >
                          <CreditCard className="w-4 h-4 mr-1" />
                          Enregistrer
                        </Button>
                        
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setDeleteConfirm(member.id)}
                          className="text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="history">
            <div className="bg-card border border-border/50 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Historique des paiements</h2>
              {payments.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Aucun paiement enregistré</p>
              ) : (
                <div className="space-y-3">
                  {payments.map((payment) => {
                    const member = members.find(m => m.id === payment.member_id);
                    return (
                      <div 
                        key={payment.id}
                        className="flex items-center justify-between py-3 border-b border-border/30 last:border-0"
                      >
                        <div>
                          <p className="font-medium text-foreground">{member?.name || 'Inconnu'}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(payment.payment_date), 'dd MMMM yyyy à HH:mm', { locale: fr })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-primary">{payment.amount.toLocaleString()} FCFA</p>
                          <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground capitalize">
                            {payment.method.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce client ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le client et tous ses paiements seront supprimés.
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

export default Admin;

