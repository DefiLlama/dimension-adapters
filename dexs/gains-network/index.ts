import { ChainBlocks, Dependencies, FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

interface IStats {
  unix_ts: number;
  day: string;
  blockchain: string;
  daily_volume: number;
}

// Prefetch function that will run once before any fetch calls
const prefetch = async (options: FetchOptions) => {
  return queryDuneSql(options, `select
      *
    from
      dune.gains.result_g_trade_stats_defi_llama
    where
      day >= from_unixtime(${options.startTimestamp})
      and day < from_unixtime(${options.endTimestamp})`
  );
};

const fetch: any = async (timestamp: number, _: ChainBlocks, options: FetchOptions): Promise<FetchResultVolume> => {
  const stats: IStats[] = options.preFetchedResults || [];
  const chainStat = stats.find((stat) => stat.unix_ts === options.startOfDay && stat.blockchain === options.chain);

  return { timestamp, dailyVolume: chainStat?.daily_volume || 0 };
};

const fetchApechain: any = async (timestamp: number, _: ChainBlocks, { getLogs }: FetchOptions): Promise<FetchResultVolume> => {
  // Apechain currently not supported on Dune, must fetch from Events
  const DIAMOND = "0x2BE5D7058AdBa14Bc38E4A83E94A81f7491b0163";
  const [limitLogs, marketLogs, partialIncreaseLogs, partialDecreaseLogs] = await Promise.all(
    [
      "event LimitExecuted((address user, uint32 index) orderId, address indexed user, uint32 indexed index, uint32 indexed limitIndex, (address user, uint32 index, uint16 pairIndex, uint24 leverage, bool long, bool isOpen, uint8 collateralIndex, uint8 tradeType, uint120 collateralAmount, uint64 openPrice, uint64 tp, uint64 sl, uint192 __placeholder) t, address triggerCaller, uint8 orderType, uint256 oraclePrice, uint256 marketPrice, uint256 liqPrice, uint256 priceImpactP, int256 percentProfit, uint256 amountSentToTrader, uint256 collateralPriceUsd, bool exactExecution)",
      "event MarketExecuted((address user, uint32 index) orderId, address indexed user, uint32 indexed index, (address user, uint32 index, uint16 pairIndex, uint24 leverage, bool long, bool isOpen, uint8 collateralIndex, uint8 tradeType, uint120 collateralAmount, uint64 openPrice, uint64 tp, uint64 sl, uint192 __placeholder) t, bool open, uint256 oraclePrice, uint256 marketPrice, uint256 liqPrice, uint256 priceImpactP, int256 percentProfit, uint256 amountSentToTrader, uint256 collateralPriceUsd)",
      "event PositionSizeIncreaseExecuted((address user, uint32 index) orderId, uint8 cancelReason, uint8 indexed collateralIndex, address indexed trader, uint256 pairIndex, uint256 indexed index, bool long, uint256 oraclePrice, uint256 collateralPriceUsd, uint256 collateralDelta, uint256 leverageDelta, (uint256 positionSizeCollateralDelta, uint256 existingPositionSizeCollateral, uint256 newPositionSizeCollateral, uint256 newCollateralAmount, uint256 newLeverage, uint256 priceAfterImpact, int256 existingPnlCollateral, uint256 oldPosSizePlusPnlCollateral, uint256 newOpenPrice, uint256 borrowingFeeCollateral, uint256 openingFeesCollateral, uint256 existingLiqPrice, uint256 newLiqPrice) vals)",
      "event PositionSizeDecreaseExecuted((address user, uint32 index) orderId, uint8 cancelReason, uint8 indexed collateralIndex, address indexed trader, uint256 pairIndex, uint256 indexed index, bool long, uint256 oraclePrice, uint256 collateralPriceUsd, uint256 collateralDelta, uint256 leverageDelta, (uint256 positionSizeCollateralDelta, uint256 existingPositionSizeCollateral, uint256 existingLiqPrice, uint256 priceAfterImpact, int256 existingPnlCollateral, uint256 borrowingFeeCollateral, uint256 closingFeeCollateral, int256 availableCollateralInDiamond, int256 collateralSentToTrader, uint120 newCollateralAmount, uint24 newLeverage) vals)",
    ].map((eventAbi) => getLogs({ target: DIAMOND, eventAbi }))
  );

  const [BI_1e3, BI_1e18, BI_1e8] = [1000n, BigInt(1e18), BigInt(1e8)];

  const volumeLimitsAndMarkets = limitLogs
    .concat(marketLogs)
    .map((e: any) => Number((e.t.collateralAmount * e.t.leverage * e.collateralPriceUsd) / Number(BI_1e18) / Number(BI_1e3) / Number(BI_1e8)))
    .reduce((a: number, b: number) => a + b, 0);

  const volumePartials = partialIncreaseLogs
    .concat(partialDecreaseLogs)
    .map((e: any) => Number((e.vals.positionSizeCollateralDelta * e.collateralPriceUsd) / Number(BI_1e18) / Number(BI_1e8)))
    .reduce((a: number, b: number) => a + b, 0);

  return { dailyVolume: volumeLimitsAndMarkets + volumePartials, timestamp };
};

const adapter: SimpleAdapter = {
  dependencies: [Dependencies.DUNE],
  adapter: {
    [CHAIN.ARBITRUM]: { fetch, start: "2023-05-25" },
    [CHAIN.POLYGON]: { fetch, start: "2023-05-25" },
    [CHAIN.BASE]: { fetch, start: "2024-09-26" },
    [CHAIN.APECHAIN]: {
      fetch: fetchApechain,
      start: "2024-11-19",
    },
    [CHAIN.MEGAETH]: { fetch, start: "2026-02-09" },
  },
  prefetch,
  isExpensiveAdapter: true,
};

export default adapter;
