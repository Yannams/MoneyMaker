-- Create subscription_requests table for pending membership requests
CREATE TABLE public.subscription_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  amount INTEGER NOT NULL DEFAULT 2000,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  payment_method TEXT NOT NULL DEFAULT 'fedapay',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  processed_by UUID
);

-- Enable RLS
ALTER TABLE public.subscription_requests ENABLE ROW LEVEL SECURITY;

-- Users can view and create their own requests
CREATE POLICY "Users can view their own subscription requests"
ON public.subscription_requests
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own subscription requests"
ON public.subscription_requests
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Admins can view and manage all requests
CREATE POLICY "Admins can view all subscription requests"
ON public.subscription_requests
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update subscription requests"
ON public.subscription_requests
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete subscription requests"
ON public.subscription_requests
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));