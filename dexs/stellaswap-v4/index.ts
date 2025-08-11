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
    dailyRevenue: req.algebraDayData?.feesUSD,
    dailyProtocolRevenue: req.algebraDayData?.feesUSD * 0.15,
    dailyHoldersRevenue: req.algebraDayData?.feesUSD * 0.835,
  }
}

const methodology = {
  Fees: 'All trading fees paid by users.',
  Revenue: '15% for treasury, 1.5% for algebra, 83.5% to veSTELLA voters',
  ProtocolRevenue: '15% for treasury',
  HoldersRevenue: '83.5% to veSTELLA voters',
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.MOONBEAM],
  start: '2025-02-07',
  methodology,
}

export default adapter;
