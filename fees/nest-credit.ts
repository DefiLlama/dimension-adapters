import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { getConfig } from "../helpers/cache";

const VAULTS_API = "https://api.nest.credit/v1/vaults";

const FEE_RATE_BASE = 1e4;
const YEAR_IN_SECS = 365 * 24 * 60 * 60;

const abis = {
    totalSupply: "uint256:totalSupply",
    decimals: "uint8:decimals",
    base: "address:base",
    exchangeRateUpdated: "event ExchangeRateUpdated(uint96 oldRate, uint96 newRate, uint64 currentTime)",
    // V1: payoutAddress, feesOwedInBase, totalSharesLastUpdate, exchangeRate, upper, lower, lastUpdateTimestamp, isPaused, minimumUpdateDelay, platformFee
    accountantStateV1: "function accountantState() view returns(address,uint128,uint128,uint96,uint16,uint16,uint64,bool,uint32,uint16)",
};

const chainConfig: Record<string, { start: string, chainNameInApi: string }> = {
    [CHAIN.ETHEREUM]: { start: "2025-03-01", chainNameInApi: "mainnet" },
    [CHAIN.PLUME]: { start: "2025-03-01", chainNameInApi: "plume" },
    [CHAIN.BSC]: { start: "2025-03-01", chainNameInApi: "bsc" },
    [CHAIN.ARBITRUM]: { start: "2025-03-01", chainNameInApi: "arbitrum" },
    [CHAIN.PLASMA]: { start: "2025-11-01", chainNameInApi: "plasma" },
    [CHAIN.WC]: { start: "2025-12-17", chainNameInApi: "worldchain" },
}

async function prefetch() {
    const { data } = await getConfig('nestcredit', VAULTS_API);
    return data
        .filter((v: any) => v.slug !== "nest-test-vault")
        .map((v: any) => ({
            vault: v.vaultAddress,
            accountant: v.accountantAddress,
            chains: Object.keys(v.chain),
        }));
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();

    const { chainNameInApi } = chainConfig[options.chain];

    const vaults = options.preFetchedResults.filter((v: any) => v.chains.includes(chainNameInApi)).map((v: any) => (v.vault));
    const accountants = options.preFetchedResults.filter((v: any) => v.chains.includes(chainNameInApi)).map((v: any) => (v.accountant));

    const [totalSupplies, decimals, tokens, accountantStates] = await Promise.all([
        options.api.multiCall({
            abi: abis.totalSupply,
            calls: vaults,
            permitFailure: true,
        }),
        options.api.multiCall({
            abi: abis.decimals,
            calls: vaults,
            permitFailure: true,
        }),
        options.api.multiCall({
            abi: abis.base,
            calls: accountants,
            permitFailure: true,
        }),
        options.api.multiCall({
            abi: abis.accountantStateV1,
            calls: accountants,
            permitFailure: true,
        }),
    ]);

    const exchangeRateUpdatedLogs = await options.getLogs({
        eventAbi: abis.exchangeRateUpdated,
        targets: accountants,
        flatten: false,
    });

    const timespan = options.toTimestamp - options.fromTimestamp;

    for (let i = 0; i < vaults.length; i++) {
        const totalSupply = totalSupplies[i];
        const decimal = decimals[i];
        const token = tokens[i];

        if (!totalSupply || !decimal || !token) continue;
        const vaultRateBase = Number(10 ** Number(decimal));

        for (const { oldRate, newRate } of exchangeRateUpdatedLogs[i]) {
            const rateChange = Number(newRate - oldRate);
            const supplySideYield = Number(totalSupply) * rateChange / vaultRateBase;

            dailyFees.add(token, supplySideYield, METRIC.ASSETS_YIELDS);
            dailySupplySideRevenue.add(token, supplySideYield, METRIC.ASSETS_YIELDS);
        }

        const accountantState = accountantStates[i];
        if (!accountantState) continue;

        const exchangeRate = Number(accountantState[3]);
        const managementFeeRate = Number(accountantState[9]);

        if (managementFeeRate > 0) {
            const totalDeposited = Number(totalSupply) * exchangeRate / vaultRateBase;
            const managementFee = totalDeposited * (managementFeeRate / FEE_RATE_BASE) * timespan / YEAR_IN_SECS;

            dailyFees.add(token, managementFee, METRIC.MANAGEMENT_FEES);
            dailyProtocolRevenue.add(token, managementFee, METRIC.MANAGEMENT_FEES);
        }
    }

    return {
        dailyFees,
        dailyRevenue: dailyProtocolRevenue,
        dailyProtocolRevenue,
        dailySupplySideRevenue,
    };
};

const breakdownMethodology = {
    Fees: {
        [METRIC.ASSETS_YIELDS]: "Yields generated from real-world asset strategies in Nest vaults.",
        [METRIC.MANAGEMENT_FEES]: "Annualized platform fees charged on total assets under management.",
    },
    Revenue: {
        [METRIC.MANAGEMENT_FEES]: "Platform fees collected by Nest Credit protocol.",
    },
    ProtocolRevenue: {
        [METRIC.MANAGEMENT_FEES]: "Platform fees collected by Nest Credit protocol.",
    },
    SupplySideRevenue: {
        [METRIC.ASSETS_YIELDS]: "Yields distributed to vault depositors after protocol fees.",
    },
};

// https://docs.nest.credit
const methodology = {
    Fees: "Total yields generated from real-world asset strategies in Nest vaults, including platform fees.",
    Revenue: "Platform fees collected by Nest Credit protocol.",
    ProtocolRevenue: "Platform fees collected by Nest Credit protocol.",
    SupplySideRevenue: "Yields distributed to vault depositors after protocol fees.",
};

const adapter: Adapter = {
    version: 2,
    prefetch,
    fetch,
    pullHourly: true,
    methodology,
    breakdownMethodology,
    adapter: chainConfig,
    doublecounted: true,
    allowNegativeValue: true,
};

export default adapter;
