import type {
  Request as ExpressRequest,
  Response,
  NextFunction,
  RequestHandler,
  Router,
} from 'express';

/**
 * Project-wide Express `Request` type (express 5 migration).
 *
 * `@types/express` 5 broadened `ParamsDictionary` to `[key: string]: string | string[]`
 * and `req.query` values to `string | string[] | ParsedQs | …` to model wildcard /
 * regex routes whose params CAN be arrays. This codebase has **no wildcard, regex,
 * splat, or repeated-param routes** — every `:param` resolves to a single string at
 * runtime, and every query value the routes read is treated as a scalar (CSV is parsed
 * from a single param via `splitCsv`, never repeated `?x=a&x=b`). Handlers here are
 * explicitly annotated `(req: Request, res)`, which gets the broad fallback type rather
 * than the per-route string inference, producing ~250 spurious `string | string[]`
 * errors.
 *
 * So we narrow params/query to the runtime reality at one place instead of casting at
 * 250 call sites. If a wildcard/regex/array-param route is ever added, read it via the
 * raw express `Request` and narrow explicitly.
 */
// Body defaults to `any` to match express's own `ReqBody = any` default — routes
// read `req.body.<field>` after Zod-parsing, exactly as before the migration.
 
export type Request<Body = any> = ExpressRequest<
  Record<string, string>,
  unknown,
  Body,
  Record<string, string | undefined>
>;

export type { Response, NextFunction, RequestHandler, Router };
