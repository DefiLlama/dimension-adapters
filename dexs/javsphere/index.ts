import {ChainBlocks, FetchOptions, FetchResultVolume, SimpleAdapter} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const methodology = {
    Volume: "LeverageX Traders create Volume by placing Trades.",
}

const fetchBase: any = async (timestamp: number, _: ChainBlocks, { getLogs }: FetchOptions): Promise<FetchResultVolume> => {
    const DIAMOND = "0xBF35e4273db5692777EA475728fDbBa092FFa1B3";
    const [limitLogs, marketLogs] = await Promise.all(
        [
            "event LimitExecuted((address user, uint32 index) orderId, (address user, uint32 index, uint16 pairIndex, uint24 leverage, bool long, bool isOpen, uint8 collateralIndex, uint8 tradeType, uint120 collateralAmount, uint64 openPrice, uint64 tp, uint64 sl, uint192 __placeholder) t, address indexed triggerCaller, uint8 orderType, uint256 price, uint256 priceImpactP, int256 percentProfit, uint256 amountSentToTrader, uint256 collateralPriceUsd, bool exactExecution)",
            "event MarketExecuted((address user, uint32 index) orderId, (address user, uint32 index, uint16 pairIndex, uint24 leverage, bool long, bool isOpen, uint8 collateralIndex, uint8 tradeType, uint120 collateralAmount, uint64 openPrice, uint64 tp, uint64 sl, uint192 __placeholder) t, bool open, uint64 price, uint256 priceImpactP, int256 percentProfit, uint256 amountSentToTrader, uint256 collateralPriceUsd)",
        ].map((eventAbi) => getLogs({ target: DIAMOND, eventAbi }))
    );

    const [BI_1e3, BI_1e18, BI_1e8] = [1000n, BigInt(1e18), BigInt(1e8)];

    const volumeLimitsAndMarkets = limitLogs
        .concat(marketLogs)
        .map((e: any) => Number((e.t.collateralAmount * e.t.leverage * e.collateralPriceUsd) / BI_1e18 / BI_1e3 / BI_1e8))
        .reduce((a: number, b: number) => a + b, 0);

    return { dailyVolume: volumeLimitsAndMarkets, timestamp };
};

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.BASE]: { fetch: fetchBase, start: "2024-12-18" },
    },
    isExpensiveAdapter: true,
    meta: {
        methodology
    },
};

export default adapter;
