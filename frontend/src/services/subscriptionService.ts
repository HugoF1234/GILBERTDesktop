import apiClient from './apiClient';

export interface Subscription {
  id: string;
  user_id: string;
  plan: 'beta_tester' | 'gilbert_plus' | 'gilbert_plus_monthly' | 'gilbert_plus_yearly' | 'enterprise' | 'discovery';
  status: string;
  stripe_subscription_id?: string;
  stripe_customer_id?: string;
  organization_id?: string;
  organization_name?: string;
  current_period_start?: string;
  current_period_end?: string;
  cancel_at_period_end: boolean;
  canceled_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Invoice {
  id: string;
  user_id: string;
  subscription_id?: string;
  stripe_payment_intent_id?: string;
  stripe_invoice_id?: string;
  stripe_charge_id?: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'canceled' | 'refunded';
  invoice_url?: string;
  hosted_payment_url?: string;
  invoice_pdf?: string;
  paid_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SubscriptionResponse {
  subscription: Subscription | null;
  hosted_payment_url?: string;
  message: string;
}

export interface InvoiceListResponse {
  invoices: Invoice[];
  total: number;
}

export const subscriptionService = {
  /**
   * Récupérer l'abonnement actuel de l'utilisateur
   */
  async getCurrentSubscription(): Promise<SubscriptionResponse> {
    const response = await apiClient.get<SubscriptionResponse>('/api/subscriptions/current');
    return response;
  },

  /**
   * Créer un nouvel abonnement
   */
  async createSubscription(plan: 'beta_tester' | 'gilbert_plus', billingPeriod: 'monthly' | 'yearly' = 'monthly'): Promise<SubscriptionResponse> {
    const response = await apiClient.post<SubscriptionResponse>('/api/subscriptions/create', {
      plan,
      billing_period: billingPeriod,
    });
    return response;
  },

  /**
   * Annuler l'abonnement actif
   */
  async cancelSubscription(): Promise<{ success: boolean; message: string; subscription?: Subscription }> {
    const response = await apiClient.post<{ success: boolean; message: string; subscription?: Subscription }>(
      '/api/subscriptions/cancel'
    );
    return response;
  },

  /**
   * Changer de plan d'abonnement
   */
  async changePlan(newPlan: 'beta_tester' | 'gilbert_plus', billingPeriod: 'monthly' | 'yearly' = 'monthly'): Promise<SubscriptionResponse> {
    const response = await apiClient.post<SubscriptionResponse>('/api/subscriptions/change-plan', {
      new_plan: newPlan,
      billing_period: billingPeriod,
    });
    return response;
  },

  /**
   * Récupérer les factures de l'utilisateur
   */
  async getInvoices(limit: number = 50, offset: number = 0): Promise<InvoiceListResponse> {
    // Construire l'URL avec les paramètres de requête
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    });
    const response = await apiClient.get<InvoiceListResponse>(`/api/subscriptions/invoices?${params.toString()}`);
    return response;
  },

};

