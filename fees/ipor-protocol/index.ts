import { ethers } from "ethers";
import { FetchOptions, SimpleAdapter, FetchResultV2 } from "../../adapters/types";
import { getConfig } from "../../helpers/cache";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics"

const IPOR_GITHUB_ADDRESSES_URL = "https://raw.githubusercontent.com/IPOR-Labs/ipor-abi/refs/heads/main/mainnet/addresses.json";

// The addresses.json keys avalanche vaults under "avalanche", but CHAIN.AVAX === "avax".
// Map our chain id to the key used in the source JSON when they differ.
const CHAIN_TO_CONFIG_KEY: Record<string, string> = {
    [CHAIN.AVAX]: "avalanche",
};

const ZERO_TOPIC = ethers.zeroPadValue(ethers.ZeroAddress, 32);
const TRANSFER_EVENT = "event Transfer(address indexed from, address indexed to, uint256 value)";
const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

// Fees are minted as vault shares to a fee account (PlasmaVault._addPerformanceFee / _realizeManagementFee):
// https://github.com/IPOR-Labs/ipor-fusion/blob/main/contracts/vaults/PlasmaVault.sol
// For vaults using a FeeManager, the fee account is a FeeAccount contract whose FEE_MANAGER splits each fee
// between the IPOR DAO (IPOR_DAO_*_FEE) and the vault's curators. Percentages use 2 decimals (10000 = 100%).
// https://github.com/IPOR-Labs/ipor-fusion/blob/main/contracts/managers/fee/FeeManager.sol
const abis = {
    performanceFeeData: 'function getPerformanceFeeData() view returns (address feeAccount, uint16 feeInPercentage)',
    managementFeeData: 'function getManagementFeeData() view returns (address feeAccount, uint16 feeInPercentage, uint32 lastUpdateTimestamp)',
    feeManager: 'address:FEE_MANAGER',
    daoPerformanceFee: 'uint256:IPOR_DAO_PERFORMANCE_FEE',
    daoManagementFee: 'uint256:IPOR_DAO_MANAGEMENT_FEE',
    totalPerformanceFee: 'uint256:getTotalPerformanceFee',
    totalManagementFee: 'uint256:getTotalManagementFee',
    convertToAssets: 'function convertToAssets(uint256) view returns (uint256)',
    managementFeeRealized: 'event ManagementFeeRealized(uint256 unrealizedFeeInUnderlying, uint256 unrealizedFeeInShares)',
    depositFeeRealized: 'event DepositFeeRealized(address recipient, uint256 feeShares)',
}

const methodology = {
    Fees: 'Gross yield earned by PlasmaVault depositors plus all fees charged by the vaults (performance, management and deposit fees).',
    Revenue: 'Performance, management and deposit fees charged by the vaults, measured from the fee shares actually minted or transferred on-chain. Split between vault curators and the IPOR DAO.',
    ProtocolRevenue: 'The IPOR DAO share of vault fees, as configured in each vault FeeManager.',
    SupplySideRevenue: 'Net yield earned by PlasmaVault depositors after fees, from the change in share price. Can be negative when a vault marks its positions down.',
};

const ratio = (part: any, total: any) => {
    const t = Number(total)
    return part && t > 0 ? Math.min(Number(part) / t, 1) : 0
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const dailyFees = options.createBalances()
    const dailyRevenue = options.createBalances()
    const dailyProtocolRevenue = options.createBalances()
    const dailySupplySideRevenue = options.createBalances()
    const config = await getConfig('ipor/assets', IPOR_GITHUB_ADDRESSES_URL);

    const configKey = CHAIN_TO_CONFIG_KEY[options.chain] || options.chain;
    const chainConfig = config[configKey];
    if (!chainConfig || !chainConfig.vaults) {
        return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
    }

    const vaults: string[] = chainConfig.vaults.map((vault: any) => vault.PlasmaVault);

    const assets = await options.api.multiCall({ abi: 'address:asset', calls: vaults, permitFailure: true });
    const supplyBefore = await options.fromApi.multiCall({ abi: 'uint256:totalSupply', calls: vaults, permitFailure: true });
    const supplyAfter = await options.toApi.multiCall({ abi: 'uint256:totalSupply', calls: vaults, permitFailure: true });
    const decimals = await options.api.multiCall({ abi: 'uint8:decimals', calls: vaults, permitFailure: true });
    const performanceFeeData = await options.api.multiCall({ abi: abis.performanceFeeData, calls: vaults, permitFailure: true });
    const managementFeeData = await options.api.multiCall({ abi: abis.managementFeeData, calls: vaults, permitFailure: true });

    // share price at both ends of the period: assets per 1 whole share
    const convertCalls = vaults.map((vault: string, i: number) => ({
        target: vault,
        params: [String(10n ** BigInt(decimals[i] ?? 18))],
    }));
    const priceBefore = await options.fromApi.multiCall({ abi: abis.convertToAssets, calls: convertCalls, permitFailure: true });
    const priceAfter = await options.toApi.multiCall({ abi: abis.convertToAssets, calls: convertCalls, permitFailure: true });

    // IPOR DAO share of performance / management fees. Older vaults have no FeeManager (FEE_MANAGER call fails) -> DAO share 0.
    const performanceAccounts = vaults.map((_, i) => performanceFeeData[i]?.feeAccount ?? null)
    const managementAccounts = vaults.map((_, i) => managementFeeData[i]?.feeAccount ?? null)
    const performanceFeeManagers = await options.api.multiCall({ abi: abis.feeManager, calls: performanceAccounts.map(a => a ?? ethers.ZeroAddress), permitFailure: true });
    const managementFeeManagers = await options.api.multiCall({ abi: abis.feeManager, calls: managementAccounts.map(a => a ?? ethers.ZeroAddress), permitFailure: true });
    const pfm = performanceFeeManagers.map((m: string | null) => m ?? ethers.ZeroAddress)
    const mfm = managementFeeManagers.map((m: string | null) => m ?? ethers.ZeroAddress)
    const daoPerformanceFees = await options.api.multiCall({ abi: abis.daoPerformanceFee, calls: pfm, permitFailure: true });
    const totalPerformanceFees = await options.api.multiCall({ abi: abis.totalPerformanceFee, calls: pfm, permitFailure: true });
    const daoManagementFees = await options.api.multiCall({ abi: abis.daoManagementFee, calls: mfm, permitFailure: true });
    const totalManagementFees = await options.api.multiCall({ abi: abis.totalManagementFee, calls: mfm, permitFailure: true });

    // all share mints (Transfer from 0x0); fee mints are the ones going to the fee accounts
    const mintLogs = await options.getLogs({
        targets: vaults,
        eventAbi: TRANSFER_EVENT,
        topics: [TRANSFER_TOPIC, ZERO_TOPIC],
        onlyArgs: false,
    });
    const managementFeeLogs = await options.getLogs({ targets: vaults, eventAbi: abis.managementFeeRealized, onlyArgs: false });
    const depositFeeLogs = await options.getLogs({ targets: vaults, eventAbi: abis.depositFeeRealized, onlyArgs: false });

    const index: Record<string, number> = {}
    vaults.forEach((v, i) => { index[v.toLowerCase()] = i })

    const performanceShares: bigint[] = vaults.map(() => 0n)
    const managementShares: bigint[] = vaults.map(() => 0n)
    const depositFeeShares: bigint[] = vaults.map(() => 0n)

    const sameAccount = (i: number) => !!performanceAccounts[i] && !!managementAccounts[i]
        && performanceAccounts[i].toLowerCase() === managementAccounts[i].toLowerCase()

    for (const log of mintLogs) {
        const i = index[log.address.toLowerCase()]
        if (i === undefined) continue
        const to = log.args.to.toLowerCase()
        if (performanceAccounts[i] && to === performanceAccounts[i].toLowerCase()) performanceShares[i] += BigInt(log.args.value)
        else if (managementAccounts[i] && to === managementAccounts[i].toLowerCase()) managementShares[i] += BigInt(log.args.value)
    }
    // When one account receives both fees, its mints were all counted as performance above;
    // move the management part (known from ManagementFeeRealized) across.
    for (const log of managementFeeLogs) {
        const i = index[log.address.toLowerCase()]
        if (i === undefined || !sameAccount(i)) continue
        managementShares[i] += BigInt(log.args.unrealizedFeeInShares)
        performanceShares[i] -= BigInt(log.args.unrealizedFeeInShares)
    }
    for (const log of depositFeeLogs) {
        const i = index[log.address.toLowerCase()]
        if (i === undefined) continue
        depositFeeShares[i] += BigInt(log.args.feeShares)
    }

    for (let i = 0; i < vaults.length; i++) {
        const token = assets[i];
        const decimal = decimals[i];
        const before = priceBefore[i];
        const after = priceAfter[i];
        if (!token || supplyBefore[i] === null || supplyAfter[i] === null || decimal === null || !before || !after) continue;

        // smaller of start/end supply: shares minted after (or redeemed before) an in-window price move never held it
        // (2026-10-30 a 500 USDC deposit into an emptied $0.12 Arbitrum vault turned -$0.12 into -$60.7M at end supply)
        const supply = BigInt(supplyBefore[i]) < BigInt(supplyAfter[i]) ? BigInt(supplyBefore[i]) : BigInt(supplyAfter[i])

        const oneShare = 10n ** BigInt(decimal)
        const toAssets = (shares: bigint) => Number(shares * BigInt(after) / oneShare)

        // Net yield to depositors: share-price change x shares. The share price is already net of all fees.
        // Fusion vaults mark positions to market, so this is negative when a vault's positions lose value.
        const netYield = Number((BigInt(after) - BigInt(before)) * supply / oneShare)

        const performanceFee = toAssets(performanceShares[i] > 0n ? performanceShares[i] : 0n)
        const managementFee = toAssets(managementShares[i])
        const depositFee = toAssets(depositFeeShares[i])

        dailySupplySideRevenue.add(token, netYield, METRIC.ASSETS_YIELDS);
        dailyFees.add(token, netYield, METRIC.ASSETS_YIELDS);

        dailyFees.add(token, performanceFee, METRIC.PERFORMANCE_FEES);
        dailyRevenue.add(token, performanceFee, METRIC.PERFORMANCE_FEES);
        dailyFees.add(token, managementFee, METRIC.MANAGEMENT_FEES);
        dailyRevenue.add(token, managementFee, METRIC.MANAGEMENT_FEES);
        dailyFees.add(token, depositFee, METRIC.DEPOSIT_WITHDRAW_FEES);
        dailyRevenue.add(token, depositFee, METRIC.DEPOSIT_WITHDRAW_FEES);

        const daoPerformance = performanceFee * ratio(daoPerformanceFees[i], totalPerformanceFees[i])
        const daoManagement = managementFee * ratio(daoManagementFees[i], totalManagementFees[i])
        dailyProtocolRevenue.add(token, daoPerformance, METRIC.PERFORMANCE_FEES);
        dailyProtocolRevenue.add(token, daoManagement, METRIC.MANAGEMENT_FEES);
    }

    return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue }
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    // Fusion vaults mark positions to market (looping, carry and LP strategies), so depositor yield
    // and therefore fees are negative in periods where a vault's share price falls.
    allowNegativeValue: true,
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch,
            start: "2024-09-29",
        },
        [CHAIN.ARBITRUM]: {
            fetch,
            start: "2024-09-03",
        },
        [CHAIN.BASE]: {
            fetch,
            start: "2024-11-08",
        },
        [CHAIN.UNICHAIN]: {
            fetch,
            start: "2025-06-18",
        },
        [CHAIN.TAC]: {
            fetch,
            start: "2025-07-11",
        },
        [CHAIN.INK]: {
            fetch,
            start: "2025-07-29",
        },
        [CHAIN.PLASMA]: {
            fetch,
            start: "2025-09-29",
        },
        [CHAIN.AVAX]: {
            fetch,
            start: "2025-10-03",
        },
        [CHAIN.KATANA]: {
            fetch,
            start: "2026-02-19",
        },
    },
    methodology,
    breakdownMethodology: {
        Fees: {
            [METRIC.ASSETS_YIELDS]: 'Net yield earned by PlasmaVault depositors, from the change in share price.',
            [METRIC.PERFORMANCE_FEES]: 'Performance fees, measured from vault shares minted to the performance fee account.',
            [METRIC.MANAGEMENT_FEES]: 'Management fees, measured from vault shares minted to the management fee account.',
            [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Deposit fees, from DepositFeeRealized events (shares sent to the vault WithdrawManager on mint).',
        },
        Revenue: {
            [METRIC.PERFORMANCE_FEES]: 'Performance fees kept by vault curators and the IPOR DAO.',
            [METRIC.MANAGEMENT_FEES]: 'Management fees kept by vault curators and the IPOR DAO.',
            [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Deposit fees kept by the vault (WithdrawManager).',
        },
        ProtocolRevenue: {
            [METRIC.PERFORMANCE_FEES]: 'IPOR DAO share of performance fees (IPOR_DAO_PERFORMANCE_FEE / total performance fee).',
            [METRIC.MANAGEMENT_FEES]: 'IPOR DAO share of management fees (IPOR_DAO_MANAGEMENT_FEE / total management fee).',
        },
        SupplySideRevenue: {
            [METRIC.ASSETS_YIELDS]: 'Net yield earned by PlasmaVault depositors after fees.',
        },
    },
}

export default adapter;
