import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import MesBusiness from "./pages/MesBusiness";
import MesOffres from "./pages/MesOffres";
import BusinessClients from "./pages/BusinessClients";
import OfferClients from "./pages/OfferClients";
import PublicPayment from "./pages/PublicPayment";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/business" element={<MesBusiness />} />
            <Route path="/business/:businessId/offres" element={<MesOffres />} />
            <Route path="/business/:businessId/clients" element={<BusinessClients />} />
            <Route path="/business/:businessId/offres/:offerId/clients" element={<OfferClients />} />
            <Route path="/payer/:token" element={<PublicPayment />} />
            <Route path="/member" element={<Navigate to="/business" replace />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
