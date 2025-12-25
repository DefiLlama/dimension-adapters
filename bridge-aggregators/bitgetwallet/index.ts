import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const CHAINS: Array<CHAIN> = [
  CHAIN.APTOS,
  CHAIN.HYPERLIQUID,
  CHAIN.SOLANA,
  CHAIN.BLAST,
  CHAIN.BITCOIN,
  CHAIN.ARBITRUM,
  CHAIN.KLAYTN,
  CHAIN.SONIC,
  CHAIN.MANTLE,
  CHAIN.RIPPLE,
  CHAIN.AVAX,
  CHAIN.LINEA,
  CHAIN.SUI,
  CHAIN.SCROLL,
  CHAIN.BASE,
  CHAIN.POLYGON,
  CHAIN.TON,
  CHAIN.CRONOS,
  CHAIN.DOGECHAIN,
  CHAIN.BERACHAIN,
  CHAIN.MONAD,
  CHAIN.TRON,
  CHAIN.CELO,
  CHAIN.BSC,
  CHAIN.MORPH,
  CHAIN.XLAYER,
  CHAIN.CORE,
  CHAIN.OP_BNB,
  CHAIN.ZKSYNC,
  CHAIN.ETHEREUM,
  CHAIN.OPTIMISM,
  CHAIN.FANTOM,
  CHAIN.PLASMA,
  CHAIN.SEI
];

interface IVolumeBridge {
  volume: string;
  date: string;
}

async function queryDataByApi(path: string) {
  const historicalVolumeEndpoint = "https://api-3rd.bitkeep.com/swap-go/open";
  let info = await fetchURL(`${historicalVolumeEndpoint}${path}`);
  const data: IVolumeBridge[] = (info)?.data?.list || [];
  return data
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const path = `/getOrderDayVolume?bridge=1&chain=${options.chain}&timestamp=${options.startOfDay}`
  const data = await queryDataByApi(path)
  const dateString = new Date(options.startOfDay * 1000).toISOString().split("T")[0];
  const dailyVolume = data.find(dayItem => dayItem.date === dateString)?.volume

  return {
    dailyBridgeVolume: dailyVolume || 0,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: CHAINS,
  start: '2025-08-01',
};

export default adapter;
