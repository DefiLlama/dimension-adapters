import { Adapter, FetchOptions, } from "../adapters/types";
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
    from: '0xc45b55032cafeaff3b8057d52758d8f8211da54d',
  },
  [CHAIN.BSC]: {
    from: '0xc45b55032cafeaff3b8057d52758d8f8211da54d',
  },
  [CHAIN.FANTOM]: {
    from: '0x0b5025d8d409a51615cb624b8ede132bb11a2550',
  },
  [CHAIN.POLYGON]: {
    from: '0xc45b55032cafeaff3b8057d52758d8f8211da54d',
  },
  [CHAIN.ARBITRUM]: {
    from: '0xc45b55032cafeaff3b8057d52758d8f8211da54d',
  },
  [CHAIN.OPTIMISM]: {
    from: '0xc45b55032cafeaff3b8057d52758d8f8211da54d',
  },
  [CHAIN.ERA]: {
    from: '0x01b50b57a3d3c1a54433813585e60713e75f3de9',
  },
  [CHAIN.LINEA]: {
    from: '0xc45b55032cafeaff3b8057d52758d8f8211da54d',
  },
  [CHAIN.BASE]: {
    from: '0xc45b55032cafeaff3b8057d52758d8f8211da54d',
  },
  [CHAIN.MANTLE]: {
    from: '0xc45b55032cafeaff3b8057d52758d8f8211da54d',
  },
  [CHAIN.SONIC]: {
    from: '0xc45b55032cafeaff3b8057d52758d8f8211da54d'
  }
}

const fetch = (chain: Chain) => {
  return async (options: FetchOptions) => {
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
    }
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetch(CHAIN.AVAX),
      start: '2023-01-09',
    },
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC),
      start: '2023-01-09',
    },
    [CHAIN.FANTOM]: {
      fetch: fetch(CHAIN.FANTOM),
      start: '2023-01-09',
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON),
      start: '2023-01-09',
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: '2023-01-09',
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: '2023-01-09',
    },
    [CHAIN.ERA]: {
      fetch: fetch(CHAIN.ERA),
      start: '2023-01-09',
    },
    [CHAIN.LINEA]: {
      fetch: fetch(CHAIN.LINEA),
      start: '2023-01-09',
    },
    [CHAIN.BASE]: {
      fetch: fetch(CHAIN.BASE),
      start: '2023-01-09',
    },
    [CHAIN.MANTLE]: {
      fetch: fetch(CHAIN.MANTLE),
      start: '2023-01-09',
    },
    [CHAIN.SONIC]: {
      fetch: fetch(CHAIN.SONIC),
      start: '2024-12-18',
    }
  }
}

export default adapter;
