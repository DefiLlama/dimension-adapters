import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";
import { addTokensReceived } from "../../helpers/token";

const HOLDERS_ADDRESS = "0x53c9e51afecda7a502a4432a10a319a6d41e8b6e";

const CONFIG: Record<
  string,
  {
    treasury: string;
    nativeToken: string;
    start: string;
  }
> = {
  sonic: {
    treasury: "0x13a4fcbb628b921fbca8296a62a7f061bdf80af2",
    nativeToken: "0x039e2fB66102314Ce7b64Ce5Ce3E5183bc94aD38",
    start: "2025-05-03",
  },
  avax: {
    treasury: "0x24190824cae72fea4f3ffca452c4e5fc34db1995",
    nativeToken: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
    start: "2025-08-12",
  },
  bsc: {
    treasury: "0x9f8745e46b795d7c665170bbfbc61ed0f3a2894b",
    nativeToken: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    start: "2025-10-03",
  },
  ethereum: {
    treasury: "0xb56bdaa3c2d554a178e7dbd2acf324ce787fbd3f",
    nativeToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    start: "2026-01-29",
  },
  base: {
    treasury: "0x6af0c089b809a0e08cf84c6538a46c17df234ab3",
    nativeToken: "0x4200000000000000000000000000000000000006",
    start: "2025-04-12",
  },
  arbitrum: {
    treasury: "0xe92a4f69d52d9d1eefdb823343708aceda47eeb6",
    nativeToken: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    start: "2026-02-17",
  },
};

const TREASURY_SHARE_DIVIDER = 1000000000000000000;

const fetch = async (options: FetchOptions) => {
  const { chain, api } = options;
  const { treasury, nativeToken } = CONFIG[chain];

  const holdersPercent = await api.call({
    target: treasury,
    abi: "function receiversPercent(address receiver) view returns (uint256)",
    params: [HOLDERS_ADDRESS],
  });

  const holdersShare = Number(holdersPercent) / Number(TREASURY_SHARE_DIVIDER);

  if (holdersShare > 1) {
    throw new Error("Holders share is greater than 1");
  }

  const rawFees = await addTokensReceived({
    options,
    target: treasury,
    tokens: [nativeToken],
  });

  const dailyFees = rawFees.clone(1, METRIC.SWAP_FEES);
  const dailyHoldersRevenue = dailyFees.clone(holdersShare, METRIC.STAKING_REWARDS);
  const dailyProtocolRevenue = dailyFees.clone(1 - holdersShare, METRIC.PROTOCOL_FEES);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Fees: "Harvest fees comes to treasury contracts on each chain",
  Revenue: "All collected fees are protocol revenue (no separate liquidity provider supply-side)",
  HoldersRevenue:
    "Share of revenue distributed to gDEX token stakers, determined at runtime via receiversPercent()",
  ProtocolRevenue: "Share of revenue retained by the protocol treasury",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Wrapped native token swap fees sent to the treasury",
  },
  Revenue: {
    [METRIC.SWAP_FEES]: "Wrapped native token swap fees sent to the treasury",
  },
  HoldersRevenue: {
    [METRIC.STAKING_REWARDS]: "Treasury share distributed to gDEX token stakers",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]:
      "Treasury share retained by the protocol team, remainder after staker distribution",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: CONFIG,
  methodology,
  breakdownMethodology,
};

export default adapter;