import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { CosmosChainMetricConfig, getBlockRangeForTimestamps } from "../../helpers/cosmosChainFees";
import fetchURL, { httpGet } from "../../utils/fetchURL";

const FACTORY = "terra1ypwj6sw25g0qcykv7mzmcvsndvx56r3yrgkaw3fds7yzwl7fwwcsnxkeh7";
const FEE_COLLECTOR = "terra1e98felysrzt8z9k0ryljgfpg0k0vsnqw83hv02kz6gxkj7n7w23s5vq5gf";

const LCDS = ["https://terraclassic-lcd-server-01.stakely.io", "https://terra-classic-lcd.publicnode.com"];
const config: CosmosChainMetricConfig = {
  chain: CHAIN.TERRA,
  rpcs: ["https://terraclassic-rpc-server-01.stakely.io", "https://rpc.terra-classic.hexxagon.io"],
  denoms: {},
};
const TX_SEARCH_RPC = "https://terraclassic-rpc-server-01.stakely.io";

const PRICED_DENOMS = new Set([
  "uluna", // LUNC
  "uusd", // USTC
  "ibc/0BB9D8513E8E8E9AE6A9D211D9136E6DA42288DDE6CFAA453A150A4566054DC5", // USDC from Noble (transfer/channel-113 -> noble-1)
]);

async function withFallback<T>(urls: string[], call: (url: string) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (const url of urls) {
    try {
      return await call(url);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

async function getPairs(): Promise<Set<string>> {
  const pairs = new Set<string>();
  let startAfter: unknown;
  while (true) {
    const query = { pairs: { pagination: { limit: 30, ...(startAfter ? { start_after: startAfter } : {}) } } };
    const encoded = encodeURIComponent(Buffer.from(JSON.stringify(query)).toString("base64"));
    const res = await withFallback(LCDS, (lcd) => httpGet(`${lcd}/cosmwasm/wasm/v1/contract/${FACTORY}/smart/${encoded}`));
    const page: { asset1: unknown; asset2: unknown; contract: string }[] = res?.data?.pairs;
    if (!Array.isArray(page)) throw new Error("garuda-defi: malformed factory pairs response");
    if (!page.length) break;
    page.forEach((p) => pairs.add(p.contract));
    startAfter = [page[page.length - 1].asset1, page[page.length - 1].asset2];
  }
  if (!pairs.size) throw new Error("garuda-defi: factory returned no pairs");
  return pairs;
}

async function getFeeCollectorTxs(fromBlock: number, toBlock: number): Promise<any[]> {
  const query = `wasm._contract_address='${FEE_COLLECTOR}' AND tx.height>=${fromBlock} AND tx.height<=${toBlock}`;
  const txs: any[] = [];
  for (let page = 1; ; page++) {
    const res = await fetchURL(`${TX_SEARCH_RPC}/tx_search?query=${encodeURIComponent('"' + query + '"')}&page=${page}&per_page=100&order_by=${encodeURIComponent('"asc"')}`);
    if (res?.error || !Array.isArray(res?.result?.txs) || res?.result?.total_count === undefined)
      throw new Error(`garuda-defi: bad tx_search response for blocks ${fromBlock}-${toBlock} page ${page}`);
    txs.push(...res.result.txs);
    if (txs.length >= Number(res.result.total_count)) return txs;
    if (!res.result.txs.length) throw new Error(`garuda-defi: tx_search pagination stalled at ${txs.length}/${res.result.total_count}`);
  }
}

const assetId = (asset: string): string => {
  const parsed = JSON.parse(asset);
  return parsed.native ?? parsed.cw20;
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const pairs = await getPairs();
  const { fromBlock, toBlock } = await getBlockRangeForTimestamps(config, options.startTimestamp, options.endTimestamp);
  const txs = await getFeeCollectorTxs(fromBlock, toBlock);

  for (const tx of txs) {
    if (Number(tx?.tx_result?.code ?? 0) !== 0) continue; // failed tx
    for (const event of tx?.tx_result?.events ?? []) {
      if (event?.type !== "wasm") continue;
      const attrs: Record<string, string> = Object.fromEntries((event.attributes ?? []).map((a: any) => [a.key, a.value]));
      // a routed tx has one swap event per hop, each on its own pair
      if (attrs.action !== "swap" || !pairs.has(attrs._contract_address)) continue;
      const offerAsset = assetId(attrs.offer_asset);
      const returnAsset = assetId(attrs.return_asset);
      if (PRICED_DENOMS.has(offerAsset)) {
        dailyVolume.add(offerAsset, attrs.offer_amount);
      } else if (PRICED_DENOMS.has(returnAsset)) {
        // the commission is taken from the offer side, so return_amount is net of it: scale it back to the gross trade
        const offer = BigInt(attrs.offer_amount);
        const gross = (BigInt(attrs.return_amount) * offer) / (offer - BigInt(attrs.total_commission));
        dailyVolume.add(returnAsset, gross.toString());
      }
    }
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.TERRA],
  start: '2026-04-11',
  methodology: {
    Volume: "Swaps on Garuda DeFi pairs, read from the pair swap events on Terra Classic. Each swap is counted once, on its LUNC, USTC or USDC side, before the swap fee. Swaps between two other tokens are not counted.",
  },
};

export default adapter;
