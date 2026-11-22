import { describe, expect, it } from "vitest";
import {
  addMoney,
  assertInventoryTransition,
  assertOrderTransition,
  assertPaymentTransition,
  canTransitionInventory,
  canTransitionOrder,
  canTransitionPayment,
  computeWaveSignature,
  createMoney,
  decryptCardSecret,
  encryptCardSecret,
  fingerprintCode,
  fromWaveAmountString,
  maskCode,
  multiplyMoney,
  normalizeCode,
  stockLabel,
  sumLineTotals,
  toWaveAmountString,
  verifyWaveSignatureHeader,
} from "./index.js";

describe("money", () => {
  it("rejects non-integers", () => {
    expect(() => createMoney(1.5)).toThrow();
  });

  it("adds and multiplies without floats", () => {
    const a = createMoney(1000);
    const b = createMoney(500);
    expect(addMoney(a, b).amountMinor).toBe(1500);
    expect(multiplyMoney(a, 3).amountMinor).toBe(3000);
  });

  it("round-trips Wave amount strings for XOF", () => {
    expect(toWaveAmountString(2500)).toBe("2500");
    expect(fromWaveAmountString("2500", "XOF").amountMinor).toBe(2500);
    expect(() => fromWaveAmountString("10.5", "XOF")).toThrow();
  });

  it("sums line totals", () => {
    expect(
      sumLineTotals([
        { unitAmountMinor: 1000, quantity: 2 },
        { unitAmountMinor: 500, quantity: 1 },
      ]).amountMinor,
    ).toBe(2500);
  });
});

describe("stockLabel", () => {
  it("maps counts", () => {
    expect(stockLabel(0)).toBe("out_of_stock");
    expect(stockLabel(3)).toBe("low_stock");
    expect(stockLabel(20)).toBe("in_stock");
  });
});

describe("order transitions", () => {
  it("allows valid and rejects invalid", () => {
    expect(canTransitionOrder("pending_payment", "payment_processing")).toBe(true);
    expect(canTransitionOrder("payment_processing", "paid")).toBe(true);
    expect(canTransitionOrder("pending_payment", "paid")).toBe(false);
    expect(() => assertOrderTransition("fulfilled", "paid")).toThrow();
  });
});

describe("payment transitions", () => {
  it("allows valid and rejects invalid", () => {
    expect(canTransitionPayment("created", "session_open")).toBe(true);
    expect(canTransitionPayment("session_open", "succeeded")).toBe(true);
    expect(canTransitionPayment("failed", "succeeded")).toBe(false);
    expect(() => assertPaymentTransition("refunded", "session_open")).toThrow();
  });
});

describe("inventory transitions", () => {
  it("allows valid and rejects invalid", () => {
    expect(canTransitionInventory("available", "reserved")).toBe(true);
    expect(canTransitionInventory("reserved", "sold")).toBe(true);
    expect(canTransitionInventory("sold", "available")).toBe(false);
    expect(() => assertInventoryTransition("sold", "reserved")).toThrow();
  });
});

describe("crypto", () => {
  const key = "a".repeat(64);
  const pepper = "test-pepper";

  it("encrypts and decrypts card secrets", () => {
    const enc = encryptCardSecret({ code: "ABCD-1234" }, key, 1);
    const dec = decryptCardSecret(enc, key);
    expect(dec.code).toBe("ABCD-1234");
  });

  it("fingerprints and masks", () => {
    const n = normalizeCode(" ab cd ");
    expect(n).toBe("ABCD");
    expect(fingerprintCode(n, pepper)).toHaveLength(64);
    expect(maskCode("ABCDEFGH")).toBe("****EFGH");
  });

  it("verifies Wave signatures with skew and multi-v1", () => {
    const body = '{"id":"evt"}';
    const secret = "wave_sn_WHS_test";
    const t = String(Math.floor(Date.now() / 1000));
    const sig = computeWaveSignature(t, body, secret);
    const header = `t=${t},v1=deadbeef,v1=${sig}`;
    expect(verifyWaveSignatureHeader(header, body, [secret])).toBe(true);
    expect(verifyWaveSignatureHeader(header, body + "x", [secret])).toBe(false);
    expect(
      verifyWaveSignatureHeader(`t=${Number(t) - 1000},v1=${sig}`, body, [secret]),
    ).toBe(false);
  });
});
