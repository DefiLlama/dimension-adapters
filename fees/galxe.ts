import { Chain } from "@defillama/sdk/build/general";
import { getBlock } from "../helpers/getBlock";
import { ChainBlocks, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBalance } from "@defillama/sdk/build/eth";
import { getPrices } from "../utils/prices";
import { queryFlipside } from "../helpers/flipsidecrypto";

type TID = {
  [key: string | Chain]: string;
}

const contract: TID = {
  [CHAIN.BSC]: '0x3AD7976823f001294d6CFF8197B1E0fc99673AD3',
  [CHAIN.ARBITRUM]: '0xF3AFfE20fefcb4F4F5B7173a202109822D74662B',
  [CHAIN.POLYGON]: '0xade113359ebce63e7429317be1a495f3a836df65'
}

const gasTokenId: TID = {
  [CHAIN.ETHEREUM]: "coingecko:ethereum",
  [CHAIN.BSC]: "coingecko:binancecoin",
  [CHAIN.POLYGON]: "coingecko:matic-network",
  [CHAIN.FANTOM]: "coingecko:fantom",
  [CHAIN.AVAX]: "coingecko:avalanche-2",
  [CHAIN.ARBITRUM]: "coingecko:ethereum",
  [CHAIN.OPTIMISM]: "coingecko:ethereum"
}
const mapValue = (chain: Chain): string => {
  if (chain === CHAIN.BSC) return "BNB_VALUE"
  if (chain === CHAIN.POLYGON) return "MATIC_VALUE"
  return "eth_value"
}

const fetchFees = (chain: Chain, _: ChainBlocks) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp
    try {
      const toBlock = await getBlock(toTimestamp, chain, {});
      const fromBlock = await getBlock(fromTimestamp, chain, {});
      const query = `
        select
          ${mapValue(chain)}
        from
          ${chain}.core.fact_traces
        WHERE to_address = '${contract[chain].toLowerCase()}'
        and BLOCK_NUMBER > ${fromBlock} AND BLOCK_NUMBER < ${toBlock}`
      const value: number[] = (await queryFlipside(query, 260)).flat();
      const prices = await getPrices([gasTokenId[chain]], timestamp);
      const basePrice = prices[gasTokenId[chain]].price;
      const fees_raw = value.reduce((a: number, b: number) => a + b, 0);
      const dailyFees = (fees_raw * basePrice)
      return {
        dailyFees: `${dailyFees}`,
        dailyRevenue: `${dailyFees}`,
        dailyProtocolRevenue: `${dailyFees}`,
        timestamp,
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  };
}
const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetchFees(CHAIN.BSC, {}),
      start: async () => 1695513600,
    },
    [CHAIN.POLYGON]: {
      fetch: fetchFees(CHAIN.POLYGON, {}),
      start: async () => 1695513600,
    },
  },
};
export default adapter;
