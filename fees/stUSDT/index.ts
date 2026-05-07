import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const chainConfig = {
    [CHAIN.TRON]: {
        stusdt: "TThzxNRLrW2Brp9DcTQU8i4Wd9udCWEdZ3",
        unstaking: "TURYwFtG6gvpEyPSm55FyjJWpgQQ2rDm5e",
        start: "2023-06-30",
    },
    [CHAIN.ETHEREUM]: {
        stusdt: "0x25eC98773D7b4ceD4cAFaB96A2A1c0945f145e10",
        unstaking: "0x156269966404Ca72F6721c3228676c56412c058c",
        start: "2023-06-30",
    }
}

const IncreaseBaseEvent = "event IncreaseBase(uint256 oldTotalUnderlying, uint256 newTotalUnderlying, uint256 totalShares)";
const DecreaseBaseEvent = "event DecreaseBase(uint256 oldTotalUnderlying, uint256 newTotalUnderlying, uint256 totalShares)";
const WithdrawalClaimedEvent = "event WithdrawalClaimed(uint256 indexed requestId, address indexed receiver, uint256 amount, uint256 fee, uint256 claimedToken)";

const fetch = async (options: FetchOptions) => {
    const { createBalances } = options;
    const dailyFees = createBalances();
    const dailyRevenue = createBalances();
    const dailySupplySideRevenue = createBalances();

    const { stusdt, unstaking } = chainConfig[options.chain];

    const withdrawalLogs = await options.getLogs({
        target: unstaking,
        eventAbi: WithdrawalClaimedEvent,
    });
    const rebaseLogs = await options.getLogs({
        target: stusdt,
        eventAbi: IncreaseBaseEvent,
    });
    const negativeRebaseLogs = await options.getLogs({
        target: stusdt,
        eventAbi: DecreaseBaseEvent,
    });

    for (const log of withdrawalLogs) {
        dailyRevenue.addToken(stusdt, log.fee, METRIC.DEPOSIT_WITHDRAW_FEES);
    }

    for (const log of rebaseLogs) {
        dailySupplySideRevenue.add(stusdt, log.newTotalUnderlying - log.oldTotalUnderlying, METRIC.ASSETS_YIELDS);
    }

    for (const log of negativeRebaseLogs) {
        dailySupplySideRevenue.subtractToken(stusdt, log.newTotalUnderlying - log.oldTotalUnderlying, METRIC.ASSETS_YIELDS);
    }

    dailyFees.add(dailySupplySideRevenue);
    dailyFees.add(dailyRevenue);

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    allowNegativeValue: true,
    pullHourly: true,
    fetch,
    adapter: chainConfig,
    methodology: {
        Fees: "Fees include stUSDT unstaking fees and net stUSDT rebase yield distributed to holders.",
        Revenue: "Unstaking fees retained by the stUSDT-RWA contract are counted as protocol revenue.",
        ProtocolRevenue: "Unstaking fees retained by the stUSDT-RWA contract are counted as protocol revenue.",
        SupplySideRevenue: "Supply-side revenue is net stUSDT rebase yield from IncreaseBase and DecreaseBase events.",
    },
    breakdownMethodology: {
        Fees: {
            [METRIC.DEPOSIT_WITHDRAW_FEES]: "The fee field from WithdrawalClaimed events, converted from stUSDT 18-decimal accounting to USDT units.",
            [METRIC.ASSETS_YIELDS]: "Net rebase yield from IncreaseBase and DecreaseBase events, calculated as newTotalUnderlying minus oldTotalUnderlying.",
        },
        Revenue: {
            [METRIC.DEPOSIT_WITHDRAW_FEES]: "The retained unstaking fee charged when users claim withdrawn USDT.",
        },
        ProtocolRevenue: {
            [METRIC.DEPOSIT_WITHDRAW_FEES]: "The retained unstaking fee charged when users claim withdrawn USDT.",
        },
        SupplySideRevenue: {
            [METRIC.ASSETS_YIELDS]: "Net rebase yield from IncreaseBase and DecreaseBase events distributed to stUSDT holders.",
        },
    },
};

export default adapter;
