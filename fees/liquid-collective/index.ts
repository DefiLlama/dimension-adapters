// https://docs.liquidcollective.io/v1/faqs#what-is-the-protocol-service-fee
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const lsETH = "0x8c1BEd5b9a0928467c9B1341Da1D7BD5e10b6549";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();

  const totalSupplyBefore = await options.fromApi.call({
    target: lsETH,
    abi: 'uint256:totalSupply',
  })
  const totalSupplyAfter = await options.toApi.call({
    target: lsETH,
    abi: 'uint256:totalSupply',
  })

  const totalUnderlyingSupplyBefore = await options.fromApi.call({
    target: lsETH,
    abi: 'uint256:totalUnderlyingSupply',
  })
  const totalUnderlyingSupplyAfter = await options.toApi.call({
    target: lsETH,
    abi: 'uint256:totalUnderlyingSupply',
  })

  const dailyLsEthHoldersYield = (totalUnderlyingSupplyAfter / totalSupplyAfter - totalUnderlyingSupplyBefore / totalSupplyBefore) * (totalSupplyAfter / 1e18);

  dailyFees.addCGToken("ethereum", dailyLsEthHoldersYield / 0.9);
  const dailyRevenue = dailyFees.clone(0.1);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2022-11-19',
    },
  },
  version: 2,
  methodology: {
    Fees: "Total ETH staking rewards from all validators.",
    Revenue: "Liquid Collective charges 10% ETH staking rewards.",
    ProtocolRevenue: "Liquid Collective charges 10% ETH staking rewards.",
  },
};

export default adapter;
