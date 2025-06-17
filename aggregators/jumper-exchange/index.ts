import { Chain } from "../../adapters/types";
import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

type IContract = {
  [c: string | Chain]: string;
}

const contract: IContract = {
  [CHAIN.AURORA]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.ARBITRUM]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.OPTIMISM]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.BASE]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.ETHEREUM]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.AVAX]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.BSC]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.LINEA]: '0xde1e598b81620773454588b85d6b5d4eec32573e',
  [CHAIN.MANTA]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.POLYGON]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.POLYGON_ZKEVM]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.FANTOM]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.MODE]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.SCROLL]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.ERA]: '0x341e94069f53234fe6dabef707ad424830525715',
  [CHAIN.METIS]: '0x24ca98fb6972f5ee05f0db00595c7f68d9fafd68',
  [CHAIN.XDAI]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.TAIKO]: '0x3a9a5dba8fe1c4da98187ce4755701bca182f63b',
  [CHAIN.BLAST]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.BOBA]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.FUSE]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.CRONOS]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.GRAVITY]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
}

const fetch: any = async (timestamp: number, _, { chain, getLogs, createBalances, }: FetchOptions): Promise<FetchResultVolume> => {
  const dailyVolume = createBalances();
  const data: any[] = await getLogs({
    target: contract[chain],
    eventAbi: 'event LiFiGenericSwapCompleted(bytes32 indexed transactionId, string integrator, string referrer, address receiver, address fromAssetId, address toAssetId, uint256 fromAmount, uint256 toAmount)'
  });

  data.forEach((e: any) => {
    if (e.integrator === 'jumper.exchange' || e.integrator === 'jumper.exchange.gas') {
      dailyVolume.add(e.toAssetId, e.toAmount);
    }
  });

  return { dailyVolume, timestamp, } as any;
};

const adapter: SimpleAdapter = {
  adapter: Object.keys(contract).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: { fetch, start: '2023-08-10', }
    }
  }, {})
};

export default adapter;
