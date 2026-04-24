import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const FACTORY = "0x56C933DbBE553a271b9b0b1638aA21a618125E1d";
const FACTORY_DEPLOY_BLOCK = 93892105

const MARKET_CREATED_ABI = "event MarketCreated(address indexed token, address indexed opener, address vault, address perps, address botWallet)";

const POSITION_OPENED_ABI = "event PositionOpened(uint256 indexed id, address indexed trader, bool isLong, uint256 margin, uint8 leverage, uint256 entryPrice, uint256 fee, uint8 marginMode)";

const POSITION_CLOSED_ABI = "event PositionClosed(uint256 indexed id, address indexed trader, int256 pnl, uint256 exitPrice, uint256 fee)";

const fetch = async (options: FetchOptions) => {

    const marketCreatedLogs = await options.getLogs({
        target: FACTORY,
        fromBlock: FACTORY_DEPLOY_BLOCK,
        eventAbi: MARKET_CREATED_ABI,
        cacheInCloud: true,
    });

    const perpsAddresses = marketCreatedLogs.map((l: any) => l.perps);

    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    if (perpsAddresses.length) {

        const [openedLogs, closedLogs] = await Promise.all([
            options.getLogs({
                targets: perpsAddresses,
                eventAbi: POSITION_OPENED_ABI,
            }),
            options.getLogs({
                targets: perpsAddresses,
                eventAbi: POSITION_CLOSED_ABI,
            }),
        ]);

        for (const log of openedLogs) {
            dailyVolume.addUSDValue(Number(log.margin) * Number(log.leverage) / 1e18);

            dailyFees.addUSDValue(Number(log.fee) / 1e18, METRIC.TRADING_FEES);
            dailyRevenue.addUSDValue(Number(log.fee) * 0.2 / 1e18, 'Trading Fees To Protocol');
            dailySupplySideRevenue.addUSDValue(Number(log.fee) * 0.8 / 1e18, 'Trading Fees To Market Creator');
        }

        for (const log of closedLogs) {
            dailyVolume.addUSDValue(Number(log.fee) * 1000 / 1e18);
            dailyFees.addUSDValue(Number(log.fee) / 1e18, METRIC.TRADING_FEES);
            dailyRevenue.addUSDValue(Number(log.fee) * 0.2 / 1e18, 'Trading Fees To Protocol');
            dailySupplySideRevenue.addUSDValue(Number(log.fee) * 0.8 / 1e18, 'Trading Fees To Market Creator');
        }
    }

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    };
};

const methodology = {
    Fees: "0.1% of notional trade size (minimum $1 USDT) charged on both open and close of perpetual positions.",
    Revenue: "20% of all trading fees go to the Jink platform.",
    ProtocolRevenue: "20% of all trading fees go to the Jink platform.",
    SupplySideRevenue: "80% of all trading fees go to the market creator (opener) who deployed the perps market.",
}

const breakdownMethodology = {
    Fees: {
        [METRIC.TRADING_FEES]: "0.1% of notional trade size (minimum $1 USDT) charged on both open and close of perpetual positions.",
    },
    Revenue: {
        'Trading Fees To Protocol': "20% of all trading fees go to the Jink platform.",
    },
    ProtocolRevenue: {
        'Trading Fees To Protocol': "20% of all trading fees go to the Jink platform.",
    },
    SupplySideRevenue: {
        'Trading Fees To Market Creator': "80% of all trading fees go to the market creator (opener) who deployed the perps market.",
    },
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.BSC],
    start: '2026-04-21',
    methodology,
    breakdownMethodology,
};

export default adapter;
