import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ArrowLeft, Loader2, Wallet, Clock3, CircleCheck, AlertCircle, HandCoins, XCircle } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { walletDisabled, walletDisabledMessage } from '@/lib/feature-flags';
import { AppGlobalHeader } from '@/components/AppGlobalHeader';
import { PageHeading } from '@/components/PageHeading';
import { ScrollReveal } from '@/components/ScrollReveal';
import { MoneyMakerLogo } from '@/components/MoneyMakerLogo';
import { StatCard } from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

type Business = {
  id: string;
  name: string;
};

type WalletSummary = {
  business_id: string;
  confirmed_incoming: number;
  reserved_withdrawals: number;
  total_withdrawn: number;
  available_balance: number;
  default_phone: string | null;
};

type WithdrawalStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled';

type WithdrawalRow = {
  id: string;
  amount: number;
  destination_phone: string;
  destination_name: string | null;
  status: WithdrawalStatus;
  provider_reference: string | null;
  failure_reason: string | null;
  requested_at: string;
  processed_at: string | null;
  created_at: string;
};

const DEFAULT_SUMMARY: WalletSummary = {
  business_id: '',
  confirmed_incoming: 0,
  reserved_withdrawals: 0,
  total_withdrawn: 0,
  available_balance: 0,
  default_phone: null,
};

const formatAmount = (value: number) => `${Number(value ?? 0).toLocaleString()} FCFA`;

const statusLabelMap: Record<WithdrawalStatus, string> = {
  pending: 'En attente',
  processing: 'Traitement',
  succeeded: 'Effectué',
  failed: 'Échoué',
  canceled: 'Annulé',
};

const statusClassMap: Record<WithdrawalStatus, string> = {
  pending: 'text-amber-300 bg-amber-400/10 border-amber-400/30',
  processing: 'text-blue-300 bg-blue-400/10 border-blue-400/30',
  succeeded: 'text-primary bg-primary/10 border-primary/30',
  failed: 'text-destructive bg-destructive/10 border-destructive/30',
  canceled: 'text-muted-foreground bg-secondary/40 border-border',
};

const resolveErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const candidate = (error as { message?: unknown }).message;
    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate;
  }
  return fallback;
};

const BusinessWallet = () => {
  const navigate = useNavigate();
  const { businessId } = useParams<{ businessId: string }>();
  const { user, session, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingWithdrawal, setIsCreatingWithdrawal] = useState(false);
  const [activeRowAction, setActiveRowAction] = useState<{ id: string; kind: 'retry' | 'cancel' } | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [summary, setSummary] = useState<WalletSummary>(DEFAULT_SUMMARY);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [destinationPhone, setDestinationPhone] = useState('');
  const [destinationName, setDestinationName] = useState('');

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!walletDisabled && !authLoading && user && businessId) {
      void fetchData();
    }
  }, [authLoading, user, businessId]);

  const fetchData = async () => {
    if (!businessId) return;
    setIsLoading(true);

    try {
      const [businessRes, summaryRes, withdrawalsRes] = await Promise.all([
        supabase.from('business').select('id, name').eq('id', businessId).maybeSingle(),
        supabase.rpc('get_business_wallet_summary' as never, { _business_id: businessId } as never),
        supabase.rpc('list_business_withdrawal_requests' as never, { _business_id: businessId } as never),
      ]);

      if (businessRes.error) throw businessRes.error;
      if (!businessRes.data) {
        toast({
          title: 'Business introuvable',
          description: "Ce business n'existe pas ou vous n'avez pas accès",
          variant: 'destructive',
        });
        navigate('/business');
        return;
      }

      if (summaryRes.error) throw summaryRes.error;
      if (withdrawalsRes.error) throw withdrawalsRes.error;

      setBusiness(businessRes.data);

      const summaryRow = (Array.isArray(summaryRes.data) ? summaryRes.data[0] : summaryRes.data) as WalletSummary | null;
      const parsedSummary = summaryRow ?? { ...DEFAULT_SUMMARY, business_id: businessId };
      setSummary(parsedSummary);

      const rows = (withdrawalsRes.data ?? []) as unknown as WithdrawalRow[];
      setWithdrawals(rows);

      if (!dialogOpen) {
        setDestinationPhone(parsedSummary.default_phone ?? '');
      }
    } catch (error: unknown) {
      const rawMessage = resolveErrorMessage(error, 'Impossible de charger le portefeuille');
      const message =
        rawMessage.includes('get_business_wallet_summary') || rawMessage.includes('list_business_withdrawal_requests')
          ? 'Migration portefeuille non appliquée. Lancez: supabase db push'
          : rawMessage;
      toast({
        title: 'Erreur',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const pendingCount = useMemo(() => withdrawals.filter((row) => row.status === 'pending' || row.status === 'processing').length, [withdrawals]);
  const failedCount = useMemo(() => withdrawals.filter((row) => row.status === 'failed').length, [withdrawals]);

  const openDialog = () => {
    if (walletDisabled) {
      toast({
        title: 'Fonction indisponible',
        description: walletDisabledMessage,
        variant: 'destructive',
      });
      return;
    }

    setAmount('');
    setDestinationPhone(summary.default_phone ?? '');
    setDestinationName('');
    setDialogOpen(true);
  };

  const processWithdrawal = async (withdrawalId: string) => {
    // Read a live session before each call to avoid sending stale JWTs.
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      throw new Error(sessionError.message);
    }

    let accessToken = sessionData.session?.access_token ?? session?.access_token ?? null;
    const expiresAt = sessionData.session?.expires_at ?? session?.expires_at ?? null;
    
    if (expiresAt && expiresAt * 1000 <= Date.now() + 5000) {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        throw new Error('Session expirée. Reconnectez-vous puis relancez le retrait.');
      }
      accessToken = refreshed.session?.access_token ?? accessToken;
    }

    const isJwtLike = typeof accessToken === 'string' && accessToken.split('.').length === 3;
    if (!isJwtLike) {
      throw new Error('Token de session invalide. Déconnectez-vous puis reconnectez-vous.');
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

    if (!supabaseUrl || !supabasePublishableKey) {
      throw new Error('Configuration Supabase manquante dans .env.development ou .env.production');
    }

    const functionsBaseUrl = supabaseUrl.replace('.supabase.co', '.functions.supabase.co');
    const response = await fetch(`${functionsBaseUrl}/process-withdrawal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabasePublishableKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        withdrawal_id: withdrawalId,
      }),
    });

    const payload = (await response.json().catch(() => null)) as { success?: boolean; error?: string; message?: string } | null;
    if (!response.ok) {
      throw new Error(payload?.error || payload?.message || `Échec HTTP ${response.status}`);
    }

    if (payload?.success === false) {
      throw new Error(payload.error || 'Échec du traitement du retrait');
    }
  };

  const handleRetryWithdrawal = async (withdrawalId: string) => {
    setActiveRowAction({ id: withdrawalId, kind: 'retry' });
    try {
      await processWithdrawal(withdrawalId);
      toast({
        title: 'Retrait relancé',
        description: 'La demande a été renvoyée vers FedaPay.',
      });
      await fetchData();
    } catch (error: unknown) {
      const message = resolveErrorMessage(error, 'Impossible de relancer ce retrait');
      toast({
        title: 'Échec relance',
        description: message,
        variant: 'destructive',
      });
      await fetchData();
    } finally {
      setActiveRowAction(null);
    }
  };

  const handleCancelWithdrawal = async (withdrawalId: string) => {
    setActiveRowAction({ id: withdrawalId, kind: 'cancel' });
    try {
      const { error } = await supabase.rpc(
        'cancel_withdrawal_request' as never,
        { _withdrawal_id: withdrawalId } as never,
      );

      if (error) throw error;

      toast({
        title: 'Retrait annulé',
        description: 'La demande de retrait a été annulée.',
      });
      await fetchData();
    } catch (error: unknown) {
      const message = resolveErrorMessage(error, "Impossible d'annuler ce retrait");
      toast({
        title: 'Échec annulation',
        description: message,
        variant: 'destructive',
      });
      await fetchData();
    } finally {
      setActiveRowAction(null);
    }
  };

  const handleCreateWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;

    const numericAmount = Number(amount);
    const phone = destinationPhone.trim();

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast({
        title: 'Erreur',
        description: 'Le montant doit être supérieur à 0',
        variant: 'destructive',
      });
      return;
    }

    if (!phone) {
      toast({
        title: 'Erreur',
        description: 'Le numéro de destination est obligatoire',
        variant: 'destructive',
      });
      return;
    }

    setIsCreatingWithdrawal(true);

    try {
      const { data, error } = await supabase.rpc(
        'create_withdrawal_request' as never,
        {
          _business_id: businessId,
          _amount: numericAmount,
          _destination_phone: phone,
          _destination_name: destinationName.trim().length > 0 ? destinationName.trim() : null,
        } as never,
      );

      if (error) throw error;

      const row = (Array.isArray(data) ? data[0] : data) as { id?: string } | null;
      const withdrawalId = row?.id;
      if (!withdrawalId) {
        throw new Error('Demande de retrait créée sans identifiant');
      }

      await processWithdrawal(withdrawalId);

      toast({
        title: 'Retrait lancé',
        description: 'La demande de retrait a été envoyée vers FedaPay.',
      });

      setDialogOpen(false);
      setAmount('');
      setDestinationName('');
      await fetchData();
    } catch (error: unknown) {
      const message = resolveErrorMessage(error, 'Impossible de lancer le retrait');
      toast({
        title: 'Erreur retrait',
        description: message,
        variant: 'destructive',
      });
      await fetchData();
    } finally {
      setIsCreatingWithdrawal(false);
    }
  };

  if (authLoading || (!walletDisabled && isLoading)) {
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

  if (walletDisabled) {
    return (
      <div className="min-h-screen bg-background">
        <div className="absolute top-0 left-0 right-0 h-96 pointer-events-none" style={{ background: 'var(--gradient-hero)' }} />
        <AppGlobalHeader businessId={businessId} />

        <main className="container mx-auto max-w-7xl px-4 py-10 sm:py-12 relative space-y-8">
          <PageHeading
            breadcrumb={[
              { label: 'Mes business', to: '/business' },
              { label: 'Portefeuille' },
            ]}
            title="Portefeuille"
            description="Fonction temporairement désactivée en production."
            actions={(
              <Button variant="outline" size="sm" onClick={() => navigate(`/business/${businessId}/offres`)}>
                <ArrowLeft className="w-4 h-4 mr-1" />
                Retour offres
              </Button>
            )}
          />

          <section className="soft-panel p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-foreground">Fonction indisponible</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Le portefeuille et les retraits sont désactivés sur l&apos;environnement de production.
            </p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="absolute top-0 left-0 right-0 h-96 pointer-events-none" style={{ background: 'var(--gradient-hero)' }} />
      <AppGlobalHeader businessId={businessId} />

      <main className="container mx-auto max-w-7xl px-4 py-10 sm:py-12 relative space-y-10">
        <PageHeading
          breadcrumb={[
            { label: 'Mes business', to: '/business' },
            { label: business?.name ?? 'Business', to: `/business/${businessId}/offres` },
            { label: 'Portefeuille' },
          ]}
          title="Portefeuille"
          description="Retirer vos encaissements vers votre compte mobile money via FedaPay."
          actions={(
            <>
              <Button variant="outline" size="sm" onClick={() => navigate(`/business/${businessId}/offres`)}>
                <ArrowLeft className="w-4 h-4 mr-1" />
                Retour offres
              </Button>
              <Button variant="moneymaker" size="sm" onClick={openDialog}>
                <HandCoins className="w-4 h-4 mr-1" />
                Retirer de l'argent
              </Button>
            </>
          )}
        />

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard
            title="Encaissements confirmés"
            value={formatAmount(summary.confirmed_incoming)}
            icon={<Wallet className="w-6 h-6" />}
            subtitle="Paiements valides sur ce business"
            trend={summary.confirmed_incoming > 0 ? 'up' : 'neutral'}
            delay={0}
          />
          <StatCard
            title="Déjà retiré"
            value={formatAmount(summary.total_withdrawn)}
            icon={<CircleCheck className="w-6 h-6" />}
            subtitle="Retraits exécutés"
            trend={summary.total_withdrawn > 0 ? 'up' : 'neutral'}
            delay={1}
          />
          <StatCard
            title="En traitement"
            value={formatAmount(summary.reserved_withdrawals)}
            icon={<Clock3 className="w-6 h-6" />}
            subtitle={`${pendingCount} retrait(s) en attente`}
            trend={summary.reserved_withdrawals > 0 ? 'neutral' : 'up'}
            delay={2}
          />
          <StatCard
            title="Solde disponible"
            value={formatAmount(summary.available_balance)}
            icon={<HandCoins className="w-6 h-6" />}
            subtitle="Montant retirable maintenant"
            trend={summary.available_balance > 0 ? 'up' : 'neutral'}
            delay={3}
          />
        </section>

        <section className="soft-panel p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-foreground">Historique des retraits</h2>
            {failedCount > 0 ? (
              <p className="text-xs text-destructive">{failedCount} retrait(s) ont échoué. Vous pouvez relancer une nouvelle demande.</p>
            ) : null}
          </div>

          {withdrawals.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun retrait pour ce business.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {withdrawals.map((row, index) => (
                <ScrollReveal key={row.id} delayMs={index * 60}>
                  <article className="soft-subtle p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-base font-semibold text-foreground">{formatAmount(Number(row.amount))}</p>
                      <span className={`text-xs px-2 py-1 rounded-full border ${statusClassMap[row.status]}`}>
                        {statusLabelMap[row.status]}
                      </span>
                    </div>

                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>
                        Destination: <span className="text-foreground">{row.destination_phone}</span>
                      </p>
                      {row.destination_name ? (
                        <p>
                          Bénéficiaire: <span className="text-foreground">{row.destination_name}</span>
                        </p>
                      ) : null}
                      <p>
                        Demande: <span className="text-foreground">{format(new Date(row.requested_at), 'dd MMM yyyy HH:mm', { locale: fr })}</span>
                      </p>
                      {row.processed_at ? (
                        <p>
                          Traité: <span className="text-foreground">{format(new Date(row.processed_at), 'dd MMM yyyy HH:mm', { locale: fr })}</span>
                        </p>
                      ) : null}
                      {row.provider_reference ? (
                        <p className="break-all">
                          Ref FedaPay: <span className="text-foreground">{row.provider_reference}</span>
                        </p>
                      ) : null}
                    </div>

                    {row.failure_reason ? (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive flex items-start gap-2">
                        <AlertCircle className="w-3.5 h-3.5 mt-0.5" />
                        <span>{row.failure_reason}</span>
                      </div>
                    ) : null}

                    {(row.status === 'pending' || row.status === 'failed') ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          disabled={!!activeRowAction || isCreatingWithdrawal}
                          onClick={() => void handleRetryWithdrawal(row.id)}
                        >
                          {activeRowAction?.id === row.id && activeRowAction.kind === 'retry' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                          Relancer
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-destructive hover:bg-destructive/10"
                          disabled={!!activeRowAction || isCreatingWithdrawal}
                          onClick={() => void handleCancelWithdrawal(row.id)}
                        >
                          {activeRowAction?.id === row.id && activeRowAction.kind === 'cancel' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                          Annuler
                        </Button>
                      </div>
                    ) : null}
                  </article>
                </ScrollReveal>
              ))}
            </div>
          )}
        </section>
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Nouveau retrait</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateWithdrawal} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="withdrawal-amount">Montant (FCFA) *</Label>
              <Input
                id="withdrawal-amount"
                type="number"
                min={1}
                step="1"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder={`Max: ${Math.floor(summary.available_balance).toLocaleString()}`}
                className="bg-secondary border-border"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="withdrawal-phone">Numéro mobile money *</Label>
              <Input
                id="withdrawal-phone"
                value={destinationPhone}
                onChange={(event) => setDestinationPhone(event.target.value)}
                placeholder="+229 01 00 00 00 00"
                className="bg-secondary border-border"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="withdrawal-name">Nom bénéficiaire (optionnel)</Label>
              <Input
                id="withdrawal-name"
                value={destinationName}
                onChange={(event) => setDestinationName(event.target.value)}
                placeholder="Ex: Yann Amoussou"
                className="bg-secondary border-border"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Solde disponible: <span className="text-foreground font-semibold">{formatAmount(summary.available_balance)}</span>
            </p>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" variant="moneymaker" disabled={isCreatingWithdrawal || !!activeRowAction}>
                {isCreatingWithdrawal ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Lancer le retrait
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BusinessWallet;
