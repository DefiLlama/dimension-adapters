import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const chains = [
    CHAIN.ETHEREUM,
    CHAIN.POLYGON,
    CHAIN.BSC,
    CHAIN.AVAX,
    CHAIN.OPTIMISM,
    CHAIN.FANTOM,
    CHAIN.ARBITRUM,
    CHAIN.AURORA,
    CHAIN.CELO,
    CHAIN.BOBA,
    CHAIN.XDAI,
    CHAIN.TELOS,
    CHAIN.BASE,
    CHAIN.LINEA,
    CHAIN.MANTLE,
    CHAIN.MOONBEAM,
    CHAIN.CRONOS,
    CHAIN.BLAST,
    CHAIN.EVMOS,
    CHAIN.FUSE,
    CHAIN.HARMONY,
    CHAIN.KAVA,
    CHAIN.MOONRIVER,
    CHAIN.OKEXCHAIN,
    CHAIN.SCROLL,
    CHAIN.TRON,
    CHAIN.TON,
    CHAIN.WAN,
    CHAIN.ZKLINK,
    CHAIN.ZKSYNC,
];

const chainToId: Record<string, number> = {
    [CHAIN.ETHEREUM]: 1,
    [CHAIN.POLYGON]: 137,
    [CHAIN.BSC]: 56,
    [CHAIN.AVAX]: 43114,
    [CHAIN.OPTIMISM]: 10,
    [CHAIN.FANTOM]: 250,
    [CHAIN.ARBITRUM]: 42161,
    [CHAIN.AURORA]: 1313161554,
    [CHAIN.CELO]: 42220,
    [CHAIN.BOBA]: 288,
    [CHAIN.XDAI]: 100,
    [CHAIN.TELOS]: 40,
    [CHAIN.BASE]: 8453,
    [CHAIN.LINEA]: 59144,
    [CHAIN.MANTLE]: 5000,
    [CHAIN.MOONBEAM]: 1284,
    [CHAIN.CRONOS]: 25,
    [CHAIN.BLAST]: 81457,
    [CHAIN.EVMOS]: 9001,
    [CHAIN.FUSE]: 122,
    [CHAIN.HARMONY]: 1666600000,
    [CHAIN.KAVA]: 2222,
    [CHAIN.MOONRIVER]: 1285,
    [CHAIN.OKEXCHAIN]: 66,
    [CHAIN.SCROLL]: 534352,
    [CHAIN.TRON]: 728126428,
    [CHAIN.TON]: -239,
    [CHAIN.WAN]: 888,
    [CHAIN.ZKLINK]: 810180,
    [CHAIN.ZKSYNC]: 324,
};

const fetch = async (_at: number, _t: any, options: FetchOptions) => {
    const startOfDay = options.startOfDay
    const url = `https://app.chainspot.io/api/2.0/statistic/daily-volume?chainId=${chainToId[options.chain]}&timestamp=${startOfDay * 1e3}`;
    const volume = (
        await httpGet(url)
    )?.volume;

    return {
        dailyVolume: volume || 0,
    };
};

const adapter: SimpleAdapter = {
    fetch, chains,
};

export default adapter;
