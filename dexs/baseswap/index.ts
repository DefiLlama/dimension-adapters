import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import type { BaseAdapter, BreakdownAdapter, ChainEndpoints } from "../../adapters/types";
import { getUniV2LogAdapter, getUniV3LogAdapter, } from "../../helpers/uniswap";

const v2Endpoints: ChainEndpoints = {
  [CHAIN.BASE]: sdk.graph.modifyEndpoint('BWHCfpXMHFDx3u4E14hEwv4ST7SUyN89FKJ2RjzWKgA9'),
};
const v3Endpoints = {
  [CHAIN.BASE]: 'https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/v3-base/prod/gn'
};


const v2Methodology = {
  UserFees: "User pays 0.25% fees on each swap.",
  SupplySideRevenue: "LPs receive 0.17% of each swap.",
  ProtocolRevenue: "Treasury receives 0.08% of each swap.",
  Revenue: "All revenue generated comes from user fees.",
  Fees: "All fees come from the user.",
};

const v3Methodology = {
  UserFees:
    "User pays a variable percentage on each swap depending on the pool. Minimum: 0.008%, maximum: 1%.",
  SupplySideRevenue: "LPs receive 36% of the current swap fee",
  ProtocolRevenue: "Treasury receives 64% of each swap",
  Fees: "All fees come from the user.",
};

const startTimeV3 = {
  [CHAIN.BASE]: 1693150193,
};

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v2: Object.keys(v2Endpoints).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: getUniV2LogAdapter({ factory: '0xFDa619b6d20975be80A10332cD39b9a4b0FAa8BB' }),
          start: '2023-07-28',
          meta: { methodology: v2Methodology },
        },
      };
    }, {}),
    v3: Object.keys(v3Endpoints).reduce((acc, chain) => {
      acc[chain] = {
        fetch: getUniV3LogAdapter({ factory: '0x38015d05f4fec8afe15d7cc0386a126574e8077b' }),
        start: startTimeV3[chain],
        meta: {
          methodology: v3Methodology,
        },
      };
      return acc;
    }, {} as BaseAdapter),
  },
};

export default adapter;
