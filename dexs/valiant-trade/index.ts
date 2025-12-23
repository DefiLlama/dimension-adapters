import { CHAIN } from '../../helpers/chains';
import { httpGet } from '../../utils/fetchURL';
import { FetchOptions } from '../../adapters/types';

const statsApiEndpoint = "https://mainnet-pro-api.valiant.trade/dex/analytics/swapStat";

const CONFIG = {
    [CHAIN.FOGO]: {
        url: statsApiEndpoint,
    },
}

async function fetch(timestamp: number, _b: any, options: FetchOptions) {
    const baseUrl = CONFIG[options.chain].url;
    const currentTimestamp = (Date.now() / 1000);
    const startTimestamp = currentTimestamp - 86400;
    const endTimestamp = currentTimestamp;
    const url = `${baseUrl}?start=${startTimestamp}&end=${endTimestamp}`;
    const response = await httpGet(url);
    const data = response;
    const dailyVolume = data.totalSwapVolume;
    const dailyFees = data.totalFees;
    const dailyUserFees = data.totalFees;
    const dailyRevenue = data.totalProtocolFees;
    const dailyProtocolRevenue = data.totalProtocolFees;
    const dailyHoldersRevenue = 0.;

    return {
        dailyVolume,
        dailyFees,
        dailyUserFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailyHoldersRevenue,
    }
}

const methodology = {
    Fees: "All fees paid by users",
    Revenue: "Revenue going to protocol treasury",
    ProtocolRevenue: "Revenue going to protocol treasury",
    UserFees: "All fees paid by users",
    SupplySideRevenue: "Revenue earned by LPs (87% of total fees)",
    HoldersRevenue: "20% of protocol fees allocated for xORCA holder buybacks and burns."
}

export default {
    methodology,
    version: 1,
    runAtCurrTime: true,
    adapter: {
        [CHAIN.FOGO]: {
            fetch,
            start: '2025-12-20',
        },
    },
    isExpensiveAdapter: true,
}
