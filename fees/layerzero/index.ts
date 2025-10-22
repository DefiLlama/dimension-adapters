import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { nullAddress } from "../../helpers/token";
import { httpGet } from "../../utils/fetchURL";

const LAYERZERO_ENDPOINT = "https://metadata.layerzero-api.com/v1/metadata";
const CHAIN_NAMES_MAPPING: any = {
    [CHAIN.ABSTRACT]: "abstract",
    [CHAIN.APECHAIN]: "ape",
    [CHAIN.ARBITRUM]: "arbitrum",
    [CHAIN.ARBITRUM_NOVA]: "nova",
    [CHAIN.ASTAR]: "astar",
    [CHAIN.AURORA]: "aurora",
    [CHAIN.AVAX]: "avalanche",
    [CHAIN.BSC]: "bsc",
    [CHAIN.BOB]: "bob",
    [CHAIN.BAHAMUT]: "bahamut",
    [CHAIN.BASE]: "base",
    [CHAIN.BERACHAIN]: "bera",
    [CHAIN.BITLAYER]: "bitlayer",
    [CHAIN.BLAST]: "blast",
    [CHAIN.BOTANIX]: "botanix",
    [CHAIN.CANTO]: "canto",
    [CHAIN.CELO]: "celo",
    [CHAIN.CONFLUX]: "conflux",
    [CHAIN.CORE]: "coredao",
    [CHAIN.CORN]: "mp1",
    [CHAIN.CRONOS]: "cronosevm",
    [CHAIN.CRONOS_ZKEVM]: "cronoszkevm",
    [CHAIN.DEXALOT]: "dexalot",
    [CHAIN.FLOW]: "flow",
    [CHAIN.ETHEREUM]: "ethereum",
    [CHAIN.ETHERLINK]: "etherlink",
    [CHAIN.FANTOM]: "fantom",
    [CHAIN.FLARE]: "flare",
    [CHAIN.FRAXTAL]: "fraxtal",
    [CHAIN.FUSE]: "fuse",
    [CHAIN.XDAI]: "gnosis",
    [CHAIN.GOAT]: "goat",
    [CHAIN.GRAVITY]: "gravity",
    [CHAIN.HARMONY]: "harmony",
    [CHAIN.HEDERA]: "hedera",
    [CHAIN.HEMI]: "hemi",
    [CHAIN.EON]: "eon",
    [CHAIN.HYPERLIQUID]: "hyperliquid",
    [CHAIN.INK]: "ink",
    [CHAIN.IOTAEVM]: "iota",
    [CHAIN.KLAYTN]: "klaytn",
    [CHAIN.KATANA]: "katana",
    [CHAIN.KAVA]: "kava",
    [CHAIN.LENS]: "lens",
    [CHAIN.LIGHTLINK_PHOENIX]: "lightlink",
    [CHAIN.LINEA]: "linea",
    [CHAIN.LISK]: "lisk",
    [CHAIN.LYRA]: "lyra",
    [CHAIN.MANTA]: "manta",
    [CHAIN.MANTLE]: "mantle",
    [CHAIN.MERLIN]: "merlin",
    [CHAIN.METER]: "meter",
    [CHAIN.METIS]: "metis",
    [CHAIN.MODE]: "mode",
    [CHAIN.MOONBEAM]: "moonbeam",
    [CHAIN.MOONRIVER]: "moonriver",
    [CHAIN.MORPH]: "morph",
    [CHAIN.NIBIRU]: "nibiru",
    [CHAIN.OKEXCHAIN]: "okx",
    [CHAIN.OPTIMISM]: "optimism",
    [CHAIN.ORDERLY]: "orderly",
    [CHAIN.PEAQ]: "peaq",
    [CHAIN.PLUME]: "plume",
    [CHAIN.POLYGON]: "polygon",
    [CHAIN.POLYGON_ZKEVM]: "zkevm",
    [CHAIN.RARI]: "rarible",
    [CHAIN.REYA]: "reya",
    [CHAIN.ROOTSTOCK]: "rootstock",
    [CHAIN.SANKO]: "sanko",
    [CHAIN.SCROLL]: "scroll",
    [CHAIN.SEI]: "sei",
    [CHAIN.SHIMMER_EVM]: "shimmer",
    [CHAIN.SKALE_EUROPA]: "skale",
    [CHAIN.SOMNIA]: "somnia",
    [CHAIN.SONEIUM]: "soneium",
    [CHAIN.SONIC]: "sonic",
    [CHAIN.SOPHON]: "sophon",
    [CHAIN.STORY]: "story",
    [CHAIN.SUPERPOSITION]: "superposition",
    [CHAIN.SWELLCHAIN]: "swell",
    [CHAIN.TAC]: "tac",
    [CHAIN.TAIKO]: "taiko",
    [CHAIN.TELOS]: "telos",
    [CHAIN.UNICHAIN]: "unichain",
    [CHAIN.VANA]: "islander",
    [CHAIN.WC]: "worldchain",
    [CHAIN.XLAYER]: "xlayer",
    [CHAIN.XDC]: "xdc",
    [CHAIN.ZIRCUIT]: "zircuit",
    [CHAIN.ZORA]: "zora",
    [CHAIN.OP_BNB]: "opbnb",
};

const EXECUTOR_FEE_EVENT = "event ExecutorFeePaid (address executor, uint256 fee)";
const DVN_FEE_EVENT = "event DVNFeePaid (address[] requiredDVNs, address[] optionalDVNs, uint256[] fees)";

const prefetch = async (_a: any) => {
    return await httpGet(LAYERZERO_ENDPOINT);
};

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const data = options.preFetchedResults;
    const chainName = CHAIN_NAMES_MAPPING[options.chain];
    const sendUln302Address = data?.[chainName]?.deployments?.find(
        (deployment: any) => deployment?.sendUln302?.address
    )?.sendUln302?.address;

    if (sendUln302Address === "" || sendUln302Address == undefined)
        console.error("No address found for chain " + options.chain);
    else {
        try {
            const executorFeeLogs = await options.getLogs({
                target: sendUln302Address,
                eventAbi: EXECUTOR_FEE_EVENT
            });
            executorFeeLogs.forEach((log: any) => {
                dailyFees.add(nullAddress, log.fee);
            });

            const dvnFeeLogs = await options.getLogs({
                target: sendUln302Address,
                eventAbi: DVN_FEE_EVENT
            });
            for (const log of dvnFeeLogs as any[]) {
                const fees = log.fees || [];

                for (const fee of fees) {
                    dailyFees.add(nullAddress, fee);
                }
            }
        }
        catch (error) {
            console.error("Error occured while fetching logs for chain " + options.chain);
        }
    }
    return {
        dailyFees,
        dailyRevenue: 0,
        dailyProtocolRevenue: 0
    };
}

const methodology = {
    Fees: 'Message fee paid by users(Oracle fee/DVN fee, Executor fee/Relayer fee) ',
    Revenue: 'Revenue share isnt activated yet',
    ProtocolRevenue: 'Protocol fee share isnt activated yet'
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [
        CHAIN.ABSTRACT, CHAIN.APECHAIN, CHAIN.ARBITRUM, CHAIN.ARBITRUM_NOVA, CHAIN.ASTAR, CHAIN.AVAX, CHAIN.BSC, CHAIN.BOB, CHAIN.BAHAMUT, CHAIN.BASE, CHAIN.BERACHAIN, CHAIN.BITLAYER, CHAIN.BOTANIX, CHAIN.BLAST,
        CHAIN.CANTO, CHAIN.CELO, CHAIN.CONFLUX, CHAIN.CORE, CHAIN.CORN,
        CHAIN.CRONOS, CHAIN.CRONOS_ZKEVM, CHAIN.DEXALOT, CHAIN.FLOW, CHAIN.ETHEREUM, CHAIN.ETHERLINK, CHAIN.FANTOM, CHAIN.FLARE, CHAIN.FRAXTAL, CHAIN.FUSE, CHAIN.XDAI, CHAIN.GOAT, CHAIN.GRAVITY, CHAIN.HARMONY, CHAIN.HEDERA, CHAIN.HEMI, CHAIN.EON, CHAIN.HYPERLIQUID, CHAIN.INK, CHAIN.IOTAEVM, CHAIN.KLAYTN, CHAIN.KATANA, CHAIN.KAVA, CHAIN.LENS, CHAIN.LINEA, CHAIN.LISK, CHAIN.LYRA, CHAIN.MANTA, CHAIN.MANTLE, CHAIN.MERLIN, CHAIN.METER, CHAIN.METIS, CHAIN.MODE, CHAIN.MOONBEAM, CHAIN.MOONRIVER, CHAIN.MORPH, CHAIN.NIBIRU, CHAIN.OPTIMISM, CHAIN.ORDERLY, CHAIN.PEAQ, CHAIN.PLUME, CHAIN.POLYGON, CHAIN.POLYGON_ZKEVM, CHAIN.RARI, CHAIN.REYA, CHAIN.ROOTSTOCK, CHAIN.SANKO, CHAIN.SCROLL, CHAIN.SHIMMER_EVM, CHAIN.SOMNIA, CHAIN.SONEIUM, CHAIN.SONIC, CHAIN.SOPHON, CHAIN.STORY, CHAIN.SUPERPOSITION, CHAIN.SWELLCHAIN, CHAIN.TAC, CHAIN.TAIKO, CHAIN.UNICHAIN, CHAIN.VANA, CHAIN.WC, CHAIN.XDC, CHAIN.ZIRCUIT, CHAIN.ZORA, CHAIN.OP_BNB, CHAIN.AURORA, CHAIN.LIGHTLINK_PHOENIX, CHAIN.OKEXCHAIN, CHAIN.SEI, CHAIN.SKALE_EUROPA, CHAIN.TELOS, CHAIN.XLAYER],
    start: '2024-01-27',
    methodology,
    prefetch: prefetch
};

export default adapter;
