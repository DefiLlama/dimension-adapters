import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const methodology = {
  Volume: "LeverageX Traders create Volume by placing Trades.",
}

const fetchBase: any = async ({ getLogs }: FetchOptions): Promise<FetchResultVolume> => {
  const DIAMOND = "0xBF35e4273db5692777EA475728fDbBa092FFa1B3";
  const [limitLogs, marketLogs] = await Promise.all(
    [
      "event LimitExecuted((address user, uint32 index) orderId, (address user, uint32 index, uint16 pairIndex, uint24 leverage, bool long, bool isOpen, uint8 collateralIndex, uint8 tradeType, uint120 collateralAmount, uint64 openPrice, uint64 tp, uint64 sl, uint192 __placeholder) t, address indexed triggerCaller, uint8 orderType, uint256 price, uint256 priceImpactP, int256 percentProfit, uint256 amountSentToTrader, uint256 collateralPriceUsd, bool exactExecution)",
      "event MarketExecuted((address user, uint32 index) orderId, (address user, uint32 index, uint16 pairIndex, uint24 leverage, bool long, bool isOpen, uint8 collateralIndex, uint8 tradeType, uint120 collateralAmount, uint64 openPrice, uint64 tp, uint64 sl, uint192 __placeholder) t, bool open, uint64 price, uint256 priceImpactP, int256 percentProfit, uint256 amountSentToTrader, uint256 collateralPriceUsd)",
    ].map((eventAbi) => getLogs({ target: DIAMOND, eventAbi }))
  );

  const volumeLimitsAndMarkets = limitLogs
    .concat(marketLogs)
    .map((e: any) => {
      const collateralAmount = Number(e.t.collateralAmount) / 1e18
      const leverage = Number(e.t.leverage) / 1e3
      const collateralPriceUsd = Number(e.collateralPriceUsd) / 1e8
      return collateralAmount * leverage * collateralPriceUsd
    })
    .reduce((a: number, b: number) => a + b, 0);


  return { dailyVolume: volumeLimitsAndMarkets, };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchBase,
      start: "2024-12-18",
      meta: {
        methodology
      },
    },
  },
};

export default adapter;
