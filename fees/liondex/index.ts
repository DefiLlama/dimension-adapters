import { Adapter, DISABLED_ADAPTER_KEY } from "../../adapters/types";
import { ARBITRUM } from "../../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints, FetchOptions } from "../../adapters/types";
import { Chain } from "@defillama/sdk/build/general";
import * as sdk from "@defillama/sdk";
import disabledAdapter from "../../helpers/disabledAdapter";

const endpoints = {
  [ARBITRUM]:
    sdk.graph.modifyEndpoint('EDnnTmgZVXAywK9ujCbwhi2hNhuaLAgeSvRL7dPAsV13'),
};

const methodology = {
  Fees: "Daily fees collected from user trading fees",
};

const VAULT = "0x8eF99304eb88Af9BDe85d58a35339Cb0e2a557B6";

const abis = {
  "getLPPrice": "uint256:getLPPrice"
}

async function lpPrice() {
  return (await sdk.api2.abi.call({ target: VAULT, abi: abis['getLPPrice'], chain: 'arbitrum' }));
}

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async ({ startOfDay }: FetchOptions) => {
      const graphQuery = gql`
        {
          dailyGlobalInfo(id: "global-fee-${startOfDay}" ) {
            fees
          }
        }
      `;
      const graphRes = await request(graphUrls[chain], graphQuery);
      const fees = graphRes.dailyGlobalInfo.fees * (await lpPrice()) / 1e18;

      return {
        dailyFees: fees.toString()
      };
    };
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [ARBITRUM]: {
      fetch: graphs(endpoints)(ARBITRUM),
      start: '2023-06-13',
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
