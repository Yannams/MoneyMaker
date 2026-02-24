import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Building2, LogOut, Menu, ShoppingCart, Users } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { MoneyMakerLogo } from '@/components/MoneyMakerLogo';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

type AppGlobalHeaderProps = {
  businessId?: string;
};

export const AppGlobalHeader = ({ businessId }: AppGlobalHeaderProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const businessBasePath = businessId ? `/business/${businessId}` : null;

  const navState = useMemo(() => {
    const pathname = location.pathname;
    const segments = pathname.split('/').filter(Boolean);
    const isBusinessPage = pathname === '/business';
    const isOffersPage = businessBasePath ? pathname === `${businessBasePath}/offres` : false;
    const isOfferClientsPage = businessId
      ? segments[0] === 'business' &&
        segments[1] === businessId &&
        segments[2] === 'offres' &&
        segments[4] === 'clients'
      : false;
    const isBusinessClientsPage = businessBasePath ? pathname === `${businessBasePath}/clients` : false;

    return {
      isBusinessPage,
      isOffersPage,
      isClientsPage: isBusinessClientsPage || isOfferClientsPage,
    };
  }, [businessBasePath, businessId, location.pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/90 backdrop-blur-md">
      <div className="container mx-auto max-w-7xl px-4 py-3 sm:py-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
              <MoneyMakerLogo className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-semibold text-foreground">MoneyMaker</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">Espace business</p>
            </div>
          </div>

          <div className="hidden md:block">
            <Button variant="outline" size="sm" onClick={handleSignOut} className="shrink-0">
              <LogOut className="w-4 h-4 mr-1" />
              Deconnexion
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
                  <SheetTitle>Navigation</SheetTitle>
                </SheetHeader>

                <div className="mt-8 space-y-2">
                  <SheetClose asChild>
                    <Button
                      variant="outline"
                      className={`w-full justify-start ${navState.isBusinessPage ? 'bg-primary/15 border-primary/40 text-primary' : 'bg-card/60'}`}
                      onClick={() => navigate('/business')}
                    >
                      <Building2 className="w-4 h-4 mr-2" />
                      Mes business
                    </Button>
                  </SheetClose>

                  {businessId ? (
                    <>
                      <SheetClose asChild>
                        <Button
                          variant="outline"
                          className={`w-full justify-start ${navState.isOffersPage ? 'bg-primary/15 border-primary/40 text-primary' : 'bg-card/60'}`}
                          onClick={() => navigate(`/business/${businessId}/offres`)}
                        >
                          <ShoppingCart className="w-4 h-4 mr-2" />
                          Offres
                        </Button>
                      </SheetClose>
                      <SheetClose asChild>
                        <Button
                          variant="outline"
                          className={`w-full justify-start ${navState.isClientsPage ? 'bg-primary/15 border-primary/40 text-primary' : 'bg-card/60'}`}
                          onClick={() => navigate(`/business/${businessId}/clients`)}
                        >
                          <Users className="w-4 h-4 mr-2" />
                          Clients
                        </Button>
                      </SheetClose>
                    </>
                  ) : null}

                  <div className="pt-4 mt-4 border-t border-border/50">
                    <SheetClose asChild>
                      <Button variant="outline" className="w-full justify-start" onClick={handleSignOut}>
                        <LogOut className="w-4 h-4 mr-2" />
                        Deconnexion
                      </Button>
                    </SheetClose>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        <div className="-mx-1 px-1 overflow-x-auto hidden md:block">
          <div className="flex min-w-max items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className={navState.isBusinessPage ? 'bg-primary/15 border-primary/40 text-primary' : 'bg-card/60'}
              onClick={() => navigate('/business')}
            >
              <Building2 className="w-4 h-4 mr-1" />
              Mes business
            </Button>

            {businessId ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className={navState.isOffersPage ? 'bg-primary/15 border-primary/40 text-primary' : 'bg-card/60'}
                  onClick={() => navigate(`/business/${businessId}/offres`)}
                >
                  <ShoppingCart className="w-4 h-4 mr-1" />
                  Offres
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={navState.isClientsPage ? 'bg-primary/15 border-primary/40 text-primary' : 'bg-card/60'}
                  onClick={() => navigate(`/business/${businessId}/clients`)}
                >
                  <Users className="w-4 h-4 mr-1" />
                  Clients
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
};
