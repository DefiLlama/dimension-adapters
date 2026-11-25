import { PromisePool } from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const api = "https://api.guanaco.fi/v1";
const day = 86400;

async function fetchVolume({ startTimestamp: start, endTimestamp: end, createBalances }: FetchOptions) {
  const markets = await fetchURL(`${api}/market-history?protocol=guanaco`);
  if (markets.protocol !== "guanaco" || markets.includesMempool !== false ||
      !(markets.indexedThrough >= end) || !markets.assets?.length)
    throw new Error("Incomplete Guanaco market history");

  const categories = new Set<string>();
  const active: string[] = [];
  for (const { category, firstPoolAt } of markets.assets) {
    if (!/^[a-f0-9]{64}$/.test(category) || categories.has(category) || !Number.isInteger(firstPoolAt))
      throw new Error("Invalid Guanaco market inventory");
    categories.add(category);
    if (firstPoolAt < end) active.push(category);
  }

  const { results, errors } = await PromisePool.withConcurrency(3).for(active).process(async (category) => {
    const result = await fetchURL(`${api}/candles/${category}?protocol=guanaco&start=${start}&end=${end}&step=${day}`);
    if (Array.isArray(result.candles) && result.candles.length === 0) {
      const check = await fetchURL(`${api}/trades/${category}?protocol=guanaco&start=${start}&end=${end}&limit=1`);
      if (check.protocol === "guanaco" && check.includesMempool === false && check.start === start &&
          check.end === end && check.truncated === false && Array.isArray(check.trades) && check.trades.length === 0)
        return 0n;
      throw new Error(`Missing candle for active Guanaco market ${category}`);
    }
    if (result.protocol !== "guanaco" || result.includesMempool !== false || result.start !== start ||
        result.end !== end || result.candles?.length !== 1 || result.candles[0].time !== start ||
        !/^\d+$/.test(result.candles[0].volumeSatoshis))
      throw new Error(`Incomplete Guanaco candle for ${category}`);
    return BigInt(result.candles[0].volumeSatoshis);
  });
  if (errors.length) throw errors[0];
  const sats = results.reduce((total, amount) => total + amount, 0n);
  const dailyVolume = createBalances();
  dailyVolume.addCGToken("bitcoin-cash", Number(sats) / 1e8);
  return { dailyVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.BITCOIN_CASH],
  start: "2026-09-06",
  fetch: fetchVolume,
  methodology: { Volume: "Sum the BCH side of confirmed swap legs from Guanaco pools across CashToken markets using the Guanaco Bitcoin Cash indexer." },
};
export default adapter;
