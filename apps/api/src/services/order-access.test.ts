import { describe, expect, it } from "vitest";
import { loadEnv, type Env } from "../config/env.js";
import { createMemoryStore } from "../db/memory-store.js";
import type { Store } from "../db/store.js";
import { createFakePaymentProvider } from "../payments/fake-provider.js";
import { processOutboxOnce } from "../workers/outbox-processor.js";
import { createCheckout } from "./checkout.js";
import { runFulfilCheckoutJob } from "./fulfilment.js";
import {
  issueOrderAccessToken,
  orderAccessLink,
  requestOrderLink,
  resolveOrderAccess,
  revealCodesForOrder,
} from "./order-access.js";

function setup() {
  const env: Env = loadEnv({
    NODE_ENV: "test",
    PAYMENT_PROVIDER: "fake",
    APP_BASE_URL: "http://localhost:3000",
  } as NodeJS.ProcessEnv);
  const store = createMemoryStore({ encryptionKey: "a".repeat(64), fingerprintPepper: "test-pepper" });
  const provider = createFakePaymentProvider(env.APP_BASE_URL);
  return { env, store, provider };
}

async function placeOrder(ctx: ReturnType<typeof setup>, userId: string | null = null) {
  const [product] = await ctx.store.listProducts({ categorySlug: "steam" });
  return createCheckout({
    ...ctx,
    input: {
      items: [{ productPublicId: product.publicId, quantity: 1 }],
      customerFullName: "Awa Koné",
      customerEmail: "awa@example.com",
      customerPhoneE164: "+2250700000000",
    },
    idempotencyKey: `order-access-test-${Math.random()}`,
    userId,
  });
}

async function pay(ctx: ReturnType<typeof setup>, store: Store, publicReference: string) {
  const order = (await store.getOrderByPublicRef(publicReference))!;
  const payment = (await store.getPaymentByOrderId(order.id))!;
  await ctx.provider.completeSessionForTest!(payment.providerCheckoutSessionId, "TXN_TEST_1");
  await runFulfilCheckoutJob({ ...ctx, sessionId: payment.providerCheckoutSessionId });
}

describe("order access", () => {
  it("grants access with the checkout token and denies without it", async () => {
    const ctx = setup();
    const result = await placeOrder(ctx);
    const ref = result.publicReference;

    expect(result.accessToken.length).toBeGreaterThanOrEqual(43);
    expect(await resolveOrderAccess(ctx.store, ctx.env, { publicReference: ref, userId: null, token: null })).toBeNull();
    expect(
      await resolveOrderAccess(ctx.store, ctx.env, { publicReference: ref, userId: null, token: "x".repeat(43) }),
    ).toBeNull();
    const granted = await resolveOrderAccess(ctx.store, ctx.env, {
      publicReference: ref,
      userId: null,
      token: result.accessToken,
    });
    expect(granted?.via).toBe("token");
  });

  it("does not accept a token issued for another order", async () => {
    const ctx = setup();
    const first = await placeOrder(ctx);
    const second = await placeOrder(ctx);
    expect(
      await resolveOrderAccess(ctx.store, ctx.env, {
        publicReference: first.publicReference,
        userId: null,
        token: second.accessToken,
      }),
    ).toBeNull();
  });

  it("rejects expired tokens", async () => {
    const ctx = setup();
    const result = await placeOrder(ctx);
    const order = (await ctx.store.getOrderByPublicRef(result.publicReference))!;
    const expired = await issueOrderAccessToken(ctx.store, ctx.env, order.id, -1000);
    expect(
      await resolveOrderAccess(ctx.store, ctx.env, {
        publicReference: result.publicReference,
        userId: null,
        token: expired,
      }),
    ).toBeNull();
  });

  it("lets the signed-in owner in without a token, but not another user", async () => {
    const ctx = setup();
    const owner = "11111111-1111-4111-8111-111111111111";
    const result = await placeOrder(ctx, owner);
    const asOwner = await resolveOrderAccess(ctx.store, ctx.env, {
      publicReference: result.publicReference,
      userId: owner,
      token: null,
    });
    expect(asOwner?.via).toBe("owner");
    expect(
      await resolveOrderAccess(ctx.store, ctx.env, {
        publicReference: result.publicReference,
        userId: "22222222-2222-4222-8222-222222222222",
        token: null,
      }),
    ).toBeNull();
  });

  it("reveals decrypted codes and audits the reveal", async () => {
    const ctx = setup();
    const result = await placeOrder(ctx);
    await pay(ctx, ctx.store, result.publicReference);
    const access = (await resolveOrderAccess(ctx.store, ctx.env, {
      publicReference: result.publicReference,
      userId: null,
      token: result.accessToken,
    }))!;
    const codes = await revealCodesForOrder(ctx.store, ctx.env, access, null);
    expect(codes).toHaveLength(1);
    expect(codes[0].code).toMatch(/^STM/);
    expect(codes[0].revealCount).toBe(1);
    const audits = await ctx.store.listAuditLogs(10);
    expect(audits[0].action).toBe("order.codes_revealed");
    expect(audits[0].actorType).toBe("guest");
  });

  it("queues a link email only when reference and email match, and caps repeats", async () => {
    const ctx = setup();
    const result = await placeOrder(ctx);
    const claim = () => ctx.store.claimOutboxJobs(50);

    await requestOrderLink(ctx.store, result.publicReference, "someone@example.com");
    expect((await claim()).filter((j) => j.jobType === "send_order_link")).toHaveLength(0);

    for (let i = 0; i < 5; i++) await requestOrderLink(ctx.store, result.publicReference, " AWA@example.com ");
    expect((await claim()).filter((j) => j.jobType === "send_order_link")).toHaveLength(3);
  });

  it("sends the codes-ready email through the outbox with a working link", async () => {
    const ctx = setup();
    const result = await placeOrder(ctx);
    const logged: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => logged.push(args.join(" "));
    try {
      await pay(ctx, ctx.store, result.publicReference);
      await processOutboxOnce(ctx.store, ctx.provider, ctx.env);
    } finally {
      console.log = original;
    }
    const email = logged.find((l) => l.includes("Vos codes sont prêts"));
    expect(email).toBeDefined();
    expect(email).not.toMatch(/STM05GL|STM10GL|STM20GL|STM50GL|STM01LOW/);
    const token = email!.match(/#t=([A-Za-z0-9_-]+)/)?.[1];
    expect(token).toBeDefined();
    expect(orderAccessLink(ctx.env, result.publicReference, token!)).toContain(`/commande/${result.publicReference}#t=`);
    const access = await resolveOrderAccess(ctx.store, ctx.env, {
      publicReference: result.publicReference,
      userId: null,
      token: token!,
    });
    expect(access?.via).toBe("token");
  });
});
