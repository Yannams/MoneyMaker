import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  ArrowLeft,
  Building2,
  CheckCircle,
  Copy,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Tag,
  Trash2,
  Users,
  XCircle,
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
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  name: string;
  description: string | null;
};

type BillingType = 'one_time' | 'recurring';
type IntervalType = 'daily' | 'weekly' | 'monthly' | 'yearly';

type Offer = {
  id: string;
  business_id: string;
  name: string;
  price: number;
  stock_quantity: number | null;
  billing_type: BillingType;
  interval_type: IntervalType | null;
  interval_value: number | null;
  active: boolean;
  created_at: string;
};

type OfferForm = {
  name: string;
  price: string;
  stock_quantity: string;
  billing_type: BillingType;
  interval_type: IntervalType;
  interval_value: string;
  active: 'active' | 'inactive';
};

type PaymentLinkRpcRow = {
  token: string;
};

const getIntervalLabel = (intervalType: Offer['interval_type']) => {
  if (intervalType === 'daily') return 'jour';
  if (intervalType === 'weekly') return 'semaine';
  if (intervalType === 'monthly') return 'mois';
  if (intervalType === 'yearly') return 'an';
  return '';
};

const MesOffres = () => {
  const navigate = useNavigate();
  const { businessId } = useParams<{ businessId: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [business, setBusiness] = useState<Business | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);
  const [form, setForm] = useState<OfferForm>({
    name: '',
    price: '',
    stock_quantity: '',
    billing_type: 'one_time',
    interval_type: 'monthly',
    interval_value: '1',
    active: 'active',
  });

  const [deleteConfirm, setDeleteConfirm] = useState<Offer | null>(null);
  const [linkFormOpen, setLinkFormOpen] = useState(false);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [selectedOfferForLink, setSelectedOfferForLink] = useState<Offer | null>(null);
  const [generatedPaymentLink, setGeneratedPaymentLink] = useState('');

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
      const [businessRes, offersRes] = await Promise.all([
        supabase.from('business').select('id, name, description').eq('id', businessId).maybeSingle(),
        supabase.from('offres').select('*').eq('business_id', businessId).order('created_at', { ascending: false }),
      ]);

      if (businessRes.error) throw businessRes.error;
      if (offersRes.error) throw offersRes.error;

      if (!businessRes.data) {
        toast({
          title: 'Business introuvable',
          description: "Ce business n'existe pas ou vous n'avez pas acces",
          variant: 'destructive',
        });
        navigate('/business');
        return;
      }

      setBusiness(businessRes.data);
      setOffers((offersRes.data ?? []) as Offer[]);
    } catch (error: any) {
      toast({
        title: 'Erreur',
        description: error.message ?? 'Impossible de charger les offres',
        variant: 'destructive',
      });
      navigate('/business');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setForm({
      name: '',
      price: '',
      stock_quantity: '',
      billing_type: 'one_time',
      interval_type: 'monthly',
      interval_value: '1',
      active: 'active',
    });
    setEditingOffer(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEditDialog = (offer: Offer) => {
    setEditingOffer(offer);
    setForm({
      name: offer.name,
      price: String(offer.price),
      stock_quantity: offer.stock_quantity === null ? '' : String(offer.stock_quantity),
      billing_type: offer.billing_type,
      interval_type: offer.interval_type ?? 'monthly',
      interval_value: String(offer.interval_value ?? 1),
      active: offer.active ? 'active' : 'inactive',
    });
    setFormOpen(true);
  };

  const handleSaveOffer = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!businessId) return;

    const name = form.name.trim();
    const priceValue = Number(form.price);
    const stockQuantityValue = form.stock_quantity.trim() === '' ? null : Number(form.stock_quantity);
    const intervalValue = Number(form.interval_value);
    const isRecurring = form.billing_type === 'recurring';

    if (!name) {
      toast({
        title: 'Erreur',
        description: "Le nom de l'offre est obligatoire",
        variant: 'destructive',
      });
      return;
    }

    if (!Number.isFinite(priceValue) || priceValue < 0) {
      toast({
        title: 'Erreur',
        description: 'Le prix doit etre un nombre valide superieur ou egal a 0',
        variant: 'destructive',
      });
      return;
    }

    if (
      stockQuantityValue !== null &&
      (!Number.isFinite(stockQuantityValue) || !Number.isInteger(stockQuantityValue) || stockQuantityValue < 0)
    ) {
      toast({
        title: 'Erreur',
        description: 'La quantite doit etre un entier superieur ou egal a 0',
        variant: 'destructive',
      });
      return;
    }

    if (isRecurring && (!Number.isFinite(intervalValue) || intervalValue <= 0)) {
      toast({
        title: 'Erreur',
        description: "La frequence de l'offre recurrente doit etre superieure a 0",
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);

    const payload = {
      business_id: businessId,
      name,
      price: priceValue,
      stock_quantity: stockQuantityValue,
      billing_type: form.billing_type,
      interval_type: isRecurring ? form.interval_type : null,
      interval_value: isRecurring ? intervalValue : null,
      active: form.active === 'active',
    };

    if (editingOffer) {
      const { error } = await supabase.from('offres').update(payload).eq('id', editingOffer.id);
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
        title: 'Offre modifiee',
        description: `${name} a ete mise a jour`,
      });
    } else {
      const { error } = await supabase.from('offres').insert(payload);
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
        title: 'Offre creee',
        description: `${name} a ete ajoutee`,
      });
    }

    setFormOpen(false);
    resetForm();
    await fetchData();
  };

  const handleDeleteOffer = async () => {
    if (!deleteConfirm) return;
    const current = deleteConfirm;
    setDeleteConfirm(null);

    const { error } = await supabase.from('offres').delete().eq('id', current.id);
    if (error) {
      toast({
        title: 'Erreur',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Offre supprimee',
      description: `${current.name} a ete retiree`,
    });

    await fetchData();
  };

  const resetLinkForm = () => {
    setGeneratedPaymentLink('');
    setSelectedOfferForLink(null);
  };

  const openLinkDialog = (offer: Offer) => {
    setSelectedOfferForLink(offer);
    setGeneratedPaymentLink('');
    setLinkFormOpen(true);
  };

  const buildPublicPaymentLink = (token: string) => {
    return `${window.location.origin}/payer/${token}`;
  };

  const handleGeneratePaymentLink = async () => {
    if (!selectedOfferForLink) return;

    setIsGeneratingLink(true);

    const { data, error } = await supabase.rpc(
      'create_payment_link' as never,
      {
        _offre_id: selectedOfferForLink.id,
        _expires_at: null,
        _max_uses: null,
      } as never,
    );

    setIsGeneratingLink(false);

    if (error) {
      toast({
        title: 'Erreur',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    const row = (Array.isArray(data) ? data[0] : data) as PaymentLinkRpcRow | null;
    const token = row?.token;

    if (!token) {
      toast({
        title: 'Erreur',
        description: 'Token de paiement introuvable',
        variant: 'destructive',
      });
      return;
    }

    const paymentLink = buildPublicPaymentLink(token);
    setGeneratedPaymentLink(paymentLink);

    try {
      await navigator.clipboard.writeText(paymentLink);
    } catch (_error) {
      // Clipboard may be unavailable on some browsers.
    }

    toast({
      title: 'Lien de paiement genere',
      description: 'Lien copie. Le client completera ses informations avant redirection vers le paiement.',
    });
  };

  const activeCount = useMemo(() => offers.filter((offer) => offer.active).length, [offers]);
  const recurringCount = useMemo(() => offers.filter((offer) => offer.billing_type === 'recurring').length, [offers]);

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

      <main className="container mx-auto max-w-7xl px-4 py-10 sm:py-12 relative">
        <PageHeading
          className="mb-8"
          breadcrumb={[
            { label: 'Mes business', to: '/business' },
            { label: business?.name ?? 'Business' },
            { label: 'Offres' },
          ]}
          title="Mes offres"
          description={business?.name ?? 'Business'}
          actions={(
            <>
              <Button variant="moneymaker" size="sm" onClick={openCreateDialog}>
                <Plus className="w-4 h-4 mr-1" />
                Creer une offre
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate('/business')}>
                <ArrowLeft className="w-4 h-4 mr-1" />
                Retour business
              </Button>
            </>
          )}
        />

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
          <StatCard
            title="Total offres"
            value={offers.length}
            icon={<Tag className="w-6 h-6" />}
            subtitle="Toutes les offres du business"
            trend={offers.length > 0 ? 'up' : 'neutral'}
            delay={0}
          />
          <StatCard
            title="Offres actives"
            value={activeCount}
            icon={<CheckCircle className="w-6 h-6" />}
            subtitle={activeCount > 0 ? 'Disponibles a la vente' : 'Aucune offre active'}
            trend={activeCount > 0 ? 'up' : 'down'}
            delay={1}
          />
          <StatCard
            title="Offres recurrentes"
            value={recurringCount}
            icon={<Building2 className="w-6 h-6" />}
            subtitle="Abonnements ou facturation cyclique"
            trend={recurringCount > 0 ? 'up' : 'neutral'}
            delay={2}
          />
        </section>

        {offers.length === 0 ? (
          <div className="soft-panel p-10 sm:p-12 text-center">
            <Tag className="w-14 h-14 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Aucune offre pour ce business</h2>
            <p className="text-muted-foreground mb-6">Creez votre premiere offre pour ce business.</p>
            <Button variant="moneymaker" onClick={openCreateDialog}>
              <Plus className="w-4 h-4 mr-1" />
              Creer une offre
            </Button>
          </div>
        ) : (
          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {offers.map((offer, index) => (
              <ScrollReveal key={offer.id} delayMs={index * 70}>
                <article className="soft-panel p-5 card-hover">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">{offer.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        Creee le {format(new Date(offer.created_at), 'dd MMM yyyy', { locale: fr })}
                      </p>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        offer.active ? 'bg-primary/20 text-primary' : 'bg-destructive/20 text-destructive'
                      }`}
                    >
                      {offer.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <p className="text-2xl font-bold text-foreground">{offer.price.toLocaleString()} FCFA</p>
                    <p className="text-sm text-muted-foreground">
                      Quantite: {offer.stock_quantity === null ? 'Illimitee' : `${offer.stock_quantity} disponible(s)`}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Type: {offer.billing_type === 'one_time' ? 'Ponctuelle' : 'Recurrente'}
                    </p>

                    {offer.billing_type === 'recurring' ? (
                      <p className="text-sm text-muted-foreground">
                        Intervalle: tous les {offer.interval_value ?? 1} {getIntervalLabel(offer.interval_type)}
                        {(offer.interval_value ?? 1) > 1 ? 's' : ''}
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-4 text-xs text-muted-foreground flex items-center gap-1">
                    {offer.active ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    {offer.active ? 'Offre visible pour les clients' : 'Offre non visible pour les clients'}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" className="bg-card/60" onClick={() => openEditDialog(offer)}>
                      <Pencil className="w-4 h-4 mr-1" />
                      Modifier
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openLinkDialog(offer)}>
                      <Link2 className="w-4 h-4 mr-1" />
                      Lien client
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => navigate(`/business/${businessId}/offres/${offer.id}/clients`)}>
                      <Users className="w-4 h-4 mr-1" />
                      Clients
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteConfirm(offer)}
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
          if (!open) resetForm();
        }}
      >
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">{editingOffer ? "Modifier l'offre" : 'Creer une offre'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveOffer} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="offer-name">Nom de l'offre *</Label>
              <Input
                id="offer-name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Ex: Abonnement Premium"
                className="bg-secondary border-border"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="offer-price">Prix (FCFA) *</Label>
              <Input
                id="offer-price"
                type="number"
                min={0}
                step="1"
                value={form.price}
                onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))}
                placeholder="Ex: 15000"
                className="bg-secondary border-border"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="offer-stock-quantity">Quantite disponible</Label>
              <Input
                id="offer-stock-quantity"
                type="number"
                min={0}
                step="1"
                value={form.stock_quantity}
                onChange={(event) => setForm((prev) => ({ ...prev, stock_quantity: event.target.value }))}
                placeholder="Ex: 5 (laisser vide pour illimite)"
                className="bg-secondary border-border"
              />
            </div>

            <div className="space-y-2">
              <Label>Type de facturation *</Label>
              <Select
                value={form.billing_type}
                onValueChange={(value: BillingType) => setForm((prev) => ({ ...prev, billing_type: value }))}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_time">Ponctuelle</SelectItem>
                  <SelectItem value="recurring">Recurrente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.billing_type === 'recurring' ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Intervalle *</Label>
                  <Select
                    value={form.interval_type}
                    onValueChange={(value: IntervalType) => setForm((prev) => ({ ...prev, interval_type: value }))}
                  >
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Jour</SelectItem>
                      <SelectItem value="weekly">Semaine</SelectItem>
                      <SelectItem value="monthly">Mois</SelectItem>
                      <SelectItem value="yearly">An</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="offer-interval-value">Frequence *</Label>
                  <Input
                    id="offer-interval-value"
                    type="number"
                    min={1}
                    step="1"
                    value={form.interval_value}
                    onChange={(event) => setForm((prev) => ({ ...prev, interval_value: event.target.value }))}
                    className="bg-secondary border-border"
                    required
                  />
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>Statut</Label>
              <Select
                value={form.active}
                onValueChange={(value: 'active' | 'inactive') => setForm((prev) => ({ ...prev, active: value }))}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" variant="moneymaker" disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {editingOffer ? 'Enregistrer les modifications' : "Creer l'offre"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={linkFormOpen}
        onOpenChange={(open) => {
          setLinkFormOpen(open);
          if (!open) resetLinkForm();
        }}
      >
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Generer un lien client
              {selectedOfferForLink ? ` - ${selectedOfferForLink.name}` : ''}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Ce lien ouvre un mini formulaire MoneyMaker. Le client renseigne ses informations, puis est redirige vers l'agregateur.
            </p>

            {generatedPaymentLink ? (
              <div className="space-y-2">
                <Label htmlFor="generated-payment-link">Lien genere</Label>
                <div className="flex gap-2">
                  <Input id="generated-payment-link" value={generatedPaymentLink} readOnly className="bg-secondary border-border" />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      await navigator.clipboard.writeText(generatedPaymentLink);
                      toast({
                        title: 'Lien copie',
                        description: 'Le lien de paiement est dans le presse-papiers',
                      });
                    }}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ) : null}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setLinkFormOpen(false)}>
                Fermer
              </Button>
              <Button type="button" variant="moneymaker" disabled={isGeneratingLink} onClick={handleGeneratePaymentLink}>
                {isGeneratingLink ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Generer le lien
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette offre ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irreversible. L'offre sera supprimee definitivement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteOffer}
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

export default MesOffres;
