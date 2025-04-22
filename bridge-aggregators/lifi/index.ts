import { Chain } from "@defillama/sdk/build/general";
import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

type IContract = {
  [c: string | Chain]: string;
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
  [CHAIN.BITCOIN]: '20000000000001',
  [CHAIN.SOLANA]: '1151111081099710',
  [CHAIN.MOONBEAM]: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
  [CHAIN.MOONRIVER]: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
  [CHAIN.FRAXTAL]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.CELO]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.LISK]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.ABSTRACT]: '0x4f8C9056bb8A3616693a76922FA35d53C056E5b3',
  [CHAIN.SONIC]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.UNICHAIN]: '0x864b314D4C5a0399368609581d3E8933a63b9232',
  [CHAIN.VELAS]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.APECHAIN]: '0x2dea447e7dc6cd2f10b31bF10dCB30F87E838417',
  [CHAIN.BERACHAIN]: '0xf909c4Ae16622898b885B89d7F839E0244851c66',
  [CHAIN.INK]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.OP_BNB]: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
  [CHAIN.SONEIUM]: '0x864b314D4C5a0399368609581d3E8933a63b9232',
  [CHAIN.AURORA]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.ARBITRUM]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.OPTIMISM]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.BASE]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.ETHEREUM]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.AVAX]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.BSC]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.LINEA]: '0xDE1E598b81620773454588B85D6b5D4eEC32573e',
  [CHAIN.MANTLE]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.POLYGON]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.POLYGON_ZKEVM]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.FANTOM]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.MODE]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.SCROLL]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.ERA]: '0x341e94069f53234fe6dabef707ad424830525715',
  [CHAIN.METIS]: '0x24ca98fB6972F5eE05f0dB00595c7f68D9FaFd68',
  [CHAIN.XDAI]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.TAIKO]: '0x3A9A5dBa8FE1C4Da98187cE4755701BCA182f63b',
  [CHAIN.BLAST]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.BOBA]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.FUSE]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.CRONOS]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.GRAVITY]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',

  // [CHAIN.ZKSYNC]: '0x341e94069f53234fE6DabeF707aD424830525715',
  // [CHAIN.SEI]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  // [CHAIN.ROOTSTOCK]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  // [CHAIN.EVMOS]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  // [CHAIN.KAIA]: '0x1255d17c1BC2f764d087536410879F2d0D8772fD',
  // [CHAIN.OKEXCHAIN]: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
  // [CHAIN.IMMUTABLEZKEVM]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  // [CHAIN.WORLDCHAIN]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  // [CHAIN.LENS]: '0xF3B20515d9B193531c48E47c18aF16d1e5d28f9a',

}

const LifiBridgeEvent = "event LiFiTransferStarted((bytes32 transactionId, string bridge, string integrator, address referrer, address sendingAssetId, address receiver, uint256 minAmount, uint256 destinationChainId, bool hasSourceSwaps, bool hasDestinationCall) bridgeData)"

const fetchFromAPI = async (chain: Chain, startTime: number, endTime: number): Promise<number> => {
  let hasMore = true;
  let totalValue = 0;
  let nextCursor: string | undefined;

  while (hasMore) {
    const params = new URLSearchParams({
      fromChain: contract[chain],
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
        tx.receiving.chainId !== Number(contract[chain]) // Ensure it's a cross-chain transfer
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
    target: contract[options.chain],
    topic: '0xcba69f43792f9f399347222505213b55af8e0b0b54b893085c2e27ecbe1644f1'
  });
  data.forEach((e: any) => {
    const data = e.data.replace('0x', '');
    const sendingAssetId = data.slice(5 * 64, 6 * 64);
    const contract_address = '0x' + sendingAssetId.slice(24, sendingAssetId.length);
    const minAmount = Number('0x' + data.slice(7 * 64, 8 * 64));
    dailyVolume.add(contract_address, minAmount);
  });

  return { dailyBridgeVolume: dailyVolume } as any;
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.keys(contract).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: { fetch, start: '2023-08-10', }
    }
  }, {})
};

export default adapter;
