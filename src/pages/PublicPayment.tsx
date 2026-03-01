import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { MoneyMakerLogo } from '@/components/MoneyMakerLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

type LinkDetails = {
  offre_id: string;
  offer_name: string;
  business_name: string;
  price: number;
  billing_type: 'one_time' | 'recurring';
  interval_type: 'daily' | 'weekly' | 'monthly' | 'yearly' | null;
  interval_value: number | null;
  stock_quantity: number | null;
  linked_client_id: string | null;
  linked_client_name: string | null;
  linked_client_phone: string | null;
  linked_client_email: string | null;
  is_available: boolean;
  unavailable_reason: string | null;
};

type StartPaymentRpcRow = {
  payment_reference: string;
  client_id: string;
  commande_id: string;
  transaction_id: string;
};

type FedaPayTransaction = {
  id?: number | string;
};

type FedaPayCallbackResponse = {
  reason: number;
  transaction: FedaPayTransaction;
};

type FedaPayCheckout = {
  open: () => void;
};

type FedaPayOptions = {
  public_key: string;
  environment: string;
  transaction: {
    amount: number;
    description: string;
  };
  currency: {
    iso: string;
  };
  customer: {
    firstname: string;
    lastname: string;
    email?: string;
  };
  onComplete: (response: FedaPayCallbackResponse) => void;
};

type FedaPayGlobal = {
  CHECKOUT_COMPLETED: number;
  init: (options: FedaPayOptions) => FedaPayCheckout;
};

declare global {
  interface Window {
    FedaPay?: FedaPayGlobal;
  }
}

const PublicPayment = () => {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [details, setDetails] = useState<LinkDetails | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [manualReference, setManualReference] = useState('');

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  const loadFedaPayScript = async () => {
    if (window.FedaPay) return true;

    const existingScript = document.querySelector<HTMLScriptElement>('script[data-fedapay-checkout="true"]');
    if (existingScript) {
      return await new Promise<boolean>((resolve) => {
        existingScript.addEventListener('load', () => resolve(true), { once: true });
        existingScript.addEventListener('error', () => resolve(false), { once: true });
      });
    }

    return await new Promise<boolean>((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.fedapay.com/checkout.js?v=1.1.7';
      script.async = true;
      script.dataset.fedapayCheckout = 'true';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const fetchLinkDetails = async () => {
    if (!token) {
      setErrorMessage('Lien invalide');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const { data, error } = await supabase.rpc('get_payment_link_details' as never, { _token: token } as never);

    if (error) {
      setErrorMessage(error.message);
      setIsLoading(false);
      return;
    }

    const row = (Array.isArray(data) ? data[0] : data) as LinkDetails | null;

    if (!row) {
      setErrorMessage('Lien introuvable');
      setIsLoading(false);
      return;
    }

    setDetails(row);
    if (row.linked_client_id) {
      setCustomerName(row.linked_client_name ?? '');
      setCustomerPhone(row.linked_client_phone ?? '');
      setCustomerEmail(row.linked_client_email ?? '');
    }
    if (!row.is_available) {
      setErrorMessage(row.unavailable_reason ?? "Ce lien n'est plus disponible");
    } else {
      setErrorMessage(null);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    void fetchLinkDetails();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) return;

    const trimmedName = customerName.trim();
    const trimmedPhone = customerPhone.trim();
    const trimmedEmail = customerEmail.trim();

    if (!trimmedName || !trimmedPhone) {
      toast({
        title: 'Erreur',
        description: 'Nom et téléphone sont obligatoires',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    const { data, error } = await supabase.rpc(
      'start_payment_with_link' as never,
      {
        _token: token,
        _customer_name: trimmedName,
        _customer_phone: trimmedPhone,
        _customer_email: trimmedEmail.length > 0 ? trimmedEmail : null,
        _method: 'mobile_money',
      } as never,
    );

    setIsSubmitting(false);

    if (error) {
      toast({
        title: 'Erreur',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    const row = (Array.isArray(data) ? data[0] : data) as StartPaymentRpcRow | null;
    const reference = row?.payment_reference;

    if (!reference) {
      toast({
        title: 'Erreur',
        description: 'Référence de paiement introuvable',
        variant: 'destructive',
      });
      return;
    }

    const fedapayPublicKey = import.meta.env.VITE_FEDAPAY_PUBLIC_KEY as string | undefined;
    const fedapayEnvironment = (import.meta.env.VITE_FEDAPAY_ENVIRONMENT as string | undefined) ?? 'sandbox';

    if (!fedapayPublicKey || fedapayPublicKey.trim().length === 0) {
      setManualReference(reference);
      toast({
        title: 'Configuration FedaPay manquante',
        description: 'Ajoutez VITE_FEDAPAY_PUBLIC_KEY dans .env.development ou .env.production.',
        variant: 'destructive',
      });
      return;
    }

    const isScriptLoaded = await loadFedaPayScript();
    if (!isScriptLoaded || !window.FedaPay) {
      setManualReference(reference);
      toast({
        title: 'Erreur',
        description: 'Impossible de charger FedaPay Checkout.',
        variant: 'destructive',
      });
      return;
    }

    const customerNameParts = trimmedName.split(/\s+/);
    const firstName = customerNameParts[0] ?? trimmedName;
    const lastName = customerNameParts.slice(1).join(' ') || firstName;
    const amount = Math.round(Number(details?.price ?? 0));

    if (!Number.isFinite(amount) || amount <= 0) {
      toast({
        title: 'Erreur',
        description: 'Montant de paiement invalide.',
        variant: 'destructive',
      });
      return;
    }

    const checkout = window.FedaPay.init({
      public_key: fedapayPublicKey,
      environment: fedapayEnvironment,
      transaction: {
        amount,
        description: `${details?.offer_name ?? 'Paiement MoneyMaker'} - Ref ${reference}`,
      },
      currency: {
        iso: 'XOF',
      },
      customer: {
        firstname: firstName,
        lastname: lastName,
        ...(trimmedEmail ? { email: trimmedEmail } : {}),
      },
      onComplete: async (response: FedaPayCallbackResponse) => {
        if (response.reason !== window.FedaPay?.CHECKOUT_COMPLETED) {
          return;
        }

        const providerReference = response.transaction?.id ? String(response.transaction.id) : null;

        const { error: finalizeError } = await supabase.rpc(
          'finalize_payment_with_reference' as never,
          {
            _payment_reference: reference,
            _provider_reference: providerReference,
          } as never,
        );

        if (finalizeError) {
          toast({
            title: 'Paiement effectué mais confirmation échouée',
            description: finalizeError.message,
            variant: 'destructive',
          });
          return;
        }

        toast({
          title: 'Paiement confirmé',
          description: 'Merci, votre paiement a été pris en compte.',
        });
      },
    });

    checkout.open();
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

  return (
    <div className="min-h-screen bg-background">
      <div className="absolute top-0 left-0 right-0 h-[24rem] pointer-events-none" style={{ background: 'var(--gradient-hero)' }} />

      <main className="container mx-auto px-4 py-10 relative">
        <section className="max-w-xl mx-auto soft-panel p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
              <MoneyMakerLogo className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Paiement</h1>
              <p className="text-sm text-muted-foreground">{details?.business_name ?? 'MoneyMaker'}</p>
            </div>
          </div>

          {details ? (
            <div className="soft-subtle p-4 space-y-1">
              <p className="text-sm text-muted-foreground">Offre</p>
              <p className="text-base font-semibold text-foreground">{details.offer_name}</p>
              <p className="text-2xl font-bold text-foreground">{Number(details.price).toLocaleString()} FCFA</p>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-sm text-destructive">
              {errorMessage}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {details?.linked_client_id ? (
                <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 text-sm text-foreground">
                  Lien personnel détecté: informations client déjà remplies.
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="customer-name">Nom complet *</Label>
                <Input
                  id="customer-name"
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="Ex: Fatou Sow"
                  className="bg-secondary border-border"
                  readOnly={!!details?.linked_client_id}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="customer-phone">Téléphone *</Label>
                <Input
                  id="customer-phone"
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                  placeholder="Ex: +229 01 90 00 00 00"
                  className="bg-secondary border-border"
                  readOnly={!!details?.linked_client_id}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="customer-email">Email</Label>
                <Input
                  id="customer-email"
                  type="email"
                  value={customerEmail}
                  onChange={(event) => setCustomerEmail(event.target.value)}
                  placeholder="Ex: client@email.com"
                  className="bg-secondary border-border"
                  readOnly={!!details?.linked_client_id}
                />
              </div>

              <Button type="submit" variant="moneymaker" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Continuer vers le paiement
              </Button>
            </form>
          )}

          {manualReference ? (
            <div className="soft-subtle p-4">
              <p className="text-sm text-muted-foreground mb-2">Référence de paiement</p>
              <p className="text-sm font-mono break-all">{manualReference}</p>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
};

export default PublicPayment;
