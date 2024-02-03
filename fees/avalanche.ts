import { Adapter, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import axios from 'axios';
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";
import { getBlock } from "../helpers/getBlock";


interface IFees {
  timestamp: number;
  value: number;
}

interface IResult {
  result: string;
}

const getBalance = async (block: string): Promise<number> => {
  const res: IResult = (await axios.post('https://api.avax.network/ext/bc/C/rpc', {
    id: 1,
    jsonrpc: '2.0',
    method: 'eth_getBalance',
    params: ['0x0100000000000000000000000000000000000000', block],
  })).data;


  return parseInt(res.result, 16) / 1e18;
};


const adapter: Adapter = {
  adapter: {
    [CHAIN.AVAX]: {
        fetch:  async (timestamp: number) => {
            const ts = getTimestampAtStartOfDayUTC(timestamp)
            const endDatets = getTimestampAtStartOfNextDayUTC(timestamp)
            const [chainBlockToday, chainBlockNextday] = await Promise.all([getBlock(ts, "avax", {}), getBlock(endDatets, "avax", {})]);
            const [balanceToday, balanceNextday] = await Promise.all([getBalance(`0x${chainBlockToday.toString(16)}`), getBalance(`0x${chainBlockNextday.toString(16)}`)]);
            // const a = `https://metrics.avax.network/v1/gas_used/mainnet?from=${ts}&to=${endDatets}&interval=day`
            // const data: any[] = (await axios.get(a)).data.results
            // const dailyFees: IFees = data.find(e => e.timestamp === ts)
            // const avaxChainFee = dailyFees.value/1e9;
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
