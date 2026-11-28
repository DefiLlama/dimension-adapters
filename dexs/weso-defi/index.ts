import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { CosmosChainMetricConfig, getBlockRangeForTimestamps } from "../../helpers/cosmosChainFees";
import fetchURL, { httpGet } from "../../utils/fetchURL";

const LCDS = [
  "https://terraclassic-lcd-server-01.stakely.io",
  "https://lcd.terra-classic.hexxagon.io",
  "https://terra-classic-lcd.publicnode.com",
];
const TX_SEARCH_RPC = "https://terraclassic-rpc-server-01.stakely.io";
const blockConfig: CosmosChainMetricConfig = {
  chain: CHAIN.TERRA,
  rpcs: [TX_SEARCH_RPC, "https://rpc.terra-classic.hexxagon.io", "https://terra-classic-rpc.publicnode.com"],
  denoms: {},
};

const FACTORY = "terra1veqa6znu8lfdmz9kp9v047chfmn84q5k3pacme75gl8ywmplk92q6xnq2k";
const WESO = "terra13ryrrlcskwa05cd94h54c8rnztff9l82pp0zqnfvlwt77za8wjjsld36ms";

// CW20 1:1 wraps of LUNC / USTC
const WRAP_AS_NATIVE: Record<string, string> = {
  terra10fusc7487y4ju2v5uavkauf3jdpxx9h8sc7wsqdqg4rne8t4qyrq8385q6: "uluna",
  terra1uncwzdhxdktqpx4rj6mkuhl0ekv0raua0058rr7zgnapm9najyyqgtpf6h: "uusd",
};

const EXCLUDED_PAIR_TYPES = new Set(["token_bonding", "converter"]);

type AssetInfo = { native_token: { denom: string } } | { token: { contract_addr: string } };

type VolumeBucketsResponse = {
  base_asset: AssetInfo;
  quote_asset: AssetInfo;
  buckets: { hour_id: number; base_volume: string; quote_volume: string }[];
};

function pairTypeKey(pairType: any): string {
  if (!pairType) return "";
  if (typeof pairType === "string") return pairType.toLowerCase();
  const key = Object.keys(pairType)[0] ?? "";
  if (key === "custom" && typeof pairType.custom === "string") return pairType.custom.toLowerCase();
  return key.toLowerCase();
}

function assetId(info: AssetInfo): string {
  if ("native_token" in info) return info.native_token.denom;
  return WRAP_AS_NATIVE[info.token.contract_addr] ?? info.token.contract_addr;
}

async function querySmart<T>(contract: string, query: object): Promise<T> {
  const encoded = encodeURIComponent(Buffer.from(JSON.stringify(query)).toString("base64"));
  let lastError: unknown;
  for (const lcd of LCDS) {
    try {
      const res = await httpGet(`${lcd}/cosmwasm/wasm/v1/contract/${contract}/smart/${encoded}`);
      if (res?.data === undefined) throw new Error(`weso-defi: no data from ${lcd} for ${contract}`);
      return res.data;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

async function getAmmPairContracts(): Promise<string[]> {
  const all: { contract_addr: string; pair_type?: unknown; asset_infos: unknown }[] = [];
  while (true) {
    const start_after = all.length ? all[all.length - 1].asset_infos : undefined;
    const { pairs } = await querySmart<{ pairs: typeof all }>(FACTORY, { pairs: { limit: 30, start_after } });
    if (!Array.isArray(pairs)) throw new Error("weso-defi: malformed factory pairs response");
    if (!pairs.length) break;
    all.push(...pairs);
  }
  return all.filter((p) => !EXCLUDED_PAIR_TYPES.has(pairTypeKey(p.pair_type))).map((p) => p.contract_addr);
}

async function getCurveSwapTxs(fromBlock: number, toBlock: number): Promise<any[]> {
  const query = `wasm._contract_address='${WESO}' AND wasm.action='swap' AND tx.height>=${fromBlock} AND tx.height<=${toBlock}`;
  const txs: any[] = [];
  for (let page = 1; ; page++) {
    const res = await fetchURL(`${TX_SEARCH_RPC}/tx_search?query=${encodeURIComponent(`"${query}"`)}&page=${page}&per_page=100&order_by=${encodeURIComponent('"asc"')}`);
    if (res?.error || !Array.isArray(res?.result?.txs) || res?.result?.total_count === undefined)
      throw new Error(`weso-defi: bad tx_search response for blocks ${fromBlock}-${toBlock} page ${page}`);
    txs.push(...res.result.txs);
    if (txs.length >= Number(res.result.total_count)) return txs;
    if (!res.result.txs.length) throw new Error(`weso-defi: tx_search pagination stalled at ${txs.length}/${res.result.total_count}`);
  }
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const pairs = await getAmmPairContracts();
  for (const pair of pairs) {
    const data = await querySmart<VolumeBucketsResponse>(pair, { volume_buckets: { limit: 168 } });
    const base = assetId(data.base_asset);
    const quote = assetId(data.quote_asset);
    for (const bucket of data.buckets ?? []) {
      const hourStart = bucket.hour_id * 3600;
      if (hourStart + 3600 <= options.startTimestamp || hourStart >= options.endTimestamp) continue;
      dailyVolume.add(base, bucket.base_volume);
      dailyVolume.add(quote, bucket.quote_volume);
    }
  }

  const { fromBlock, toBlock } = await getBlockRangeForTimestamps(blockConfig, options.startTimestamp, options.endTimestamp);
  const txs = await getCurveSwapTxs(fromBlock, toBlock);
  for (const tx of txs) {
    if (Number(tx?.tx_result?.code ?? 0) !== 0) continue;
    for (const event of tx.tx_result.events ?? []) {
      if (event.type !== "wasm") continue;
      const attributes: { key: string; value: string }[] = event.attributes ?? [];
      const attrs = Object.fromEntries(attributes.map((a) => [a.key, a.value]));
      // curve sells emit action=swap followed by action=burn in the same event
      const isSwap = attributes.some((a) => a.key === "action" && a.value === "swap");
      if (attrs._contract_address !== WESO || !isSwap) continue;
      if (attrs.offer_asset === "uluna") dailyVolume.add("uluna", attrs.offer_amount);
      else if (attrs.ask_asset === "uluna") dailyVolume.add("uluna", attrs.return_amount);
    }
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.TERRA],
  start: "2026-02-17",
  methodology: {
    Volume:
      "Swaps on WESO DeFi factory AMM pairs (reflective + cumulative), read from the pairs' on-chain hourly volume buckets, plus buys and sells on the $WESO bonding curve, counted on their LUNC side from the curve's swap events. CWLUNC/CWUSTC wrap/unwrap and converter pairs are excluded.",
  },
};

export default adapter;
