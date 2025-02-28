import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDune } from "../helpers/dune";

const fetch = () => {
  return async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    try {
      const rows = await queryDune("4786708", {});
      rows.forEach(row => {
        const chainKey = row.blockchain;
        const feeValue = (row.fees_by_chain || 0) * 1e18;
        dailyFees.add(chainKey, feeValue);
     }); 
      return { dailyFees };
    } catch (e) {
      return { dailyFees };
    }
  };
};

const methodology = {
  dailyFees: "Combines reserve asset yield and protocol fees on swap fee revenue.",
};

const supportedChains = [
  CHAIN.ETHEREUM,
  CHAIN.POLYGON,
  CHAIN.POLYGON_ZKEVM,
  CHAIN.OPTIMISM,
  CHAIN.ARBITRUM,
  CHAIN.BASE,
  CHAIN.AVAX,
  CHAIN.SONIC,
  CHAIN.SEI,
  CHAIN.XDAI,
];

const adapterChains = supportedChains.reduce((acc, chain) => {
  acc[chain] = { fetch: fetch() as any, meta: { methodology } };
  return acc;
}, {});

const adapter: Adapter = {
  version: 2,
  adapter: adapterChains,
  isExpensiveAdapter: true,
};


export default adapter;
