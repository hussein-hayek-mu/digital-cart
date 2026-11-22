import { cartValidateSchema, HTTP_STATUS } from "@repo/shared";
import type { Express, NextFunction, Request, Response } from "express";
import express from "express";
import type { Store } from "../db/store.js";
import * as catalog from "../services/catalog.js";

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

function routeParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Phase 2 public catalog routes: categories, products, and cart validation.
 * Mounted under /api/v1. Never returns codes/secrets or exact stock counts.
 */
export function mountCatalogRoutes(app: Express, store: Store) {
  const r = express.Router();

  r.get(
    "/categories",
    asyncHandler(async (_req, res) => {
      res.json({ data: await catalog.listCategories(store) });
    }),
  );

  r.get(
    "/categories/:slug",
    asyncHandler(async (req, res) => {
      const category = await catalog.getCategoryBySlug(store, routeParam(req.params.slug));
      if (!category) {
        res.status(HTTP_STATUS.NOT_FOUND).json({ error: { code: "NOT_FOUND" } });
        return;
      }
      const products = await catalog.listProducts(store, { categorySlug: category.slug });
      res.json({ data: { category, products } });
    }),
  );

  r.get(
    "/products",
    asyncHandler(async (req, res) => {
      const categorySlug = typeof req.query.category === "string" ? req.query.category : undefined;
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const products = await catalog.listProducts(store, { categorySlug, q });
      res.json({ data: products });
    }),
  );

  r.get(
    "/products/:slug",
    asyncHandler(async (req, res) => {
      const product = await catalog.getProductBySlug(store, routeParam(req.params.slug));
      if (!product) {
        res.status(HTTP_STATUS.NOT_FOUND).json({ error: { code: "NOT_FOUND" } });
        return;
      }
      res.json({ data: product });
    }),
  );

  r.post(
    "/cart/validate",
    asyncHandler(async (req, res) => {
      const body = cartValidateSchema.parse(req.body);
      const result = await catalog.validateCart(store, body.items);
      res.json({ data: result });
    }),
  );

  app.use("/api/v1", r);
}
