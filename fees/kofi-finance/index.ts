import type { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const config_rule = {
    headers: {
        'user-agent': 'axios/1.6.7'
    }
}

const api_url = "https://api-production-f74f.up.railway.app/api/v1/fee";

interface IFeeData {
    fee: number;
    timestamp: number;
}

const fetch = async (timestamp: number) => {
    const dayEndpoint = `${api_url}?timestamp=${timestamp}`;
    const dayFeesData = await httpGet(dayEndpoint, config_rule)

    const dailyFees = dayFeesData.fee.reduce((partialSum: number, a: IFeeData) => partialSum + a.fee, 0);

    const dailyRevenue = dailyFees * 0.10; // 10% of daily fees 
    const dailySupplySideRevenue = dailyFees * 0.90; // 99% of daily fees 

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    };
}

const methodology = {
    Fees: "Total staking rewards",
    Revenue: "10% of total staking rewards",
    ProtocolRevenue: "10% of total staking rewards goes to the DAO Treasury",
    SupplySideRevenue: "90% of total staking rewards goes to stakers",
}

const adapter: Adapter = {
    version: 1,
    adapter: {
        [CHAIN.APTOS]: {
            fetch,
            start: '2025-05-14',
        },
    },
    methodology,
}

export default adapter;
