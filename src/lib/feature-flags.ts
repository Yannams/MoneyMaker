export const isProductionEnvironment = import.meta.env.PROD;

export const paymentLinkGenerationDisabled = isProductionEnvironment;
export const walletDisabled = isProductionEnvironment;

export const paymentLinkGenerationDisabledMessage =
  "La génération de liens est désactivée sur l'environnement de production.";

export const walletDisabledMessage =
  "Le portefeuille est désactivé sur l'environnement de production.";
