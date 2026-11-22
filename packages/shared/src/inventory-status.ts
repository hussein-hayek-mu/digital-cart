export const INVENTORY_STATUSES = [
  "available",
  "reserved",
  "sold",
  "disabled",
] as const;

export type InventoryStatus = (typeof INVENTORY_STATUSES)[number];

export const INVENTORY_STATUS_TRANSITIONS: Record<
  InventoryStatus,
  readonly InventoryStatus[]
> = {
  available: ["reserved", "disabled"],
  reserved: ["available", "sold", "disabled"],
  sold: [],
  disabled: ["available"],
};

export class InvalidInventoryTransitionError extends Error {
  constructor(
    public readonly from: InventoryStatus,
    public readonly to: InventoryStatus,
  ) {
    super(`Invalid inventory status transition from ${from} to ${to}`);
    this.name = "InvalidInventoryTransitionError";
  }
}

export function canTransitionInventory(
  from: InventoryStatus,
  to: InventoryStatus,
): boolean {
  if (from === to) {
    return true;
  }
  return INVENTORY_STATUS_TRANSITIONS[from].includes(to);
}

export function assertInventoryTransition(
  from: InventoryStatus,
  to: InventoryStatus,
): void {
  if (!canTransitionInventory(from, to)) {
    throw new InvalidInventoryTransitionError(from, to);
  }
}

export function isSellableInventoryStatus(status: InventoryStatus): boolean {
  return status === "available";
}

export function isTerminalInventoryStatus(status: InventoryStatus): boolean {
  return status === "sold";
}
