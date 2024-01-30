import { Chain } from '@defillama/sdk/build/general';
import { Adapter, FetchResultFees } from '../adapters/types';
import { getBlock } from '../helpers/getBlock';
import { CHAIN } from '../helpers/chains';
import { getPrices } from '../utils/prices';
import fetchURL from '../utils/fetchURL';
import { indexa, toBytea } from '../helpers/db';


const graph = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {

    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp
    try {
      const startblock = (await getBlock(fromTimestamp, chain, {}));
      const endblock = (await getBlock(toTimestamp, chain, {}));
      const data: string[] = (await fetchURL('https://scatter-api.fly.dev/api/contracts')).data.body;
      const to_address = data
        .map(toBytea)

      const mintor = () => indexa<{ data: string, eth_value: string }[]>`
          SELECT
            '0x' || encode(data, 'hex') AS data,
            value as eth_value
          FROM ethereum.transactions
            WHERE to_address IN ${indexa(to_address)}
              and block_number > ${startblock}
              and block_number < ${endblock};`;
      const exs = await mintor().execute();
      const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
      const ethPrice = (await getPrices([ethAddress], timestamp))[ethAddress].price;
      const total_amount_mint = exs
        .filter((e: any) => e.data.startsWith('0x4a21a2df') || e.data.startsWith('0x1fff79b0'))
        .map((e: any) => Number(e.eth_value) / 1e18).reduce((a: number, b: number) => a + b, 0);
      const _dailyFees = total_amount_mint * ethPrice;
      const dailyRevenue = _dailyFees * 0.05;
      const dailyFees = dailyRevenue;
      const dailyProtocolRevenue = dailyRevenue;
      indexa.end({ timeout: 3 });
      return {
        dailyFees: `${dailyFees}`,
        dailyRevenue: `${dailyRevenue}`,
        dailyProtocolRevenue: `${dailyProtocolRevenue}`,
        timestamp
      }
    } catch (error) {
      indexa.end({ timeout: 3 });
      console.error(error);
      throw error;
    }
  }
}


const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: graph(CHAIN.ETHEREUM),
      // start: async ()  => 1650844800,
      start: async ()  => 1656633600, //
    },
  }
}

export default adapter;
