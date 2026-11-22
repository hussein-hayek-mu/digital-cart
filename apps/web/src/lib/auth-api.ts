import { ApiError } from "./api";

export type Profile = {
  id: string;
  fullName: string | null;
  email: string | null;
  phoneE164: string | null;
};

export type OrderSummary = {
  publicReference: string;
  status: string;
  subtotalAmountMinor: number;
  totalAmountMinor: number;
  currency: "XOF";
  createdAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
};

function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
}

export async function authRequest<T>(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    let code = `HTTP_${res.status}`;
    let message: string | undefined;
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
      message = body.error?.message;
    } catch {
      // ignore non-JSON bodies
    }
    throw new ApiError(code, res.status, message);
  }

  const body = (await res.json()) as { data: T };
  return body.data;
}

export function getProfile(accessToken: string): Promise<Profile> {
  return authRequest<Profile>("/api/v1/me", accessToken);
}

export function updateProfile(
  accessToken: string,
  input: { fullName?: string; phoneE164?: string },
): Promise<Profile> {
  return authRequest<Profile>("/api/v1/me", accessToken, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function getMyOrders(accessToken: string): Promise<{ orders: OrderSummary[] }> {
  return authRequest<{ orders: OrderSummary[] }>("/api/v1/me/orders", accessToken);
}
