import { Adapter, DISABLED_ADAPTER_KEY } from "../../adapters/types";
import { ARBITRUM } from "../../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../../adapters/types";
import { Chain } from "@defillama/sdk/build/general";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import * as sdk from "@defillama/sdk";
import disabledAdapter from "../../helpers/disabledAdapter";

const endpoints = {
  [ARBITRUM]:
    "https://api.thegraph.com/subgraphs/name/liondextrade/finance",
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
    return async (timestamp: number) => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);

      const graphQuery = gql`
        {
          dailyGlobalInfo(id: "global-fee-${todaysTimestamp}" ) {
            fees
          }
        }
      `;
      const graphRes = await request(graphUrls[chain], graphQuery);
      const fees = graphRes.dailyGlobalInfo.fees * (await lpPrice()) / 1e18;

      return {
        timestamp,
        dailyFees: fees.toString()
      };
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [ARBITRUM]: {
      fetch: graphs(endpoints)(ARBITRUM),
      start: 1686614400,
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
