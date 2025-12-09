import { Adapter, FetchOptions, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const API_URL = "https://api.multiversx.com/network/economics";

const fetch = async (timestamp: number, _: any, options: FetchOptions) => {
  const result = await httpGet(API_URL);
  const metrics = result?.data?.metrics;
  const totalFees = metrics?.erd_total_fees; 
  const devRewards = metrics?.erd_dev_rewards;
  
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  if (totalFees) {
    dailyFees.addCGToken('elrond-erd-2', Number(totalFees) / 1e18);
  }
  if (devRewards) {
    dailyRevenue.addCGToken('elrond-erd-2', Number(devRewards) / 1e18);
  }

  return {
    timestamp,
    dailyFees,
    dailyRevenue,
  }; 
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.MULTIVERSX]: {
      fetch,
      runAtCurrTime: true,
      start: '2020-07-30',
    },
  },
  protocolType: ProtocolType.CHAIN
};

export default adapter;