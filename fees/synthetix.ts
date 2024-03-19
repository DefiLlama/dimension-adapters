import ADDRESSES from '../helpers/coreAssets.json'
import { Adapter, ChainBlocks, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain } from '@defillama/sdk/build/general';
import { addTokensReceived } from '../helpers/token';


const methodology = {
  UserFees: "Users pay between 10-100 bps (0.1%-1%), usually 30 bps, whenever they exchange a synthetic asset (Synth)",
  HoldersRevenue: "Fees are granted proportionally to SNX stakers by automatically burning outstanding debt (note: rewards not included here can also be claimed by SNX stakers)",
  Revenue: "Fees paid by users and awarded to SNX stakers",
  Fees: "Fees generated on each synthetic asset exchange, between 0.1% and 1% (usually 0.3%)",
}

type IContract = {
  [l: string | Chain]: string;
}
const contract_address: IContract = {
  [CHAIN.ETHEREUM]: ADDRESSES.ethereum.sUSD,
  [CHAIN.OPTIMISM]: ADDRESSES.optimism.sUSD
}
const graphs = (chain: Chain) => {
  return async (timestamp: number, _: ChainBlocks, options: FetchOptions) => {
    const token = contract_address[chain]
    const dailyFee = await addTokensReceived({ tokens: [token], options, target: '0xfeefeefeefeefeefeefeefeefeefeefeefeefeef' })

    return {
      timestamp,
      dailyUserFees: dailyFee,
      dailyFees: dailyFee,
      dailyRevenue: dailyFee,
      dailyHoldersRevenue: dailyFee
    };
  };
};


const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: graphs(CHAIN.ETHEREUM),
      start: 1653523200,
      meta: {
        methodology
      }
    },
    [CHAIN.OPTIMISM]: {
      fetch: graphs(CHAIN.OPTIMISM),
      start: 1636606800,
      meta: {
        methodology
      }
    },
  }
}

export default adapter;
