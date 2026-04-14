import fetchURL from "../../utils/fetchURL";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = 'https://volume-tracking.icecreamswap.dev';

interface IAPIResponse {
    dailyVolume: string;
}

const commonStartTime = '2025-08-01'

const chainConfig: Record<string, { id: number, start: string }> = {
    [CHAIN.ETHEREUM]: { id: 1, start: commonStartTime },
    [CHAIN.HEMI]: { id: 43111, start: commonStartTime },
    [CHAIN.ARBITRUM]: { id: 42161, start: commonStartTime },
    [CHAIN.CELO]: { id: 42220, start: commonStartTime },
    [CHAIN.ROOTSTOCK]: { id: 30, start: commonStartTime },
    [CHAIN.XDC]: { id: 50, start: commonStartTime },
    [CHAIN.TELOS]: { id: 40, start: commonStartTime },
    [CHAIN.AVAX]: { id: 43114, start: commonStartTime },
    [CHAIN.SONIC]: { id: 146, start: commonStartTime },
    [CHAIN.SCROLL]: { id: 534352, start: commonStartTime },
    [CHAIN.TAIKO]: { id: 167000, start: commonStartTime },
    [CHAIN.CORE]: { id: 1116, start: commonStartTime },
    [CHAIN.IMMUTABLEX]: { id: 13371, start: commonStartTime },
    [CHAIN.MORPH]: { id: 2818, start: commonStartTime },
    [CHAIN.OPTIMISM]: { id: 10, start: commonStartTime },
    [CHAIN.LINEA]: { id: 59144, start: commonStartTime },
    [CHAIN.ZIRCUIT]: { id: 48900, start: commonStartTime },
    [CHAIN.BOB]: { id: 60808, start: commonStartTime },
    [CHAIN.BOBA]: { id: 288, start: commonStartTime },
    [CHAIN.BASE]: { id: 8453, start: commonStartTime },
    [CHAIN.MANTLE]: { id: 5000, start: commonStartTime },
    [CHAIN.BSC]: { id: 56, start: commonStartTime },
    [CHAIN.POLYGON]: { id: 137, start: commonStartTime },
    [CHAIN.CRONOS]: { id: 25, start: commonStartTime },
    [CHAIN.BLAST]: { id: 81457, start: commonStartTime },
    [CHAIN.POLYGON_ZKEVM]: { id: 1101, start: commonStartTime },
    [CHAIN.BITTORRENT]: { id: 199, start: commonStartTime },
    [CHAIN.BERACHAIN]: { id: 80094, start: commonStartTime },
    [CHAIN.UNICHAIN]: { id: 130, start: commonStartTime },
    [CHAIN.HYPERLIQUID]: { id: 999, start: commonStartTime },
    [CHAIN.SEI]: { id: 1329, start: commonStartTime },
    [CHAIN.BITGERT]: { id: 32520, start: commonStartTime },
    [CHAIN.ULTRON]: { id: 1231, start: commonStartTime },
    [CHAIN.EOS]: { id: 17777, start: commonStartTime },
    [CHAIN.KAVA]: { id: 2222, start: commonStartTime },
    [CHAIN.MOONRIVER]: { id: 1285, start: commonStartTime },
    [CHAIN.XLAYER]: { id: 196, start: commonStartTime },
    [CHAIN.METIS]: { id: 1088, start: commonStartTime },
    [CHAIN.LIGHTLINK_PHOENIX]: { id: 1890, start: commonStartTime },
    [CHAIN.MINT]: { id: 185, start: commonStartTime },
    [CHAIN.GRAVITY]: { id: 1625, start: commonStartTime },
    [CHAIN.OKEXCHAIN]: { id: 66, start: commonStartTime },
    [CHAIN.AURORA]: { id: 1313161554, start: commonStartTime },
    [CHAIN.ZORA]: { id: 7777777, start: commonStartTime },
    [CHAIN.DUCKCHAIN]: { id: 5545, start: commonStartTime },
    [CHAIN.MANTA]: { id: 169, start: commonStartTime },
    [CHAIN.PULSECHAIN]: { id: 369, start: commonStartTime },
    [CHAIN.EOS_EVM]: { id: 17777, start: commonStartTime },
    [CHAIN.THUNDERCORE]: { id: 108, start: commonStartTime },
    [CHAIN.ASTAR]: { id: 592, start: commonStartTime },
    [CHAIN.METER]: { id: 82, start: commonStartTime },
    [CHAIN.SONEIUM]: { id: 1868, start: commonStartTime },
    [CHAIN.SHIMMER_EVM]: { id: 148, start: commonStartTime },
    [CHAIN.SANKO]: { id: 1996, start: commonStartTime },
    [CHAIN.BITLAYER]: { id: 200901, start: commonStartTime },
    [CHAIN.ZETA]: { id: 7000, start: commonStartTime },
    [CHAIN.RONIN]: { id: 2020, start: commonStartTime },
    [CHAIN.BSQUARED]: { id: 223, start: commonStartTime },
    [CHAIN.ETHERLINK]: { id: 42793, start: commonStartTime },
    [CHAIN.FLARE]: { id: 14, start: commonStartTime },
    [CHAIN.INK]: { id: 57073, start: commonStartTime },
    [CHAIN.FRAXTAL]: { id: 252, start: commonStartTime },
    [CHAIN.IOTAEVM]: { id: 8822, start: commonStartTime },
    [CHAIN.STORY]: { id: 1514, start: commonStartTime },
    [CHAIN.BOUNCE_BIT]: { id: 6001, start: commonStartTime },
    [CHAIN.SWELLCHAIN]: { id: 1923, start: commonStartTime },
    [CHAIN.VANA]: { id: 1480, start: commonStartTime },
    [CHAIN.CORN]: { id: 21000000, start: commonStartTime },
    [CHAIN.FLOW]: { id: 747, start: commonStartTime },
    [CHAIN.CONFLUX]: { id: 1030, start: commonStartTime },
    [CHAIN.CHILIZ]: { id: 88888, start: commonStartTime },
    [CHAIN.OP_BNB]: { id: 204, start: commonStartTime },
    [CHAIN.WAN]: { id: 888, start: commonStartTime },
    [CHAIN.MERLIN]: { id: 4200, start: commonStartTime },
    [CHAIN.LISK]: { id: 1135, start: commonStartTime },
    [CHAIN.TARA]: { id: 841, start: commonStartTime },
    [CHAIN.DOGECHAIN]: { id: 2000, start: commonStartTime },
    [CHAIN.APECHAIN]: { id: 33139, start: commonStartTime },
    [CHAIN.RARI]: { id: 1380012617, start: commonStartTime },
    [CHAIN.FILECOIN]: { id: 314, start: commonStartTime },
    [CHAIN.SUPERPOSITION]: { id: 55244, start: commonStartTime },
    [CHAIN.FUSE]: { id: 122, start: commonStartTime },
    [CHAIN.MEER]: { id: 813, start: commonStartTime },
    [CHAIN.KROMA]: { id: 255, start: commonStartTime },
    [CHAIN.MODE]: { id: 34443, start: commonStartTime },
};

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResult> => {
    const chainId = chainConfig[options.chain].id;

    const endpoint = `/api/v1/statistics/${chainId}/${options.dateString}`;
    const response: IAPIResponse = await fetchURL(`${URL}${endpoint}`);

    return {
        dailyVolume: response.dailyVolume
    };
};

const adapter: SimpleAdapter = {
    fetch,
    adapter: chainConfig
};

export default adapter;