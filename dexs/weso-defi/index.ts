import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

// WESO DeFi AMM factory on Terra Classic (chain key: terra, NOT terra2).
const LCD = "https://terra-classic-lcd.publicnode.com";
const FCD = "https://terra-classic-fcd.publicnode.com";
const FACTORY =
  "terra1veqa6znu8lfdmz9kp9v047chfmn84q5k3pacme75gl8ywmplk92q6xnq2k";
const WESO =
  "terra13ryrrlcskwa05cd94h54c8rnztff9l82pp0zqnfvlwt77za8wjjsld36ms";

// CW20 1:1 wraps — map to native denoms so Llama can price volume.
const CWLUNC =
  "terra10fusc7487y4ju2v5uavkauf3jdpxx9h8sc7wsqdqg4rne8t4qyrq8385q6";
const CWUSTC =
  "terra1uncwzdhxdktqpx4rj6mkuhl0ekv0raua0058rr7zgnapm9najyyqgtpf6h";
const WRAP_AS_NATIVE: Record<string, string> = {
  [CWLUNC]: "uluna",
  [CWUSTC]: "uusd",
};

// Wrap/unwrap + converter are not DEX swaps. $WESO bonding curve is counted separately.
const EXCLUDED_PAIR_TYPES = new Set(["token_bonding", "converter"]);

const BUCKET_LIMIT = 168;
const FCD_PAGE = 100;
const FCD_MAX_PAGES = 40;

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

function ulunaAmount(raw: string | undefined): string | null {
  if (!raw) return null;
  if (raw.endsWith("uluna")) {
    const n = raw.slice(0, -5);
    return n && n !== "0" ? n : null;
  }
  return null;
}

function addWesoCurveTx(dailyVolume: { add: (t: string, a: string) => void }, tx: any) {
  const val = tx?.tx?.value || {};
  for (const m of val.msg || []) {
    const mv = m.value || {};
    if (mv.contract !== WESO) continue;
    const inner = mv.msg || {};
    const sender = mv.sender;

    if (inner.buy) {
      const funds = mv.funds || mv.sent_funds || [];
      for (const coin of funds) {
        if (coin?.denom === "uluna" && coin.amount && coin.amount !== "0") {
          dailyVolume.add("uluna", coin.amount);
        }
      }
      continue;
    }

    if (inner.burn || inner.sell) {
      let payout = 0n;
      for (const log of tx.logs || []) {
        for (const ev of log.events || []) {
          if (ev.type !== "transfer") continue;
          const attrs: Record<string, string> = {};
          for (const a of ev.attributes || []) attrs[a.key] = a.value;
          if (attrs.sender !== WESO || attrs.recipient !== sender) continue;
          const n = ulunaAmount(attrs.amount);
          if (!n) continue;
          const bn = BigInt(n);
          if (bn > payout) payout = bn;
        }
      }
      if (payout > 0n) dailyVolume.add("uluna", payout.toString());
    }
  }
}

async function addWesoCurveVolume(
  dailyVolume: { add: (t: string, a: string) => void },
  startTimestamp: number,
  endTimestamp: number,
) {
  let offset: number | undefined;
  for (let i = 0; i < FCD_MAX_PAGES; i++) {
    const qs = new URLSearchParams({
      account: WESO,
      limit: String(FCD_PAGE),
    });
    if (offset != null) qs.set("offset", String(offset));
    const data = await httpGet(`${FCD}/v1/txs?${qs.toString()}`, {
      headers: LCD_HEADERS,
    });
    const txs: any[] = data?.txs || [];
    if (!txs.length) break;

    for (const tx of txs) {
      const ts = Date.parse(tx.timestamp) / 1000;
      if (!Number.isFinite(ts)) continue;
      if (ts >= endTimestamp || ts < startTimestamp) continue;
      addWesoCurveTx(dailyVolume, tx);
    }

    const oldest = Date.parse(txs[txs.length - 1].timestamp) / 1000;
    if (Number.isFinite(oldest) && oldest < startTimestamp) break;
    if (data.next == null) break;
    offset = data.next;
  }
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
      if (base && bucket.base_volume && bucket.base_volume !== "0") {
        dailyVolume.add(base, bucket.base_volume);
      }
      if (quote && bucket.quote_volume && bucket.quote_volume !== "0") {
        dailyVolume.add(quote, bucket.quote_volume);
      }
    }
  }

  await addWesoCurveVolume(
    dailyVolume,
    options.startTimestamp,
    options.endTimestamp,
  );

  return { dailyVolume };
};

const methodology = {
  Volume:
    "Factory AMM swaps (reflective + cumulative) from on-chain volume_buckets, plus $WESO bonding-curve buy/sell volume as native LUNC. Buys count uluna paid into terra13ryrr…ld36ms; sells count uluna paid back to the trader. Excludes CWLUNC/CWUSTC wrap/unwrap, converter pairs, and non-swap curve transfers (e.g. flywheel). AMM buckets retain 168 hours; curve volume is read from FCD txs in the requested window.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.TERRA],
  // Factory instantiate height 27353737 @ 2026-02-17T02:40:17Z.
  start: "2026-02-17",
  methodology,
};

export default adapter;
