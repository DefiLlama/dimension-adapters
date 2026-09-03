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

async function fetch(options: FetchOptions): Promise<FetchResult> {
    const { chainId } = CHAIN_CONFIG[options.chain];
    const allVaultDetails = await configPost("aera-v2","https://app.aera.finance/api/metric/v1", {
        "metric_identifier": "aera-vaults-current-tvl-by-vault-usd", "aggregation": "last"
    });
    const periodWrtYear = (options.toTimestamp - options.fromTimestamp) / (365 * 24 * 60 * 60);

    const vaultsOfCurrentChain = allVaultDetails.data.filter((vaultDetails: any) => vaultDetails.label.chain == chainId);

    const vaultValueMap = new Map(vaultsOfCurrentChain.map((vaultDetail: any) => [vaultDetail.label.vault_address.toLowerCase(), vaultDetail.series[0].value]));

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

    for (const [index, vaultDetail] of vaultDetails.entries()) {
        const feeBefore = totalFeesBefore[index];
        const feeAfter = totalFeesAfter[index];
        const feePrice = feeTokenPrice[index];
        if (feeBefore != null && feeAfter != null && feePrice != null) {
            const totalFeesForPeriod = ((feeAfter - feeBefore) / 1e18) * (feePrice / 1e18);
            if (Number.isFinite(totalFeesForPeriod)) {
                dailyFees.addUSDValue(totalFeesForPeriod, METRIC.MANAGEMENT_FEES);
                dailyRevenue.addUSDValue(totalFeesForPeriod, METRIC.MANAGEMENT_FEES);
            }
        }

        const currentTvlInUsd = vaultValueMap.get(vaultDetail.vaultAddress.toLowerCase());
        const currentApy = vaultDetail.summary?.external_apy?.value;
        if (currentTvlInUsd == null || currentApy == null) continue;

        const totalYieldForPeriod = +currentTvlInUsd * currentApy * periodWrtYear;
        if (Number.isFinite(totalYieldForPeriod) && totalYieldForPeriod !== 0) {
            dailyFees.addUSDValue(totalYieldForPeriod, METRIC.ASSETS_YIELDS);
            dailySupplySideRevenue.addUSDValue(totalYieldForPeriod, METRIC.ASSETS_YIELDS);
        }
    }

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
    allowNegativeValue: true, // vault external APY can be negative when strategies realize losses
}

export default adapter;
