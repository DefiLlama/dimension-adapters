import { FetchOptions, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const fetch: FetchV2 = async (option: FetchOptions) => {
  const dailyFees = option.createBalances();

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
    dailyFees.add(e._rewardToken, e._reward);
  });
  
  const dailyRevenue = dailyFees.clone(1/3);

  return {
    dailyFees,
    dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: "2023-06-02",
    },

    [CHAIN.ARBITRUM]: {
      fetch: fetch,
      start: "2023-06-02",
    },
    [CHAIN.BSC]: {
      fetch: fetch,
      start: "2023-06-02",
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch,
      start: "2023-06-02",
    },
    [CHAIN.MANTLE]: {
      fetch: fetch,
      start: "2023-06-02",
    },
  },
  version: 2,
};

export default adapter;
