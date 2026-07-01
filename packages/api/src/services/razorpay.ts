import crypto from "crypto";
import Razorpay from "razorpay";

/**
 * Razorpay client singleton for payment processing.
 * Uses environment variables for authentication.
 *
 * Requirements: 9.4
 */
let razorpayInstance: Razorpay | null = null;

/**
 * Gets or creates the Razorpay client instance.
 * Throws if required environment variables are not set.
 */
export function getRazorpayClient(): Razorpay {
  if (razorpayInstance) {
    return razorpayInstance;
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error(
      "Razorpay credentials not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET environment variables."
    );
  }

  razorpayInstance = new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });

  return razorpayInstance;
}

/**
 * Validates a Razorpay webhook signature using HMAC SHA256.
 *
 * @param body - The raw request body string
 * @param signature - The signature from Razorpay headers (x-razorpay-signature)
 * @param secret - The webhook secret configured in Razorpay dashboard
 * @returns true if the signature is valid
 */
export function validateWebhookSignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  return expectedSignature === signature;
}

/**
 * Plan configuration for Razorpay subscription creation.
 */
export interface RazorpayPlanConfig {
  planId: string;
  amount: number;
  currency: string;
  interval: "monthly";
}

/**
 * Creates a Razorpay subscription for a workspace.
 *
 * @param customerId - Razorpay customer ID (not passed in create, will link via notify_info or auth)
 * @param planId - Razorpay plan ID for the selected tier
 * @returns Subscription object with id and short_url for checkout
 */
export async function createRazorpaySubscription(
  customerId: string,
  planId: string
): Promise<{ id: string; short_url: string }> {
  const razorpay = getRazorpayClient();

  const subscription = await razorpay.subscriptions.create({
    plan_id: planId,
    total_count: 12, // 12 months
    quantity: 1,
    notify_info: {
      notify_email: customerId, // Will use customer email for notification
    },
  } as any);

  return {
    id: subscription.id,
    short_url: subscription.short_url || "",
  };
}

/**
 * Creates a Razorpay customer for a workspace.
 *
 * @param email - Workspace admin email
 * @param name - Workspace name
 * @returns Customer ID
 */
export async function createRazorpayCustomer(
  email: string,
  name: string
): Promise<string> {
  const razorpay = getRazorpayClient();

  try {
    const customer = await razorpay.customers.create({
      email,
      name,
      fail_existing: 0,
    });
    return (customer as any).id;
  } catch (err: any) {
    // Razorpay returns an error when the customer already exists for the
    // merchant, even with fail_existing=0 in some SDK versions. In that case,
    // fetch the existing customer by email via the list endpoint.
    const desc: string =
      err?.error?.description || err?.message || "";
    if (desc.toLowerCase().includes("already exists")) {
      const list = await (razorpay.customers as any).all({ count: 1, email });
      const existing = list?.items?.[0] ?? (list?.entity === "collection" ? list?.items?.[0] : undefined);
      if (existing?.id) return existing.id as string;
      // If we can't find them, proceed without a customer id — the payment
      // link will still work, we just won't have the customer on file.
      return "";
    }
    throw err;
  }
}

/**
 * Creates a one-time Razorpay Payment Link for a Pro upgrade.
 *
 * Unlike the Subscriptions API, Payment Links work on any activated Razorpay
 * account without the recurring-payments feature enabled, and return a hosted
 * `short_url` the client can redirect to. The `workspaceId` is attached as a
 * note so the webhook can match the resulting `payment_link.paid` event back to
 * the workspace.
 *
 * @param params.email - Customer email
 * @param params.name - Customer / workspace name
 * @param params.amount - Amount in the smallest currency unit (paise for INR)
 * @param params.currency - ISO currency code (e.g. "INR")
 * @param params.workspaceId - Workspace to upgrade when the link is paid
 * @param params.callbackUrl - Where Razorpay redirects after payment
 * @returns Payment link id and hosted short_url
 */
export async function createRazorpayPaymentLink(params: {
  email: string;
  name: string;
  amount: number;
  currency: string;
  workspaceId: string;
  callbackUrl?: string;
}): Promise<{ id: string; short_url: string }> {
  const razorpay = getRazorpayClient();

  const link = await razorpay.paymentLink.create({
    amount: params.amount,
    currency: params.currency,
    accept_partial: false,
    description: "ShipFlow Pro plan — upgrade",
    customer: {
      name: params.name,
      email: params.email,
    },
    notify: { email: true, sms: false },
    reminder_enable: false,
    notes: { workspaceId: params.workspaceId },
    ...(params.callbackUrl
      ? { callback_url: params.callbackUrl, callback_method: "get" }
      : {}),
  } as any);

  return {
    id: (link as any).id,
    short_url: (link as any).short_url || "",
  };
}

/**
 * Cancels a Razorpay subscription.
 *
 * @param subscriptionId - Razorpay subscription ID
 * @param cancelAtCycleEnd - Whether to cancel at the end of the billing cycle
 */
export async function cancelRazorpaySubscription(
  subscriptionId: string,
  cancelAtCycleEnd: boolean = true
): Promise<void> {
  const razorpay = getRazorpayClient();

  await razorpay.subscriptions.cancel(subscriptionId, cancelAtCycleEnd);
}
