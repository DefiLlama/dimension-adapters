import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const HISTORY_URL = "https://api.7.exchange/api/v1/transaction/history";
const PER_PAGE = 50;
const MAX_PAGES = 2000;

const CHAIN_KEY_TO_CHAIN: Record<string, CHAIN> = {
    "bitcoin": CHAIN.BITCOIN,
    "ethereum": CHAIN.ETHEREUM,
    "solana": CHAIN.SOLANA,
    "binance-smart-chain": CHAIN.BSC,
    "tron": CHAIN.TRON,
    "xrp": CHAIN.RIPPLE,
    "cardano": CHAIN.CARDANO,
    "avalanche": CHAIN.AVAX,
    "polygon-pos": CHAIN.POLYGON,
    "dogecoin": CHAIN.DOGE,
    "the-open-network": CHAIN.TON,
    "sui": CHAIN.SUI,
    "near-protocol": CHAIN.NEAR,
    "stellar": CHAIN.STELLAR,
    "zcash": CHAIN.ZEC,
    "aptos": CHAIN.APTOS,
    "arbitrum-one": CHAIN.ARBITRUM,
    "optimistic-ethereum": CHAIN.OPTIMISM,
    "base": CHAIN.BASE,
    "hedera-hashgraph": CHAIN.HEDERA,
    "cosmos": CHAIN.COSMOS,
    "injective": CHAIN.INJECTIVE,
    "starknet": CHAIN.STARKNET,
    "hyperliquid": CHAIN.HYPERLIQUID,
    "sei-v2": CHAIN.SEI,
    "fantom": CHAIN.FANTOM,
    "litecoin": CHAIN.LITECOIN,
    "bitcoin-cash": CHAIN.BITCOIN_CASH,
    "mantle": CHAIN.MANTLE,
    "linea": CHAIN.LINEA,
    "zksync": CHAIN.ZKSYNC,
    "berachain": CHAIN.BERACHAIN,
    "scroll": CHAIN.SCROLL,
    "cronos": CHAIN.CRONOS,
    "celo": CHAIN.CELO,
    "sonic": CHAIN.SONIC,
    "thorchain": CHAIN.THORCHAIN,
    "blast": CHAIN.BLAST,
    "ronin": CHAIN.RONIN,
    "manta-pacific": CHAIN.MANTA,
    "polygon-zkevm": CHAIN.POLYGON_ZKEVM,
    "klay-token": CHAIN.KLAYTN,
    "moonbeam": CHAIN.MOONBEAM,
    "moonriver": CHAIN.MOONRIVER,
    "astar": CHAIN.ASTAR,
    "xdai": CHAIN.XDAI,
    "kava": CHAIN.KAVA,
    "metis-andromeda": CHAIN.METIS,
    "taiko": CHAIN.TAIKO,
    "mode": CHAIN.MODE,
    "fraxtal": CHAIN.FRAXTAL,
    "core": CHAIN.CORE,
    "chiliz": CHAIN.CHILIZ,
    "flare-network": CHAIN.FLARE,
    "rootstock": CHAIN.ROOTSTOCK,
    "boba": CHAIN.BOBA,
    "aurora": CHAIN.AURORA,
    "unichain": CHAIN.UNICHAIN,
    "conflux": CHAIN.CONFLUX,
    "xdc-network": CHAIN.XDC,
    "soneium": CHAIN.SONEIUM,
    "ink": CHAIN.INK,
    "world-chain": CHAIN.WC,
    "story": CHAIN.STORY,
    "abstract": CHAIN.ABSTRACT,
    "lens": CHAIN.LENS,
    "monad": CHAIN.MONAD,
    "opbnb": CHAIN.OP_BNB,
    "lisk": CHAIN.LISK,
    "zircuit": CHAIN.ZIRCUIT,
    "telos": CHAIN.TELOS,
    "fuse": CHAIN.FUSE,
    "flow-evm": CHAIN.FLOW,
    "apechain": CHAIN.APECHAIN,
    "x-layer": CHAIN.XLAYER,
    "zora-network": CHAIN.ZORA,
    "arbitrum-nova": CHAIN.ARBITRUM_NOVA,
    "etherlink": CHAIN.ETHERLINK,
    "degen": CHAIN.DEGEN,
    "beam": CHAIN.BEAM,
    "vana": CHAIN.VANA,
    "gravity-alpha": CHAIN.GRAVITY,
    "swellchain": CHAIN.SWELLCHAIN,
    "redstone": CHAIN.REDSTONE,
    "eclipse": CHAIN.ECLIPSE,
    "bittensor-evm": CHAIN.BITTENSOR,
    "lightlink": CHAIN.LIGHTLINK_PHOENIX,
    "morph-l2": CHAIN.MORPH,
    "sanko": CHAIN.SANKO,
    "corn": CHAIN.CORN,
    "plume-network": CHAIN.PLUME,
    "peaq": CHAIN.PEAQ,
    "mayachain": CHAIN.MAYA,
    "ancient8": CHAIN.ANCIENT8,
    "iota-evm": CHAIN.IOTAEVM,
    "edu-chain": CHAIN.EDU_CHAIN,
    "sophon": CHAIN.SOPHON,
    "superseed": CHAIN.SSEED,
    "megaeth": CHAIN.MEGAETH,
    "nibiru": CHAIN.NIBIRU,
    "hemi": CHAIN.HEMI,
    "botanix": CHAIN.BOTANIX,
    "dash": CHAIN.DASH,
    "tomochain": CHAIN.TOMOCHAIN,
    "katana": CHAIN.KATANA,
    "zero-network": CHAIN.ZERO,
    "goat": CHAIN.GOAT,
    "rari": CHAIN.RARI,
    "somnia": CHAIN.SOMNIA,
    "tac": CHAIN.TAC,
    "shape": CHAIN.SHAPE,
    "citrea": CHAIN.CITREA,
    "stable": CHAIN.STABLE,
    "plasma": CHAIN.PLASMA,
    "gatelayer": CHAIN.GATE_LAYER,
    "gensyn": CHAIN.GENSYN,
    "tempo": CHAIN.TEMPO,
    "Superposition": CHAIN.SUPERPOSITION,
    "0g": CHAIN.OG,
    "radix": CHAIN.RADIXDLT,
    "b3": CHAIN.B3,
    "bob": CHAIN.BOB,
    "camp": CHAIN.CAMP,
    "doma": CHAIN.DOMA,
    "ethereal": CHAIN.ETHEREAL,
    "kujira": CHAIN.KUJIRA,
    "lighter": CHAIN.ZK_LIGHTER,
    "mythos": CHAIN.MYTHOS,
    "orderly": CHAIN.ORDERLY,
    "pharos": CHAIN.PHAROS,
    "robinhood": CHAIN.ROBINHOOD,
};

const chains = Array.from(new Set(Object.values(CHAIN_KEY_TO_CHAIN)));

interface HistoryTx {
    amountUsd: number | null;
    createdAt: string;
    fee?: { amountUsd?: number | null };
    srcAsset?: { chain?: string | null };
}

interface HistoryResponse {
    data?: HistoryTx[];
    pagination?: { hasMore?: boolean };
}

interface ChainTotals {
    volume: number;
    fees: number;
}

type WindowBreakdown = Partial<Record<CHAIN, ChainTotals>>;

const windowCache = new Map<string, Promise<WindowBreakdown>>();

function getWindowBreakdown(start: number, end: number): Promise<WindowBreakdown> {
    const cacheKey = `${start}:${end}`;
    let pending = windowCache.get(cacheKey);
    if (!pending) {
        pending = buildWindowBreakdown(start, end);
        windowCache.set(cacheKey, pending);
    }
    return pending;
}

async function buildWindowBreakdown(start: number, end: number): Promise<WindowBreakdown> {
    const totals: WindowBreakdown = {};

    for (let page = 1; page <= MAX_PAGES; page++) {
        const res: HistoryResponse = await httpGet(
            `${HISTORY_URL}?statuses=SUCCESS&finalizedOnly=true` +
            `&from=${start}&to=${end}&perPage=${PER_PAGE}&page=${page}`
        );

        const rows = res?.data ?? [];
        if (rows.length === 0) break;

        for (const tx of rows) {
            const key = tx.srcAsset?.chain;
            if (!key) continue;

            const chain = CHAIN_KEY_TO_CHAIN[key];
            if (!chain) continue;

            const ts = Math.floor(new Date(tx.createdAt).getTime() / 1000);
            if (ts < start || ts >= end) continue;

            const bucket = (totals[chain] ??= { volume: 0, fees: 0 });
            bucket.volume += Number(tx.amountUsd ?? 0);
            bucket.fees += Number(tx.fee?.amountUsd ?? 0);
        }

        if (res?.pagination?.hasMore !== true) break;

        if (page === MAX_PAGES) {
            throw new Error(
                `7.exchange history exceeded ${MAX_PAGES} pages for window ${start}-${end}`
            );
        }
    }

    return totals;
}

const fetch = async (options: FetchOptions) => {
    const breakdown = await getWindowBreakdown(options.startTimestamp, options.endTimestamp);
    const { volume = 0, fees = 0 } = breakdown[options.chain as CHAIN] ?? {};
    return { dailyVolume: volume, dailyFees: fees };
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains,
    start: "2026-05-07",
    methodology: {
        Volume:
            "USD value of finalized swaps routed through 7.exchange in the period, mapped from the source-chain key and credited to that chain.",
        Fees: "USD fees recorded on finalized 7.exchange swaps.",
    },
};

export default adapter;