import * as sdk from "@defillama/sdk";
import { Chain, FetchOptions } from "../../adapters/types";
import request, { gql } from "graphql-request";
import { Adapter, FetchResultVolume } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

interface IData {
  totalTradingVolume: string;
}

interface IProtocolData {
  protocolByDay: IData;
  protocol: IData;
}

type IURL = {
  [l: string | Chain]: string;
};

const endpoints: IURL = {
  [CHAIN.CELO]: sdk.graph.modifyEndpoint('DGN3dMffNnXZRAHFyCAq3csJbe2o7g9Jdg2XHe2mzVdG'),
};

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const todayTimestamp = getTimestampAtStartOfDayUTC(options.toTimestamp);

  const graphQuery = gql`
      {
        protocolByDay(id: "${todayTimestamp}") {
          totalTradingVolume
        }
        protocol(id: "1") {
          totalTradingVolume
        }
      }
    `;

  const res: IProtocolData = await request(endpoints[options.chain], graphQuery);
  const dailyVolume = Number(res.protocolByDay.totalTradingVolume) / 10 ** 18;

  return {
    dailyVolume: dailyVolume.toString(),
  };
};

const adapter: Adapter = {
  fetch,
  chains: [CHAIN.CELO],
  start: '2023-08-01',
};

export default adapter;
