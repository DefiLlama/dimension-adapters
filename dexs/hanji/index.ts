import request from "graphql-request";
import type { FetchOptions, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const ENDPOINTS: any = {
  [CHAIN.ETHERLINK]: "https://api.studio.thegraph.com/query/61208/onchain-clob-etherlink/version/latest"
}

interface IGraph {
  dailyVolume: {
    volumeUsd: string;
  };
  dailyFees: {
    feesUsd: string;
    userFeesUsd: string;
    revenueUsd: string;
  };
}

const fetch = async (_:any, _1: any, {chain, startOfDay}: FetchOptions) => {

  const query = `{
    dailyVolume(id: ${startOfDay}) {
      volumeUsd
    }
    dailyFees(id: ${startOfDay}) {
      feesUsd
      userFeesUsd
      revenueUsd
    }
  }
  `;

  const data: IGraph = await request(ENDPOINTS[chain], query);


  return {
    dailyVolume: data.dailyVolume.volumeUsd,
    dailyFees: data.dailyFees.feesUsd,
    dailyUserFees: data.dailyFees.userFeesUsd,
    dailyRevenue: data.dailyFees.revenueUsd,
  };
};

export default {
  start: '2025-02-19',
  chains: Object.keys(ENDPOINTS),
  fetch,
}