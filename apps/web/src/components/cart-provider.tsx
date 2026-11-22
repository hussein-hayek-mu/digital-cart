"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type CartItem = {
  productPublicId: string;
  slug: string;
  name: string;
  platform: string;
  region: string;
  faceValue: string;
  faceCurrency: string;
  imageUrl: string | null;
  /** Price snapshot at add-to-cart time — always re-validated server-side on /panier. */
  unitAmountMinor: number;
  quantity: number;
};

type CartContextValue = {
  items: CartItem[];
  itemCount: number;
  subtotalAmountMinor: number;
  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  updateQuantity: (productPublicId: string, quantity: number) => void;
  removeItem: (productPublicId: string) => void;
  clearCart: () => void;
  isReady: boolean;
};

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = "mahdis-store:cart:v1";

function readStoredCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is CartItem =>
        typeof x === "object" &&
        x !== null &&
        typeof (x as CartItem).productPublicId === "string" &&
        typeof (x as CartItem).quantity === "number",
    );
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setItems(readStoredCart());
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady || typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, isReady]);

  const addItem = useCallback((item: Omit<CartItem, "quantity">, quantity = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.productPublicId === item.productPublicId);
      if (existing) {
        return prev.map((i) =>
          i.productPublicId === item.productPublicId
            ? { ...i, quantity: Math.min(20, i.quantity + quantity) }
            : i,
        );
      }
      return [...prev, { ...item, quantity: Math.min(20, Math.max(1, quantity)) }];
    });
  }, []);

  const updateQuantity = useCallback((productPublicId: string, quantity: number) => {
    setItems((prev) => {
      if (quantity <= 0) {
        return prev.filter((i) => i.productPublicId !== productPublicId);
      }
      return prev.map((i) =>
        i.productPublicId === productPublicId
          ? { ...i, quantity: Math.min(20, quantity) }
          : i,
      );
    });
  }, []);

  const removeItem = useCallback((productPublicId: string) => {
    setItems((prev) => prev.filter((i) => i.productPublicId !== productPublicId));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const itemCount = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items]);
  const subtotalAmountMinor = useMemo(
    () => items.reduce((sum, i) => sum + i.unitAmountMinor * i.quantity, 0),
    [items],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      itemCount,
      subtotalAmountMinor,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      isReady,
    }),
    [items, itemCount, subtotalAmountMinor, addItem, updateQuantity, removeItem, clearCart, isReady],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return ctx;
}
