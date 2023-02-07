import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { Chain } from "@defillama/sdk/build/general";


type TFee = {
  target: string;
  targetDecimal: number
  topics: string[];
}

type TFeeDetail = {
  [l: string | Chain]: TFee;
}
const fee_detail: TFeeDetail = {
  [CHAIN.AVAX]: {
    target: '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e',
    targetDecimal: 6,
    topics: [
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
      '0x0000000000000000000000006cb1bc6c8aabdae822a2bf8d83b36291cb70f169',
    ]
  },
  [CHAIN.BSC]: {
    target: '0xe9e7cea3dedca5984780bafc599bd69add087d56',
    targetDecimal: 18,
    topics: [
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
      '0x0000000000000000000000008c603050d7a913b6f63836e07ebf385a4a5736e7',
    ]
  },
  [CHAIN.FANTOM]: {
    target: '0x04068DA6C83AFCFA0e13ba15A6696662335D5B75',
    targetDecimal: 6,
    topics: [
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
      '0x0000000000000000000000000b5025d8d409a51615cb624b8ede132bb11a2550',
    ]
  },
  [CHAIN.POLYGON]: {
    target: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    targetDecimal: 6,
    topics: [
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
      '0x000000000000000000000000938021351425dbfa606ed2b81fc66952283e0dd5',
    ]
  },
  [CHAIN.ARBITRUM]: {
    target: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
    targetDecimal: 6,
    topics: [
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
      '0x0000000000000000000000000ba6c34af9713d15141dcc91d2788c3f370ecb9e',
    ]
  },
  [CHAIN.OPTIMISM]: {
    target: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
    targetDecimal: 6,
    topics: [
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
      '0x000000000000000000000000a058798cd293f5acb4e7757b08c960a79f527699',
    ]
  }
}
interface ITx  {
  data: string;
  transactionHash: string;
}

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const todaysTimestamp = timestamp + 35500;
    const yesterdaysTimestamp = todaysTimestamp + 4000;

    const fromBlock = (await getBlock(todaysTimestamp, chain, {}));
    const toBlock = (await getBlock(yesterdaysTimestamp, chain, {}));

    const logs: ITx[] = (await sdk.api.util.getLogs({
      target: fee_detail[chain].target,
      keys: [],
      chain: chain,
      topic: '',
      topics: fee_detail[chain].topics,
      toBlock: toBlock,
      fromBlock: fromBlock,
    })).output as ITx[];

    const [first, second, third] = logs;
    const dailyFees = (Number(first.data) + Number(second.data) + Number(third.data)) / 10 ** fee_detail[chain].targetDecimal;
    const dailyRevenue = (Number(first.data) + Number(third.data)) / 10 ** fee_detail[chain].targetDecimal;
    return {
      dailyFees: dailyFees.toString(),
      dailyRevenue: dailyRevenue.toString(),
      timestamp
    }
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.AVAX]: {
        fetch: fetch(CHAIN.AVAX),
        start: async ()  => 1675555200,
    },
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC),
      start: async ()  => 1675555200,
    },
    [CHAIN.FANTOM]: {
      fetch: fetch(CHAIN.FANTOM),
      start: async ()  => 1675555200,
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON),
      start: async ()  => 1675555200,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: async ()  => 1675555200,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: async ()  => 1675555200,
    },
  }
}

export default adapter;
