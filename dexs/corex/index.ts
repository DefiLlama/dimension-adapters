import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetch = async ({ getLogs }: FetchOptions): Promise<FetchResultVolume> => {
    const MARKETS = "0xb212b1E9b00aD54fB5419E6231E0b4300dB9F40F";

    const COLLATERAL_PRECISION: { [key: number]: number } = {
        0: 1e18,  // CORE (18 decimals)
        1: 1e6,   // USDT (6 decimals)
    };

    const [limitLogs, marketLogs] = await Promise.all(
        [
            "event LimitExecuted((address user, uint32 index) orderId, (address user, uint32 index, uint16 pairIndex, uint24 leverage, bool long, bool isOpen, uint8 collateralIndex, uint8 tradeType, uint120 collateralAmount, uint64 openPrice, uint64 tp, uint64 sl, uint192 __placeholder) t, address indexed triggerCaller, uint8 orderType, uint256 price, uint256 priceImpactP, int256 percentProfit, uint256 amountSentToTrader, uint256 collateralPriceUsd, bool exactExecution)",
            "event MarketExecuted((address user, uint32 index) orderId, (address user, uint32 index, uint16 pairIndex, uint24 leverage, bool long, bool isOpen, uint8 collateralIndex, uint8 tradeType, uint120 collateralAmount, uint64 openPrice, uint64 tp, uint64 sl, uint192 __placeholder) t, bool open, uint64 price, uint256 priceImpactP, int256 percentProfit, uint256 amountSentToTrader, uint256 collateralPriceUsd)",
        ].map((eventAbi) => getLogs({ target: MARKETS, eventAbi }))
    );

    const volumeLimitsAndMarkets = limitLogs
        .concat(marketLogs)
        .map((e: any) => {
            const collateralIndex = Number(e.t.collateralIndex);
            const precision = COLLATERAL_PRECISION[collateralIndex] || 1e18;

            const collateralAmount = Number(e.t.collateralAmount) / precision;
            const leverage = Number(e.t.leverage) / 1e3;
            const collateralPriceUsd = Number(e.collateralPriceUsd) / 1e8;

            return collateralAmount * leverage * collateralPriceUsd;
        })
        .reduce((a: number, b: number) => a + b, 0);

    return {
        dailyVolume: volumeLimitsAndMarkets,
    };
};

const methodology = {
    Volume: "Corex Markets Volume tracked by execution of Market and Limit orders.",
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.CORE]: {
            fetch,
            start: "2026-01-01",
        },
    },
    methodology,
};

export default adapter;
