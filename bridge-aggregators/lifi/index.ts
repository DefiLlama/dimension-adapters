import { Chain } from "@defillama/sdk/build/general";
import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

type IContract = {
  [c: string | Chain]: {
    id: string;
    startTime: string;
  }
}

interface LifiTransferV2 {
  transactionId: string;
  status: string;
  sending: {
    amountUSD: string;
    chainId: number;
  };
  receiving: {
    chainId: number;
  };
}

interface LifiResponseV2 {
  data: LifiTransferV2[];
  hasPrevious: boolean;
  hasNext: boolean;
  next?: string;
}

const contract: IContract = {
  [CHAIN.BITCOIN]: {
    id: '20000000000001',
    startTime: '2023-03-11'
  },
  [CHAIN.SOLANA]: {
    id: '1151111081099710',
    startTime: '2024-01-01'
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
  [CHAIN.VELAS]: {
    id: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
    startTime: '2022-10-20'
  },
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
    startTime: '2023-07-21'
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
  }
}

const LifiBridgeEvent = "event LiFiTransferStarted((bytes32 transactionId, string bridge, string integrator, address referrer, address sendingAssetId, address receiver, uint256 minAmount, uint256 destinationChainId, bool hasSourceSwaps, bool hasDestinationCall) bridgeData)"

const fetchFromAPI = async (chain: Chain, startTime: number, endTime: number): Promise<number> => {
  let hasMore = true;
  let totalValue = 0;
  let nextCursor: string | undefined;

  while (hasMore) {
    const params = new URLSearchParams({
      fromChain: contract[chain].id,
      fromTimestamp: startTime.toString(),
      toTimestamp: endTime.toString(),
      status: 'DONE',
      limit: '1000'
    });

    if (nextCursor) {
      params.append('next', nextCursor);
    }

    const url = `https://li.quest/v2/analytics/transfers?${params}`;
    const response = await fetchURL(url) as LifiResponseV2;

    if (!response?.data || !Array.isArray(response.data)) {
      break;
    }

    const transfers = response.data;

    transfers.forEach((tx) => {
      if (
        tx.status === 'DONE' &&
        tx.receiving.chainId !== Number(contract[chain].id) // Ensure it's a cross-chain transfer
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

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  if (options.chain === CHAIN.BITCOIN || options.chain === CHAIN.SOLANA) {
    const dailyVolume = await fetchFromAPI(options.chain, options.startTimestamp, options.endTimestamp);
    return {
      dailyBridgeVolume: dailyVolume
    };
  }

  const dailyVolume = options.createBalances();
  const data: any[] = await options.getLogs({
    target: contract[options.chain].id,
    topic: '0xcba69f43792f9f399347222505213b55af8e0b0b54b893085c2e27ecbe1644f1',
    eventAbi: LifiBridgeEvent,
  });
  data.forEach(({ bridgeData: { sendingAssetId, minAmount } }: any) => {
    dailyVolume.add(sendingAssetId, minAmount);
  });

  return { dailyBridgeVolume: dailyVolume } as any;
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.keys(contract).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch,
        start: contract[chain].startTime
      }
    }
  }, {})
};

export default adapter;
