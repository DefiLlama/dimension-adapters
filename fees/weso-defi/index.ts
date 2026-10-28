import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { httpGet } from "../../utils/fetchURL";

// WESO DeFi AMM factory on Terra Classic (chain key: terra, NOT terra2).
const LCD = "https://terra-classic-lcd.publicnode.com";
const FACTORY =
  "terra1veqa6znu8lfdmz9kp9v047chfmn84q5k3pacme75gl8ywmplk92q6xnq2k";

// CW20 1:1 wraps — map to native denoms so Llama can price fees.
const CWLUNC =
  "terra10fusc7487y4ju2v5uavkauf3jdpxx9h8sc7wsqdqg4rne8t4qyrq8385q6";
const CWUSTC =
  "terra1uncwzdhxdktqpx4rj6mkuhl0ekv0raua0058rr7zgnapm9najyyqgtpf6h";
const WRAP_AS_NATIVE: Record<string, string> = {
  [CWLUNC]: "uluna",
  [CWUSTC]: "uusd",
};

// Wrap/unwrap + converter are not DEX swaps (same exclusion as volume adapter).
const EXCLUDED_PAIR_TYPES = new Set(["token_bonding", "converter"]);

// On-chain hourly volume buckets retain at most 168 hours (7d).
const BUCKET_LIMIT = 168;

const LCD_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; DefiLlama/1.0)",
};

type AssetInfo =
  | { native_token: { denom: string } }
  | { token: { contract_addr: string } };

type VolumeBucket = {
  hour_id: number;
  base_volume: string;
  quote_volume: string;
  swap_count?: number;
};

type VolumeBucketsResponse = {
  base_asset: AssetInfo;
  quote_asset: AssetInfo;
  current_hour_id: number;
  buckets: VolumeBucket[];
};

type PairConfig = {
  commission_rate: string;
  fee_collector_share_permille: number | string;
  fee_collector_addr?: string;
};

function pairTypeKey(pairType: unknown): string {
  if (!pairType) return "";
  if (typeof pairType === "string") return pairType.toLowerCase();
  if (typeof pairType === "object") {
    const key = Object.keys(pairType as object)[0];
    if (
      key === "custom" &&
      typeof (pairType as { custom?: string }).custom === "string"
    ) {
      return (pairType as { custom: string }).custom.toLowerCase();
    }
    return (key || "").toLowerCase();
  }
  return "";
}

function assetId(info: AssetInfo | undefined): string | null {
  if (!info) return null;
  if ("native_token" in info && info.native_token?.denom) {
    return info.native_token.denom;
  }
  if ("token" in info && info.token?.contract_addr) {
    const addr = info.token.contract_addr;
    return WRAP_AS_NATIVE[addr] || addr;
  }
  return null;
}

async function querySmart<T>(contract: string, query: object): Promise<T> {
  const encoded = Buffer.from(JSON.stringify(query)).toString("base64");
  const url = `${LCD}/cosmwasm/wasm/v1/contract/${contract}/smart/${encoded}`;
  const res = await httpGet(url, { headers: LCD_HEADERS });
  if (!res || res.data === undefined) {
    throw new Error(`WESO LCD smart query returned no data for ${contract}`);
  }
  return res.data as T;
}

async function getAmmPairContracts(): Promise<string[]> {
  const all: Array<{
    contract_addr: string;
    pair_type?: unknown;
    asset_infos?: unknown;
  }> = [];
  let page: typeof all;
  do {
    const query: {
      pairs: { limit: number; start_after?: unknown };
    } = { pairs: { limit: 30 } };
    if (all.length) {
      query.pairs.start_after = all[all.length - 1].asset_infos;
    }
    const { pairs } = await querySmart<{ pairs: typeof all }>(FACTORY, query);
    if (!Array.isArray(pairs)) {
      throw new Error("WESO factory returned a malformed pairs response");
    }
    page = pairs;
    all.push(...page);
  } while (page.length > 0);

  return all
    .filter((p) => !EXCLUDED_PAIR_TYPES.has(pairTypeKey(p.pair_type)))
    .map((p) => p.contract_addr)
    .filter(Boolean);
}

function bucketOverlaps(
  hourId: number,
  startTimestamp: number,
  endTimestamp: number,
): boolean {
  const hourStart = hourId * 3600;
  const hourEnd = hourStart + 3600;
  return hourStart < endTimestamp && hourEnd > startTimestamp;
}

/** Multiply integer amount by Decimal commission_rate (e.g. "0.002") with floor. */
function applyCommission(amount: string, commissionRate: string): string {
  if (!amount || amount === "0") return "0";
  const rate = String(commissionRate).trim();
  if (!rate || rate === "0") return "0";
  const [wholePart, fracPart = ""] = rate.split(".");
  const decimals = fracPart.length;
  const digits = `${wholePart || "0"}${fracPart}`.replace(/^0+(?=\d)/, "") || "0";
  const rateNum = BigInt(digits);
  if (rateNum === 0n) return "0";
  const scale = 10n ** BigInt(decimals);
  return ((BigInt(amount) * rateNum) / scale).toString();
}

/** Apply fee_collector_share_permille (1000 = 100%). */
function applyCollectorShare(feeAmount: string, sharePermille: number): string {
  if (!feeAmount || feeAmount === "0") return "0";
  if (sharePermille >= 1000) return feeAmount;
  if (sharePermille <= 0) return "0";
  return ((BigInt(feeAmount) * BigInt(sharePermille)) / 1000n).toString();
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const pairs = await getAmmPairContracts();

  for (const pair of pairs) {
    const [config, data] = await Promise.all([
      querySmart<PairConfig>(pair, { config: {} }),
      querySmart<VolumeBucketsResponse>(pair, {
        volume_buckets: { limit: BUCKET_LIMIT },
      }),
    ]);

    const commissionRate = config.commission_rate;
    const sharePermille = Number(config.fee_collector_share_permille);
    if (
      commissionRate === undefined ||
      commissionRate === null ||
      Number.isNaN(sharePermille)
    ) {
      throw new Error(
        `WESO pair ${pair} missing commission_rate or fee_collector_share_permille`,
      );
    }

    const base = assetId(data.base_asset);
    const quote = assetId(data.quote_asset);

    for (const bucket of data.buckets || []) {
      if (
        !bucketOverlaps(
          bucket.hour_id,
          options.startTimestamp,
          options.endTimestamp,
        )
      ) {
        continue;
      }

      // Fees = offer_volume * pair.commission_rate; fee asset = offer asset.
      // base_volume / quote_volume are offer-side amounts (one side per swap).
      const offers: Array<[string | null, string | undefined]> = [
        [base, bucket.base_volume],
        [quote, bucket.quote_volume],
      ];

      for (const [asset, volume] of offers) {
        if (!asset || !volume || volume === "0") continue;
        const fee = applyCommission(volume, commissionRate);
        if (fee === "0") continue;

        // Live fee_collector_share_permille (sampled pairs = 1000 → 100% to
        // fee_collector). Remainder of this commission field is NOT attributed
        // to LPs without proof — reflective pools may compensate LPs via the
        // curve, not this commission — so dailySupplySideRevenue is omitted.
        const toCollector = applyCollectorShare(fee, sharePermille);

        // Gross fees = full AMM commission field.
        dailyFees.add(asset, fee, METRIC.SWAP_FEES);
        // With share=1000, revenue == fees. If share were lower, only the
        // collector portion is counted as revenue (unknown remainder omitted,
        // not invented as supply-side).
        if (toCollector !== "0") {
          dailyRevenue.add(asset, toCollector, "Swap Fees To Protocol");
          dailyProtocolRevenue.add(asset, toCollector, "Swap Fees To Protocol");
        }
      }
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue };
};

const methodology = {
  Fees:
    "AMM swap commission only: for each hourly volume_bucket on factory pairs (reflective + cumulative), fee = offer_volume * live pair.commission_rate (fee asset = offer asset). Excludes token_bonding wrap/unwrap and converter pairs. $WESO cw20_bonding curve tax_collected is cumulative-only (project_tax_pct 10) with no time-bucketed query, so curve taxes are NOT included. Buckets retain at most 168 hours.",
  Revenue:
    "fee_collector_share_permille of the AMM commission (live per pair; sampled pairs are 1000 = 100%) sent to fee_collector terra1wkdm6wcm4srahrvp09jea7csfq3yuacc4gmyft6p6n6pls9wy5js9lqhqq. No separate LP share of this commission field is counted — reflective pools may compensate LPs via the curve, not this commission — so SupplySideRevenue is omitted.",
  ProtocolRevenue:
    "Same as Revenue: at current on-chain shares the counted AMM commission accrues to the fee collector / protocol.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]:
      "Offer-side swap volume × live pair.commission_rate from WESO AMM volume_buckets. Does not include $WESO bonding-curve taxes (cumulative tax_collected only).",
  },
  Revenue: {
    "Swap Fees To Protocol":
      "fee_collector_share_permille of AMM commission (1000 on sampled pairs) to the fee collector.",
  },
  ProtocolRevenue: {
    "Swap Fees To Protocol":
      "fee_collector_share_permille of AMM commission (1000 on sampled pairs) to the fee collector.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.TERRA],
  // Factory instantiate height 27353737 @ 2026-02-17T02:40:17Z (terra-classic-lcd.publicnode.com).
  start: "2026-02-17",
  methodology,
  breakdownMethodology,
};

export default adapter;
