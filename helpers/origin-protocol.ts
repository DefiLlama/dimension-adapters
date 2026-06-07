import { FetchOptions, FetchResultV2 } from "../adapters/types";
import fetchURL from "../utils/fetchURL";

// Per-product daily yield is read from Origin's public daily_revenue endpoint
// (amountUSD = gross yield generated that day; triangulated against on-chain
// YieldDistribution events for OUSD: 2 events/day at $481.62 yield each =
// $963.24 ≈ API ousd.amountUSD $963.51 for 2026-05-13).
//
// Revenue is computed per product as productFees × feeBps / FEE_SCALE, where
// feeBps is read on-chain from each vault. OToken vaults expose trusteeFeeBps()
// (VaultCore.sol line 454: fee = yield × trusteeFeeBps / 1e4). ARM vaults
// expose fee() (AbstractARM.sol line 887: fees = assetIncrease × fee /
// FEE_SCALE, FEE_SCALE = 10000). Both use a 1e4 basis-point scale.
//
// On-chain readings 2026-05-17: OUSD/OETH/superOETHb/all-ARM = 2000 bps (20%);
// OS (Sonic) = 1000 bps (10%). Per-product reads handle the rate disparity.
const FEE_API = "https://api.originprotocol.com/api/v2/protocol/daily_revenue";
const FEE_SCALE = 10000;

export const ORIGIN_YIELD_LABEL = "Origin Product Yield";
export const ORIGIN_PROTOCOL_FEE_LABEL = "Origin Performance Fee";
export const ORIGIN_REBASE_LABEL = "Origin Rebase To LST Holders";
export const STAKING_REWARDS_LABEL = "OGN Staking Rewards";

/**
 * Describes one Origin product that is rolled up into a per-protocol fee
 * adapter (origin-dollar = ["ousd"], origin-ether = ["oeth", "superOethb"],
 * origin-sonic = ["os"], origin-arm = [...four ARM vaults]).
 */
export interface OriginProduct {
  /** Key under which Origin's daily_revenue API reports this product (e.g. "ousd"). */
  apiKey: string;
  /** OToken vault or ARM vault address on the product's chain. */
  vault: string;
  /**
   * Solidity ABI for the fee getter — `uint256:trusteeFeeBps` for OToken
   * vaults (VaultCore) or `uint16:fee` for ARM vaults (AbstractARM). Both
   * return basis points scaled by FEE_SCALE = 10000.
   */
  feeAbi: string;
}

/** Per-day record returned by api.originprotocol.com/api/v2/protocol/daily_revenue. */
interface OriginDailyRecord {
  timestamp: number;
  [productKey: string]: any;
}

/**
 * Builds a `fetch` for an Origin product adapter (origin-dollar, origin-ether,
 * etc). Combines Origin's published per-product daily yield with each vault's
 * on-chain performance-fee rate so that:
 *
 *   - dailyFees                 = sum over products of API `amountUSD`
 *   - dailyRevenue              = sum over products of fees × feeBps / 10000
 *   - dailySupplySideRevenue    = fees − revenue (rebase yield to holders)
 *   - dailyHoldersRevenue       = revenue (entire performance fee goes to OGN
 *                                 stakers / ARM fee collector)
 *
 * @param products  Products to roll into this adapter. Empty arrays return
 *                  zero-filled balances (used for chain branches the protocol
 *                  isn't deployed on).
 */
export const fetchOriginFees = (products: OriginProduct[]) =>
  async (options: FetchOptions): Promise<FetchResultV2> => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyHoldersRevenue = options.createBalances();

    if (products.length === 0) {
      return { dailyFees, dailyRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
    }

    const feeData: OriginDailyRecord[] = await fetchURL(FEE_API);
    const day = feeData.find((d) => d.timestamp === options.startOfDay * 1000);
    if (!day) {
      throw new Error(
        `origin-protocol: no daily_revenue record for startOfDay=${options.startOfDay} ` +
        `(${options.dateString ?? ""}) on chain=${options.chain}`,
      );
    }

    // Group products by feeAbi so we can issue one multiCall per ABI variant.
    const byAbi = new Map<string, OriginProduct[]>();
    for (const p of products) {
      if (!byAbi.has(p.feeAbi)) byAbi.set(p.feeAbi, []);
      byAbi.get(p.feeAbi)!.push(p);
    }
    const feeBpsByKey: Record<string, number> = {};
    for (const [abi, group] of byAbi) {
      const results: unknown[] = await options.api.multiCall({
        abi,
        calls: group.map((p) => p.vault),
      });
      group.forEach((p, i) => {
        const feeBps = Number(results[i]);
        if (!Number.isFinite(feeBps)) {
          throw new Error(
            `origin-protocol: invalid feeBps for ${p.apiKey} (vault ${p.vault}) — got ${results[i]}`,
          );
        }
        feeBpsByKey[p.apiKey] = feeBps;
      });
    }

    for (const p of products) {
      const rawAmountUSD = day[p.apiKey]?.amountUSD;
      const productFees = Number(rawAmountUSD ?? 0);
      if (!Number.isFinite(productFees)) {
        throw new Error(
          `origin-protocol: invalid amountUSD for ${p.apiKey} on chain=${options.chain} — got ${rawAmountUSD}`,
        );
      }
      // Skip only the exact-zero case. Origin's daily_revenue can briefly
      // report negative amountUSD on loss days (e.g. an ARM vault's NAV
      // dipping before the next rebase). Forwarding those through keeps
      // dailyFees / dailyRevenue honest instead of overstating them by
      // dropping loss days.
      if (productFees === 0) continue;
      const feeBps = feeBpsByKey[p.apiKey];
      if (!Number.isFinite(feeBps)) {
        throw new Error(`origin-protocol: missing feeBps for ${p.apiKey}`);
      }
      const productRevenue = productFees * feeBps / FEE_SCALE;
      const productSupplySide = productFees - productRevenue;
      dailyFees.addUSDValue(productFees, ORIGIN_YIELD_LABEL);
      dailyRevenue.addUSDValue(productRevenue, ORIGIN_PROTOCOL_FEE_LABEL);
      dailySupplySideRevenue.addUSDValue(productSupplySide, ORIGIN_REBASE_LABEL);
      dailyHoldersRevenue.addUSDValue(productFees, STAKING_REWARDS_LABEL);
    }

    return {
      dailyFees,
      dailyRevenue,
      dailyHoldersRevenue,
      dailySupplySideRevenue,
    };
  };
