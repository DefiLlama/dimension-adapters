import { FetchOptions, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const fetch: FetchV2 = async (option: FetchOptions) => {
  const dailyFees = option.createBalances();
  const dailyRevenue = option.createBalances();

  const contracts: {[key: string]: string }  = {
    ethereum:  "0x357F55b46821A6C6e476CC32EBB2674cD125e849",
    arbitrum: "0x9739d1E515C5291faA26D92a5D02761b6BbB4D6F",
    bsc:  "0xE2dB20ce7D845f99338BbA4bdFF00e733801Dde7",
    optimism: "0x898CA9B3ef8b6a30dA5fc7202f70E7992b3602B3",
    mantle : "0x741620136cf08a782c1Df1Fc9E3cAA760Cc4Fecc",
  }

  const logs = await option.getLogs({
    target: contracts[option.chain],
    eventAbi:
      "event RewardAdded(address indexed _rewardToken, uint256 _reward)",
  });
  logs.map((e) => {
    dailyFees.add(e._rewardToken, e._reward, METRIC.ASSETS_YIELDS);
    dailyRevenue.add(e._rewardToken, e._reward * BigInt(1) / BigInt(3), METRIC.PROTOCOL_FEES);
  });

  const dailySupplySideRevenue = dailyFees.clone(0.9);

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM, CHAIN.ARBITRUM, CHAIN.BSC, CHAIN.OPTIMISM, CHAIN.MANTLE],
  start: '2023-06-02',
  breakdownMethodology: {
    Fees: {
      [METRIC.ASSETS_YIELDS]: "Total reward tokens distributed via Equilibria RewardAdded events across all supported chains.",
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: "One-third of total reward distributions retained as Equilibria protocol revenue.",
    },
  },
};

export default adapter;
