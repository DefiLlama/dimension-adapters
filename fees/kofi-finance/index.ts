import type { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
//API
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
    const dailyUserFees = dayFeesData.fee.reduce((partialSum: number, a: IFeeData) => partialSum + a.fee, 0); 

    return {
        dailyUserFees: dailyUserFees,
        dailyRevenue: dailyUserFees,
        dailyProtocolRevenue: dailyUserFees,
      };
}

const adapter: Adapter = {
    adapter: {
        [CHAIN.APTOS]: {
            fetch,
            start: '2025-05-05',
            meta: {
                methodology: {
                    UserFees: "Kofi Finance takes 7% fee on users staking rewards",
                    Revenue: "Staking rewards",
                    ProtocolRevenue: "Kofi Finance applies a 7% fee on staking rewards to the DAO Treasury",
                }
            }
        },
    }
  }
  
  export default adapter;
