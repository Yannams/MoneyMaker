import {
  ArrowRight,
  ArrowRightLeft,
  BellRing,
  BriefcaseBusiness,
  CheckCircle2,
  Link2,
  Menu,
  MessageCircle,
  PiggyBank,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

import { MoneyMakerLogo } from '@/components/MoneyMakerLogo';
import { ScrollReveal } from '@/components/ScrollReveal';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

const features = [
  {
    title: 'Espace business',
    description: 'Un espace unique pour piloter plusieurs business sans se perdre.',
    icon: BriefcaseBusiness,
  },
  {
    title: "Catalogue d'offres",
    description: 'Produits ou services, ponctuels ou récurrents, avec gestion de quantité.',
    icon: ShoppingCart,
  },
  {
    title: 'Liens de paiement',
    description: "Un lien personnel par client pour simplifier l'encaissement.",
    icon: Link2,
  },
  {
    title: 'Base clients centralisée',
    description: 'Retrouver commandes, historique et statut client dans une seule vue.',
    icon: Users,
  },
  {
    title: 'Suivi des échéances',
    description: 'Voir rapidement qui est en règle, en retard, et quand relancer.',
    icon: CheckCircle2,
  },
  {
    title: 'Flux de paiement sécurisé',
    description: 'Validation des transactions et journal clair de chaque paiement.',
    icon: ShieldCheck,
  },
];

const Landing = () => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background overflow-x-clip">
      <div className="absolute top-0 left-0 right-0 h-[34rem] pointer-events-none" style={{ background: 'var(--gradient-hero)' }} />
      <div className="pointer-events-none absolute -top-24 left-[8%] w-72 h-72 rounded-full bg-primary/10 blur-3xl animate-drift-slow" />
      <div className="pointer-events-none absolute top-52 right-[8%] w-64 h-64 rounded-full bg-primary/5 blur-3xl animate-drift-slow" style={{ animationDelay: '1.2s' }} />

      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/90 backdrop-blur-md">
        <div className="container mx-auto max-w-7xl px-4 py-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 shrink-0">
                <MoneyMakerLogo className="w-8 h-8 text-primary" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">MoneyMaker</p>
                <p className="text-xs text-muted-foreground">Système de gestion pour petit business</p>
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
              <a href="#produit" className="hover:text-foreground transition-colors">Produit</a>
              <a href="#fonctionnalites" className="hover:text-foreground transition-colors">Fonctionnalités</a>
              <a href="#roadmap" className="hover:text-foreground transition-colors">Feuille de route</a>
              <a href="#pourquoi" className="hover:text-foreground transition-colors">Pourquoi</a>
            </nav>

            <div className="hidden md:flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate('/auth')}>
                Connexion
              </Button>
              <Button variant="moneymaker" size="sm" onClick={() => navigate('/auth')}>
                Commencer
              </Button>
            </div>

            <div className="md:hidden">
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Ouvrir le menu">
                    <Menu className="w-4 h-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="bg-card border-border/60">
                  <SheetHeader>
                    <SheetTitle>Menu</SheetTitle>
                  </SheetHeader>
                  <div className="mt-8 space-y-2">
                    <SheetClose asChild>
                      <a href="#produit" className="block rounded-xl border border-border/50 bg-card/60 px-4 py-3 text-sm text-foreground">
                        Produit
                      </a>
                    </SheetClose>
                    <SheetClose asChild>
                      <a href="#fonctionnalites" className="block rounded-xl border border-border/50 bg-card/60 px-4 py-3 text-sm text-foreground">
                        Fonctionnalités
                      </a>
                    </SheetClose>
                    <SheetClose asChild>
                      <a href="#roadmap" className="block rounded-xl border border-border/50 bg-card/60 px-4 py-3 text-sm text-foreground">
                        Feuille de route
                      </a>
                    </SheetClose>
                    <SheetClose asChild>
                      <a href="#pourquoi" className="block rounded-xl border border-border/50 bg-card/60 px-4 py-3 text-sm text-foreground">
                        Pourquoi
                      </a>
                    </SheetClose>

                    <div className="pt-4 mt-4 border-t border-border/50 space-y-2">
                      <SheetClose asChild>
                        <Button variant="outline" className="w-full" onClick={() => navigate('/auth')}>
                          Connexion
                        </Button>
                      </SheetClose>
                      <SheetClose asChild>
                        <Button variant="moneymaker" className="w-full" onClick={() => navigate('/auth')}>
                          Commencer
                        </Button>
                      </SheetClose>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-7xl px-4 py-16 sm:py-24 lg:py-28 relative space-y-24 lg:space-y-28">
        <ScrollReveal delayMs={80}>
          <section id="produit" className="max-w-4xl mx-auto space-y-9 text-center">
            <div className="space-y-8 text-center">
              <div className="inline-flex items-center gap-2 text-xs px-3.5 py-1.5 rounded-full border border-primary/20 bg-primary/10 text-primary font-medium mx-auto">
                <BellRing className="w-3.5 h-3.5" />
                Construit en un weekend
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-semibold tracking-tight text-foreground leading-[1.02]">
                L'app de gestion business qui reste simple.
              </h1>

              <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
                MoneyMaker aide les petits business à gérer offres, clients, commandes et paiements dans un même workflow.
                Lance rapidement. Structure mieux. Encaisse proprement.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <Button variant="moneymaker" onClick={() => navigate('/auth')}>
                  Commencer maintenant
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Conçu pour les indépendants, petits commerces et équipes terrain.
              </p>
            </div>
          </section>
        </ScrollReveal>

        <ScrollReveal delayMs={140}>
          <section className="max-w-5xl mx-auto space-y-4">
            <div className="text-center space-y-1">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Aperçu produit</p>
              <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">Une interface orientée action</h2>
            </div>

            <article className="bg-card/70 border border-border/40 rounded-3xl p-6 sm:p-8 lg:p-10 space-y-6 shadow-[0_24px_60px_hsl(0_0%_0%_/_0.24)] backdrop-blur-xl animate-float-soft animate-glow-pulse">
              <div className="flex items-center justify-between gap-3 border-b border-border/30 pb-4">
                <p className="text-sm font-medium text-foreground">Tableau MoneyMaker</p>
                <span className="text-xs text-primary bg-primary/10 border border-primary/20 px-2 py-1 rounded-full">En direct</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="soft-subtle p-5">
                  <p className="text-xs text-muted-foreground">Encaisse</p>
                  <p className="text-xl font-semibold text-foreground mt-1">412 000 FCFA</p>
                </div>
                <div className="soft-subtle p-5">
                  <p className="text-xs text-muted-foreground">Clients actifs</p>
                  <p className="text-xl font-semibold text-foreground mt-1">86</p>
                </div>
              </div>

              <div className="soft-subtle p-5 space-y-3">
                <p className="text-xs text-muted-foreground">Actions récentes</p>
                <div className="space-y-2.5 text-sm">
                  <p className="flex items-center gap-2 text-foreground"><CheckCircle2 className="w-4 h-4 text-primary" /> Paiement confirmé - 12 000 FCFA</p>
                  <p className="flex items-center gap-2 text-foreground"><CheckCircle2 className="w-4 h-4 text-primary" /> Lien personnel envoyé à Yann</p>
                  <p className="flex items-center gap-2 text-foreground"><CheckCircle2 className="w-4 h-4 text-primary" /> Échéance récurrente calculée</p>
                </div>
              </div>
            </article>
          </section>
        </ScrollReveal>

        <ScrollReveal delayMs={200}>
          <section id="fonctionnalites" className="space-y-8">
            <div className="space-y-2 text-center">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Fonctionnalités</p>
              <h2 className="section-heading">Concentré sur ce qui fait avancer ton business</h2>
              <p className="section-caption max-w-2xl mx-auto">Une base solide, claire, et orientée exécution.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
              {features.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <ScrollReveal key={feature.title} delayMs={240 + index * 70}>
                    <article className="bg-card/70 border border-border/40 rounded-3xl p-7 card-hover backdrop-blur-sm">
                      <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center mb-6">
                        <Icon className="w-5 h-5" />
                      </div>
                      <h3 className="text-base sm:text-lg font-semibold text-foreground">{feature.title}</h3>
                      <p className="mt-2.5 text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                    </article>
                  </ScrollReveal>
                );
              })}
            </div>
          </section>
        </ScrollReveal>

        <ScrollReveal delayMs={260}>
          <section id="roadmap" className="max-w-5xl mx-auto">
            <article className="bg-card/70 border border-border/40 rounded-3xl p-8 lg:p-10 space-y-8 backdrop-blur-sm">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Feuille de route</p>
                <h3 className="text-2xl sm:text-3xl font-semibold text-foreground">Les prochaines fonctionnalités MoneyMaker</h3>
                <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-3xl">
                  Deux évolutions arrivent pour renforcer le suivi client et la maîtrise financière de chaque business.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 md:gap-3 items-stretch">
                <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5 space-y-3">
                  <div className="inline-flex items-center gap-2 text-xs px-2.5 py-1 rounded-full border border-amber-400/30 text-amber-300">
                    <MessageCircle className="w-3.5 h-3.5" />
                    À venir
                  </div>
                  <h4 className="text-base font-semibold text-foreground">Rappels automatiques WhatsApp</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Envoi automatique des rappels d'échéance, confirmations de paiement et relances clients pour réduire les retards.
                  </p>
                </div>

                <div className="hidden md:flex items-center justify-center">
                  <div className="h-full min-h-14 w-12 flex items-center justify-center">
                    <div className="w-12 h-[2px] bg-primary/40 relative">
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center justify-center w-6 h-6 rounded-full border border-primary/30 bg-primary/10 text-primary">
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-primary/30 bg-primary/10 p-5 space-y-3">
                  <div className="inline-flex items-center gap-2 text-xs px-2.5 py-1 rounded-full border border-primary/30 text-primary">
                    <PiggyBank className="w-3.5 h-3.5" />
                    À venir
                  </div>
                  <h4 className="text-base font-semibold text-foreground">Gestion de budget</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Suivi des dépenses, objectifs mensuels et alertes budget pour mieux piloter la rentabilité du business.
                  </p>
                </div>
              </div>
            </article>
          </section>
        </ScrollReveal>

        <ScrollReveal delayMs={300}>
          <section id="pourquoi" className="max-w-5xl mx-auto">
            <article className="bg-card/70 border border-border/40 rounded-3xl p-8 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Pourquoi MoneyMaker</p>
              <ul className="mt-4 space-y-3.5 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Wallet className="w-4 h-4 text-primary mt-0.5" />
                  Encaisse plus proprement avec des liens clients.
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary mt-0.5" />
                  Sache tout de suite qui est en règle ou en retard.
                </li>
                <li className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-primary mt-0.5" />
                  Passe d'un suivi artisanal à un suivi structuré.
                </li>
              </ul>
            </article>
          </section>
        </ScrollReveal>

        <ScrollReveal delayMs={340}>
          <section className="bg-card/70 border border-border/40 rounded-3xl p-8 sm:p-11 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 backdrop-blur-sm">
            <div>
              <h3 className="text-2xl font-semibold text-foreground">Prêt à lancer ton espace MoneyMaker ?</h3>
              <p className="text-sm sm:text-base text-muted-foreground mt-1">Connecte-toi et commence à structurer ton business dès aujourd'hui.</p>
            </div>
            <Button variant="moneymaker" onClick={() => navigate('/auth')}>
              Commencer
              <ArrowRight className="w-4 h-4" />
            </Button>
          </section>
        </ScrollReveal>
      </main>
    </div>
  );
};

export default Landing;
