import * as sdk from "@defillama/sdk";
import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { FetchOptions } from "../adapters/types"
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints:Record<string, string> = {
    [CHAIN.BSC]: sdk.graph.modifyEndpoint('3CUU9roJ9PsMdijcBdaCBRHhTUBobLeDLyMW4QF2XNmn')
}

const fetch = async (timestamp: number, _a:any, options: FetchOptions) => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
    const searchTimestamp = todaysTimestamp + ":daily"

    const graphQuery = gql`
        {
            feeStat(id: "${searchTimestamp}") {
                mint
                burn
                marginAndLiquidation
                swap
            }
        }`;

    const graphRes = await request(endpoints[options.chain], graphQuery);

    const dailyFee = parseInt(graphRes?.feeStat?.mint || 0) + parseInt(graphRes?.feeStat?.burn || 0) + parseInt(graphRes?.feeStat?.marginAndLiquidation || 0) + parseInt(graphRes?.feeStat?.swap || 0)
    const finalDailyFee = (dailyFee / 1e30);
    const userFee = parseInt(graphRes?.feeStat?.marginAndLiquidation || 0) + parseInt(graphRes?.feeStat?.swap || 0)
    const finalUserFee = (userFee / 1e30);

    return {
        dailyFees: finalDailyFee.toString(),
        dailyUserFees: finalUserFee.toString(),
        dailyRevenue: (finalDailyFee * 0.1 + finalDailyFee * 0.25 + finalDailyFee * 0.15).toString(),
        dailyProtocolRevenue: (finalDailyFee * 0.15).toString(),
        dailyHoldersRevenue: (finalDailyFee * 0.1 + finalDailyFee * 0.25).toString(),
        dailySupplySideRevenue: (finalDailyFee * 0.5).toString()
    };
};

const methodology = {
    Fees: "Fees from open/close position (0.1%), swap (0.2% to 0.8%), mint and burn (based on tokens balance in the pool) and borrow fee ((assets borrowed)/(total assets in pool)*0.01%)",
    UserFees: "Fees from open/close position (0.1%), swap (0.2% to 0.8%) and borrow fee ((assets borrowed)/(total assets in pool)*0.01%)",
    HoldersRevenue: "10% goes to MVX stakers and 25% are buyback and burn of GHNY",
    SupplySideRevenue: "50% of all collected fees goes to GLL holders",
    Revenue: "15% Protocol revenue, 10% goes to MVX stakers and 25% are buyback and burn of GHNY",
    ProtocolRevenue: "10% of all collected fees goes to Grizzly.fi treasury and 5% goes to marketing"
}

const adapter: Adapter = {
    deadFrom: "2024-12-14",
    methodology,
    adapter: {
        [CHAIN.BSC]: {
            fetch,
            start: '2023-07-21',
        },
    }
}

export default adapter;
