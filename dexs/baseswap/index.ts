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

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v2: Object.keys(v2Endpoints).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: getUniV2LogAdapter({ factory: '0xFDa619b6d20975be80A10332cD39b9a4b0FAa8BB', revenueRatio: 0 }),
          start: '2023-07-28',
        },
      };
    }, {}),
    v3: Object.keys(v3Endpoints).reduce((acc, chain) => {
      acc[chain] = {
        fetch: getUniV3LogAdapter({ factory: '0x38015d05f4fec8afe15d7cc0386a126574e8077b', revenueRatio: 0.64 }),
        start: '2023-07-28',
      };
      return acc;
    }, {} as BaseAdapter),
  },
};

export default adapter;
