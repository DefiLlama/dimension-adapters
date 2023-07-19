import axios from "axios";
import {Adapter, ChainEndpoints} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import {Chain} from "@defillama/sdk/build/general";

const endpoints = {
    [CHAIN.BSC]: "https://www.apollox.finance/bapi/futures/v1/public/future/apx/fee/all",
}

const request = (urls: ChainEndpoints) => {
    return (chain: Chain) => {
        return async (timestamp: number) => {
            const { data } = (await axios.get(urls[chain])).data;
            const { alpFeeVOFor24Hour, allAlpFeeVO } = data
            return {
                timestamp,
                dailyFees: alpFeeVOFor24Hour.fee || 0,
                dailyRevenue: alpFeeVOFor24Hour.revenue || 0,
                totalFees: allAlpFeeVO.fee || 0,
                totalRevenue: allAlpFeeVO.revenue || 0,
            };
        }
    }
}

const adapter: Adapter = {
    adapter: {
        [CHAIN.BSC]: {
            fetch: request(endpoints)(CHAIN.BSC),
            start: async () => 1689609600,
        },
    }
}

export default adapter;
