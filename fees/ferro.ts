import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import request, { gql } from "graphql-request";

const endpoints: any = {
  [CHAIN.CRONOS]: "https://graph.cronoslabs.com/subgraphs/name/ferro/swap",
};

interface IVolume {
  volume: string;
}

const fetchVolume = async (options: FetchOptions) => {
  const query = gql`
    {
      dailyVolumes(where:{timestamp: "${options.startOfDay}"}){
        timestamp
        volume
      }
    }
  `
  const res:IVolume[] = (await request(endpoints[options.chain], query)).dailyVolumes as IVolume[];
  const dailyVolume = res.reduce((acc, item) => acc + Number(item.volume), 0);
  const dailyFees = dailyVolume * (0.04 /100);
  const dailyUserFees = dailyFees;
  const dailyRevenue = dailyVolume * (0.02 /100);
  const dailyHoldersRevenue = dailyVolume * (0.016 /100);
  const dailySupplySideRevenue = dailyVolume * (0.02 /100);

  return {
    dailyFees,
    dailyUserFees: dailyUserFees,
    dailyRevenue,
    dailyHoldersRevenue: dailyHoldersRevenue,
    dailySupplySideRevenue: dailySupplySideRevenue,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.CRONOS]: {
      fetch: fetchVolume,
      start: '2022-08-29',
    },
  },
};

export default adapter;
