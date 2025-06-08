// https://docs.liquidcollective.io/v1/faqs#what-is-the-protocol-service-fee
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { ETHEREUM } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const lsETH = "0x8c1BEd5b9a0928467c9B1341Da1D7BD5e10b6549";
const event = "event PulledELFees(uint256 amount)";
const WETH = ADDRESSES.ethereum.WETH;

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const fees = await options.getLogs({
    target: lsETH,
    eventAbi: event,
  });

  dailyFees.add(WETH, fees);
  const dailyRevenue = dailyFees.clone(0.15)
  return { dailyFees, dailyRevenue };
};

const adapter: Adapter = {
  adapter: {
    [ETHEREUM]: {
      fetch,
      start: '2022-11-19',
      meta: {
        methodology: {
          Fees: "Total ETH staking rewards from all validators.",
          Revenue: "Liquid Collective charges 15% ETH staking rewards.",
        },
      },
    },
  },
  version: 2,
};

export default adapter;
