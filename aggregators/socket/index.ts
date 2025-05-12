import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { fetchSocketData, SocketGatewayContracts } from "../../bridge-aggregators/socket";

const fetch: any = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const { dailyVolume } = await fetchSocketData(options, {volume: true, })
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.keys(SocketGatewayContracts).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: { fetch, start: '2023-08-10', }
    }
  }, {})
};

export default adapter;
