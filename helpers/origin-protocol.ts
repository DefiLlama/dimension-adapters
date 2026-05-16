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

export interface OriginProduct {
  apiKey: string;
  vault: string;
  feeAbi: string;
}

export const fetchOriginFees = (products: OriginProduct[]) =>
  async (options: FetchOptions): Promise<FetchResultV2> => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();

    if (products.length === 0) {
      return { dailyFees, dailyRevenue, dailyHoldersRevenue: dailyRevenue, dailySupplySideRevenue: dailyFees.clone() };
    }

    const feeData = await fetchURL(FEE_API);
    const day = feeData.find((d: any) => d.timestamp === options.startOfDay * 1000);
    if (!day) {
      return { dailyFees, dailyRevenue, dailyHoldersRevenue: dailyRevenue, dailySupplySideRevenue: dailyFees.clone() };
    }

    const byAbi = new Map<string, OriginProduct[]>();
    for (const p of products) {
      if (!byAbi.has(p.feeAbi)) byAbi.set(p.feeAbi, []);
      byAbi.get(p.feeAbi)!.push(p);
    }
    const feeBpsByKey: Record<string, number> = {};
    for (const [abi, group] of byAbi) {
      const results: any[] = await options.api.multiCall({
        abi,
        calls: group.map(p => p.vault),
      });
      group.forEach((p, i) => { feeBpsByKey[p.apiKey] = Number(results[i]); });
    }

    for (const p of products) {
      const productFees = Number(day[p.apiKey]?.amountUSD || 0);
      if (productFees <= 0) continue;
      const feeBps = feeBpsByKey[p.apiKey];
      const productRevenue = productFees * feeBps / FEE_SCALE;
      dailyFees.addUSDValue(productFees);
      dailyRevenue.addUSDValue(productRevenue);
    }

    const dailySupplySideRevenue = dailyFees.clone();
    dailySupplySideRevenue.subtract(dailyRevenue);

    return {
      dailyFees,
      dailyRevenue,
      dailyHoldersRevenue: dailyRevenue,
      dailySupplySideRevenue,
    };
  };
