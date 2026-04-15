import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const ROUTER = "0x89ad89c9d1fc32cbe204e5780f04cf9b396118eb";

const BUY_EVENT = "event TokenBought(address indexed buyer, address indexed token, uint8 tradeType, uint256 ethIn, uint256 tokensOut)";
const SELL_EVENT = "event TokenSold(address indexed seller, address indexed token, uint8 tradeType, uint256 tokensIn, uint256 netEth)";

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailyVolume = options.createBalances();

    const [buyLogs, sellLogs] = await Promise.all([
        options.getLogs({ target: ROUTER, eventAbi: BUY_EVENT }),
        options.getLogs({ target: ROUTER, eventAbi: SELL_EVENT }),
    ]);

    buyLogs.forEach((log: any) => {
        dailyVolume.addGasToken(log.ethIn);
        dailyFees.addGasToken(log.ethIn / BigInt(100), METRIC.TRADING_FEES);
    });

    sellLogs.forEach((log: any) => {
        const grossEth = log.netEth * BigInt(100) / BigInt(99);
        dailyVolume.addGasToken(grossEth);
        dailyFees.addGasToken(grossEth - log.netEth, METRIC.TRADING_FEES);
    });

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    };
};

const methodology = {
    Volume: "Total ETH volume (buys + sells) routed through the Priority Trade bot.",
    Fees: "1% fee charged on every trade, collected in native ETH by the protocol.",
    Revenue: "All fees are retained by Priority Trade as protocol revenue.",
    ProtocolRevenue: "All fees flow to the Priority Trade treasury wallet.",
}

const breakdownMethodology = {
    Fees: {
        [METRIC.TRADING_FEES]: "1% trading fee charged on each swap executed through Priority Trade.",
    },
    Revenue: {
        [METRIC.TRADING_FEES]: "Trading fees collected by the Priority Trade protocol.",
    },
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.MEGAETH],
    start: "2026-02-04",
    methodology,
    breakdownMethodology,
};

export default adapter;
