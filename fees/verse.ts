import { CHAIN } from "../helpers/chains";
import { BaseAdapter, Adapter, ChainBlocks, FetchOptions, Fetch } from "../adapters/types";
import volumeAdapter from "../dexs/verse";
import BigNumber from "bignumber.js";


const adapterObj = volumeAdapter.adapter;

const fetch = (chain: string, totalFees: number, revenueFee: number, ssrFee: number) => {
    return async (timestamp: number, chainBlocks: ChainBlocks, options: FetchOptions) => {
        const fetchedResult = await (adapterObj[chain].fetch as Fetch)(timestamp, chainBlocks, options);
        const chainDailyVolume = fetchedResult.dailyVolume as any;
        const chainTotalVolume = fetchedResult.totalVolume as any;

        return {
        timestamp,
        totalUserFees: chainTotalVolume ? new BigNumber(chainTotalVolume).multipliedBy(totalFees).toString() : undefined,
        dailyUserFees: chainDailyVolume ? new BigNumber(chainDailyVolume).multipliedBy(totalFees).toString() : '0',
        totalFees: chainTotalVolume ? new BigNumber(chainTotalVolume).multipliedBy(totalFees).toString() : undefined,
        dailyFees: chainDailyVolume ? new BigNumber(chainDailyVolume).multipliedBy(totalFees).toString() : '0',
        totalRevenue: chainTotalVolume ? new BigNumber(chainTotalVolume).multipliedBy(revenueFee).toString() : undefined,
        dailyRevenue: chainDailyVolume ? new BigNumber(chainDailyVolume).multipliedBy(revenueFee).toString() : '0',
        totalSupplySideRevenue: chainTotalVolume ? new BigNumber(chainTotalVolume).multipliedBy(ssrFee).toString() : undefined,
        dailySupplySideRevenue: chainDailyVolume ? new BigNumber(chainDailyVolume).multipliedBy(ssrFee).toString() : '0',
        };
    }
}

const methodology = {
    UserFees: "Fees paid by traders, 0.3% on each swap",
    Fees: "0.3% trading fee",
    Revenue: "Percentage of swap fees (sbch and ethereum) going to treasury, 0.05% on each swap",
    SupplySideRevenue: "User fees (sbch and ethereum) distributed among LPs, 0.25% on each swap"
}

const baseAdapter: BaseAdapter = {
    [CHAIN.ETHEREUM]: {
        ...adapterObj[CHAIN.ETHEREUM],
        fetch: fetch(CHAIN.ETHEREUM, 0.003, 0.0005, 0.0025),
        customBackfill: fetch(CHAIN.ETHEREUM, 0.003, 0.0005, 0.0025),
        meta: {
            methodology
        }
    },
    [CHAIN.SMARTBCH]: {
        ...adapterObj[CHAIN.SMARTBCH],
        fetch: fetch(CHAIN.SMARTBCH, 0.003, 0.0005, 0.0025),
        customBackfill: fetch(CHAIN.SMARTBCH, 0.003, 0.0005, 0.0025),
        meta: {
            methodology
        }
    }
}

const adapter: Adapter = {
    adapter: baseAdapter
};

export default adapter;
