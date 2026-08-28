import { FetchOptions, FetchResultV2 } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

export const DZAP_VOLUME_CHAIN_URL = "https://api.dzap.io/v1/volume/chain";

export const DZAP_SUPPORTED_CHAINS: Record<number, CHAIN> = {
  1: CHAIN.ETHEREUM,
  10: CHAIN.OPTIMISM,
  14: CHAIN.FLARE,
  25: CHAIN.CRONOS,
  30: CHAIN.ROOTSTOCK,
  40: CHAIN.TELOS,
  50: CHAIN.XDC,
  56: CHAIN.BSC,
  100: CHAIN.XDAI,
  122: CHAIN.FUSE,
  130: CHAIN.UNICHAIN,
  137: CHAIN.POLYGON,
  143: CHAIN.MONAD,
  146: CHAIN.SONIC,
  169: CHAIN.MANTA,
  185: CHAIN.MINT,
  196: CHAIN.XLAYER,
  204: CHAIN.OP_BNB,
  223: CHAIN.BSQUARED,
  232: CHAIN.LENS,
  250: CHAIN.FANTOM,
  252: CHAIN.FRAXTAL,
  255: CHAIN.KROMA,
  288: CHAIN.BOBA,
  324: CHAIN.ZKSYNC,
  369: CHAIN.PULSECHAIN,
  480: CHAIN.WC,
  988: CHAIN.STABLE,
  998: CHAIN.HYPERLIQUID,
  1000: CHAIN.BITCOIN,
  1088: CHAIN.METIS,
  1101: CHAIN.POLYGON_ZKEVM,
  1116: CHAIN.CORE,
  1284: CHAIN.MOONBEAM,
  1285: CHAIN.MOONRIVER,
  1329: CHAIN.SEI,
  1514: CHAIN.STORY,
  1625: CHAIN.GRAVITY,
  1868: CHAIN.SONEIUM,
  1923: CHAIN.SWELLCHAIN,
  2020: CHAIN.RONIN,
  2222: CHAIN.KAVA,
  2741: CHAIN.ABSTRACT,
  2818: CHAIN.MORPH,
  4114: CHAIN.CITREA,
  4200: CHAIN.MERLIN,
  4217: CHAIN.TEMPO,
  4326: CHAIN.MEGAETH,
  5000: CHAIN.MANTLE,
  5165: CHAIN.BAHAMUT,
  7000: CHAIN.ZETA,
  8453: CHAIN.BASE,
  8217: CHAIN.KLAYTN,
  9745: CHAIN.PLASMA,
  13371: CHAIN.IMX,
  19219: CHAIN.SUI,
  33139: CHAIN.APECHAIN,
  34443: CHAIN.MODE,
  42161: CHAIN.ARBITRUM,
  42220: CHAIN.CELO,
  42766: CHAIN.ZKFAIR,
  43111: CHAIN.HEMI,
  43114: CHAIN.AVAX,
  48900: CHAIN.ZIRCUIT,
  55244: CHAIN.SUPERPOSITION,
  57073: CHAIN.INK,
  59144: CHAIN.LINEA,
  60808: CHAIN.BOB,
  80094: CHAIN.BERACHAIN,
  81457: CHAIN.BLAST,
  98866: CHAIN.PLUME,
  167000: CHAIN.TAIKO,
  200901: CHAIN.BITLAYER,
  534352: CHAIN.SCROLL,
  747474: CHAIN.KATANA,
  7565164: CHAIN.SOLANA,
  1313161554: CHAIN.AURORA,
};

export type DzapVolumeSide = {
  allTime: number;
  last24Hours: number;
};

export type DzapChainVolumeRow = {
  swap: DzapVolumeSide;
  bridge: DzapVolumeSide;
};

function normalizeVolume(
  raw: Partial<DzapChainVolumeRow> | undefined,
  txType: "swap" | "bridge"
): number {
  return raw?.[txType]?.last24Hours ?? 0;
}

export async function fetchChainWiseVolumeFromDZapAPI(
  options: FetchOptions & { txType: "swap" | "bridge" }
): Promise<FetchResultV2> {
  const startDate = new Date(options.fromTimestamp * 1000).toISOString();
  const endDate = new Date(options.toTimestamp * 1000).toISOString();
  const query = new URLSearchParams({
    txType: options.txType,
    startDate,
    endDate,
  });

  const url = `${DZAP_VOLUME_CHAIN_URL}?${query.toString()}`;
  const raw = (await httpGet(url)) as Partial<
    Record<number, DzapChainVolumeRow>
  >;
  return Object.fromEntries(
    Object.entries(raw).flatMap(([chainIdStr, data]) => {
      const chainId = Number(chainIdStr);
      const chainName = DZAP_SUPPORTED_CHAINS[chainId];
      if (!chainName) return [];
      return [[chainName, normalizeVolume(data, options.txType)] as const];
    })
  );
}
