import { CHAIN } from "../../helpers/chains";
import { Chain } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

type IContract = {
  [c: string | Chain]: {
    id: string;
    startTime: string;
  }
}

interface LifiTransfer {
  transactionId: string;
  status: string;
  sending: {
    amountUSD: string;
    chainId: number;
    timestamp: number;
  };
  receiving: {
    chainId: number;
  };
  metadata: {
    integrator: string;
  };
}

interface LifiResponse {
  data: LifiTransfer[];
  hasPrevious: boolean;
  hasNext: boolean;
  next?: string;
}

// source: https://github.com/lifinance/contracts/tree/3c3d5c89223c8d43612c3c8a5cbb2a06e877e9bd/deployments
export const LifiDiamonds: IContract = {
  [CHAIN.BITCOIN]: {
    id: '20000000000001',
    startTime: '2023-03-11'
  },
  [CHAIN.SOLANA]: {
    id: '1151111081099710',
    startTime: '2024-01-01'
  },
  [CHAIN.SUI]: {
    id: '9270000000000000',
    startTime: '2025-07-01'
  },
  [CHAIN.MOONBEAM]: {
    id: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
    startTime: '2022-10-18'
  },
  [CHAIN.MOONRIVER]: {
    id: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
    startTime: '2023-10-18'
  },
  [CHAIN.FRAXTAL]: {
    id: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    startTime: '2024-06-27'
  },
  [CHAIN.CELO]: {
    id: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    startTime: '2022-10-18'
  },
  [CHAIN.LISK]: {
    id: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    startTime: '2024-12-09'
  },
  [CHAIN.ABSTRACT]: {
    id: '0x4f8C9056bb8A3616693a76922FA35d53C056E5b3',
    startTime: '2025-01-15'
  },
  [CHAIN.SONIC]: {
    id: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    startTime: '2025-01-22'
  },
  [CHAIN.UNICHAIN]: {
    id: '0x864b314D4C5a0399368609581d3E8933a63b9232',
    startTime: '2025-02-12'
  },
  // [CHAIN.VELAS]: {
  //   id: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  //   startTime: '2022-10-20'
  // },
  [CHAIN.APECHAIN]: {
    id: '0x2dea447e7dc6cd2f10b31bF10dCB30F87E838417',
    startTime: '2025-01-20'
  },
  [CHAIN.BERACHAIN]: {
    id: '0xf909c4Ae16622898b885B89d7F839E0244851c66',
    startTime: '2025-02-12'
  },
  [CHAIN.INK]: {
    id: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    startTime: '2025-01-22'
  },
  [CHAIN.OP_BNB]: {
    id: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
    startTime: '2023-10-24'
  },
  [CHAIN.SONEIUM]: {
    id: '0x864b314D4C5a0399368609581d3E8933a63b9232',
    startTime: '2025-02-17'
  },
  [CHAIN.AURORA]: {
    id: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    startTime: '2022-10-21'
  },
  [CHAIN.ARBITRUM]: {
    id: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    startTime: '2023-08-21'
  },
  [CHAIN.OPTIMISM]: {
    id: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    startTime: '2023-07-25'
  },
  [CHAIN.BASE]: {
    id: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    startTime: '2023-08-15'
  },
  [CHAIN.ETHEREUM]: {
    id: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    startTime: '2023-07-27'
  },
  [CHAIN.AVAX]: {
    id: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    startTime: '2022-10-18'
  },
  [CHAIN.BSC]: {
    id: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    startTime: '2023-07-21',
  },
  [CHAIN.LINEA]: {
    id: '0xDE1E598b81620773454588B85D6b5D4eEC32573e',
    startTime: '2023-08-28'
  },
  [CHAIN.MANTLE]: {
    id: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    startTime: '2024-05-13'
  },
  [CHAIN.POLYGON]: {
    id: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    startTime: '2023-07-20'
  },
  [CHAIN.POLYGON_ZKEVM]: {
    id: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    startTime: '2023-06-01'
  },
  [CHAIN.FANTOM]: {
    id: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    startTime: '2022-10-18'
  },
  [CHAIN.MODE]: {
    id: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    startTime: '2024-04-15'
  },
  [CHAIN.SCROLL]: {
    id: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    startTime: '2024-02-06'
  },
  [CHAIN.ERA]: {
    id: '0x341e94069f53234fe6dabef707ad424830525715',
    startTime: '2023-07-13'
  },
  [CHAIN.METIS]: {
    id: '0x24ca98fB6972F5eE05f0dB00595c7f68D9FaFd68',
    startTime: '2024-02-03'
  },
  [CHAIN.XDAI]: {
    id: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    startTime: '2023-07-24'
  },
  [CHAIN.TAIKO]: {
    id: '0x3A9A5dBa8FE1C4Da98187cE4755701BCA182f63b',
    startTime: '2024-08-15'
  },
  [CHAIN.BLAST]: {
    id: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    startTime: '2024-05-17'
  },
  [CHAIN.BOBA]: {
    id: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    startTime: '2022-10-21'
  },
  [CHAIN.FUSE]: {
    id: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    startTime: '2023-10-19'
  },
  [CHAIN.CRONOS]: {
    id: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    startTime: '2023-10-19'
  },
  [CHAIN.GRAVITY]: {
    id: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    startTime: '2024-07-30'
  },
  [CHAIN.KATANA]: {
    id: '0xC59fe32C9549e3E8B5dCcdAbC45BD287Bd5bA2bc',
    startTime: '2025-07-01'
  },
  // DefiLlama does not differentiate HyperEVM from Hyperliquid; this uses the HyperEVM diamond deployment
  [CHAIN.HYPERLIQUID]: {
    id: '0x0a0758d937d1059c356D4714e57F5df0239bce1A',
    startTime: '2025-05-19'
  },
  [CHAIN.KLAYTN]: {
    id: '0x1255d17c1BC2f764d087536410879F2d0D8772fD',
    startTime: '2025-08-01'
  },
  [CHAIN.PLUME]: {
    id: '0x6f5C8Bb0C5Fe4ECeAC40EE1C238EaB6bbb29761c',
    startTime: '2025-09-01'
  },
  [CHAIN.ROBINHOOD]: {
    id: '0xB477751B76CF82d00a686A1232f5fCD772414Af3',
    startTime: '2026-05-11'
  },
  [CHAIN.MONAD]: {
    id: '0x026F252016A7C47CDEf1F05a3Fc9E20C92a49C37',
    startTime: '2025-10-02'
  },
  // Sei is fetched via the LI.FI analytics API (getLogs unreliable here); id is the LI.FI chainId
  [CHAIN.SEI]: {
    id: '1329',
    startTime: '2024-06-07'
  },
  [CHAIN.ROOTSTOCK]: {
    id: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
    startTime: '2024-05-24'
  },
  [CHAIN.IMX]: {
    id: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
    startTime: '2024-08-01'
  },
  [CHAIN.XLAYER]: {
    id: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
    startTime: '2024-09-23'
  },
  [CHAIN.WC]: {
    id: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
    startTime: '2024-12-02'
  },
  [CHAIN.SWELLCHAIN]: {
    id: '0x76F6937a41910F075024138066708B36139AC104',
    startTime: '2025-04-07'
  },
  [CHAIN.ETHERLINK]: {
    id: '0x977474593c982cFa8b197cAE302e6d01f789435b',
    startTime: '2025-04-08'
  },
  [CHAIN.CORN]: {
    id: '0x11d8E4207a976B8Bb33bD3b494d80f8a6854F06b',
    startTime: '2025-04-09'
  },
  [CHAIN.SUPERPOSITION]: {
    id: '0x03d55A7896097801B1dE90b4E3E0392CE279180A',
    startTime: '2025-04-16'
  },
  [CHAIN.LENS]: {
    id: '0xF3B20515d9B193531c48E47c18aF16d1e5d28f9a',
    startTime: '2025-04-21'
  },
  [CHAIN.XDC]: {
    id: '0x055d4612Ec74aD799C6cB4dF72C0Ab8dbDBCBAfa',
    startTime: '2025-05-19'
  },
  [CHAIN.BOB]: {
    id: '0x452Cf1B8597E6319Cd21abd847312bF17E26d8d1',
    startTime: '2025-05-21'
  },
  [CHAIN.FLARE]: {
    id: '0x198FC70Dfe05E755C81e54bd67Bff3F729344B9b',
    startTime: '2025-06-04'
  },
  [CHAIN.RONIN]: {
    id: '0x452Cf1B8597E6319Cd21abd847312bF17E26d8d1',
    startTime: '2025-06-20'
  },
  [CHAIN.VANA]: {
    id: '0x198FC70Dfe05E755C81e54bd67Bff3F729344B9b',
    startTime: '2025-06-24'
  },
  [CHAIN.SOPHON]: {
    id: '0x81aFE8745038A0B63782186bcD1a4f27cB2Aef9d',
    startTime: '2025-08-04'
  },
  [CHAIN.PLASMA]: {
    id: '0x026F252016A7C47CDEf1F05a3Fc9E20C92a49C37',
    startTime: '2025-09-09'
  },
  [CHAIN.FLOW]: {
    id: '0x026F252016A7C47CDEf1F05a3Fc9E20C92a49C37',
    startTime: '2025-09-12'
  },
  [CHAIN.HEMI]: {
    id: '0x026F252016A7C47CDEf1F05a3Fc9E20C92a49C37',
    startTime: '2025-09-16'
  },
  [CHAIN.STABLE]: {
    id: '0x026F252016A7C47CDEf1F05a3Fc9E20C92a49C37',
    startTime: '2025-11-11'
  }
}

export const LifiFeeCollectors: IContract = {
  [CHAIN.ABSTRACT]: {
    id: '0xde6A2171959d7b82aAD8e8B14cc84684C3a186AC',
    startTime: '2025-01-15'
  },
  [CHAIN.APECHAIN]: {
    id: '0xEe80aaE1e39b1d25b9FC99c8edF02bCd81f9eA30',
    startTime: '2025-01-20'
  },
  [CHAIN.ARBITRUM]: {
    id: '0xB0210dE78E28e2633Ca200609D9f528c13c26cD9',
    startTime: '2023-08-21'
  },
  [CHAIN.AURORA]: {
    id: '0xB0210dE78E28e2633Ca200609D9f528c13c26cD9',
    startTime: '2022-10-21'
  },
  [CHAIN.AVAX]: {
    id: '0xB0210dE78E28e2633Ca200609D9f528c13c26cD9',
    startTime: '2022-10-18'
  },
  [CHAIN.BASE]: {
    id: '0x0A6d96E7f4D7b96CFE42185DF61E64d255c12DFf',
    startTime: '2023-08-15'
  },
  [CHAIN.BERACHAIN]: {
    id: '0x070EC43b4222E0f17EEcD2C839cb9D1D5adeF73c',
    startTime: '2025-02-12'
  },
  // [CHAIN.BITCOIN]: {
  //     id: '20000000000001',
  //     startTime: '2023-03-11'
  // },
  [CHAIN.BLAST]: {
    id: '0xF048e5816B0C7951AC179f656C5B86e5a79Bd7b5',
    startTime: '2024-05-17'
  },
  [CHAIN.BOBA]: {
    id: '0xB0210dE78E28e2633Ca200609D9f528c13c26cD9',
    startTime: '2022-10-21'
  },
  [CHAIN.BSC]: {
    id: '0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9',
    startTime: '2023-07-21'
  },
  [CHAIN.CELO]: {
    id: '0xF048e5816B0C7951AC179f656C5B86e5a79Bd7b5',
    startTime: '2022-10-18'
  },
  [CHAIN.CRONOS]: {
    id: '0x11d40Dc8Ff0CE92F54A315aD8e674a55a866cBEe',
    startTime: '2023-10-19'
  },
  // [CHAIN.EVMOS]: {
  //   id: '0xB49EaD76FE09967D7CA0dbCeF3C3A06eb3Aa0cB4',
  //   startTime: '2022-10-24'
  // },
  [CHAIN.ERA]: {
    id: '0x8dBf6f59187b2EB36B980F3D8F4cFC6DC4E4642e',
    startTime: '2023-07-13'
  },
  [CHAIN.ETHEREUM]: {
    id: '0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9',
    startTime: '2023-07-27'
  },
  [CHAIN.FANTOM]: {
    id: '0xB0210dE78E28e2633Ca200609D9f528c13c26cD9',
    startTime: '2022-10-18'
  },
  [CHAIN.FRAXTAL]: {
    id: '0x7956280Ec4B4d651C4083Ca737a1fa808b5319D8',
    startTime: '2024-06-27'
  },
  [CHAIN.FUSE]: {
    id: '0xB0210dE78E28e2633Ca200609D9f528c13c26cD9',
    startTime: '2023-10-19'
  },
  [CHAIN.GRAVITY]: {
    id: '0x79540403cdE176Ca5f1fb95bE84A7ec91fFDEF76',
    startTime: '2024-07-30'
  },
  [CHAIN.INK]: {
    id: '0x8295805320853d6B28778fC8f5199327e62e3d87',
    startTime: '2025-01-22'
  },
  [CHAIN.LINEA]: {
    id: '0xA4A24BdD4608D7dFC496950850f9763B674F0DB2',
    startTime: '2023-08-28'
  },
  [CHAIN.LISK]: {
    id: '0x50D5a8aCFAe13Dceb217E9a071F6c6Bd5bDB4155',
    startTime: '2024-12-09'
  },
  [CHAIN.MANTLE]: {
    id: '0xF048e5816B0C7951AC179f656C5B86e5a79Bd7b5',
    startTime: '2024-05-13'
  },
  [CHAIN.METIS]: {
    id: '0x27f0e36dE6B1BA8232f6c2e87E00A50731048C6B',
    startTime: '2024-02-03'
  },
  [CHAIN.MODE]: {
    id: '0xF048e5816B0C7951AC179f656C5B86e5a79Bd7b5',
    startTime: '2024-04-15'
  },
  [CHAIN.MOONBEAM]: {
    id: '0xB0210dE78E28e2633Ca200609D9f528c13c26cD9',
    startTime: '2022-10-18'
  },
  [CHAIN.MOONRIVER]: {
    id: '0xB0210dE78E28e2633Ca200609D9f528c13c26cD9',
    startTime: '2023-10-18'
  },
  [CHAIN.OP_BNB]: {
    id: '0x6A2420650139854F17964b8C3Bb60248470aB57E',
    startTime: '2023-10-24'
  },
  [CHAIN.OPTIMISM]: {
    id: '0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9',
    startTime: '2023-07-25'
  },
  [CHAIN.POLYGON]: {
    id: '0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9',
    startTime: '2023-07-20'
  },
  [CHAIN.POLYGON_ZKEVM]: {
    id: '0xB49EaD76FE09967D7CA0dbCeF3C3A06eb3Aa0cB4',
    startTime: '2023-06-01'
  },
  // [CHAIN.ROOTSTOCK]: {
  //   id: '0xF048e5816B0C7951AC179f656C5B86e5a79Bd7b5',
  //   startTime: '2024-05-27'
  // },
  [CHAIN.SCROLL]: {
    id: '0xF048e5816B0C7951AC179f656C5B86e5a79Bd7b5',
    startTime: '2024-02-06'
  },
  /* [CHAIN.SEI]: {
      id: '0x7956280Ec4B4d651C4083Ca737a1fa808b5319D8',
      startTime: '2024-05-27'
  }, */
  // [CHAIN.SOLANA]: {
  //     id: '1151111081099710',
  //     startTime: '2024-01-01'
  // },
  [CHAIN.SONEIUM]: {
    id: '0x8295805320853d6B28778fC8f5199327e62e3d87',
    startTime: '2025-02-17'
  },
  [CHAIN.SONIC]: {
    id: '0xaFb8cC8fCd71cd768Ce117C11eB723119FCDb1f8',
    startTime: '2025-01-22'
  },
  [CHAIN.SUPERPOSITION]: {
    id: '0x15b9Cf781B4A79C00E4dB7b49d8Bf67359a87Fd2',
    startTime: '2025-04-24'
  },
  [CHAIN.SWELLCHAIN]: {
    id: '0x5d9C68B76809B33317d869FF6034929F4458913c',
    startTime: '2025-04-23'
  },
  [CHAIN.TAIKO]: {
    id: '0xDd8A081efC90DFFD79940948a1528C51793C4B03',
    startTime: '2024-08-15'
  },
  [CHAIN.UNICHAIN]: {
    id: '0x8295805320853d6B28778fC8f5199327e62e3d87',
    startTime: '2025-02-12'
  },
  // [CHAIN.VELAS]: {
  //     id: '0xB0210dE78E28e2633Ca200609D9f528c13c26cD9',
  //     startTime: '2022-10-20'
  // },
  [CHAIN.XDAI]: {
    id: '0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9',
    startTime: '2023-07-24'
  },
  [CHAIN.KATANA]: {
    id: '0xB7ea489dB36820f0d57F1A67353AA4f5d0890ce3',
    startTime: '2025-07-01'
  },
  [CHAIN.PLUME]: {
    id: '0x3e46137a80BB3c14906505d0f78ADbb2deDb9E3f',
    startTime: '2025-09-01'
  },
  [CHAIN.ROBINHOOD]: {
    id: '0xAD257784C6D50640d1EFa31cfB3e75bD566f63BA',
    startTime: '2026-05-11'
  },
  [CHAIN.HEMI]: {
    id: '0x026F252016A7C47CDEf1F05a3Fc9E20C92a49C37',
    startTime: '2025-09-07'
  },
  [CHAIN.MONAD]: {
    id: '0x954d55105CDF5371224268691FAf6178be5f62F5',
    startTime: '2025-10-02'
  }
}

export const fetchVolumeFromLIFIAPI = async (chain: Chain, startTime: number, endTime: number, integrators?: string[], exclude_integrators?: string[], swapType?: 'cross-chain' | 'same-chain'): Promise<number> => {
  let hasMore = true;
  let totalValue = 0;
  let nextCursor: string | undefined;

  while (hasMore) {
    const params = new URLSearchParams({
      fromChain: LifiDiamonds[chain].id,
      fromTimestamp: startTime.toString(),
      toTimestamp: endTime.toString(),
      status: 'DONE',
      limit: '1000'
    });

    if (nextCursor) {
      params.append('next', nextCursor);
    }

    const url = `https://li.quest/v2/analytics/transfers?${params}`;
    const response = await fetchURL(url) as LifiResponse;

    if (!response?.data || !Array.isArray(response.data)) {
      break;
    }

    const transfers = response.data;

    transfers.forEach((tx) => {
      if (
        tx.status === 'DONE' &&
        // enforce the requested window client-side: the API filter is by chain, but with hourly
        // runs we must drop any transfer whose timestamp falls outside [startTime, endTime]
        tx.sending.timestamp >= startTime && tx.sending.timestamp < endTime &&
        (swapType === 'cross-chain' ? tx.receiving.chainId !== Number(LifiDiamonds[chain].id) : tx.receiving.chainId === Number(LifiDiamonds[chain].id)) &&
        (integrators && integrators.length > 0 ? integrators.includes(tx.metadata.integrator) : true) &&
        (exclude_integrators && exclude_integrators.length > 0 ? !exclude_integrators.includes(tx.metadata.integrator) : true)
      ) {
        const value = parseFloat(tx.sending.amountUSD) || 0;
        totalValue += value;
      }
    });

    nextCursor = response.next;
    hasMore = response.hasNext;
  }

  return totalValue;
};
