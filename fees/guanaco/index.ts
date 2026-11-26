import { PromisePool } from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { burnedBuybacks } from "./buybacks";

// Guanaco publishes confirmed pool swaps through the same indexer used by its DEX volume adapter.
const indexer = "https://api.guanaco.fi/v1";
// Fee levels use the deployment order published by Guanaco at https://guanaco.fi/liquidity.
const tierBps = [1, 5, 30, 100, 10, 20, 50];
const satoshisPerBch = 100_000_000;
const bpsPerUnit = 10_000;
const protocolShare = 0.10; // The allocation is documented at https://guanaco.fi/gua.
const labels = tierBps.map(bps => `Swap Fees (${bps / 100}% Tier)`);
const lpLabel = "Swap Fees To Liquidity Providers";
const revenueLabel = "Swap Fees Allocated To GUA Buybacks";
const burnLabel = "GUA Buyback And Burn";

async function candleVolume(category: string, start: number, end: number, tier?: number): Promise<bigint> {
  const step = end - start;
  const window = `protocol=guanaco&start=${start}&end=${end}`;
  const tierQuery = tier === undefined ? "" : `&fee_level=${tier}`;
  const data = await fetchURL(`${indexer}/candles/${category}?${window}&step=${step}${tierQuery}`);
  if (data.protocol !== "guanaco" || data.includesMempool !== false || data.feeLevel !== (tier ?? null) ||
      data.start !== start || data.end !== end || data.step !== step || !Array.isArray(data.candles))
    throw new Error(`Incomplete Guanaco candle window for ${category}`);

  if (data.candles.length === 0) {
    if (tier !== undefined) return 0n; // The sum of all tiers is checked against the unfiltered total.
    const check = await fetchURL(`${indexer}/trades/${category}?${window}&limit=1`);
    if (check.protocol === "guanaco" && check.includesMempool === false && check.start === start &&
        check.end === end && check.truncated === false && check.trades?.length === 0)
      return 0n;
    throw new Error(`Missing candle for active Guanaco market ${category}`);
  }

  const [candle] = data.candles;
  if (data.candles.length !== 1 || candle.time !== start || !/^\d+$/.test(candle.volumeSatoshis))
    throw new Error(`Invalid Guanaco candle volume for ${category}`);
  return BigInt(candle.volumeSatoshis);
}

async function runRequests<T, R>(items: T[], request: (item: T) => Promise<R>) {
  const { results, errors } = await PromisePool.withConcurrency(2).for(items).process(request);
  if (errors.length) throw errors[0];
  return results;
}

async function volumeByTier(start: number, end: number) {
  const markets = await fetchURL(`${indexer}/market-history?protocol=guanaco`);
  if (markets.protocol !== "guanaco" || markets.includesMempool !== false ||
      markets.volumeDefinition !== "gross_swap_legs" || !(markets.indexedThrough >= end) || !markets.assets?.length)
    throw new Error("Incomplete Guanaco market history");

  const seen = new Set<string>();
  const active: { category: string; knownTiers: number[] }[] = [];
  for (const { category, firstPoolAt, feeTiers } of markets.assets) {
    if (!/^[a-f0-9]{64}$/.test(category) || seen.has(category) || !Number.isInteger(firstPoolAt))
      throw new Error("Invalid Guanaco market inventory");
    seen.add(category);
    if (firstPoolAt < end) {
      const knownTiers = Array.isArray(feeTiers)
        ? [...new Set<number>(feeTiers.map(row => row.feeLevel).filter(tier =>
          Number.isInteger(tier) && tier >= 0 && tier < tierBps.length
        ))]
        : [];
      active.push({ category, knownTiers });
    }
  }

  const traded = await runRequests(active, async market => ({
    ...market,
    total: await candleVolume(market.category, start, end),
    volumes: tierBps.map(() => 0n),
  }));
  const marketsWithVolume = traded.filter(market => market.total > 0n);
  const readTier = async ({ market, tier }: { market: typeof traded[number]; tier: number }) => {
    market.volumes[tier] = await candleVolume(market.category, start, end, tier);
  };
  await runRequests(marketsWithVolume.flatMap(market => market.knownTiers.map(tier => ({ market, tier }))), readTier);

  const reconciles = (market: typeof traded[number]) => market.volumes.reduce((sum, volume) => sum + volume, 0n) === market.total;
  // Recent history suggests which tiers to query first. Older windows can use different tiers.
  const missing = marketsWithVolume.filter(market => !reconciles(market)).flatMap(market =>
    [...tierBps.keys()].filter(tier => !market.knownTiers.includes(tier)).map(tier => ({ market, tier }))
  );
  await runRequests(missing, readTier);
  for (const market of marketsWithVolume)
    if (!reconciles(market)) throw new Error(`Guanaco fee tier volumes do not reconcile for ${market.category}`);

  const totalsByTier = tierBps.map((_, tier) => marketsWithVolume.reduce((sum, market) => sum + market.volumes[tier], 0n));
  return totalsByTier;
}

async function fetch({ startTimestamp, endTimestamp, createBalances }: FetchOptions) {
  const volumes = await volumeByTier(startTimestamp, endTimestamp);
  const dailyFees = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();
  let total = 0n;
  volumes.forEach((volume, tier) => {
    const feeUnits = volume * BigInt(tierBps[tier]);
    total += feeUnits;
    if (feeUnits > 0n) dailyFees.addCGToken("bitcoin-cash", Number(feeUnits) / (bpsPerUnit * satoshisPerBch), labels[tier]);
  });

  const feesBch = Number(total) / (bpsPerUnit * satoshisPerBch);
  if (feesBch > 0) {
    const revenueBch = feesBch * protocolShare;
    dailySupplySideRevenue.addCGToken("bitcoin-cash", feesBch - revenueBch, lpLabel);
    dailyRevenue.addCGToken("bitcoin-cash", revenueBch, revenueLabel);
  }

  const spentSats = await burnedBuybacks(indexer, startTimestamp, endTimestamp);
  if (spentSats > 0n) dailyHoldersRevenue.addCGToken("bitcoin-cash", Number(spentSats) / satoshisPerBch, burnLabel);
  return { dailyFees, dailyUserFees: dailyFees, dailySupplySideRevenue, dailyRevenue, dailyProtocolRevenue: 0, dailyHoldersRevenue };
}

const methodology = {
  Fees: "Estimated swap fees calculated from confirmed Guanaco pool volume in BCH times the fee rate of each covenant tier.",
  UserFees: "Estimated swap fees paid by traders to Guanaco pools.",
  SupplySideRevenue: "90% of estimated swap fees attributable to Guanaco liquidity providers.",
  Revenue: "10% of estimated swap fees allocated to periodic GUA buybacks.",
  HoldersRevenue: "BCH paid into the project pool for treasury-purchased GUA, recognized at purchase confirmation for purchases linked to a verified burn.",
};
const breakdownMethodology = {
  Fees: Object.fromEntries(labels.map((label, tier) => [label, `Confirmed Guanaco swap-leg volume in the ${tierBps[tier] / 100}% fee tier multiplied by its fee rate.`])),
  UserFees: Object.fromEntries(labels.map(label => [label, "Estimated fees paid by traders in this tier."])),
  SupplySideRevenue: { [lpLabel]: methodology.SupplySideRevenue },
  Revenue: { [revenueLabel]: methodology.Revenue },
  HoldersRevenue: { [burnLabel]: methodology.HoldersRevenue },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.BITCOIN_CASH],
  start: "2026-09-06",
  fetch,
  methodology,
  breakdownMethodology,
};
export default adapter;
