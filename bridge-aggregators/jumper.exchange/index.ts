import { Chain } from "@defillama/sdk/build/general";
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
  [CHAIN.LINEA]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.MANTA]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.POLYGON]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.POLYGON_ZKEVM]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.FANTOM]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.MODE]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.SCROLL]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.ERA]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.METIS]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
  [CHAIN.XDAI]: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',
}

const fetch: any = async (timestamp: number, _, { chain, getLogs, createBalances, }: FetchOptions): Promise<FetchResultVolume> => {
  const dailyVolume = createBalances();
  const data: any[] = await getLogs({
    target: contract[chain],
    topic: '0xcba69f43792f9f399347222505213b55af8e0b0b54b893085c2e27ecbe1644f1'
  });
  data.forEach((e: any) => {
    const data = e.data.replace('0x', '');
    const integrator = '0x' + data.slice(3 * 64, 4 * 64);
    if ('0x0000000000000000000000000000000000000000000000000000000000000180' === integrator) {
      const sendingAssetId = data.slice(5 * 64, 6 * 64);
      const contract_address = '0x' + sendingAssetId.slice(24, sendingAssetId.length);
      const minAmount = Number('0x' + data.slice(7 * 64, 8 * 64));
      dailyVolume.add(contract_address, minAmount);
    }
  });

  return { dailyBridgeVolume: dailyVolume, timestamp, } as any;
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
