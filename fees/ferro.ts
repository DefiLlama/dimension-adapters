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

const methodology = {
  Fees: "Ferro charges a 0.04% fee on all swaps",
  Revenue: "0.02% of swap volume goes to the protocol, with 0.016% distributed to token holders and 0.004% to the treasury",
  SupplySideRevenue: "0.02% of swap volume is distributed to liquidity providers",
};

const breakdownMethodology = {
  Fees: {
    "Swap Fees": "0.04% fee charged on all token swaps through Ferro's StableSwap pools",
  },
  UserFees: {
    "Swap Fees": "0.04% fee paid by users on each swap",
  },
  Revenue: {
    "Protocol Share": "0.02% of swap volume retained by the protocol (0.016% to token holders + 0.004% to treasury)",
  },
  HoldersRevenue: {
    "Token Holder Distributions": "0.016% of swap volume distributed to FER token holders",
  },
  SupplySideRevenue: {
    "LP Fees": "0.02% of swap volume distributed to liquidity providers in the pools",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.CRONOS]: {
      fetch: fetchVolume,
      start: '2022-08-29',
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
