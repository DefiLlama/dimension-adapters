import { Chain } from "@defillama/sdk/build/general";
import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

type IContract = {
  [c: string | Chain]: string;
}

const contract: IContract = {
  [CHAIN.AURORA]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.ARBITRUM]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.OPTIMISM]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.BASE]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.BLAST]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.ETHEREUM]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.AVAX]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.BSC]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.POLYGON]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.POLYGON_ZKEVM]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.FANTOM]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.LINEA]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.MANTLE]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.SCROLL]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.ZKSYNC]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
  [CHAIN.XDAI]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
}

const fetch: any = async (timestamp: number, _, { chain, getLogs, createBalances, }: FetchOptions): Promise<FetchResultVolume> => {
  const dailyVolume = createBalances();
  const data: any[] = await getLogs({
    target: contract[chain],
    eventAbi: 'event SocketBridge(uint256 amount, address token, uint256 toChainId, bytes32 bridgeName, address sender, address receiver, bytes32 metadata)'
  });
  data.forEach((e: any) => {
    if (e.metadata === '0x00000000000000000000000000000000000000000000000000000000000000cd') {
      dailyVolume.add(e.sendingAssetId, e.minAmount);
    }
  });

  return { dailyVolume, timestamp, } as any;
};

const adapter: SimpleAdapter = {
  adapter: Object.keys(contract).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: { fetch, start: 1691625600, }
    }
  }, {})
};

export default adapter;
