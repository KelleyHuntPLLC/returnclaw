import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uuid,
  serial,
  numeric,
  index,
} from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, desc, ilike, or, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { createChildLogger } from '@returnclaw/core';
import type {
  RetailerPolicy,
  ReturnCondition,
  PolicyException,
  CategoryPolicy,
  ExchangePolicy,
  RestockingFee,
  RefundMethod,
} from '@returnclaw/core';

const log = createChildLogger({ component: 'policy-store' });

// ---------------------------------------------------------------------------
// Drizzle schema definitions
// ---------------------------------------------------------------------------

export const retailers = pgTable(
  'retailers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull().unique(),
    slug: text('slug').notNull().unique(),
    website: text('website').notNull(),
    logoUrl: text('logo_url'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: index('retailers_slug_idx').on(table.slug),
    nameIdx: index('retailers_name_idx').on(table.name),
  }),
);

export const policies = pgTable(
  'policies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    retailerId: uuid('retailer_id')
      .notNull()
      .references(() => retailers.id, { onDelete: 'cascade' }),
    returnWindow: integer('return_window').notNull(),
    requiresReceipt: boolean('requires_receipt').notNull().default(true),
    freeReturnShipping: boolean('free_return_shipping').notNull().default(false),
    restockingFeePct: numeric('restocking_fee_pct', { precision: 5, scale: 2 }),
    exchangeAllowed: boolean('exchange_allowed').notNull().default(true),
    refundMethods: jsonb('refund_methods').notNull().$type<RefundMethod[]>(),
    dropOffLocations: jsonb('drop_off_locations').notNull().$type<string[]>(),
    conditions: jsonb('conditions').notNull().$type<ReturnCondition[]>(),
    exceptions: jsonb('exceptions').notNull().$type<PolicyException[]>(),
    restockingFee: jsonb('restocking_fee').$type<RestockingFee | null>(),
    exchangePolicy: jsonb('exchange_policy').notNull().$type<ExchangePolicy>(),
    specialCategories: jsonb('special_categories')
      .notNull()
      .$type<CategoryPolicy[]>(),
    sourceUrl: text('source_url').notNull(),
    lastVerified: timestamp('last_verified').defaultNow().notNull(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    retailerIdx: index('policies_retailer_id_idx').on(table.retailerId),
    versionIdx: index('policies_version_idx').on(table.retailerId, table.version),
  }),
);

export const policyExceptions = pgTable(
  'policy_exceptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    policyId: uuid('policy_id')
      .notNull()
      .references(() => policies.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    rule: text('rule').notNull(),
    customReturnWindow: integer('custom_return_window'),
    nonReturnable: boolean('non_returnable').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    policyIdx: index('policy_exceptions_policy_id_idx').on(table.policyId),
  }),
);

export const policyVersions = pgTable(
  'policy_versions',
  {
    id: serial('id').primaryKey(),
    policyId: uuid('policy_id')
      .notNull()
      .references(() => policies.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    changes: jsonb('changes').notNull().$type<Record<string, unknown>>(),
    changedBy: text('changed_by').notNull().default('system'),
    changedAt: timestamp('changed_at').defaultNow().notNull(),
  },
  (table) => ({
    policyIdx: index('policy_versions_policy_id_idx').on(table.policyId),
  }),
);

// ---------------------------------------------------------------------------
// Helper types
// ---------------------------------------------------------------------------

export interface Retailer {
  id: string;
  name: string;
  slug: string;
  website: string;
  logoUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PolicyVersion {
  id: number;
  policyId: string;
  version: number;
  changes: Record<string, unknown>;
  changedBy: string;
  changedAt: Date;
}

// ---------------------------------------------------------------------------
// PolicyStore class
// ---------------------------------------------------------------------------

export class PolicyStore {
  private db: ReturnType<typeof drizzle>;
  private sql: ReturnType<typeof postgres>;

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl);
    this.db = drizzle(this.sql);
  }

  /**
   * Look up a single retailer by UUID.
   */
  async getRetailer(retailerId: string): Promise<Retailer | null> {
    const rows = await this.db
      .select()
      .from(retailers)
      .where(eq(retailers.id, retailerId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      website: row.website,
      logoUrl: row.logoUrl,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Get the latest policy for a retailer by retailer UUID.
   * Joins retailers + policies and maps to the shared RetailerPolicy shape.
   */
  async getPolicy(retailerId: string): Promise<RetailerPolicy | null> {
    const results = await this.db
      .select({
        policy: policies,
        retailer: retailers,
      })
      .from(policies)
      .innerJoin(retailers, eq(policies.retailerId, retailers.id))
      .where(eq(retailers.id, retailerId))
      .orderBy(desc(policies.version))
      .limit(1);

    const row = results[0];
    if (!row) return null;

    return this.mapRowToPolicy(row);
  }

  /**
   * Get the latest policy for a retailer by retailer name (case-sensitive).
   */
  async getPolicyByName(retailerName: string): Promise<RetailerPolicy | null> {
    const results = await this.db
      .select({
        policy: policies,
        retailer: retailers,
      })
      .from(policies)
      .innerJoin(retailers, eq(policies.retailerId, retailers.id))
      .where(eq(retailers.name, retailerName))
      .orderBy(desc(policies.version))
      .limit(1);

    const row = results[0];
    if (!row) return null;

    return this.mapRowToPolicy(row);
  }

  /**
   * Get the latest policy for a retailer by slug.
   */
  async getPolicyBySlug(slug: string): Promise<RetailerPolicy | null> {
    const results = await this.db
      .select({
        policy: policies,
        retailer: retailers,
      })
      .from(policies)
      .innerJoin(retailers, eq(policies.retailerId, retailers.id))
      .where(eq(retailers.slug, slug))
      .orderBy(desc(policies.version))
      .limit(1);

    const row = results[0];
    if (!row) return null;

    return this.mapRowToPolicy(row);
  }

  /**
   * Create or update a retailer record. Returns the retailer UUID.
   */
  async upsertRetailer(
    name: string,
    slug: string,
    website: string,
    logoUrl?: string,
  ): Promise<string> {
    const existing = await this.db
      .select({ id: retailers.id })
      .from(retailers)
      .where(eq(retailers.slug, slug))
      .limit(1);

    if (existing[0]) {
      await this.db
        .update(retailers)
        .set({ name, website, logoUrl: logoUrl ?? null, updatedAt: new Date() })
        .where(eq(retailers.id, existing[0].id));
      return existing[0].id;
    }

    const result = await this.db
      .insert(retailers)
      .values({ name, slug, website, logoUrl: logoUrl ?? null })
      .returning({ id: retailers.id });

    log.info({ name, slug }, 'Retailer created');
    return result[0]!.id;
  }

  /**
   * Insert a new policy version for a retailer. If a policy already exists the
   * version number is automatically incremented and a history record is stored.
   */
  async upsertPolicy(
    retailerId: string,
    policy: Omit<RetailerPolicy, 'retailerId' | 'retailerName'>,
  ): Promise<void> {
    const existing = await this.db
      .select({
        id: policies.id,
        version: policies.version,
        returnWindow: policies.returnWindow,
        conditions: policies.conditions,
        exceptions: policies.exceptions,
        restockingFee: policies.restockingFee,
        exchangePolicy: policies.exchangePolicy,
        refundMethods: policies.refundMethods,
        requiresReceipt: policies.requiresReceipt,
        freeReturnShipping: policies.freeReturnShipping,
        dropOffLocations: policies.dropOffLocations,
        specialCategories: policies.specialCategories,
        sourceUrl: policies.sourceUrl,
      })
      .from(policies)
      .where(eq(policies.retailerId, retailerId))
      .orderBy(desc(policies.version))
      .limit(1);

    const newVersion = existing[0] ? existing[0].version + 1 : 1;

    // Compute a lightweight change diff when there is an existing version
    const changes: Record<string, unknown> = {};
    if (existing[0]) {
      const prev = existing[0];
      if (prev.returnWindow !== policy.returnWindow) {
        changes['returnWindow'] = {
          from: prev.returnWindow,
          to: policy.returnWindow,
        };
      }
      if (prev.requiresReceipt !== policy.requiresReceipt) {
        changes['requiresReceipt'] = {
          from: prev.requiresReceipt,
          to: policy.requiresReceipt,
        };
      }
      if (prev.freeReturnShipping !== policy.freeReturnShipping) {
        changes['freeReturnShipping'] = {
          from: prev.freeReturnShipping,
          to: policy.freeReturnShipping,
        };
      }
      if (prev.sourceUrl !== policy.sourceUrl) {
        changes['sourceUrl'] = { from: prev.sourceUrl, to: policy.sourceUrl };
      }
      if (
        JSON.stringify(prev.refundMethods) !==
        JSON.stringify(policy.refundMethod)
      ) {
        changes['refundMethods'] = {
          from: prev.refundMethods,
          to: policy.refundMethod,
        };
      }
      if (
        JSON.stringify(prev.exceptions) !== JSON.stringify(policy.exceptions)
      ) {
        changes['exceptions'] = { from: prev.exceptions, to: policy.exceptions };
      }
      if (
        JSON.stringify(prev.specialCategories) !==
        JSON.stringify(policy.specialCategories)
      ) {
        changes['specialCategories'] = {
          from: prev.specialCategories,
          to: policy.specialCategories,
        };
      }
    }

    const restockingFeePctValue =
      policy.restockingFee?.percentage != null
        ? String(policy.restockingFee.percentage)
        : null;

    const insertedPolicy = await this.db
      .insert(policies)
      .values({
        retailerId,
        returnWindow: policy.returnWindow,
        conditions: policy.conditions,
        exceptions: policy.exceptions,
        restockingFee: policy.restockingFee,
        restockingFeePct: restockingFeePctValue,
        exchangePolicy: policy.exchangePolicy,
        exchangeAllowed: policy.exchangePolicy.allowed,
        refundMethods: policy.refundMethod,
        requiresReceipt: policy.requiresReceipt,
        freeReturnShipping: policy.freeReturnShipping,
        dropOffLocations: policy.dropOffLocations,
        specialCategories: policy.specialCategories,
        sourceUrl: policy.sourceUrl,
        lastVerified: policy.lastVerified,
        version: newVersion,
      })
      .returning({ id: policies.id });

    // Store individual exception rows in the relational table
    if (policy.exceptions.length > 0 && insertedPolicy[0]) {
      const policyId = insertedPolicy[0].id;
      await this.db.insert(policyExceptions).values(
        policy.exceptions.map((ex) => ({
          policyId,
          category: ex.category,
          rule: ex.rule,
          customReturnWindow: ex.returnWindow ?? null,
          nonReturnable: ex.nonReturnable ?? false,
        })),
      );
    }

    // Store version history when there's a previous version
    if (existing[0] && Object.keys(changes).length > 0 && insertedPolicy[0]) {
      await this.db.insert(policyVersions).values({
        policyId: insertedPolicy[0].id,
        version: newVersion,
        changes,
        changedBy: 'system',
      });
    }

    log.info({ retailerId, version: newVersion }, 'Policy upserted');
  }

  /**
   * Retrieve the full version history for a retailer's policies.
   */
  async getPolicyHistory(retailerId: string): Promise<PolicyVersion[]> {
    const retailerPolicies = await this.db
      .select({ id: policies.id })
      .from(policies)
      .where(eq(policies.retailerId, retailerId));

    if (retailerPolicies.length === 0) return [];

    const policyIds = retailerPolicies.map((p) => p.id);

    const rows = await this.db
      .select()
      .from(policyVersions)
      .where(
        or(...policyIds.map((pid) => eq(policyVersions.policyId, pid))),
      )
      .orderBy(desc(policyVersions.version));

    return rows.map((r) => ({
      id: r.id,
      policyId: r.policyId,
      version: r.version,
      changes: r.changes,
      changedBy: r.changedBy,
      changedAt: r.changedAt,
    }));
  }

  /**
   * Full-text search across retailer names, policy source URLs, and
   * exception categories. Returns the latest policy for each matching retailer.
   */
  async searchPolicies(query: string): Promise<RetailerPolicy[]> {
    const pattern = `%${query}%`;

    const matchingRetailers = await this.db
      .select({ id: retailers.id })
      .from(retailers)
      .where(
        or(
          ilike(retailers.name, pattern),
          ilike(retailers.slug, pattern),
          ilike(retailers.website, pattern),
        ),
      );

    const results: RetailerPolicy[] = [];
    for (const r of matchingRetailers) {
      const policy = await this.getPolicy(r.id);
      if (policy) results.push(policy);
    }

    return results;
  }

  /**
   * Return every retailer in the database.
   */
  async getAllRetailers(): Promise<Retailer[]> {
    const rows = await this.db.select().from(retailers);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      website: r.website,
      logoUrl: r.logoUrl,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  /**
   * Convenience alias kept for backward compatibility.
   */
  async listRetailers(): Promise<
    Array<{ id: string; name: string; slug: string; website: string }>
  > {
    return this.db
      .select({
        id: retailers.id,
        name: retailers.name,
        slug: retailers.slug,
        website: retailers.website,
      })
      .from(retailers);
  }

  /**
   * Cleanly close the underlying database connection.
   */
  async close(): Promise<void> {
    await this.sql.end();
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private mapRowToPolicy(row: {
    policy: typeof policies.$inferSelect;
    retailer: typeof retailers.$inferSelect;
  }): RetailerPolicy {
    return {
      retailerId: row.retailer.id,
      retailerName: row.retailer.name,
      returnWindow: row.policy.returnWindow,
      conditions: row.policy.conditions,
      exceptions: row.policy.exceptions,
      restockingFee: row.policy.restockingFee ?? null,
      exchangePolicy: row.policy.exchangePolicy,
      refundMethod: row.policy.refundMethods,
      requiresReceipt: row.policy.requiresReceipt,
      freeReturnShipping: row.policy.freeReturnShipping,
      dropOffLocations: row.policy.dropOffLocations,
      specialCategories: row.policy.specialCategories,
      lastVerified: row.policy.lastVerified,
      sourceUrl: row.policy.sourceUrl,
    };
  }
}
