import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import fetchURL, { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";
import { getConfig } from "../../helpers/cache";
import PromisePool from "@supercharge/promise-pool";

const URLS = {
  market: "https://trading-api.evedex.com/api/market",
  instruments: "https://trading-api.evedex.com/api/market/instrument",
  ohlcv: "https://market-data-api.evedex.com/api/history",
};

const LABELS = {
  tradingFees: METRIC.TRADING_FEES,
  revenue: "Trading Fees To Protocol",
};

const fetch = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;
  const [market, instruments] = await Promise.all([
    fetchURL(URLS.market),
    getConfig('evedex/instruments', URLS.instruments),
  ]);

  const markets = instruments
    .filter((instrument: any) => instrument.type === "perpetual-futures")
    .map((instrument: any) => instrument.name);
  const after = new Date(startTimestamp * 1000).toISOString();
  const before = new Date(endTimestamp * 1000).toISOString();

  const { results: volumes } = await PromisePool
    .withConcurrency(2)
    .for(markets)
    .process(async (market) => {
      const candles = await fetchURLAutoHandleRateLimit(`${URLS.ohlcv}/${market}/list?after=${after}&before=${before}&group=1h`);
      return candles
        .filter((candle: any) => candle[0] >= startTimestamp * 1000 && candle[0] < endTimestamp * 1000)
        .reduce((sum: number, candle: any) => sum + Number(candle[5]), 0);
    });

  const oneSidedVolume = volumes.reduce((sum, volume) => sum + volume, 0) / 2;
  const feeRate = Number(market.fees.maker) + Number(market.fees.taker);
  const tradingFees = oneSidedVolume * feeRate;
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyFees.addUSDValue(tradingFees, LABELS.tradingFees);
  dailyRevenue.addUSDValue(tradingFees, LABELS.revenue);

  return {
    dailyUserFees: dailyFees.clone(),
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
  };
};

const methodology = {
  Fees: "Trading fees paid by users on EVEDEX perpetual futures. Excludes billing fees and cashback/VaultV2 distributions.",
  UserFees: "Trading fees paid by users on EVEDEX perpetual futures. Excludes billing fees and cashback/VaultV2 distributions.",
  Revenue: "Trading fees kept by EVEDEX.",
  ProtocolRevenue: "Trading fees kept by EVEDEX.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.tradingFees]: "Perpetual futures trading fees, estimated from one-sided trading volume and EVEDEX maker/taker fee rates.",
  },
  Revenue: {
    [LABELS.revenue]: "Trading fees retained by EVEDEX.",
  },
  ProtocolRevenue: {
    [LABELS.revenue]: "Trading fees retained by EVEDEX.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  start: "2025-06-30",
  methodology,
  breakdownMethodology,
};

export default adapter;
