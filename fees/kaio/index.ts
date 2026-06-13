import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import fetchURL from "../../utils/fetchURL";

const KAIO_TVL_API = "https://api.kaio.xyz/api/v1/tvl";
const YEAR_IN_SECONDS = 365 * 24 * 60 * 60;

// Source: RWA.xyz asset pages list annual management fees for each KAIO fund.
const MANAGEMENT_FEE_RATES: Record<string, number> = {
    VOLTx: 0.0105, // https://app.rwa.xyz/assets/VOLTx
    MACROx: 0.005, // https://app.rwa.xyz/assets/MACROx
    SCOPEx: 0.005, // https://app.rwa.xyz/assets/SCOPEx
    CASHx: 0.0015, // https://app.rwa.xyz/assets/CASHx
};

const chainConfig = {
    [CHAIN.ETHEREUM]: "",
    [CHAIN.POLYGON]: "Polygon",
    [CHAIN.AVAX]: "Avalanche",
    [CHAIN.IMMUTABLEX]: "Immutable",
    [CHAIN.SUI]: "Sui",
    [CHAIN.NEAR]: "Near",
    [CHAIN.APTOS]: "Aptos",
    [CHAIN.SOLANA]: "Solana",
    [CHAIN.XDC]: "XDC",
    [CHAIN.INJECTIVE]: "Injective",
    [CHAIN.HEDERA]: "Hedera",
}

async function prefetch(_options: FetchOptions) {
    const { assets } = await fetchURL(KAIO_TVL_API);
    const receipts = await fetchURL(`${KAIO_TVL_API}/receipts`);
    return {
        assets,
        receipts,
    }
}

async function fetch(options: FetchOptions): Promise<FetchResult> {
    const { assets, receipts } = options.preFetchedResults;
    if (!assets?.length) throw new Error("Missing KAIO TVL assets");

    const instrumentIdToSymbol: Map<string, string> = new Map(assets.map((asset: any) => [asset.instrumentId, asset.symbol]));

    const periodInYears = (options.toTimestamp - options.fromTimestamp) / YEAR_IN_SECONDS;
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();

    if (options.chain === CHAIN.ETHEREUM) {
        for (const asset of assets) {
            if (asset.tvl > 10_000_000 && MANAGEMENT_FEE_RATES[asset.symbol] === undefined) {
                throw new Error(`Missing management fee rate for ${asset.symbol}`);
            }
            const managementFees = (asset.tvl || 0) * (MANAGEMENT_FEE_RATES[asset.symbol] || 0) * periodInYears;

            dailyFees.addUSDValue(managementFees, METRIC.MANAGEMENT_FEES);
            dailyRevenue.addUSDValue(managementFees, METRIC.MANAGEMENT_FEES);
        }
        for (const chaindata of receipts.chains) {
            for (const asset of chaindata.assets) {
                const symbol = instrumentIdToSymbol.get(asset.instrumentId);
                if (!symbol) continue;
                const managementFees = (asset.tvl || 0) * (MANAGEMENT_FEE_RATES[symbol] || 0) * periodInYears;
                dailyFees.addUSDValue(-1 * managementFees, METRIC.MANAGEMENT_FEES);
                dailyRevenue.addUSDValue(-1 * managementFees, METRIC.MANAGEMENT_FEES);
            }
        }
    }
    else {
        const { assets } = receipts.chains.find((data: any) => data.chain === chainConfig[options.chain]);
        for (const asset of assets) {
            const symbol = instrumentIdToSymbol.get(asset.instrumentId);
            if (!symbol) continue;
            const managementFees = (asset.tvl || 0) * (MANAGEMENT_FEE_RATES[symbol] || 0) * periodInYears;
            dailyFees.addUSDValue(managementFees, METRIC.MANAGEMENT_FEES);
            dailyRevenue.addUSDValue(managementFees, METRIC.MANAGEMENT_FEES);
        }
    }

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
    };
}

const adapter: SimpleAdapter = {
    prefetch,
    fetch,
    chains: Object.keys(chainConfig),
    methodology: {
        Fees: "Estimated daily management fees from KAIO's current TVL and the annual fund fee rates listed on RWA.xyz.",
        Revenue: "Management fees are counted as protocol revenue.",
        ProtocolRevenue: "All estimated management fee revenue is attributed to the protocol.",
    },
    breakdownMethodology: {
        Fees: {
            [METRIC.MANAGEMENT_FEES]: "Estimated management fees from KAIO's current TVL and the annual fund fee rates listed on RWA.xyz.",
        },
        Revenue: {
            [METRIC.MANAGEMENT_FEES]: "Management fees are counted as protocol revenue.",
        },
        ProtocolRevenue: {
            [METRIC.MANAGEMENT_FEES]: "All estimated management fee revenue is attributed to the protocol.",
        },
    },
    runAtCurrTime: true,
};

export default adapter;
