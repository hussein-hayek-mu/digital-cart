import type { OrderRow, ProfileRow, Store } from "../db/store.js";

type ProfileUpdateInput = {
  fullName?: string;
  phoneE164?: string;
};

export type ProfileDto = {
  id: string;
  fullName: string | null;
  email: string | null;
  phoneE164: string | null;
};

export type OrderSummaryDto = {
  publicReference: string;
  status: OrderRow["status"];
  subtotalAmountMinor: number;
  totalAmountMinor: number;
  currency: OrderRow["currency"];
  createdAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
};

function toProfileDto(row: ProfileRow): ProfileDto {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    phoneE164: row.phoneE164,
  };
}

function toOrderSummary(order: OrderRow): OrderSummaryDto {
  return {
    publicReference: order.publicReference,
    status: order.status,
    subtotalAmountMinor: order.subtotalAmountMinor,
    totalAmountMinor: order.totalAmountMinor,
    currency: order.currency,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    fulfilledAt: order.fulfilledAt?.toISOString() ?? null,
  };
}

export async function getOrCreateProfile(
  store: Store,
  userId: string,
  userEmail?: string | null,
): Promise<ProfileDto> {
  const existing = await store.getProfile(userId);
  if (existing) {
    return toProfileDto(existing);
  }

  const created: ProfileRow = {
    id: userId,
    fullName: null,
    email: userEmail ?? null,
    phoneE164: null,
  };
  await store.upsertProfile(created);
  return toProfileDto(created);
}

export async function updateProfile(
  store: Store,
  userId: string,
  input: ProfileUpdateInput,
  userEmail?: string | null,
): Promise<ProfileDto> {
  const existing =
    (await store.getProfile(userId)) ??
    ({
      id: userId,
      fullName: null,
      email: userEmail ?? null,
      phoneE164: null,
    } satisfies ProfileRow);

  const next: ProfileRow = {
    id: userId,
    fullName: input.fullName !== undefined ? input.fullName : existing.fullName,
    phoneE164: input.phoneE164 !== undefined ? input.phoneE164 : existing.phoneE164,
    email: existing.email,
  };

  await store.upsertProfile(next);
  return toProfileDto(next);
}

export async function listUserOrderSummaries(
  store: Store,
  userId: string,
): Promise<OrderSummaryDto[]> {
  const orders = await store.listOrdersForUser(userId);
  return orders
    .slice()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map(toOrderSummary);
}
