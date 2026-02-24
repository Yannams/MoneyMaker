import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { addDays, addMonths, addWeeks, addYears, isBefore, startOfDay } from 'date-fns';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ArrowLeft, CheckCircle2, Copy, Link2, Loader2, ShoppingCart, Users } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { AppGlobalHeader } from '@/components/AppGlobalHeader';
import { PageHeading } from '@/components/PageHeading';
import { ScrollReveal } from '@/components/ScrollReveal';
import { MoneyMakerLogo } from '@/components/MoneyMakerLogo';
import { StatCard } from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

type Offer = {
  id: string;
  business_id: string;
  name: string;
  price: number;
  billing_type: 'one_time' | 'recurring';
  interval_type: 'daily' | 'weekly' | 'monthly' | 'yearly' | null;
  interval_value: number | null;
  stock_quantity: number | null;
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
  client: Client | null;
  transactions: Transaction[] | null;
};

type AggregatedClient = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  total_orders: number;
  total_paid: number;
  last_order_at: string;
  successful_payments: number;
  next_due_at: string | null;
  is_up_to_date: boolean | null;
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

const OfferClients = () => {
  const navigate = useNavigate();
  const { businessId, offerId } = useParams<{ businessId: string; offerId: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isLinkGeneratingFor, setIsLinkGeneratingFor] = useState<string | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [commandes, setCommandes] = useState<Commande[]>([]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!authLoading && user && businessId && offerId) {
      void fetchData();
    }
  }, [authLoading, user, businessId, offerId]);

  const fetchData = async () => {
    if (!businessId || !offerId) return;
    setIsLoading(true);

    try {
      const { data: offerData, error: offerError } = await supabase
        .from('offres')
        .select('id, business_id, name, price, billing_type, interval_type, interval_value, stock_quantity')
        .eq('id', offerId)
        .eq('business_id', businessId)
        .maybeSingle();

      if (offerError) throw offerError;
      if (!offerData) {
        toast({
          title: 'Offre introuvable',
          description: "Cette offre n'existe pas ou vous n'avez pas acces",
          variant: 'destructive',
        });
        navigate(`/business/${businessId}/offres`);
        return;
      }

      setOffer(offerData);

      const { data: commandesData, error: commandesError } = await supabase
        .from('commandes')
        .select(`
          id,
          status,
          type,
          total_amount,
          created_at,
          next_due_at,
          client:clients(id, name, phone, email, created_at),
          transactions(id, amount, status, method, paid_at, created_at)
        `)
        .eq('offre_id', offerId)
        .order('created_at', { ascending: false });

      if (commandesError) throw commandesError;
      setCommandes((commandesData ?? []) as unknown as Commande[]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Impossible de charger les clients de cette offre';
      toast({
        title: 'Erreur',
        description: message,
        variant: 'destructive',
      });
      navigate(`/business/${businessId}/offres`);
    } finally {
      setIsLoading(false);
    }
  };

  const aggregatedClients = useMemo(() => {
    const map = new Map<string, AggregatedClient>();
    const today = startOfDay(new Date());

    commandes.forEach((commande) => {
      if (!commande.client) return;
      const client = commande.client;
      const successTransactions = (commande.transactions ?? []).filter((transaction) => transaction.status === 'success');
      const successAmount = successTransactions.reduce((sum, transaction) => sum + Number(transaction.amount), 0);
      const successPayments = successTransactions.length;
      const latestPaymentDate =
        successTransactions.length > 0
          ? new Date(
              successTransactions
                .map((transaction) => transaction.paid_at ?? transaction.created_at)
                .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0],
            )
          : null;

      const dueDateFromCommande = commande.next_due_at ? new Date(commande.next_due_at) : null;
      const dueDateFromInterval =
        latestPaymentDate && offer?.billing_type === 'recurring'
          ? computeNextDueDate(latestPaymentDate, offer.interval_type, offer.interval_value)
          : null;
      const dueDate = dueDateFromCommande ?? dueDateFromInterval;
      const isUpToDate = offer?.billing_type === 'recurring' ? (dueDate ? !isBefore(dueDate, today) : null) : null;

      const current = map.get(client.id);
      if (!current) {
        map.set(client.id, {
          id: client.id,
          name: client.name,
          phone: client.phone,
          email: client.email,
          total_orders: 1,
          total_paid: successAmount,
          last_order_at: commande.created_at,
          successful_payments: successPayments,
          next_due_at: dueDate ? dueDate.toISOString() : null,
          is_up_to_date: isUpToDate,
        });
        return;
      }

      const isNewer = new Date(commande.created_at) > new Date(current.last_order_at);
      const currentDue = current.next_due_at ? new Date(current.next_due_at) : null;
      const keepNewDue = dueDate && (!currentDue || dueDate > currentDue);
      const nextDueAt = keepNewDue ? dueDate?.toISOString() ?? null : current.next_due_at;
      const nextIsUpToDate =
        offer?.billing_type === 'recurring'
          ? keepNewDue
            ? isUpToDate
            : current.is_up_to_date
          : null;

      map.set(client.id, {
        ...current,
        total_orders: current.total_orders + 1,
        total_paid: current.total_paid + successAmount,
        successful_payments: current.successful_payments + successPayments,
        last_order_at: isNewer ? commande.created_at : current.last_order_at,
        next_due_at: nextDueAt,
        is_up_to_date: nextIsUpToDate,
      });
    });

    return Array.from(map.values()).sort((a, b) => new Date(b.last_order_at).getTime() - new Date(a.last_order_at).getTime());
  }, [commandes, offer]);

  const totalPaid = useMemo(
    () => commandes.flatMap((commande) => commande.transactions ?? []).filter((tx) => tx.status === 'success').reduce((sum, tx) => sum + Number(tx.amount), 0),
    [commandes],
  );
  const compliantCount = useMemo(
    () => aggregatedClients.filter((client) => client.is_up_to_date === true).length,
    [aggregatedClients],
  );

  const buildPublicPaymentLink = (token: string) => {
    return `${window.location.origin}/payer/${token}`;
  };

  const handleGeneratePersonalLink = async (clientId: string) => {
    if (!offer) return;

    setIsLinkGeneratingFor(clientId);

    const { data, error } = await supabase.rpc(
      'create_personal_payment_link' as never,
      {
        _offre_id: offer.id,
        _client_id: clientId,
        _expires_at: null,
        _max_uses: 1,
      } as never,
    );

    setIsLinkGeneratingFor(null);

    if (error) {
      toast({
        title: 'Erreur',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    const row = (Array.isArray(data) ? data[0] : data) as { token?: string } | null;
    const token = row?.token;

    if (!token) {
      toast({
        title: 'Erreur',
        description: 'Token du lien introuvable',
        variant: 'destructive',
      });
      return;
    }

    const link = buildPublicPaymentLink(token);
    await navigator.clipboard.writeText(link);

    toast({
      title: 'Lien personnel copie',
      description: 'Envoyez ce lien au client pour son prochain paiement.',
    });
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

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="absolute top-0 left-0 right-0 h-96 pointer-events-none" style={{ background: 'var(--gradient-hero)' }} />
      <AppGlobalHeader businessId={businessId} />

      <main className="container mx-auto max-w-7xl px-4 py-10 sm:py-12 relative space-y-10">
        <PageHeading
          breadcrumb={[
            { label: 'Mes business', to: '/business' },
            { label: 'Offres', to: `/business/${businessId}/offres` },
            { label: offer?.name ?? 'Offre' },
            { label: 'Clients' },
          ]}
          title="Clients de l'offre"
          description={offer?.name ?? 'Offre'}
          actions={(
            <>
              <Button variant="outline" size="sm" onClick={() => navigate(`/business/${businessId}/clients`)}>
                <Users className="w-4 h-4 mr-1" />
                Clients business
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate(`/business/${businessId}/offres`)}>
                <ArrowLeft className="w-4 h-4 mr-1" />
                Retour offres
              </Button>
            </>
          )}
        />

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard
            title="Clients uniques"
            value={aggregatedClients.length}
            icon={<Users className="w-6 h-6" />}
            subtitle="Clients ayant achete cette offre"
            trend={aggregatedClients.length > 0 ? 'up' : 'neutral'}
            delay={0}
          />
          <StatCard
            title="Commandes"
            value={commandes.length}
            icon={<ShoppingCart className="w-6 h-6" />}
            subtitle="Toutes les commandes de cette offre"
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
            title="Clients en regle"
            value={offer?.billing_type === 'recurring' ? compliantCount : '-'}
            icon={<CheckCircle2 className="w-6 h-6" />}
            subtitle={offer?.billing_type === 'recurring' ? `${compliantCount}/${aggregatedClients.length} a jour` : 'Non applicable (offre ponctuelle)'}
            trend={
              offer?.billing_type === 'recurring'
                ? aggregatedClients.length === 0
                  ? 'neutral'
                  : compliantCount === aggregatedClients.length
                    ? 'up'
                    : 'down'
                : 'neutral'
            }
            delay={3}
          />
        </section>

        <section className="soft-panel p-5">
          <p className="text-sm text-muted-foreground">
            Prix: <span className="text-foreground font-semibold">{Number(offer?.price ?? 0).toLocaleString()} FCFA</span> | Type:{' '}
            <span className="text-foreground font-semibold">{offer?.billing_type === 'recurring' ? 'Recurrente' : 'Ponctuelle'}</span> | Quantite:{' '}
            <span className="text-foreground font-semibold">{offer?.stock_quantity === null ? 'Illimitee' : offer?.stock_quantity}</span>
          </p>
        </section>

        {aggregatedClients.length === 0 ? (
          <div className="soft-panel p-10 sm:p-12 text-center">
            <Users className="w-14 h-14 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Aucun client pour cette offre</h2>
            <p className="text-muted-foreground">Les clients apparaissent ici des qu'une commande est enregistree.</p>
          </div>
        ) : (
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {aggregatedClients.map((client, index) => (
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
                    <p>Derniere commande: <span className="text-foreground">{format(new Date(client.last_order_at), 'dd MMM yyyy', { locale: fr })}</span></p>
                    <p>Paiements confirmes: <span className="text-foreground">{client.successful_payments}</span></p>
                    {offer?.billing_type === 'recurring' ? (
                      <>
                        <p>
                          Prochain paiement:{' '}
                          <span className="text-foreground">
                            {client.next_due_at ? format(new Date(client.next_due_at), 'dd MMM yyyy', { locale: fr }) : 'Non calcule'}
                          </span>
                        </p>
                        <p>
                          Statut:{' '}
                          <span
                            className={
                              client.is_up_to_date === true
                                ? 'text-primary font-semibold'
                                : client.is_up_to_date === false
                                  ? 'text-destructive font-semibold'
                                  : 'text-muted-foreground font-semibold'
                            }
                          >
                            {client.is_up_to_date === true ? 'En regle' : client.is_up_to_date === false ? 'En retard' : 'Non calcule'}
                          </span>
                        </p>
                      </>
                    ) : null}
                  </div>

                  <div className="mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => handleGeneratePersonalLink(client.id)}
                      disabled={isLinkGeneratingFor === client.id}
                    >
                      {isLinkGeneratingFor === client.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link2 className="w-4 h-4 mr-2" />}
                      Lien personnel
                      <Copy className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </article>
              </ScrollReveal>
            ))}
          </section>
        )}
      </main>
    </div>
  );
};

export default OfferClients;
