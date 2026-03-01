import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type PrepareWithdrawalRpcRow = {
  withdrawal_id: string;
  business_id: string;
  business_name: string;
  amount: number;
  destination_phone: string;
  destination_name: string | null;
};

const getFedaPayApiBase = () => {
  const env = (Deno.env.get("FEDAPAY_ENVIRONMENT") ?? "sandbox").toLowerCase();
  return env === "live" ? "https://api.fedapay.com/v1" : "https://sandbox-api.fedapay.com/v1";
};

const toErrorMessage = (value: unknown) => {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  return "Erreur inconnue";
};

const parseFedaPayId = (payload: any): string | null => {
  const direct = payload?.id;
  if (direct !== undefined && direct !== null) return String(direct);

  const candidatePaths = [
    payload?.data?.id,
    payload?.transfer?.id,
    payload?.v1?.id,
    Array.isArray(payload?.payouts) ? payload.payouts[0]?.id : null,
    payload?.payouts?.[0]?.id,
  ];

  for (const candidate of candidatePaths) {
    if (candidate !== undefined && candidate !== null) return String(candidate);
  }

  return null;
};

const extractApiErrorMessage = (payload: any, fallback: string): string => {
  if (typeof payload?.message === "string" && payload.message.trim().length > 0) {
    return payload.message;
  }

  if (typeof payload?.error === "string" && payload.error.trim().length > 0) {
    return payload.error;
  }

  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    const first = payload.errors[0];
    if (typeof first === "string") return first;
    if (typeof first?.message === "string") return first.message;
  }

  return fallback;
};

const detectCountryCode = (phone: string): string => {
  const normalized = phone.replace(/\s+/g, "");
  if (normalized.startsWith("+229")) return "BJ";
  if (normalized.startsWith("+228")) return "TG";
  if (normalized.startsWith("+225")) return "CI";
  if (normalized.startsWith("+224")) return "GN";
  if (normalized.startsWith("+227")) return "NE";
  if (normalized.startsWith("+221")) return "SN";
  if (normalized.startsWith("+223")) return "ML";
  if (normalized.startsWith("+226")) return "BF";
  return "BJ";
};

const resolvePayoutMode = (countryCode: string): string | null => {
  const explicitMode = (Deno.env.get("FEDAPAY_PAYOUT_MODE") ?? "").trim();
  if (explicitMode.length > 0) return explicitMode;

  const countryMode = (Deno.env.get(`FEDAPAY_PAYOUT_MODE_${countryCode}`) ?? "").trim();
  if (countryMode.length > 0) return countryMode;

  const environment = (Deno.env.get("FEDAPAY_ENVIRONMENT") ?? "sandbox").toLowerCase();
  if (environment !== "live") {
    return "momo_test";
  }

  return null;
};

const extractAccessTokenFromHeader = (req: Request): string | null => {
  const authHeader = req.headers.get("Authorization") ?? "";

  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!bearerMatch) return null;
  return bearerMatch[1]?.trim() || null;
};

serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const fedapaySecretKey = Deno.env.get("FEDAPAY_SECRET_KEY");

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Configuration Supabase manquante." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!fedapaySecretKey) {
      return new Response(
        JSON.stringify({ error: "FEDAPAY_SECRET_KEY manquant." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let withdrawalId: string | null = null;
    try {
      const body = await req.json();
      withdrawalId = typeof body?.withdrawal_id === "string" ? body.withdrawal_id : null;
    } catch {
      return new Response(
        JSON.stringify({ error: "Corps de requête invalide." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const accessToken = extractAccessTokenFromHeader(req);
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "Authorization requise." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!withdrawalId) {
      return new Response(
        JSON.stringify({ error: "withdrawal_id est obligatoire." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: userData, error: userError } = await adminSupabase.auth.getUser(accessToken);
    if (userError || !userData.user) {
      return new Response(
        JSON.stringify({ error: "Session invalide. Reconnectez-vous." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const userId = userData.user.id;

    const { data: preparedData, error: prepareError } = await adminSupabase.rpc(
      "prepare_withdrawal_for_processing_by_user",
      { _withdrawal_id: withdrawalId, _user_id: userId },
    );

    if (prepareError) {
      return new Response(
        JSON.stringify({ error: prepareError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const prepared = (Array.isArray(preparedData) ? preparedData[0] : preparedData) as PrepareWithdrawalRpcRow | null;
    if (!prepared) {
      return new Response(
        JSON.stringify({ error: "Demande de retrait introuvable." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiBase = getFedaPayApiBase();
    const amount = Math.round(Number(prepared.amount));
    const customerName = prepared.destination_name?.trim() || prepared.business_name || "Client";
    const nameParts = customerName.split(/\s+/);
    const firstname = nameParts[0] || "Client";
    const lastname = nameParts.slice(1).join(" ") || firstname;

    const fedapayHeaders = {
      Authorization: `Bearer ${fedapaySecretKey}`,
      "Content-Type": "application/json",
    };

    try {
      const countryCode = detectCountryCode(prepared.destination_phone);
      const payoutMode = resolvePayoutMode(countryCode);
      if (!payoutMode) {
        throw new Error(
          `Mode payout non configuré pour ${countryCode}. Définissez FEDAPAY_PAYOUT_MODE ou FEDAPAY_PAYOUT_MODE_${countryCode}.`,
        );
      }
      const merchantReference = `MM-WDR-${prepared.withdrawal_id}`;

      const createPayload = {
        amount,
        mode: payoutMode,
        currency: { iso: "XOF" },
        description: `Retrait MoneyMaker - ${prepared.business_name}`,
        customer: {
          firstname,
          lastname,
          phone_number: {
            number: prepared.destination_phone,
            country: countryCode,
          },
        },
        merchant_reference: merchantReference,
      };

      const createPayoutResponse = await fetch(`${apiBase}/payouts`, {
        method: "POST",
        headers: fedapayHeaders,
        body: JSON.stringify(createPayload),
      });

      const createPayoutData = await createPayoutResponse.json().catch(() => null);
      if (!createPayoutResponse.ok) {
        throw new Error(
          extractApiErrorMessage(createPayoutData, "Création du payout FedaPay impossible."),
        );
      }

      const payoutId = parseFedaPayId(createPayoutData);
      if (!payoutId) {
        throw new Error("ID payout FedaPay introuvable après création.");
      }

      // API doc uses an array body for /payouts/start.
      const startPayload = [
        {
          id: Number(payoutId),
          phone_number: {
            number: prepared.destination_phone,
            country: countryCode,
          },
        },
      ];

      const startPayoutResponse = await fetch(`${apiBase}/payouts/start`, {
        method: "PUT",
        headers: fedapayHeaders,
        body: JSON.stringify(startPayload),
      });

      const startPayoutData = await startPayoutResponse.json().catch(() => null);
      if (!startPayoutResponse.ok) {
        throw new Error(
          extractApiErrorMessage(startPayoutData, "Démarrage du payout FedaPay impossible."),
        );
      }

      const startedRows = Array.isArray(startPayoutData)
        ? startPayoutData
        : Array.isArray(startPayoutData?.payouts)
          ? startPayoutData.payouts
          : [];
      const firstStarted = startedRows[0];
      const payoutReference =
        (typeof firstStarted?.reference === "string" ? firstStarted.reference : null) ??
        (typeof createPayoutData?.reference === "string" ? createPayoutData.reference : null) ??
        payoutId;

      const { error: updateError } = await adminSupabase
        .from("withdrawal_requests")
        .update({
          status: "succeeded",
          provider_reference: payoutReference,
          provider_payload: {
            created: createPayoutData,
            started: startPayoutData,
          },
          failure_reason: null,
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", prepared.withdrawal_id)
        .eq("status", "processing");

      if (updateError) {
        throw new Error(updateError.message);
      }

      return new Response(
        JSON.stringify({
          success: true,
          withdrawal_id: prepared.withdrawal_id,
          provider_reference: payoutReference,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } catch (processingError: unknown) {
      const message = toErrorMessage(processingError);

      await adminSupabase
        .from("withdrawal_requests")
        .update({
          status: "failed",
          failure_reason: message,
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", prepared.withdrawal_id)
        .eq("status", "processing");

      return new Response(
        JSON.stringify({ error: message }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } catch (error: unknown) {
    const message = toErrorMessage(error);

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
