import { FetchOptions, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const fetch: FetchV2 = async (option: FetchOptions) => {
  const dailyFees = option.createBalances();
  const dailyRevenue = option.createBalances();

  const logs = await option.getLogs({
    targets: [
      "0x357F55b46821A6C6e476CC32EBB2674cD125e849", //ETH
      "0x9739d1E515C5291faA26D92a5D02761b6BbB4D6F", //ARB
      "0xE2dB20ce7D845f99338BbA4bdFF00e733801Dde7", //BSC
      "0x898CA9B3ef8b6a30dA5fc7202f70E7992b3602B3", //OP
      "0x741620136cf08a782c1Df1Fc9E3cAA760Cc4Fecc", //MANTLE
    ],
    eventAbi:
      "event RewardAdded(address indexed _rewardToken, uint256 _reward)",
  });
  logs.map((e) => {
    dailyFees.add(e[0], e[1]);
    dailyRevenue.add(e[0], e[1] / BigInt(3));
  });

  return {
    dailyFees: dailyFees,
    dailyRevenue: dailyRevenue,
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
