import Link from "next/link";
import type { OrderSummary } from "@/lib/auth-api";
import { formatXOF, orderStatusLabel, orderStatusTone } from "@/lib/format";
import { ChevronRightIcon } from "./icons";

export function OrderList({ orders }: { orders: OrderSummary[] }) {
  return (
    <ul className="order-list">
      {orders.map((order) => {
        const tone = orderStatusTone(order.status);
        return (
          <li key={order.publicReference}>
            <Link href={`/commande/${encodeURIComponent(order.publicReference)}`} className="order-row-link">
              <div className="order-row-link__main">
                <p className="order-row-link__ref">{order.publicReference}</p>
                <p className="text-muted order-row-link__meta">
                  {new Date(order.createdAt).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}{" "}
                  · {formatXOF(order.totalAmountMinor)}
                </p>
              </div>
              <span className={`badge ${tone === "neutral" ? "" : `badge-${tone}`}`}>
                <span className="badge-dot" />
                {orderStatusLabel(order.status)}
              </span>
              <ChevronRightIcon size={18} className="order-row-link__chevron" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
