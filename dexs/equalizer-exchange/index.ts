import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../helpers/getBlock";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../../utils/date";
import BigNumber from "bignumber.js";
import { getPrices } from "../../utils/prices";
const BIG_TEN = new BigNumber('10');
interface IToken {
  address: string;
  decimale: number;
}

interface IPool {
  lpAddress: string;
  token0: IToken;
  token1: IToken;
}
interface ILog {
  data: string;
  transactionHash: string;
}
interface IAmount {
  amount0In: string;
  amount1In: string;
  amount0Out: string;
  amount1Out: string;
}
const topic_name = 'Swap(index_topic_1 address sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, index_topic_2 address to)';
const topic0 = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';

const LpList: IPool[] = [
  {
    lpAddress: '0x7547d05dFf1DA6B4A2eBB3f0833aFE3C62ABD9a1',
    token0: {
      address: '0x04068da6c83afcfa0e13ba15a6696662335d5b75',
      decimale: 6
    },
    token1: {
      address: '0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83',
      decimale: 18
    }
  } as IPool,
];

// uint256 amount0In
// uint256 amount1In
// uint256 amount0Out
// uint256 amount1Out

const fetch = async (timestamp: number) => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
  const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp)

  const todaysBlock = (await getBlock(todaysTimestamp, 'fantom', {}));
  const yesterdaysBlock = (await getBlock(yesterdaysTimestamp, 'fantom', {}));
  const log: IAmount[] = ((await sdk.api.util.getLogs({
    target: LpList[0].lpAddress,
    topic: topic_name,
    toBlock: yesterdaysBlock,
    fromBlock: todaysBlock,
    keys: [],
    chain: 'fantom',
    topics: [topic0]
  })).output as ILog[])
    .map((e:ILog)  => {return  { ...e, data: e.data.replace('0x', '') }})
    .map((p: ILog) => {
      const amount0In = new BigNumber('0x'+p.data.slice(0, 64)).toString();
      const amount1In = new BigNumber('0x'+p.data.slice(64, 128)).toString();
      const amount0Out = new BigNumber('0x'+p.data.slice(128, 192)).toString();
      const amount1Out = new BigNumber('0x'+p.data.slice(192, 256)).toString();
      return {
        amount0In,
        amount1In,
        amount0Out,
        amount1Out,
      } as IAmount
    });

  const coins = LpList.map(e => [`fantom:${e.token0.address}`,`fantom:${e.token1.address}`]).flat()
  const prices = await getPrices(coins, timestamp);
  const totalAmount0 = log
    .reduce((a: number, b: IAmount) => Number(b.amount0In)+ Number(b.amount0Out) + a, 0) / 10 ** LpList[0].token0.decimale * prices[`fantom:${LpList[0].token0.address}`].price;
  const totalAmount1 = log
    .reduce((a: number, b: IAmount) => Number(b.amount1In)+ Number(b.amount1Out) + a, 0) / 10 ** LpList[0].token1.decimale * prices[`fantom:${LpList[0].token1.address}`].price;
  const untrackAmountUSD = totalAmount0 + totalAmount1;
  console.log(untrackAmountUSD)
  return {
    totalVolume: '0',
    dailyVolume: '0',
    timestamp,
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.FANTOM]: {
      fetch,
      start: async () => 1600704000,
    },
  }
};

export default adapter;
