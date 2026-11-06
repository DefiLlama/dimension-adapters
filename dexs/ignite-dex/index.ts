import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import fetchURL from "../../utils/fetchURL";

// Ignite matches orders on an off-chain central limit order book; traders' assets sit in
// custody vaults on Ethereum, Base, BNB Chain, Solana and Lithosphere. Fills are not
// emitted on-chain, so volume and fees come from Ignite's public market-data API, which
// sums the fills of any window of up to 24 hours (start inclusive, end exclusive).
// Docs: https://ignite.trade/api-docs (OpenAPI: https://ignite.trade/ignite-market-data-openapi.json)
const DAILY_URL = "https://api.ignite.trade/v1/market-data/daily";

type WindowTotals = {
  start_time: number;
  end_time: number;
  volume_usd: string;
  fees_usd: string;
  lp_fees_usd: string;
  protocol_fees_usd: string;
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const data: WindowTotals = await fetchURL(
    `${DAILY_URL}?start_time=${options.startTimestamp}&end_time=${options.endTimestamp}`
  );
  if (data?.start_time !== options.startTimestamp || data?.end_time !== options.endTimestamp)
    throw new Error("ignite-dex: API returned a different window than requested");

  const volume = Number(data.volume_usd);
  const fees = Number(data.fees_usd);
  const lpFees = Number(data.lp_fees_usd);
  const protocolFees = Number(data.protocol_fees_usd);
  if (![volume, fees, lpFees, protocolFees].every((v) => Number.isFinite(v) && v >= 0))
    throw new Error("ignite-dex: malformed API response");

  // Pairs are quoted in LAX, USDC or USDT; the API values each quote unit at USD 1 and
  // counts every fill once (price x size), with the taker fee charged in the quote asset.
  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(volume);

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(fees, METRIC.TRADING_FEES);

  // Each fill's fee is split between the pair's liquidity pool (LPs) and the protocol
  // fee account; the pool's protocol cut is currently 0, so LPs receive the whole fee on
  // pairs with a pool.
  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addUSDValue(lpFees, METRIC.LP_FEES);

  const dailyRevenue = options.createBalances();
  dailyRevenue.addUSDValue(protocolFees, METRIC.PROTOCOL_FEES);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume:
    "Notional (price x size) of every fill on Ignite's public spot pairs quoted in LAX, USDC or USDT, counted once per fill, from Ignite's public market-data API.",
  Fees: "Taker trading fees charged on those fills, in the quote asset.",
  UserFees: "Same as Fees: all trading fees are paid by takers.",
  Revenue: "The share of trading fees credited to the Ignite protocol fee account.",
  ProtocolRevenue: "The share of trading fees credited to the Ignite protocol fee account.",
  SupplySideRevenue: "The share of trading fees credited to the liquidity providers of each pair's Ignite pool.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Taker trading fees charged on Ignite order-book fills.",
  },
  UserFees: {
    [METRIC.TRADING_FEES]: "Taker trading fees paid by traders on Ignite order-book fills.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "Trading fees credited to the Ignite protocol fee account.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "Trading fees credited to the Ignite protocol fee account.",
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "Trading fees credited to the liquidity providers of each pair's Ignite pool.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  // Mainnet-only trading opened on 2026-10-10 (first fill 22:09 UTC).
  start: "2026-10-10",
  methodology,
  breakdownMethodology,
};

export default adapter;
