import {
    Adapter,
    FetchOptions,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const naviApiURL = 'https://open-api.naviprotocol.io/api/internal/defillama/fee';

interface DailyStats {
    fromTimestamp: number,
    toTimestamp: number,
    borrowInterestRevenue: number,
    borrowInterestFee: number,
    borrowRevenue: number,
    flashLoanRevenue: number,
    liquidationRevenue: number,
    naviDailyRevenue: number,
    naviDailyFee: number,
}

const methodology = {
    dailyFees: 'Interest and fees paid by borrowers',
    dailyRevenue: 'Interest and borrow fees earned by NAVI'
}


const fetchNAVIStats = async ({ startTimestamp }: any) => {
    const url = `${naviApiURL}?fromTimestamp=${startTimestamp}&cf_pass=b35f13a110a4`
    const stats: DailyStats = (await fetchURL(url)).data;

    return {
        dailyFees: stats.naviDailyFee,
        dailyUserFees: stats.naviDailyFee,
        dailyRevenue: stats.naviDailyRevenue,
        dailyProtocolRevenue: stats.naviDailyRevenue
    };
};


const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.SUI]: {
            fetch: fetchNAVIStats,
            start: '2024-03-01',
            meta: {
                methodology,
            },
        },
    },
};

export default adapter;