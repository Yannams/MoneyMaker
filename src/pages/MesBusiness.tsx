import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Building2, Loader2, Pencil, Plus, ShoppingCart, Trash2, Users, Wallet } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { AppGlobalHeader } from '@/components/AppGlobalHeader';
import { PageHeading } from '@/components/PageHeading';
import { ScrollReveal } from '@/components/ScrollReveal';
import { MoneyMakerLogo } from '@/components/MoneyMakerLogo';
import { StatCard } from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type Business = {
  id: string;
  businessman_id: string;
  name: string;
  description: string | null;
  created_at: string;
};

type BusinessForm = {
  name: string;
  description: string;
};

type BusinessStats = {
  offers: number;
  orders: number;
  clients: number;
  revenue: number;
};

type PortfolioStats = {
  totalOffers: number;
  totalOrders: number;
  totalClients: number;
  totalRevenue: number;
};

type OfferRow = {
  id: string;
  business_id: string;
};

type TransactionRow = {
  amount: number;
  status: 'pending' | 'success' | 'failed';
};

type CommandeRow = {
  id: string;
  offre_id: string;
  client_id: string | null;
  transactions: TransactionRow[] | null;
};

const EMPTY_PORTFOLIO_STATS: PortfolioStats = {
  totalOffers: 0,
  totalOrders: 0,
  totalClients: 0,
  totalRevenue: 0,
};

const EMPTY_BUSINESS_STATS: BusinessStats = {
  offers: 0,
  orders: 0,
  clients: 0,
  revenue: 0,
};

const MesBusiness = () => {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [businessmanId, setBusinessmanId] = useState<string | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [portfolioStats, setPortfolioStats] = useState<PortfolioStats>(EMPTY_PORTFOLIO_STATS);

  const [formOpen, setFormOpen] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState<Business | null>(null);
  const [form, setForm] = useState<BusinessForm>({ name: '', description: '' });
  const [deleteConfirm, setDeleteConfirm] = useState<Business | null>(null);

  const withTimeout = async <T,>(promise: Promise<T>, timeoutMs = 10000): Promise<T> => {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => reject(new Error('Delai depasse. Verifiez votre connexion et reessayez.')), timeoutMs);
      }),
    ]);
  };

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!authLoading && user) {
      void initializePage();
    }
  }, [authLoading, user]);

  const initializePage = async () => {
    setIsLoading(true);

    try {
      const id = await ensureBusinessmanProfile();
      if (id) {
        await fetchBusinesses(id);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Impossible de charger vos business';
      toast({
        title: 'Erreur',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const ensureBusinessmanProfile = async () => {
    if (!user) return null;

    const { data: existing, error: existingError } = await withTimeout(
      supabase.from('businessmen').select('id').eq('user_id', user.id).maybeSingle(),
    );

    if (existingError) {
      toast({
        title: 'Erreur',
        description: existingError.message,
        variant: 'destructive',
      });
      return null;
    }

    if (existing?.id) {
      setBusinessmanId(existing.id);
      return existing.id;
    }

    const metadataPhone =
      typeof user.user_metadata?.phone === 'string' && user.user_metadata.phone.trim().length > 0
        ? user.user_metadata.phone.trim()
        : '+229 0100000000';

    const { data: created, error: createError } = await withTimeout(
      supabase
        .from('businessmen')
        .insert({
          user_id: user.id,
          phone: metadataPhone,
        })
        .select('id')
        .single(),
    );

    if (createError) {
      toast({
        title: 'Erreur',
        description: createError.message,
        variant: 'destructive',
      });
      return null;
    }

    setBusinessmanId(created.id);
    return created.id;
  };

  const fetchBusinesses = async (ownerId: string) => {
    const { data, error } = await withTimeout(
      supabase
        .from('business')
        .select('*')
        .eq('businessman_id', ownerId)
        .order('created_at', { ascending: false }),
    );

    if (error) {
      toast({
        title: 'Erreur',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    const items = data ?? [];
    setBusinesses(items);
    await fetchBusinessStats(items.map((item) => item.id));
  };

  const fetchBusinessStats = async (businessIds: string[]) => {
    if (businessIds.length === 0) {
      setPortfolioStats(EMPTY_PORTFOLIO_STATS);
      return;
    }

    const initialStats = businessIds.reduce<Record<string, BusinessStats>>((acc, businessId) => {
      acc[businessId] = { ...EMPTY_BUSINESS_STATS };
      return acc;
    }, {});

    const clientsByBusiness = new Map<string, Set<string>>();
    businessIds.forEach((businessId) => clientsByBusiness.set(businessId, new Set<string>()));

    const offerToBusiness = new Map<string, string>();
    const uniqueClients = new Set<string>();

    const { data: offersData, error: offersError } = await withTimeout(
      supabase.from('offres').select('id, business_id').in('business_id', businessIds),
    );

    if (offersError) {
      toast({
        title: 'Erreur',
        description: offersError.message,
        variant: 'destructive',
      });
      return;
    }

    const offers = (offersData ?? []) as OfferRow[];
    offers.forEach((offer) => {
      offerToBusiness.set(offer.id, offer.business_id);
      if (!initialStats[offer.business_id]) {
        initialStats[offer.business_id] = { ...EMPTY_BUSINESS_STATS };
      }
      initialStats[offer.business_id].offers += 1;
    });

    if (offers.length > 0) {
      const offerIds = offers.map((offer) => offer.id);

      const { data: commandesData, error: commandesError } = await withTimeout(
        supabase
          .from('commandes')
          .select('id, offre_id, client_id, transactions(amount, status)')
          .in('offre_id', offerIds),
      );

      if (commandesError) {
        toast({
          title: 'Erreur',
          description: commandesError.message,
          variant: 'destructive',
        });
        return;
      }

      const commandes = (commandesData ?? []) as unknown as CommandeRow[];
      commandes.forEach((commande) => {
        const businessId = offerToBusiness.get(commande.offre_id);
        if (!businessId || !initialStats[businessId]) return;

        initialStats[businessId].orders += 1;

        if (commande.client_id) {
          clientsByBusiness.get(businessId)?.add(commande.client_id);
          uniqueClients.add(commande.client_id);
        }

        const successfulRevenue = (commande.transactions ?? [])
          .filter((transaction) => transaction.status === 'success')
          .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

        initialStats[businessId].revenue += successfulRevenue;
      });
    }

    Object.entries(initialStats).forEach(([businessId, stats]) => {
      stats.clients = clientsByBusiness.get(businessId)?.size ?? 0;
    });

    const nextPortfolioStats = Object.values(initialStats).reduce<PortfolioStats>(
      (acc, stats) => {
        acc.totalOffers += stats.offers;
        acc.totalOrders += stats.orders;
        acc.totalRevenue += stats.revenue;
        return acc;
      },
      { ...EMPTY_PORTFOLIO_STATS },
    );
    nextPortfolioStats.totalClients = uniqueClients.size;

    setPortfolioStats(nextPortfolioStats);
  };

  const openCreateDialog = () => {
    setEditingBusiness(null);
    setForm({ name: '', description: '' });
    setFormOpen(true);
  };

  const openEditDialog = (business: Business) => {
    setEditingBusiness(business);
    setForm({
      name: business.name,
      description: business.description ?? '',
    });
    setFormOpen(true);
  };

  const handleSaveBusiness = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = form.name.trim();
    const trimmedDescription = form.description.trim();

    if (!trimmedName) {
      toast({
        title: 'Erreur',
        description: 'Le nom du business est obligatoire',
        variant: 'destructive',
      });
      return;
    }

    if (!businessmanId) {
      toast({
        title: 'Erreur',
        description: 'Profil business non initialise',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);

    const { error } = editingBusiness
      ? await supabase
          .from('business')
          .update({
            name: trimmedName,
            description: trimmedDescription.length > 0 ? trimmedDescription : null,
          })
          .eq('id', editingBusiness.id)
      : await supabase
          .from('business')
          .insert({
            businessman_id: businessmanId,
            name: trimmedName,
            description: trimmedDescription.length > 0 ? trimmedDescription : null,
          });

    setIsSaving(false);

    if (error) {
      toast({
        title: 'Erreur',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: editingBusiness ? 'Business modifie' : 'Business cree',
      description: editingBusiness ? `${trimmedName} a ete mis a jour` : `${trimmedName} a ete ajoute`,
    });

    setFormOpen(false);
    setEditingBusiness(null);
    setForm({ name: '', description: '' });
    await fetchBusinesses(businessmanId);
  };

  const handleDeleteBusiness = async () => {
    if (!deleteConfirm || !businessmanId) return;

    const current = deleteConfirm;
    setDeleteConfirm(null);

    const { error } = await supabase.from('business').delete().eq('id', current.id);

    if (error) {
      toast({
        title: 'Erreur',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Business supprime',
      description: `${current.name} a ete retire`,
    });

    await fetchBusinesses(businessmanId);
  };

  const businessCount = useMemo(() => businesses.length, [businesses]);

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
      <AppGlobalHeader />

      <main className="container mx-auto max-w-7xl px-4 py-10 sm:py-12 relative">
        <PageHeading
          className="mb-8"
          breadcrumb={[{ label: 'Mes business' }]}
          title="Mes business"
          description="Vue portefeuille et performances"
          actions={(
            <Button variant="moneymaker" size="sm" onClick={openCreateDialog}>
              <Plus className="w-4 h-4 mr-1" />
              Creer un business
            </Button>
          )}
        />

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
          <StatCard
            title="Total business"
            value={businessCount}
            icon={<Building2 className="w-6 h-6" />}
            subtitle={businessCount > 0 ? 'Business actifs dans MoneyMaker' : 'Commencez votre premier business'}
            trend={businessCount > 0 ? 'up' : 'neutral'}
            delay={0}
          />
          <StatCard
            title="Offres totales"
            value={portfolioStats.totalOffers}
            icon={<ShoppingCart className="w-6 h-6" />}
            subtitle="Produits et services publies"
            trend={portfolioStats.totalOffers > 0 ? 'up' : 'neutral'}
            delay={1}
          />
          <StatCard
            title="Clients uniques"
            value={portfolioStats.totalClients}
            icon={<Users className="w-6 h-6" />}
            subtitle="Clients actifs sur vos business"
            trend={portfolioStats.totalClients > 0 ? 'up' : 'neutral'}
            delay={2}
          />
          <StatCard
            title="Encaisse total"
            value={`${portfolioStats.totalRevenue.toLocaleString()} FCFA`}
            icon={<Wallet className="w-6 h-6" />}
            subtitle={`${portfolioStats.totalOrders} commande(s) enregistree(s)`}
            trend={portfolioStats.totalRevenue > 0 ? 'up' : 'neutral'}
            delay={3}
          />
        </section>

        {businesses.length === 0 ? (
          <div className="soft-panel p-10 sm:p-12 text-center">
            <Building2 className="w-14 h-14 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Aucun business pour le moment</h2>
            <p className="text-muted-foreground mb-6">Creez votre premier business pour commencer votre gestion.</p>
            <Button variant="moneymaker" onClick={openCreateDialog}>
              <Plus className="w-4 h-4 mr-1" />
              Creer un business
            </Button>
          </div>
        ) : (
          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {businesses.map((business, index) => (
              <ScrollReveal key={business.id} delayMs={index * 70}>
                <article
                  className="soft-panel p-5 card-hover cursor-pointer"
                  onClick={() => navigate(`/business/${business.id}/offres`)}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">{business.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        Cree le {format(new Date(business.created_at), 'dd MMM yyyy', { locale: fr })}
                      </p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center text-primary">
                      <Building2 className="w-5 h-5" />
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground min-h-12">
                    {business.description?.trim() ? business.description : 'Aucune description pour ce business.'}
                  </p>

                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-card/60"
                      onClick={(event) => {
                        event.stopPropagation();
                        openEditDialog(business);
                      }}
                    >
                      <Pencil className="w-4 h-4 mr-1" />
                      Modifier
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteConfirm(business);
                      }}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Supprimer
                    </Button>
                  </div>
                </article>
              </ScrollReveal>
            ))}
          </section>
        )}
      </main>

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setForm({ name: '', description: '' });
            setEditingBusiness(null);
          }
        }}
      >
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">{editingBusiness ? 'Modifier le business' : 'Creer un business'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveBusiness} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="business-name">Nom du business *</Label>
              <Input
                id="business-name"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Ex: Boutique Alpha"
                className="bg-secondary border-border"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="business-description">Description</Label>
              <Textarea
                id="business-description"
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Decrivez votre activite en quelques lignes"
                className="bg-secondary border-border min-h-28"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" variant="moneymaker" disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {editingBusiness ? 'Enregistrer les modifications' : 'Creer le business'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce business ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irreversible. Le business sera supprime definitivement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBusiness}
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

export default MesBusiness;
