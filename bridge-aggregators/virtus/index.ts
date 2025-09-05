import { Adapter, FetchOptions } from '../../adapters/types';
import { httpGet } from '../../utils/fetchURL';
import { CHAIN } from '../../helpers/chains';
import { getEnv } from '../../helpers/env';

const BACKEND_BASE = getEnv('VIRTUS_BACKEND_BASE');
const UNIFORM_START = '2025-09-03';

const CHAINS: Record<string, { id: string }> = {
  [CHAIN.ETHEREUM]: { id: 'ethereum' },
  [CHAIN.SOLANA]: { id: 'solana' },
  [CHAIN.BSC]: { id: 'bsc' },
  [CHAIN.SCROLL]: { id: 'scroll' },
  [CHAIN.BASE]: { id: 'base' },
  [CHAIN.BITCOIN]: { id: 'bitcoin' },
  [CHAIN.ARBITRUM]: { id: 'arbitrum' },
  [CHAIN.POLYGON]: { id: 'polygon' },
  [CHAIN.OPTIMISM]: { id: 'optimism' },
  [CHAIN.LINEA]: { id: 'linea' },
  [CHAIN.CELO]: { id: 'celo' },
  [CHAIN.AVAX]: { id: 'avax' },
  [CHAIN.ERA]: { id: 'era' },
  [CHAIN.MODE]: { id: 'mode' },
  [CHAIN.TRON]: { id: 'tron' },
  [CHAIN.ZORA]: { id: 'zora' },
  [CHAIN.BLAST]: { id: 'blast' },
  [CHAIN.OSMOSIS]: { id: 'osmosis' },
  [CHAIN.COSMOS]: { id: 'cosmos' },
  [CHAIN.FANTOM]: { id: 'fantom' },
  [CHAIN.MOONRIVER]: { id: 'moonriver' },
  [CHAIN.TAIKO]: { id: 'taiko' },
  [CHAIN.STARKNET]: { id: 'starknet' },
  [CHAIN.POLYGON_ZKEVM]: { id: 'polygon_zkevm' },
  [CHAIN.SUI]: { id: 'sui' },
  [CHAIN.CRONOS]: { id: 'cronos' },
  [CHAIN.NOBLE]: { id: 'noble' },
  [CHAIN.BOBA]: { id: 'boba' },
  [CHAIN.THORCHAIN]: { id: 'thorchain' },
  [CHAIN.FUSE]: { id: 'fuse' },
  [CHAIN.XDAI]: { id: 'xdai' },
  [CHAIN.HARMONY]: { id: 'harmony' },
  [CHAIN.MOONBEAM]: { id: 'moonbeam' },
  [CHAIN.TERRA]: { id: 'terra' },
  [CHAIN.SONIC]: { id: 'sonic' },
  [CHAIN.TON]: { id: 'ton' },
  [CHAIN.BERACHAIN]: { id: 'berachain' },
  [CHAIN.AURORA]: { id: 'aurora' },
  [CHAIN.ROOTSTOCK]: { id: 'rsk' },
  [CHAIN.KLAYTN]: { id: 'klaytn' },
  [CHAIN.KAVA]: { id: 'kava' },
  [CHAIN.EVMOS]: { id: 'evmos' },
  [CHAIN.OKEXCHAIN]: { id: 'okexchain' },
  [CHAIN.FILECOIN]: { id: 'filecoin' },
  [CHAIN.CORE]: { id: 'core' },
  [CHAIN.KROMA]: { id: 'kroma' },
  [CHAIN.XLAYER]: { id: 'xlayer' },
  [CHAIN.BITLAYER]: { id: 'btr' },
  [CHAIN.MERLIN]: { id: 'merlin' },
  [CHAIN.BOB]: { id: 'bob' },
  [CHAIN.ZKLINK]: { id: 'zklink' },
  [CHAIN.ZETA]: { id: 'zeta' },
  [CHAIN.PULSECHAIN]: { id: 'pulse' },
};

const fetch = async (options: FetchOptions) => {
  const { chain, endTimestamp } = options;
  const info = CHAINS[chain];
  if (!info) return { dailyBridgeVolume: 0, timestamp: endTimestamp };
  const url = `${BACKEND_BASE}/defillama/bridge-volume?chain=${info.id}&timestamp=${endTimestamp}`;
  const res = await httpGet(url) as { dailyBridgeVolume: number };
  return { dailyBridgeVolume: res?.dailyBridgeVolume || 0, timestamp: endTimestamp };
};

const adapter: Adapter = {
  version: 2,
  fetch, start: UNIFORM_START,
  chains: Object.keys(CHAINS),
};

export default adapter;
