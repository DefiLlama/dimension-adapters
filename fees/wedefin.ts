import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

/**
rewards_fee -> is the one that is charge each time a index user rebalance to the latest community index. This one goes to the traders / pro and index setter.
transaction fees -> are normal rebalancing actions by the pro / traders -> this one goes direct to the protocol
deposit/withdrawal fees for both index and pro -> goes to protocol
rebalance_actor_fee -> is the fee from the rewards that is taken for the index setter (whoever did it). For instance if the rewards fee is 1%, and rebalance_actor_fee is 10%, then the index setter gets 1% * 10%.

as these values can be changed by governance, api to check the breakdown is available here:

https://app.wedefin.com/fee_breakdown_data.json

 */

const events = {
   TreasuryGeneralFeeDeposited: 'event TreasuryGeneralFeeDeposited(address indexed depositor, uint256 amount)',
   TreasuryRewardFeeDeposited: 'event TreasuryRewardFeeDeposited(address indexed depositor, uint256 amount)'
}

const tokens: Record<string, string> = {
  [CHAIN.ETHEREUM]: '0x9CD8D94f69Ed3cA784231E162905745c436d22Bc',
  [CHAIN.BASE]: '0x9b2AE23A9693475f0588E09e814d6977821c1492',
  [CHAIN.ARBITRUM]: '0x5F2D9c9619807182a9C3353FF67fd695b6d1b892',
};


const fetchFees = async (options: FetchOptions) => {
  const { chain, getLogs } = options;
  const token = tokens[chain];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  
  const protocolFeeLogs = await getLogs({    target: token,    eventAbi: events.TreasuryGeneralFeeDeposited,  });
  const rewardFeeLogs = await getLogs({    target: token,    eventAbi: events.TreasuryRewardFeeDeposited,  });

   for (const log of rewardFeeLogs) dailySupplySideRevenue.addGasToken(log.amount)

  for (const log of protocolFeeLogs) dailyRevenue.addGasToken(log.amount)

  dailyFees.add(dailyRevenue)
  dailyFees.add(dailySupplySideRevenue)

  return {
    dailyFees,
    dailyRevenue: dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: Object.keys(tokens),
  fetch: fetchFees,
  methodology: {
    Fees: 'Fees for minting/rebalancing/selling the index, paid by users.',
    Revenue: 'Transaction, deposit & withdrawal fees collected by the protocol.',
    ProtocolRevenue: 'All the revenue goes to the protocol',
    SupplySideRevenue: 'Fees distributed to the traders & index setters.',
  },
};

export default adapter;
