import { Chain } from "@defillama/sdk/build/general";
import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";
import { queryFlipside } from "../helpers/flipsidecrypto";

interface IFee {
  contract_address: string;
  volume: number;
}

type TPrice = {
  [s: string]: {
    price: number;
    decimals: number
  };
}
type IToken = {
  [s: string | Chain]: string[];
}
const tokens: IToken = {
  [CHAIN.ETHEREUM]: ['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', '0xdac17f958d2ee523a2206206994597c13d831ec7'],
}

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {

    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp
      try {

        const startblock = (await getBlock(fromTimestamp, chain, {}));
        const endblock = (await getBlock(toTimestamp, chain, {}));


      const query =`
        SELECT
          data,
          contract_address,
          tx_hash
        from
          ${chain}.core.fact_event_logs
        WHERE
          BLOCK_NUMBER > ${startblock} AND BLOCK_NUMBER < ${endblock}
          and contract_address in (${tokens[chain].map((a: string) => `'${a.toLowerCase()}'`).join(',')})
          and topics[0] = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
          and topics[2] = '0x00000000000000000000000004bda42de3bc32abb00df46004204424d4cf8287'
      `;
      // 0xcdd1b25d - replay
      // 0x3593564c - ex


      const logs: [string, string][] = (await queryFlipside(query))

      const log = logs.map(([data, contract_address]: [string, string]) => {
          const volume =  Number(data)
        return {
          volume: volume,
          contract_address: contract_address,
        } as IFee
      });

      const coins = [...new Set(log.map((e: IFee) => `${chain}:${e.contract_address}`.toLowerCase()))]
      const coins_split = [];
      for(let i = 0; i <= coins.length; i+=100) {
        coins_split.push(coins.slice(i, i + 100))
      }
      const prices_result: any =  (await Promise.all(coins_split.map((a: string[]) =>  getPrices(a, timestamp)))).flat().flat().flat();
      const prices: TPrice = Object.assign({}, {});
      prices_result.map((a: any) => Object.assign(prices, a))

      const amounts = log.map((p: IFee) => {
        const price = prices[`${chain}:${p.contract_address}`.toLowerCase()]?.price || 0;
        const decimals = prices[`${chain}:${p.contract_address}`.toLowerCase()]?.decimals || 0;
        return (p.volume / 10 ** decimals) * price;
      })
      const volume = amounts
        .filter((e: any) => !isNaN(e))
        .filter((e: number) => e < 100_000_000)
        .reduce((a: number, b: number) => a+b, 0);
      const dailyFees = volume;

      return {
        timestamp: timestamp,
        dailyFees: dailyFees.toString(),
        dailyRevenue: dailyFees.toString(),
        dailyProtocolRevenue: dailyFees.toString(),
      } as FetchResultFees

      } catch (error) {
        throw error
      }
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
        fetch: fetch(CHAIN.ETHEREUM),
        start: async ()  => 1672531200,
    }
  },

}

export default adapter;
