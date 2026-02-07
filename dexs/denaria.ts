import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const DENARIA_PERP_PAIR = "0xd07822ee341c11a193869034d7e5f583c4a94872";

const EXECUTED_TRADE_EVENT =
    "event ExecutedTrade(address indexed user, bool direction, uint256 tradeSize, uint256 tradeReturn, uint256 currentPrice, uint256 leverage)";

async function fetch(options: FetchOptions) {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();

    const tradeLogs = await options.getLogs({
        target: DENARIA_PERP_PAIR,
        eventAbi: EXECUTED_TRADE_EVENT,
    });

    const totalTraderExposure = await options.api.call({
        target: DENARIA_PERP_PAIR,
        abi: "uint256:totalTraderExposure",
    });

    for (const log of tradeLogs) {
        const isLong = Boolean(log.direction);

        const tradeSize = Number(log.tradeSize) / 1e18;
        const price = Number(log.currentPrice) / 1e8;
        const tradeReturn = Number(log.tradeReturn) / 1e18;

        if (isLong) {
            dailyVolume.addUSDValue(tradeSize);
            dailyFees.addUSDValue(tradeSize - (tradeReturn * price));
        } else {
            dailyVolume.addUSDValue(tradeSize * price);
            dailyFees.addUSDValue(tradeSize * price - tradeReturn);
        }
    }

    const openInterestAtEnd = options.createBalances();
    openInterestAtEnd.addCGToken("bitcoin", totalTraderExposure / 1e18);

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
        openInterestAtEnd,
    };
}

const methodology = {
    Volume: "All Denaria Perp volume on Linea, computed from ExecutedTrade notional in virtual USD.",
    Fees: "Deneria Perp trading fees",
    Revenue: "All the fees are revenue",
    ProtocolRevenue: "All the revenue goes to the protocol",
};

const adapter: SimpleAdapter = {
    version: 2,
    chains: [CHAIN.LINEA],
    fetch,
    start: "2025-12-15",
    methodology,
};

export default adapter;
