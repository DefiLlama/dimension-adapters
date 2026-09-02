import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import pLimit from "p-limit";
import fetchURL from "../../utils/fetchURL";
import { METRIC } from "../../helpers/metrics";
import { configPost } from "../../helpers/cache";

const CHAIN_CONFIG: Record<string, any> = {
    [CHAIN.ETHEREUM]: {
        factoryAddresses: [
            "0x9500948c2BEeeB2Da4CC3aA21CB05Bd2e7C27191", "0x38896b4ac8420b8A2B768001Da44d11109F1797D"
        ],
        startBlock: 18192390,
        chainId: 1,
    },
    [CHAIN.POLYGON]: {
        factoryAddresses: [
            "0x49b428ea1cd536e7d103e9729ea14400785e30ec", "0xa1c908cf7371047649dfca9ece01327dc6db3094",
        ],
        startBlock: 48024333,
        chainId: 137,
    },
    [CHAIN.ARBITRUM]: {
        factoryAddresses: [
            "0xaF2762E1F75DeCdb8d240576e7A2CEc1A365cD46", "0x49b428ea1cd536e7d103e9729ea14400785e30ec"
        ],
        startBlock: 203397910,
        chainId: 42161,
    },
    [CHAIN.BASE]: {
        factoryAddresses: [
            "0x5CD0Cb0DcDEF98a8d07a8D44054a13F2c35C53E1", //"0x1395C314782bba704ca984ad41e57275f6E77b09"
        ],
        startBlock: 13582859,
        chainId: 8453,
    }
}

const ABIs = {
    vaultCreated: "event VaultCreated (address indexed vault, address assetRegistry, address hooks, address indexed owner,address indexed guardian, address feeRecipient, uint256 fee, string description, address wrappedNativeToken)",
    feeTotal: "uint256:feeTotal",
    feeTokenPrice: "uint256:lastFeeTokenPrice"
}

const limit = pLimit(5);

// Aera's API renamed `summary.apy` -> `summary.external_apy` at some point and,
// as of 2026-09, that field is frozen at `{value: 0, timestamp: 2026-06-30T18:44:47Z}`
// for every vault (a dead upstream pipeline, not a real zero yield). Exported and
// pure so they can be unit-tested directly against synthetic snapshots without a
// live API call - real-world data is currently 100% stale/missing, so several
// branches below aren't otherwise observable.
//
// Coverage is TVL-weighted, not vault-count-weighted: a single high-TVL vault
// with bad apy data can dwarf nine dust vaults with fresh data, so counting
// vaults instead of dollars would let a whale's missing yield through silently.
// A MISSING snapshot counts as a coverage problem exactly like STALE or INVALID -
// if Aera drops the field/response entirely for every vault, that must refuse,
// not silently fall back to management-fees-only with 0/0 "nothing to refuse".
export const STALE_APY_THRESHOLD_SECONDS = 3 * 24 * 60 * 60;
export const FUTURE_SKEW_TOLERANCE_SECONDS = 60 * 60;
export const MAX_STALE_APY_TVL_RATIO = 0.1;

export type ApySnapshotStatus = "fresh" | "stale" | "missing" | "invalid";

export function classifyApySnapshot(
    toTimestamp: number,
    apySnapshot: { value: number; timestamp: string } | undefined | null,
): ApySnapshotStatus {
    if (!apySnapshot) return "missing";
    const snapshotMs = new Date(apySnapshot.timestamp).getTime();
    if (!Number.isFinite(snapshotMs) || !Number.isFinite(apySnapshot.value)) return "invalid";
    const snapshotAgeSeconds = toTimestamp - snapshotMs / 1000;
    if (snapshotAgeSeconds < -FUTURE_SKEW_TOLERANCE_SECONDS) return "invalid";
    if (snapshotAgeSeconds > STALE_APY_THRESHOLD_SECONDS) return "stale";
    return "fresh";
}

export function shouldRefuseStaleApyDataset(tvlWithUsableApy: number, tvlWithApyProblem: number): boolean {
    const totalTvl = tvlWithUsableApy + tvlWithApyProblem;
    if (totalTvl <= 0) return false;
    return tvlWithApyProblem / totalTvl > MAX_STALE_APY_TVL_RATIO;
}

async function fetch(options: FetchOptions): Promise<FetchResult> {
    const { chainId } = CHAIN_CONFIG[options.chain];
    const allVaultDetails = await configPost("aera-v2","https://app.aera.finance/api/metric/v1", {
        "metric_identifier": "aera-vaults-current-tvl-by-vault-usd", "aggregation": "last"
    });
    const periodWrtYear = (options.toTimestamp - options.fromTimestamp) / (365 * 24 * 60 * 60);

    const vaultsOfCurrentChain = allVaultDetails.data.filter((vaultDetails: any) => vaultDetails.label.chain == chainId);

    const vaultValueMap = new Map(vaultsOfCurrentChain.map((vaultDetail: any) => [vaultDetail.label.vault_address, vaultDetail.series[0].value]));

    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const vaultCreationLogs = await options.getLogs({
        eventAbi: ABIs.vaultCreated,
        targets: CHAIN_CONFIG[options.chain].factoryAddresses,
        fromBlock: CHAIN_CONFIG[options.chain].startBlock,
        cacheInCloud: true,
    });

    const vaults: any[] = [];

    for (const { vault } of vaultCreationLogs)
        vaults.push(vault);

    const vaultDetails = await Promise.all(vaults.map(vault => limit(() => fetchURL(`https://app.aera.finance/api/latest_vault_asset_metrics?vault_address=${vault}&chain_id=${chainId}`))));

    const totalFeesBefore = await options.fromApi.multiCall({
        calls: vaults,
        abi: ABIs.feeTotal,
        permitFailure: true,
    });

    const totalFeesAfter = await options.toApi.multiCall({
        calls: vaults,
        abi: ABIs.feeTotal,
        permitFailure: true
    });

    const feeTokenPrice = await options.api.multiCall({
        calls: vaults,
        abi: ABIs.feeTokenPrice,
        permitFailure: true
    });

    let tvlWithUsableApy = 0;
    let tvlWithApyProblem = 0;

    for (const [index, vaultDetail] of vaultDetails.entries()) {
        const currentTvlInUsd = +(vaultValueMap.get(vaultDetail.vaultAddress) || 0);

        const totalFeesForPeriod = ((totalFeesAfter[index] - totalFeesBefore[index]) / 1e18) * (feeTokenPrice[index] / 1e18);
        dailyFees.addUSDValue(totalFeesForPeriod, METRIC.MANAGEMENT_FEES);
        dailyRevenue.addUSDValue(totalFeesForPeriod, METRIC.MANAGEMENT_FEES);

        const apySnapshot = vaultDetail.summary?.external_apy;
        const status = classifyApySnapshot(options.toTimestamp, apySnapshot);

        // A vault with no TVL contributes 0 yield regardless of its apy status,
        // so it's excluded from the coverage ratio entirely - it can't dilute or
        // inflate the refusal decision either way.
        if (currentTvlInUsd > 0) {
            if (status === "fresh") tvlWithUsableApy += currentTvlInUsd;
            else tvlWithApyProblem += currentTvlInUsd;
        }

        if (status !== "fresh") continue;

        const totalYieldForPeriod = currentTvlInUsd * apySnapshot!.value * periodWrtYear;
        dailyFees.addUSDValue(totalYieldForPeriod, METRIC.ASSETS_YIELDS);
        dailySupplySideRevenue.addUSDValue(totalYieldForPeriod, METRIC.ASSETS_YIELDS);
    }

    if (shouldRefuseStaleApyDataset(tvlWithUsableApy, tvlWithApyProblem))
        throw new Error(`aera-v2: $${tvlWithApyProblem.toFixed(0)} of $${(tvlWithUsableApy + tvlWithApyProblem).toFixed(0)} tracked TVL has missing/stale/invalid external_apy data - Aera's asset-metrics pipeline appears to be down, refusing to report vault yields as zero`);

    return {
        dailyFees,
        dailyRevenue,
        dailySupplySideRevenue,
        dailyProtocolRevenue: dailyRevenue,
    }
}

const methodology = {
    Fees: "Includes vault yields and fees",
    Revenue: "Fees paid on vaults",
    SupplySideRevenue: "Vault yields recived by vault depositors",
    ProtocolRevenue: "All the revenue goes to the protocol"
};

const breakdownMethodology = {
    Fees: {
        [METRIC.ASSETS_YIELDS]: "Yields earned on vault deposits",
        [METRIC.MANAGEMENT_FEES]: "Management fees occured on fee enabled vaults",
    },
    Revenue: {
        [METRIC.MANAGEMENT_FEES]: "Management fees occured on fee enabled vaults",
    },
    SupplySideRevenue: {
        [METRIC.ASSETS_YIELDS]: "Yields earned on vault deposits",
    },
    ProtocolRevenue: {
        [METRIC.MANAGEMENT_FEES]: "Management fees occured on fee enabled vaults",
    }
}

const adapter: SimpleAdapter = {
    fetch,
    adapter: CHAIN_CONFIG,
    methodology,
    breakdownMethodology,
    runAtCurrTime: true,
}

export default adapter;