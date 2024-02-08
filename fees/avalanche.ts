import { Adapter, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";
import { getBlock } from "../helpers/getBlock";
import * as sdk from "@defillama/sdk";


const getBalance = async (block: string): Promise<number> => {
  const data = await sdk.api.eth.getBalance({ target: '0x0100000000000000000000000000000000000000', block: +block, chain: 'avax' });
  return +data.output / 1e18;
};


const adapter: Adapter = {
  adapter: {
    [CHAIN.AVAX]: {
        fetch:  async (timestamp: number) => {
            const ts = getTimestampAtStartOfDayUTC(timestamp)
            const endDatets = getTimestampAtStartOfNextDayUTC(timestamp)
            const [chainBlockToday, chainBlockNextday] = await Promise.all([getBlock(ts, "avax", {}), getBlock(endDatets, "avax", {})]);
            const [balanceToday, balanceNextday] = await Promise.all([getBalance(`0x${chainBlockToday.toString(16)}`), getBalance(`0x${chainBlockNextday.toString(16)}`)]);
            const txFees = balanceNextday - balanceToday;
            const pricesObj = await getPrices(["coingecko:avalanche-2"], ts);
            const dailyFee = ((txFees) * pricesObj["coingecko:avalanche-2"].price);

            return {
                timestamp,
                dailyFees: dailyFee.toString(),
                dailyRevenue: dailyFee.toString(),
                dailyHoldersRevenue: dailyFee.toString(),
            };
        },
        start: 1609459200
    },
},
  protocolType: ProtocolType.CHAIN
}

export default adapter;
