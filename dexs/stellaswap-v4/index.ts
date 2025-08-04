import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request } from "graphql-request";
import * as sdk from "@defillama/sdk";

const fetch = async (_timestamp: number, _: any, options: FetchOptions): Promise<any> => {
  const dayID = Math.floor(options.startOfDay / 86400);
  const query = `
    {
        algebraDayData(id:${dayID}) {
            id
            volumeUSD
            feesUSD
        }
    }`;
  const url = sdk.graph.modifyEndpoint('LgiKJnsTspbsPBLqDPqULPtnAdSZP6LfPCSo3GWuJ5a');
  const req = await request(url, query);
  return {
    dailyVolume: req.algebraDayData?.volumeUSD,
    dailyFees: req.algebraDayData?.feesUSD,
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.MOONBEAM]: {
      fetch,
      start: 1738927506,
    },
  }
}

export default adapter;
