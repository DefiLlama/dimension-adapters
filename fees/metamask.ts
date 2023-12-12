import { Chain } from "@defillama/sdk/build/general"
import { CHAIN } from "../helpers/chains";
import { Adapter, FetchResultFees } from "../adapters/types";
import { queryFlipside } from "../helpers/flipsidecrypto";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";

type TPrice = {
  [s: string]: {
    price: number;
    decimals: number
  };
}
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
  return async (timestamp: number): Promise<FetchResultFees> => {

    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp
    try {
      const startblock = (await getBlock(fromTimestamp, chain, {}));
      const endblock = (await getBlock(toTimestamp, chain, {}));
      const query = `
        select
          input_data,
          TX_HASH
        from
          ${chain}.core.fact_transactions
        WHERE to_address = '${address[chain]}'
        and BLOCK_NUMBER > ${startblock} AND BLOCK_NUMBER < ${endblock}
      `


      const value: string[][] = (await queryFlipside(query, 210))
      const rawData = value.map((a: string[]) => {
        const data = a[0].replace('0x5f575529', '');
        const address = data.slice(64, 128);
        const amount = Number('0x'+data.slice(128, 192));
        const tokenAddress = '0x' + address.slice(24, address.length);
        return {
          amount: amount,
          tokenAddress: tokenAddress,
          tx: a[1]
        } as IVolume
      })
      const coins =[...new Set(rawData.map((a: IVolume) => `${chain}:${a.tokenAddress.toLowerCase()}`))]
      const coins_split = [];
      for(let i = 0; i < coins.length; i+=100) {
        coins_split.push(coins.slice(i, i + 100))
      }
      const prices_result: any =  (await Promise.all(coins_split.map((a: string[]) =>  getPrices(a, timestamp)))).flat().flat().flat();
      const prices: TPrice = Object.assign({}, {});
      prices_result.map((a: any) => Object.assign(prices, a))

      const volumeUSD: IVolume[] = rawData.map((e: IVolume) => {
        const price = prices[`${chain}:${e.tokenAddress.toLowerCase()}`]?.price || 0;
        const decimals = prices[`${chain}:${e.tokenAddress.toLowerCase()}`]?.decimals || 0;
        if (!price || !decimals) return {
          amount: 0,
          tokenAddress: e.tokenAddress,
          tx: e.tx
        } as IVolume;
        const amount = (Number(e.amount) / 10 ** decimals) * price;
        return  {
          amount: amount,
          tokenAddress: e.tokenAddress,
          tx: e.tx
        } as IVolume
      }).filter((a: IVolume) => !isNaN(a.amount))
        .filter((a: IVolume) => !blackList[chain]?.includes(a.tokenAddress.toLowerCase()))
        .filter((a: IVolume) => a.amount < 10_000_000)
      const dailyVolume = volumeUSD.reduce((a: number, b: IVolume) => a + b.amount, 0);
      const dailyFees = dailyVolume * 0.0085

      return {
        dailyFees: `${dailyFees}`,
        dailyProtocolRevenue: `${dailyFees}`,
        dailyRevenue: `${dailyFees}`,
        timestamp
      }
    } catch (err) {
      console.log(err);
      throw err;
    }

  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: graph(CHAIN.ETHEREUM),
      start: async ()  => 1672531200,
    },
    [CHAIN.POLYGON]: {
      fetch: graph(CHAIN.POLYGON),
      start: async ()  => 1672531200,
    },
    [CHAIN.BSC]: {
      fetch: graph(CHAIN.BSC),
      start: async ()  => 1672531200,
    },
    [CHAIN.ARBITRUM]: {
      fetch: graph(CHAIN.ARBITRUM),
      start: async ()  => 1672531200,
    }
  }
}

export default adapter;
