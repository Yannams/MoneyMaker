import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { MoneyMakerLogo } from '@/components/MoneyMakerLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';

const loginSchema = z.object({
  email: z.string().trim().email({ message: 'Email invalide' }),
  password: z.string().min(6, { message: 'Le mot de passe doit avoir au moins 6 caracteres' }),
});

const signupSchema = z.object({
  name: z.string().trim().min(2, { message: 'Le nom doit avoir au moins 2 caracteres' }),
  phone: z.string().trim().min(8, { message: 'Numero de telephone invalide' }),
  email: z.string().trim().email({ message: 'Email invalide' }),
  password: z.string().min(6, { message: 'Le mot de passe doit avoir au moins 6 caracteres' }),
});

const Auth = () => {
  const navigate = useNavigate();
  const { signIn, signUp, user, isAdmin, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [signupData, setSignupData] = useState({ name: '', phone: '', email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!authLoading && user) {
      navigate(isAdmin ? '/admin' : '/business');
    }
  }, [authLoading, user, isAdmin, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
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
        title: 'Connexion reussie',
        description: 'Bienvenue !',
      });
    } catch (error: any) {
      toast({
        title: 'Erreur reseau',
        description: error?.message ?? 'Connexion impossible. Verifiez votre reseau et reessayez.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
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
      const { error } = await signUp(signupData.email, signupData.password, signupData.name, signupData.phone);

      if (error) {
        if (error.message.includes('already registered')) {
          toast({
            title: 'Compte existant',
            description: 'Un compte avec cet email existe deja. Connectez-vous.',
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
        title: 'Inscription reussie',
        description: 'Bienvenue sur MoneyMaker !',
      });
    } catch (error: any) {
      toast({
        title: 'Erreur reseau',
        description: error?.message ?? 'Inscription impossible. Verifiez votre reseau et reessayez.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

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
            <p className="text-muted-foreground">Gerez votre business simplement</p>
          </div>
        </div>

        <div className="soft-panel p-6">
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
                  <Label htmlFor="signup-phone">Telephone</Label>
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

                <Button type="submit" variant="moneymaker" className="w-full" disabled={isLoading}>
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  S'inscrire
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
