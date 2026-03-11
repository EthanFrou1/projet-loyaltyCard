import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import Stripe from "stripe";
import { prisma } from "@loyalty/database";

type CheckoutPlanId = "STARTER" | "PRO";
type StoredPlanId = "STARTER" | "PRO" | "BUSINESS";

const APP_URL = process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000";

const CheckoutBody = z.object({
  plan: z.enum(["STARTER", "PRO"]),
});

const PortalBody = z.object({
  plan: z.enum(["STARTER", "PRO"]).optional(),
});

function getStripeClient() {
  const secretKey = process.env["STRIPE_SECRET_KEY"];
  if (!secretKey) return null;
  return new Stripe(secretKey, {
    apiVersion: "2026-02-25.clover",
  });
}

function getPriceMap() {
  return {
    STARTER: process.env["STRIPE_PRICE_STARTER_MONTHLY"] ?? "",
    PRO: process.env["STRIPE_PRICE_PRO_MONTHLY"] ?? "",
    BUSINESS: process.env["STRIPE_PRICE_BUSINESS_MONTHLY"] ?? "",
  } satisfies Record<StoredPlanId, string>;
}

function mapPlanFromPriceId(priceId: string | null | undefined): StoredPlanId {
  const priceMap = getPriceMap();
  const found = (Object.entries(priceMap) as Array<[StoredPlanId, string]>).find(([, id]) => id && id === priceId);
  return found?.[0] ?? "STARTER";
}

async function ensureStripeCustomer(stripe: Stripe, businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      stripe_customer_id: true,
      users: {
        take: 1,
        orderBy: { created_at: "asc" },
        select: { email: true },
      },
    },
  });

  if (!business) {
    throw new Error("Business introuvable.");
  }

  if (business.stripe_customer_id) {
    return business.stripe_customer_id;
  }

  const customer = await stripe.customers.create({
    name: business.name || undefined,
    email: business.users[0]?.email,
    metadata: {
      business_id: business.id,
    },
  });

  await prisma.business.update({
    where: { id: business.id },
    data: { stripe_customer_id: customer.id },
  });

  return customer.id;
}

async function syncSubscriptionFromStripe(subscription: Stripe.Subscription) {
  const priceId = subscription.items.data[0]?.price.id ?? null;
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const currentPeriodEnd = (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end ?? null;

  const plan = mapPlanFromPriceId(priceId);
  const status = subscription.status;
  const isActivePlan = ["active", "trialing", "past_due", "unpaid"].includes(status);

  await prisma.business.updateMany({
    where: { stripe_customer_id: customerId },
    data: {
      plan: isActivePlan ? plan : "STARTER",
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId,
      subscription_status: status,
      current_period_end: currentPeriodEnd
        ? new Date(currentPeriodEnd * 1000)
        : null,
    },
  });
}

async function clearSubscriptionFromStripe(customerId: string) {
  await prisma.business.updateMany({
    where: { stripe_customer_id: customerId },
    data: {
      plan: "STARTER",
      stripe_subscription_id: null,
      stripe_price_id: null,
      subscription_status: "canceled",
      current_period_end: null,
    },
  });
}

export async function stripeRoutes(app: FastifyInstance) {
  app.get("/status", { preHandler: [app.authenticate, app.requireOwner] }, async (request, reply) => {
    const business = await prisma.business.findUnique({
      where: { id: request.user.business_id },
      select: {
        plan: true,
        stripe_customer_id: true,
        stripe_subscription_id: true,
        stripe_price_id: true,
        subscription_status: true,
        current_period_end: true,
      },
    });

    const priceMap = getPriceMap();
    const stripeReady = Boolean(
      process.env["STRIPE_SECRET_KEY"] &&
      process.env["STRIPE_WEBHOOK_SECRET"] &&
      priceMap.STARTER &&
      priceMap.PRO
    );

    return reply.send({
      stripe_ready: stripeReady,
      current_plan: business?.plan ?? "STARTER",
      subscription_status: business?.subscription_status ?? null,
      current_period_end: business?.current_period_end?.toISOString() ?? null,
      has_customer: Boolean(business?.stripe_customer_id),
      has_subscription: Boolean(business?.stripe_subscription_id),
    });
  });

  app.post("/checkout", { preHandler: [app.authenticate, app.requireOwner] }, async (request, reply) => {
    const body = CheckoutBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "ValidationError", message: body.error.message });
    }

    const stripe = getStripeClient();
    if (!stripe) {
      return reply.status(503).send({ error: "StripeNotConfigured", message: "Stripe n'est pas configuré." });
    }

    const priceMap = getPriceMap();
    const priceId = priceMap[body.data.plan];
    if (!priceId) {
      return reply.status(503).send({ error: "StripePriceMissing", message: "Prix Stripe manquant pour cette offre." });
    }

    const business = await prisma.business.findUnique({
      where: { id: request.user.business_id },
      select: {
        id: true,
        name: true,
        plan: true,
        stripe_subscription_id: true,
      },
    });

    if (!business) {
      return reply.status(404).send({ error: "NotFound", message: "Business introuvable." });
    }

    if (business.plan === body.data.plan) {
      return reply.status(400).send({ error: "AlreadyOnPlan", message: "Cette offre est déjà active." });
    }

    if (business.stripe_subscription_id) {
      return reply.status(409).send({
        error: "UsePortal",
        message: "Utilisez le portail Stripe pour modifier votre abonnement existant.",
      });
    }

    const customerId = await ensureStripeCustomer(stripe, business.id);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
      success_url: `${APP_URL}/dashboard/billing?stripe=success`,
      cancel_url: `${APP_URL}/dashboard/billing?stripe=cancel`,
      metadata: {
        business_id: business.id,
        target_plan: body.data.plan,
      },
      subscription_data: {
        metadata: {
          business_id: business.id,
          target_plan: body.data.plan,
        },
      },
    });

    return reply.send({ url: session.url });
  });

  app.post("/portal", { preHandler: [app.authenticate, app.requireOwner] }, async (request, reply) => {
    const body = PortalBody.safeParse(request.body ?? {});
    if (!body.success) {
      return reply.status(400).send({ error: "ValidationError", message: body.error.message });
    }

    const stripe = getStripeClient();
    if (!stripe) {
      return reply.status(503).send({ error: "StripeNotConfigured", message: "Stripe n'est pas configur?." });
    }

    const business = await prisma.business.findUnique({
      where: { id: request.user.business_id },
      select: {
        stripe_customer_id: true,
        stripe_subscription_id: true,
        stripe_price_id: true,
      },
    });

    if (!business?.stripe_customer_id) {
      return reply.status(400).send({
        error: "NoStripeCustomer",
        message: "Aucun client Stripe n'est encore li? ? ce compte.",
      });
    }

    let session: Stripe.BillingPortal.Session;

    if (body.data.plan) {
      if (!business.stripe_subscription_id) {
        return reply.status(400).send({
          error: "NoStripeSubscription",
          message: "Aucun abonnement Stripe n'est encore actif pour ce compte.",
        });
      }

      const priceMap = getPriceMap();
      const targetPriceId = priceMap[body.data.plan];
      if (!targetPriceId) {
        return reply.status(503).send({ error: "StripePriceMissing", message: "Prix Stripe manquant pour cette offre." });
      }

      if (business.stripe_price_id === targetPriceId) {
        return reply.status(400).send({
          error: "AlreadyOnPlan",
          message: "Cette offre est d?j? active.",
        });
      }

      const subscription = await stripe.subscriptions.retrieve(business.stripe_subscription_id);
      const subscriptionItem = subscription.items.data[0];

      if (!subscriptionItem) {
        return reply.status(400).send({
          error: "SubscriptionItemMissing",
          message: "Impossible de retrouver la ligne d'abonnement Stripe.",
        });
      }

      session = await stripe.billingPortal.sessions.create({
        customer: business.stripe_customer_id,
        return_url: `${APP_URL}/dashboard/billing`,
        flow_data: {
          type: "subscription_update_confirm",
          after_completion: {
            type: "redirect",
            redirect: {
              return_url: `${APP_URL}/dashboard/billing?stripe=success`,
            },
          },
          subscription_update_confirm: {
            subscription: business.stripe_subscription_id,
            items: [
              {
                id: subscriptionItem.id,
                price: targetPriceId,
                quantity: subscriptionItem.quantity ?? 1,
              },
            ],
          },
        },
      });
    } else {
      session = await stripe.billingPortal.sessions.create({
        customer: business.stripe_customer_id,
        return_url: `${APP_URL}/dashboard/billing`,
      });
    }

    return reply.send({ url: session.url });
  });

  app.post(
    "/webhook",
    { config: { rawBody: true } },
    async (request, reply) => {
      const stripe = getStripeClient();
      const webhookSecret = process.env["STRIPE_WEBHOOK_SECRET"];

      if (!stripe || !webhookSecret) {
        return reply.status(503).send({ error: "StripeNotConfigured", message: "Stripe n'est pas configuré." });
      }

      const signature = request.headers["stripe-signature"];
      const rawBody = (request as FastifyRequest & { rawBody?: string | Buffer }).rawBody;
      if (!signature || typeof signature !== "string" || !rawBody) {
        return reply.status(400).send({ error: "BadRequest", message: "Signature Stripe manquante." });
      }

      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(
          typeof rawBody === "string" ? rawBody : rawBody.toString("utf8"),
          signature,
          webhookSecret
        );
      } catch (err) {
        return reply.status(400).send({
          error: "InvalidSignature",
          message: err instanceof Error ? err.message : "Signature webhook invalide.",
        });
      }

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;
          if (subscriptionId) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            await syncSubscriptionFromStripe(subscription);
          }
          break;
        }
        case "customer.subscription.created":
        case "customer.subscription.updated": {
          await syncSubscriptionFromStripe(event.data.object as Stripe.Subscription);
          break;
        }
        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId =
            typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
          await clearSubscriptionFromStripe(customerId);
          break;
        }
        default:
          break;
      }

      return reply.send({ received: true });
    }
  );
}
