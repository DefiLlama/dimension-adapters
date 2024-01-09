import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";
import { ethers } from "ethers";


const address = '0x2f60c9cee6450a8090e17a79e3dd2615a1c419eb'
const event_fees_distibute = 'event Stolen (address from, address to, uint256 id, uint256 value)';
const contract_interface = new ethers.Interface([
    event_fees_distibute
]);

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp
    const fromBlock = (await getBlock(fromTimestamp, CHAIN.ARBITRUM, {}));
    const toBlock = (await getBlock(toTimestamp, CHAIN.ARBITRUM, {}));
    const prices = await getPrices([
        "coingecko:ethereum"
    ], timestamp);
    const dailyFees = (await sdk.getEventLogs({
        target: address,
        fromBlock: fromBlock,
        toBlock: toBlock,
        topics: ['0xbd1d1f579700e7d5d89a06ef937990d5f920f734ad1b9b945b354c9643dfd322'],
        chain: CHAIN.ARBITRUM
    })).map((e: any) => contract_interface.parseLog(e))
        .map((e: any) => {
            return Number(e!.args.value) / 10 ** 18;
        }).reduce((a: number, b: number) => a + b/10, 0) * prices["coingecko:ethereum"].price
    const dailyRevenue = dailyFees;
    return {
        dailyFees: `${dailyFees}`,
        dailyRevenue: `${dailyRevenue}`,
        timestamp
    }
}


const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch: fetch,
            start: async () => 1678406400,
        },
    }
};

export default adapter;
