import { Chain } from '@defillama/sdk/build/general';
import { Adapter, FetchResultFees } from '../adapters/types';
import { getBlock } from '../helpers/getBlock';
import { queryFlipside } from '../helpers/flipsidecrypto';
import { CHAIN } from '../helpers/chains';
import { getPrices } from '../utils/prices';
import fetchURL from '../utils/fetchURL';


const graph = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {

    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp
    try {
      const startblock = (await getBlock(fromTimestamp, chain, {}));
      const endblock = (await getBlock(toTimestamp, chain, {}));
      const data: string[] = (await fetchURL('https://scatter-api.fly.dev/api/contracts')).data.body;
      const _contract = data.map((e: string) => e.toLowerCase())
      const query = `
        SELECT sum(eth_value) as sum from ethereum.core.fact_transactions
        WHERE to_address in (${_contract.map((a: string) => `'${a.toLowerCase()}'`).join(',')})
        and origin_function_signature in ('0x4a21a2df','0x1fff79b0')
        and BLOCK_NUMBER > ${startblock} AND BLOCK_NUMBER < ${endblock}
      `

      const value: string[] = (await queryFlipside(query)).flat();
      const total_amount_mint: number = Number(value[0] || 0);
      const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
      const ethPrice = (await getPrices([ethAddress], timestamp))[ethAddress].price;
      const dailyFees = total_amount_mint * ethPrice;
      const dailyRevenue = dailyFees * 0.05;
      const dailyProtocolRevenue = dailyRevenue;
      return {
        dailyFees: `${dailyFees}`,
        dailyRevenue: `${dailyRevenue}`,
        dailyProtocolRevenue: `${dailyProtocolRevenue}`,
        timestamp
      }
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}


const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: graph(CHAIN.ETHEREUM),
      start: async ()  => 1650844800,
    },
  }
}

export default adapter;
