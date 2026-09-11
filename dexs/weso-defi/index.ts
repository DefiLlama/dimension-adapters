import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

// WESO DeFi AMM factory on Terra Classic (chain key: terra, NOT terra2).
const LCD = "https://terra-classic-lcd.publicnode.com";
const FACTORY =
  "terra1veqa6znu8lfdmz9kp9v047chfmn84q5k3pacme75gl8ywmplk92q6xnq2k";

// CW20 1:1 wraps — map to native denoms so Llama can price volume.
const CWLUNC =
  "terra10fusc7487y4ju2v5uavkauf3jdpxx9h8sc7wsqdqg4rne8t4qyrq8385q6";
const CWUSTC =
  "terra1uncwzdhxdktqpx4rj6mkuhl0ekv0raua0058rr7zgnapm9najyyqgtpf6h";
const WRAP_AS_NATIVE: Record<string, string> = {
  [CWLUNC]: "uluna",
  [CWUSTC]: "uusd",
};

// Wrap/unwrap + converter are not DEX swaps.
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

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const pairs = await getAmmPairContracts();

  for (const pair of pairs) {
    const data = await querySmart<VolumeBucketsResponse>(pair, {
      volume_buckets: { limit: BUCKET_LIMIT },
    });
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
      // base_volume / quote_volume are offer-side amounts (one side per swap).
      if (base && bucket.base_volume && bucket.base_volume !== "0") {
        dailyVolume.add(base, bucket.base_volume);
      }
      if (quote && bucket.quote_volume && bucket.quote_volume !== "0") {
        dailyVolume.add(quote, bucket.quote_volume);
      }
    }
  }

  return { dailyVolume };
};

const methodology = {
  Volume:
    "On-chain hourly volume_buckets from WESO AMM factory pairs on Terra Classic (reflective + cumulative). Counts offer-side swap amounts as raw token balances. Excludes CWLUNC/CWUSTC token_bonding wrap/unwrap and converter pairs. $WESO cw20_bonding curve buys/sells are not included (curve has no time-bucketed volume query). Buckets retain at most 168 hours.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.TERRA],
  // Factory instantiate height 27353737 @ 2026-02-17T02:40:17Z (terra-classic-lcd.publicnode.com).
  start: "2026-02-17",
  methodology,
};

export default adapter;
