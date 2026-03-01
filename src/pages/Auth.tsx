import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { MoneyMakerLogo } from '@/components/MoneyMakerLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';

const loginSchema = z.object({
  email: z.string().trim().email({ message: 'Email invalide' }),
  password: z.string().min(6, { message: 'Le mot de passe doit avoir au moins 6 caractères' }),
});

const signupSchema = z.object({
  name: z.string().trim().min(2, { message: 'Le nom doit avoir au moins 2 caractères' }),
  phone: z.string().trim().min(8, { message: 'Numéro de téléphone invalide' }),
  email: z.string().trim().email({ message: 'Email invalide' }),
  password: z.string().min(6, { message: 'Le mot de passe doit avoir au moins 6 caractères' }),
  acceptBeta: z.boolean().refine((value) => value === true, {
    message: 'Vous devez accepter les conditions de la phase de test',
  }),
});

type BetaStatus = {
  max_users: number;
  current_users: number;
  remaining_slots: number;
  is_open: boolean;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const candidate = (error as { message?: unknown }).message;
    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate;
  }
  return fallback;
};

const Auth = () => {
  const navigate = useNavigate();
  const { signIn, signUp, user, isAdmin, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [signupData, setSignupData] = useState({ name: '', phone: '', email: '', password: '', acceptBeta: false });
  const [betaStatus, setBetaStatus] = useState<BetaStatus | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const betaCounterText = betaStatus
    ? `${betaStatus.remaining_slots}/${betaStatus.max_users} places de test restantes`
    : 'Chargement des places de test...';

  useEffect(() => {
    if (!authLoading && user) {
      navigate(isAdmin ? '/admin' : '/business');
    }
  }, [authLoading, user, isAdmin, navigate]);

  useEffect(() => {
    const fetchBetaStatus = async () => {
      const { data, error } = await supabase.rpc('get_signup_beta_status' as never);
      if (error) return;
      const row = (Array.isArray(data) ? data[0] : data) as BetaStatus | null;
      if (row) {
        setBetaStatus(row);
      }
    };

    void fetchBetaStatus();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authLoading || user) return;
    setErrors({});

    const result = loginSchema.safeParse(loginData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await signIn(loginData.email, loginData.password);

      if (error) {
        toast({
          title: 'Erreur de connexion',
          description: error.message === 'Invalid login credentials' ? 'Email ou mot de passe incorrect' : error.message,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Connexion réussie',
        description: 'Bienvenue !',
      });
    } catch (error: unknown) {
      toast({
        title: 'Erreur réseau',
        description: getErrorMessage(error, 'Connexion impossible. Vérifiez votre réseau et réessayez.'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authLoading || user) return;
    setErrors({});

    const result = signupSchema.safeParse(signupData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    setIsLoading(true);
    try {
      if (betaStatus && !betaStatus.is_open) {
        toast({
          title: 'Phase de test complète',
          description: 'La phase de test est limitée à 10 utilisateurs.',
          variant: 'destructive',
        });
        return;
      }

      const { error } = await signUp(signupData.email, signupData.password, signupData.name, signupData.phone);

      if (error) {
        const errorMessage = String(error.message ?? '');
        if (error.message.includes('already registered')) {
          toast({
            title: 'Compte existant',
            description: 'Un compte avec cet email existe déjà. Connectez-vous.',
            variant: 'destructive',
          });
        } else if (errorMessage.toLowerCase().includes('phase de test') || errorMessage.toLowerCase().includes('database error saving new user')) {
          toast({
            title: 'Phase de test complète',
            description: 'La phase de test est limitée à 10 utilisateurs.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: "Erreur d'inscription",
            description: error.message,
            variant: 'destructive',
          });
        }
        return;
      }

      toast({
        title: 'Inscription réussie',
        description: "Votre inscription est presque terminée. Consultez votre boîte mail pour valider votre adresse email et activer votre compte.",
      });
    } catch (error: unknown) {
      toast({
        title: 'Erreur réseau',
        description: getErrorMessage(error, 'Inscription impossible. Vérifiez votre réseau et réessayez.'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading || user) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="absolute top-0 left-0 right-0 h-[24rem] pointer-events-none" style={{ background: 'var(--gradient-hero)' }} />

        <div className="relative flex flex-col items-center gap-4 text-center">
          <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20">
            <MoneyMakerLogo className="w-12 h-12 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">MoneyMaker</h1>
            <p className="text-muted-foreground">
              {authLoading ? 'Vérification de la session...' : 'Session active, redirection en cours...'}
            </p>
          </div>
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="absolute top-0 left-0 right-0 h-[24rem] pointer-events-none" style={{ background: 'var(--gradient-hero)' }} />

      <div className="relative w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-4">
          <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20">
            <MoneyMakerLogo className="w-12 h-12 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">MoneyMaker</h1>
            <p className="text-muted-foreground">Gérez votre business simplement</p>
          </div>
        </div>

        <div className="soft-panel p-6">
          <div className="mb-4 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-center text-xs">
            <span className={betaStatus && !betaStatus.is_open ? 'text-destructive font-medium' : 'text-primary font-medium'}>
              {betaCounterText}
            </span>
          </div>

          <Tabs defaultValue="login" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 bg-muted/25">
              <TabsTrigger value="login">Connexion</TabsTrigger>
              <TabsTrigger value="signup">Inscription</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="votre@email.com"
                    value={loginData.email}
                    onChange={(e) => setLoginData((d) => ({ ...d, email: e.target.value }))}
                    className="bg-background/50"
                  />
                  {errors.email && <p className="text-destructive text-sm">{errors.email}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-password">Mot de passe</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={loginData.password}
                    onChange={(e) => setLoginData((d) => ({ ...d, password: e.target.value }))}
                    className="bg-background/50"
                  />
                  {errors.password && <p className="text-destructive text-sm">{errors.password}</p>}
                </div>

                <Button type="submit" variant="moneymaker" className="w-full" disabled={isLoading}>
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Se connecter
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-foreground/90 leading-relaxed">
                  En acceptant de vous inscrire, vous acceptez d'être testeur de la plateforme MoneyMaker.
                  Certaines fonctionnalités peuvent ne pas se passer comme prévu pendant cette phase bêta.
                  Nous prendrons en compte vos retours pour améliorer la plateforme.
                  {betaStatus ? (
                    <span className="block mt-2 text-primary font-medium">
                      Places restantes: {betaStatus.remaining_slots}/{betaStatus.max_users}
                    </span>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-name">Nom complet</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    placeholder="Jean Dupont"
                    value={signupData.name}
                    onChange={(e) => setSignupData((d) => ({ ...d, name: e.target.value }))}
                    className="bg-background/50"
                  />
                  {errors.name && <p className="text-destructive text-sm">{errors.name}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-phone">Téléphone</Label>
                  <Input
                    id="signup-phone"
                    type="tel"
                    placeholder="+221 XX XXX XX XX"
                    value={signupData.phone}
                    onChange={(e) => setSignupData((d) => ({ ...d, phone: e.target.value }))}
                    className="bg-background/50"
                  />
                  {errors.phone && <p className="text-destructive text-sm">{errors.phone}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="votre@email.com"
                    value={signupData.email}
                    onChange={(e) => setSignupData((d) => ({ ...d, email: e.target.value }))}
                    className="bg-background/50"
                  />
                  {errors.email && <p className="text-destructive text-sm">{errors.email}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-password">Mot de passe</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="••••••••"
                    value={signupData.password}
                    onChange={(e) => setSignupData((d) => ({ ...d, password: e.target.value }))}
                    className="bg-background/50"
                  />
                  {errors.password && <p className="text-destructive text-sm">{errors.password}</p>}
                </div>

                <div className="flex items-start gap-2">
                  <input
                    id="signup-accept-beta"
                    type="checkbox"
                    checked={signupData.acceptBeta}
                    onChange={(e) => setSignupData((d) => ({ ...d, acceptBeta: e.target.checked }))}
                    className="mt-1 h-4 w-4 rounded border-border bg-background"
                  />
                  <Label htmlFor="signup-accept-beta" className="text-xs text-muted-foreground leading-relaxed">
                    Je confirme accepter de participer à la phase de test de la plateforme.
                  </Label>
                </div>
                {errors.acceptBeta && <p className="text-destructive text-sm">{errors.acceptBeta}</p>}

                <Button type="submit" variant="moneymaker" className="w-full" disabled={isLoading || (betaStatus ? !betaStatus.is_open : false)}>
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {betaStatus && !betaStatus.is_open ? 'Phase bêta complète' : "S'inscrire"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default Auth;
