import { BaseAdapter, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";



const config = {
  [CHAIN.ETHEREUM]: {
    pools: [
      '0x6818809eefce719e480a7526d76bd3e561526b46',
    ]
  },
}


const adapters: SimpleAdapter = {
  adapter: {},
  version: 2,
  methodology: {
    Fees: "Fees paid by users using privicy services."
  },
};

Object.entries(config).forEach(([chain, { pools }]) => {
  (adapters.adapter as BaseAdapter)[chain] = {
    fetch: async (options: FetchOptions) => {
      const dailyFees = options.createBalances();
      const logs = await options.getLogs({
        targets: pools,
        eventAbi: "event FeesWithdrawn(address asset, address _recipient, uint256 amount)",
      });

      logs.forEach(log => {
        dailyFees.add(log.asset, log.amount);
      });

      return {
        dailyFees,
      };
    },
  }
});

export default adapters;
