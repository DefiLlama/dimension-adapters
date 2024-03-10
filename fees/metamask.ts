import { Chain } from "@defillama/sdk/build/general"
import { CHAIN } from "../helpers/chains";
import { Adapter, ChainBlocks, FetchOptions, FetchResultFees } from "../adapters/types";
import { queryFlipside } from "../helpers/flipsidecrypto";

interface IVolume {
  amount: number;
  tokenAddress: string;
  tx: string;
}

type TAddress = {
  [s: string | Chain]: string;
}

const address: TAddress = {
  [CHAIN.ETHEREUM]: '0x881d40237659c251811cec9c364ef91dc08d300c',
  [CHAIN.POLYGON]: '0x1a1ec25dc08e98e5e93f1104b5e5cdd298707d31',
  [CHAIN.BSC]: '0x1a1ec25dc08e98e5e93f1104b5e5cdd298707d31',
  [CHAIN.ARBITRUM]: '0x9dda6ef3d919c9bc8885d5560999a3640431e8e6'
}
type TKeyArray = {
  [s: string | Chain]: string[];
}
const blackList: TKeyArray = {
  [CHAIN.BSC]: ['0xc342774492b54ce5f8ac662113ed702fc1b34972'],
  [CHAIN.ETHEREUM]: [],
  [CHAIN.POLYGON]: [],
  [CHAIN.ARBITRUM]: []
}

const graph = (chain: Chain) => {
  return async (timestamp: number , _: ChainBlocks, { createBalances, getFromBlock, getToBlock, }: FetchOptions): Promise<FetchResultFees> => {

    const query = `
        select
          input_data,
          TX_HASH
        from
          ${chain}.core.fact_transactions
        WHERE to_address = '${address[chain]}'
        and BLOCK_NUMBER > ${await getFromBlock()} AND BLOCK_NUMBER < ${await getToBlock()}
      `


    const value: string[][] = (await queryFlipside(query, 510))
    const rawData = value.map((a: string[]) => {
      const data = a[0].replace('0x5f575529', '');
      const address = data.slice(64, 128);
      const amount = Number('0x' + data.slice(128, 192));
      const tokenAddress = '0x' + address.slice(24, address.length);
      return {
        amount: amount,
        tokenAddress: tokenAddress,
        tx: a[1]
      } as IVolume
    })
    const dailyFees = createBalances()

    rawData.map((e: IVolume) => {
      dailyFees.add(e.tokenAddress, e.amount)
    })

    dailyFees.resizeBy(0.0085)

    return {
      dailyFees: dailyFees,
      dailyProtocolRevenue: dailyFees,
      dailyRevenue: dailyFees,
      timestamp
    }

  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: graph(CHAIN.ETHEREUM),
      start: 1672531200,
    },
    [CHAIN.POLYGON]: {
      fetch: graph(CHAIN.POLYGON),
      start: 1672531200,
    },
    [CHAIN.BSC]: {
      fetch: graph(CHAIN.BSC),
      start: 1672531200,
    },
    [CHAIN.ARBITRUM]: {
      fetch: graph(CHAIN.ARBITRUM),
      start: 1672531200,
    }
  },
  isExpensiveAdapter: true,
}

export default adapter;
