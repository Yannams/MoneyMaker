import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { addDays, addMonths, addWeeks, addYears, isBefore, startOfDay } from 'date-fns';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  ArrowLeft,
  CheckCircle2,
  Search,
  ShoppingCart,
  Users,
} from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { AppGlobalHeader } from '@/components/AppGlobalHeader';
import { PageHeading } from '@/components/PageHeading';
import { ScrollReveal } from '@/components/ScrollReveal';
import { MoneyMakerLogo } from '@/components/MoneyMakerLogo';
import { StatCard } from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

type Business = {
  id: string;
  name: string;
};

type Offer = {
  id: string;
  name: string;
  business_id: string;
  billing_type: 'one_time' | 'recurring';
  interval_type: 'daily' | 'weekly' | 'monthly' | 'yearly' | null;
  interval_value: number | null;
};

type Client = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
};

type Transaction = {
  id: string;
  amount: number;
  status: 'pending' | 'success' | 'failed';
  method: 'cash' | 'mobile_money';
  paid_at: string | null;
  created_at: string;
};

type Commande = {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'canceled';
  type: 'one_time' | 'recurring';
  total_amount: number;
  created_at: string;
  next_due_at: string | null;
  offre: Offer | null;
  client: Client | null;
  transactions: Transaction[] | null;
};

type AggregatedClient = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
  total_orders: number;
  total_paid: number;
  last_order_at: string;
  last_offer_name: string;
  successful_payments: number;
  recurring_total: number;
  recurring_up_to_date: number;
  recurring_unknown: number;
  next_due_at: string | null;
};

type OfferSummary = {
  id: string;
  name: string;
  total_commandes: number;
  unique_clients: number;
  total_paid: number;
};

const computeNextDueDate = (
  baseDate: Date,
  intervalType: 'daily' | 'weekly' | 'monthly' | 'yearly' | null,
  intervalValue: number | null,
) => {
  const value = intervalValue ?? 1;
  if (intervalType === 'daily') return addDays(baseDate, value);
  if (intervalType === 'weekly') return addWeeks(baseDate, value);
  if (intervalType === 'monthly') return addMonths(baseDate, value);
  if (intervalType === 'yearly') return addYears(baseDate, value);
  return null;
};

const BusinessClients = () => {
  const navigate = useNavigate();
  const { businessId } = useParams<{ businessId: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [business, setBusiness] = useState<Business | null>(null);
  const [commandes, setCommandes] = useState<Commande[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!authLoading && user && businessId) {
      void fetchData();
    }
  }, [authLoading, user, businessId]);

  const fetchData = async () => {
    if (!businessId) return;
    setIsLoading(true);

    try {
      const { data: businessData, error: businessError } = await supabase
        .from('business')
        .select('id, name')
        .eq('id', businessId)
        .maybeSingle();

      if (businessError) throw businessError;
      if (!businessData) {
        toast({
          title: 'Business introuvable',
          description: "Ce business n'existe pas ou vous n'avez pas acces",
          variant: 'destructive',
        });
        navigate('/business');
        return;
      }

      setBusiness(businessData);

      const { data: offersData, error: offersError } = await supabase
        .from('offres')
        .select('id')
        .eq('business_id', businessId);

      if (offersError) throw offersError;

      const offerIds = (offersData ?? []).map((offer) => offer.id);
      if (offerIds.length === 0) {
        setCommandes([]);
        setIsLoading(false);
        return;
      }

      const { data: commandesData, error: commandesError } = await supabase
        .from('commandes')
        .select(`
          id,
          status,
          type,
          total_amount,
          created_at,
          next_due_at,
          offre:offres(id, name, business_id, billing_type, interval_type, interval_value),
          client:clients(id, name, phone, email, created_at),
          transactions(id, amount, status, method, paid_at, created_at)
        `)
        .in('offre_id', offerIds)
        .order('created_at', { ascending: false });

      if (commandesError) throw commandesError;
      setCommandes((commandesData ?? []) as unknown as Commande[]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Impossible de charger les clients';
      toast({
        title: 'Erreur',
        description: message,
        variant: 'destructive',
      });
      navigate('/business');
    } finally {
      setIsLoading(false);
    }
  };

  const aggregatedClients = useMemo(() => {
    const map = new Map<string, AggregatedClient>();
    const recurringByClient = new Map<
      string,
      Map<string, { paidAt: string; dueAt: string | null; isUpToDate: boolean | null }>
    >();
    const today = startOfDay(new Date());

    commandes.forEach((commande) => {
      if (!commande.client) return;

      const client = commande.client;
      const successTransactions = (commande.transactions ?? []).filter((transaction) => transaction.status === 'success');
      const successAmount = successTransactions.reduce((sum, transaction) => sum + Number(transaction.amount), 0);
      const successPayments = successTransactions.length;

      const current = map.get(client.id);

      if (!current) {
        map.set(client.id, {
          id: client.id,
          name: client.name,
          phone: client.phone,
          email: client.email,
          created_at: client.created_at,
          total_orders: 1,
          total_paid: successAmount,
          last_order_at: commande.created_at,
          last_offer_name: commande.offre?.name ?? 'Offre',
          successful_payments: successPayments,
          recurring_total: 0,
          recurring_up_to_date: 0,
          recurring_unknown: 0,
          next_due_at: null,
        });
      } else {
        const isNewerOrder = new Date(commande.created_at) > new Date(current.last_order_at);

        map.set(client.id, {
          ...current,
          total_orders: current.total_orders + 1,
          total_paid: current.total_paid + successAmount,
          successful_payments: current.successful_payments + successPayments,
          last_order_at: isNewerOrder ? commande.created_at : current.last_order_at,
          last_offer_name: isNewerOrder ? commande.offre?.name ?? current.last_offer_name : current.last_offer_name,
        });
      }

      if (commande.offre?.billing_type === 'recurring' && successTransactions.length > 0) {
        const latestPaidAt = successTransactions
          .map((transaction) => transaction.paid_at ?? transaction.created_at)
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
        const latestPaidAtDate = new Date(latestPaidAt);

        const dueFromCommande = commande.next_due_at ? new Date(commande.next_due_at) : null;
        const dueFromInterval = computeNextDueDate(latestPaidAtDate, commande.offre.interval_type, commande.offre.interval_value);
        const dueDate = dueFromCommande ?? dueFromInterval;

        const perClientSubscriptions = recurringByClient.get(client.id) ?? new Map<string, { paidAt: string; dueAt: string | null; isUpToDate: boolean }>();
        const existingForOffer = perClientSubscriptions.get(commande.offre.id);

        if (!existingForOffer || new Date(latestPaidAt) > new Date(existingForOffer.paidAt)) {
          perClientSubscriptions.set(commande.offre.id, {
            paidAt: latestPaidAt,
            dueAt: dueDate ? dueDate.toISOString() : null,
            isUpToDate: dueDate ? !isBefore(dueDate, today) : null,
          });
        }

        recurringByClient.set(client.id, perClientSubscriptions);
      }
    });

    recurringByClient.forEach((subscriptions, clientId) => {
      const current = map.get(clientId);
      if (!current) return;

      const values = Array.from(subscriptions.values());
      const nextDueDate = values
        .map((item) => item.dueAt)
        .filter((dueAt): dueAt is string => !!dueAt)
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null;

      map.set(clientId, {
        ...current,
        recurring_total: values.length,
        recurring_up_to_date: values.filter((item) => item.isUpToDate).length,
        recurring_unknown: values.filter((item) => item.isUpToDate === null).length,
        next_due_at: nextDueDate,
      });
    });

    return Array.from(map.values()).sort((a, b) => new Date(b.last_order_at).getTime() - new Date(a.last_order_at).getTime());
  }, [commandes]);

  const offersSummary = useMemo(() => {
    const map = new Map<string, { name: string; total_commandes: number; clients: Set<string>; total_paid: number }>();

    commandes.forEach((commande) => {
      if (!commande.offre) return;

      const key = commande.offre.id;
      const current = map.get(key) ?? {
        name: commande.offre.name,
        total_commandes: 0,
        clients: new Set<string>(),
        total_paid: 0,
      };

      current.total_commandes += 1;
      if (commande.client?.id) current.clients.add(commande.client.id);
      current.total_paid += (commande.transactions ?? [])
        .filter((transaction) => transaction.status === 'success')
        .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

      map.set(key, current);
    });

    return Array.from(map.entries())
      .map(([id, value]) => ({
        id,
        name: value.name,
        total_commandes: value.total_commandes,
        unique_clients: value.clients.size,
        total_paid: value.total_paid,
      }))
      .sort((a, b) => b.total_commandes - a.total_commandes);
  }, [commandes]);

  const filteredClients = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return aggregatedClients;

    return aggregatedClients.filter((client) => {
      const haystack = [client.name, client.phone ?? '', client.email ?? '', client.last_offer_name].join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }, [aggregatedClients, search]);

  const totalPaid = useMemo(
    () => commandes.flatMap((commande) => commande.transactions ?? []).filter((tx) => tx.status === 'success').reduce((sum, tx) => sum + Number(tx.amount), 0),
    [commandes],
  );
  const recurringClientsCount = useMemo(
    () => aggregatedClients.filter((client) => client.recurring_total > 0).length,
    [aggregatedClients],
  );
  const recurringCompliantCount = useMemo(
    () =>
      aggregatedClients.filter(
        (client) =>
          client.recurring_total > 0 && client.recurring_unknown === 0 && client.recurring_total === client.recurring_up_to_date,
      ).length,
    [aggregatedClients],
  );
  const recurringUnknownCount = useMemo(
    () => aggregatedClients.filter((client) => client.recurring_total > 0 && client.recurring_unknown > 0).length,
    [aggregatedClients],
  );

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

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="absolute top-0 left-0 right-0 h-96 pointer-events-none" style={{ background: 'var(--gradient-hero)' }} />
      <AppGlobalHeader businessId={businessId} />

      <main className="container mx-auto max-w-7xl px-4 py-10 sm:py-12 relative space-y-10">
        <PageHeading
          breadcrumb={[
            { label: 'Mes business', to: '/business' },
            { label: business?.name ?? 'Business', to: `/business/${businessId}/offres` },
            { label: 'Clients' },
          ]}
          title="Clients du business"
          description={business?.name ?? 'Business'}
          actions={(
            <Button variant="outline" size="sm" onClick={() => navigate(`/business/${businessId}/offres`)}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              Retour offres
            </Button>
          )}
        />

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard
            title="Clients uniques"
            value={aggregatedClients.length}
            icon={<Users className="w-6 h-6" />}
            subtitle={aggregatedClients.length > 0 ? 'Clients ayant au moins une commande' : 'Aucun client pour le moment'}
            trend={aggregatedClients.length > 0 ? 'up' : 'neutral'}
            delay={0}
          />
          <StatCard
            title="Commandes"
            value={commandes.length}
            icon={<ShoppingCart className="w-6 h-6" />}
            subtitle="Toutes les commandes du business"
            trend={commandes.length > 0 ? 'up' : 'neutral'}
            delay={1}
          />
          <StatCard
            title="Paiements confirmes"
            value={`${totalPaid.toLocaleString()} FCFA`}
            icon={<CheckCircle2 className="w-6 h-6" />}
            subtitle="Transactions en succes"
            trend={totalPaid > 0 ? 'up' : 'neutral'}
            delay={2}
          />
          <StatCard
            title="Abonnements en regle"
            value={`${recurringCompliantCount}/${recurringClientsCount}`}
            icon={<CheckCircle2 className="w-6 h-6" />}
            subtitle={
              recurringUnknownCount > 0
                ? `${recurringUnknownCount} client(s) non calcule(s)`
                : 'Clients recurrents a jour'
            }
            trend={
              recurringClientsCount === 0
                ? 'neutral'
                : recurringUnknownCount > 0
                  ? 'neutral'
                  : recurringCompliantCount === recurringClientsCount
                    ? 'up'
                    : 'down'
            }
            delay={3}
          />
        </section>

        <section className="soft-panel p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Offres et clients</h2>
              <p className="text-sm text-muted-foreground">Naviguez vers la liste clients de chaque offre</p>
            </div>
          </div>

          {offersSummary.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune commande enregistree pour ce business.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {offersSummary.map((offer, index) => (
                <ScrollReveal key={offer.id} delayMs={index * 70}>
                  <article className="soft-subtle p-4 space-y-3">
                    <div>
                      <p className="font-semibold text-foreground">{offer.name}</p>
                      <p className="text-xs text-muted-foreground">{offer.unique_clients} client(s) - {offer.total_commandes} commande(s)</p>
                    </div>

                    <p className="text-sm text-muted-foreground">Encaisse: {offer.total_paid.toLocaleString()} FCFA</p>

                    <Button variant="outline" size="sm" onClick={() => navigate(`/business/${businessId}/offres/${offer.id}/clients`)}>
                      Voir clients
                    </Button>
                  </article>
                </ScrollReveal>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Liste des clients</h2>
              <p className="text-sm text-muted-foreground">Vision globale des clients du business</p>
            </div>

            <div className="relative w-full lg:max-w-xs">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher un client..."
                className="pl-9 bg-card border-border"
              />
            </div>
          </div>

          {filteredClients.length === 0 ? (
            <div className="soft-panel p-8 text-center">
              <Users className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Aucun client trouve.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredClients.map((client, index) => (
                <ScrollReveal key={client.id} delayMs={index * 60}>
                  <article className="soft-panel p-5 card-hover">
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold text-foreground">{client.name}</h3>
                      <p className="text-sm text-muted-foreground">{client.phone ?? 'Telephone non renseigne'}</p>
                      <p className="text-sm text-muted-foreground">{client.email ?? 'Email non renseigne'}</p>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-lg bg-secondary/40 p-2">
                        <p className="text-muted-foreground">Commandes</p>
                        <p className="font-semibold text-foreground">{client.total_orders}</p>
                      </div>
                      <div className="rounded-lg bg-secondary/40 p-2">
                        <p className="text-muted-foreground">Encaisse</p>
                        <p className="font-semibold text-foreground">{client.total_paid.toLocaleString()} FCFA</p>
                      </div>
                    </div>

                    <div className="mt-4 text-xs text-muted-foreground space-y-1">
                      <p>Derniere offre: <span className="text-foreground">{client.last_offer_name}</span></p>
                      <p>Derniere commande: <span className="text-foreground">{format(new Date(client.last_order_at), 'dd MMM yyyy', { locale: fr })}</span></p>
                      <p>Paiements confirmes: <span className="text-foreground">{client.successful_payments}</span></p>
                      {client.recurring_total > 0 ? (
                        <>
                          <p>
                            Statut recurrent:{' '}
                            <span
                              className={
                                client.recurring_unknown > 0
                                  ? 'text-muted-foreground font-semibold'
                                  : client.recurring_total === client.recurring_up_to_date
                                    ? 'text-primary font-semibold'
                                    : 'text-destructive font-semibold'
                              }
                            >
                              {client.recurring_unknown > 0
                                ? `${client.recurring_up_to_date}/${client.recurring_total - client.recurring_unknown} en regle (${client.recurring_unknown} non calcule)`
                                : `${client.recurring_up_to_date}/${client.recurring_total} en regle`}
                            </span>
                          </p>
                          <p>
                            Prochaine echeance:{' '}
                            <span className="text-foreground">
                              {client.next_due_at ? format(new Date(client.next_due_at), 'dd MMM yyyy', { locale: fr }) : 'Non calculee'}
                            </span>
                          </p>
                        </>
                      ) : null}
                    </div>
                  </article>
                </ScrollReveal>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default BusinessClients;
