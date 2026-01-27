import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request, gql } from "graphql-request";
import type { FetchOptions } from "../../adapters/types";
import * as sdk from "@defillama/sdk";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoints:Record<string, string> = {
  [CHAIN.ARBITRUM]:
    sdk.graph.modifyEndpoint('EDnnTmgZVXAywK9ujCbwhi2hNhuaLAgeSvRL7dPAsV13'),
};

const VAULT = "0x8eF99304eb88Af9BDe85d58a35339Cb0e2a557B6";

const abis = {
  "getLPPrice": "uint256:getLPPrice"
}

async function lpPrice() {
  return (await sdk.api2.abi.call({ target: VAULT, abi: abis['getLPPrice'], chain: 'arbitrum' }));
}

const fetch = async (timestamp: number, _a:any, options: FetchOptions) => {
  const startOfDay = getTimestampAtStartOfDayUTC(timestamp);
  const graphQuery = gql`
    {
      dailyGlobalInfo(id: "global-fee-${startOfDay}" ) {
        fees
      }
    }
  `;
  const graphRes = await request(endpoints[options.chain], graphQuery);
  const fees = graphRes.dailyGlobalInfo.fees * (await lpPrice()) / 1e18;

  return {
    dailyFees: fees.toString()
  };
};


const methodology = {
  Fees: "Daily fees collected from user trading fees",
};

const adapter: Adapter = {
  deadFrom: "2024-12-14",
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2023-06-13',
    },
  },
  methodology,
};

export default adapter;
