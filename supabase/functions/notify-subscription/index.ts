import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  name: string;
  phone: string;
  email?: string;
  amount: number;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, phone, email, amount }: NotificationRequest = await req.json();
    
    const adminEmail = Deno.env.get("ADMIN_EMAIL");
    const adminWhatsapp = Deno.env.get("ADMIN_WHATSAPP");
    
    console.log("=== New MoneyMaker Access Request ===");
    console.log(`Name: ${name}`);
    console.log(`Phone: ${phone}`);
    console.log(`Email: ${email || 'N/A'}`);
    console.log(`Amount: ${amount} FCFA`);
    console.log(`Admin Email: ${adminEmail}`);
    console.log(`Admin WhatsApp: ${adminWhatsapp}`);
    
    // Build WhatsApp message
    const message = encodeURIComponent(
      `🆕 Nouvelle demande MoneyMaker!\n\n` +
      `👤 Nom: ${name}\n` +
      `📱 Téléphone: ${phone}\n` +
      `📧 Email: ${email || 'Non fourni'}\n` +
      `💰 Montant: ${amount.toLocaleString()} FCFA\n\n` +
      `Connectez-vous à l'admin pour valider ou rejeter cette demande.`
    );
    
    // WhatsApp link for the admin
    const whatsappLink = adminWhatsapp 
      ? `https://wa.me/${adminWhatsapp.replace(/[^0-9]/g, '')}?text=${message}`
      : null;
    
    console.log("WhatsApp Link:", whatsappLink);
    
    // For now, we log the notification. 
    // In production, you'd integrate with an email service like Resend
    // and/or use WhatsApp Business API
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Notification envoyée",
        whatsappLink 
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in notify-subscription:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
};

serve(handler);
