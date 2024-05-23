import { Adapter, ChainBlocks, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import { addTokensReceived } from '../helpers/token';

type TFee = {
  from: string;
}

type TFeeDetail = {
  [l: string | Chain]: TFee;
}
const fee_detail: TFeeDetail = {
  [CHAIN.AVAX]: {
    from: '0x6cb1bc6c8aabdae822a2bf8d83b36291cb70f169',
  },
  [CHAIN.BSC]: {
    from: '0xda5e1d3aaa93e8716f87b5ee39e5f514cc934d5e',
  },
  [CHAIN.FANTOM]: {
    from: '0x0b5025d8d409a51615cb624b8ede132bb11a2550',
  },
  [CHAIN.POLYGON]: {
    from: '0x938021351425dbfa606ed2b81fc66952283e0dd5',
  },
  [CHAIN.ARBITRUM]: {
    from: '0x0ba6c34af9713d15141dcc91d2788c3f370ecb9e',
  },
  [CHAIN.OPTIMISM]: {
    from: '0xa058798cd293f5acb4e7757b08c960a79f527699',
  }
}

const fetch = (chain: Chain) => {
  return async (timestamp: number, _: ChainBlocks, options: FetchOptions): Promise<FetchResultFees> => {
    const { api } = options;
    const { from, } = fee_detail[chain];
    const token = await api.call({ abi: 'address:quoteToken', target: from })
    const rebateManager = await api.call({ abi: 'address:rebateManager', target: from })
    const treasury = await api.call({ abi: 'address:treasury', target: from })
    const vaultManager = await api.call({ abi: 'address:vaultManager', target: from })
    const dailyFees = await addTokensReceived({ fromAddressFilter: from, options, tokens: [token], targets: [vaultManager, rebateManager, treasury] })
    const dailyRevenue = await addTokensReceived({ fromAddressFilter: from, options, tokens: [token], targets: [vaultManager, treasury] })
    const dailyHoldersRevenue = await addTokensReceived({ fromAddressFilter: from, options, tokens: [token], targets: [vaultManager] })
    return {
      dailyFees,
      dailyRevenue,
      dailyHoldersRevenue,
      timestamp
    }
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetch(CHAIN.AVAX),
      start: 1673222400,
    },
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC),
      start: 1673222400,
    },
    [CHAIN.FANTOM]: {
      fetch: fetch(CHAIN.FANTOM),
      start: 1673222400,
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON),
      start: 1673222400,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: 1673222400,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: 1673222400,
    },
  }
}

export default adapter;
