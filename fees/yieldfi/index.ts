import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";

const ABI = {
    NAV: "event NAVUpdated(address indexed vault, uint256 indexed newNav, uint256 vestingEndTime, uint256 managementFee, uint256 performanceFee)",
    NAV_2: "event NAVUpdated(address indexed vault,uint256 oldNav,uint256 newNav,uint256 vestingEndTime)",
    YIELD_PROXY: "event DistributeYield(address caller, address indexed asset, address indexed receiver, uint256 amount, bool profit)",
    ASSET_SHARED: "event AssetAndShareManaged(address indexed caller,address indexed yToken,uint256 shares,uint256 assetAmount,bool updateAsset,bool isMint,bool isNewYToken)",
    DEPLOY_VAULT: "event VaultDeployed(address indexed vault, address indexed implementation, string name, string symbol, bytes32 salt)"
}

const CONTRACTS = {
    NAV_MANAGER: {
        [CHAIN.ETHEREUM]: "0x08fB9833A5a84d5bCEcDF5a4a635d33260C5F05C",
        [CHAIN.BSC]: "0x08fB9833A5a84d5bCEcDF5a4a635d33260C5F05C",
    },
    VAULT_DEPLOYER: {
        [CHAIN.ETHEREUM]: "0x5c46Ed83fC4446282a75d30375d993357aBa3878",
        [CHAIN.BSC]: "0x5c46Ed83fC4446282a75d30375d993357aBa3878",
    },
    YIELD_PROXY: {
        [CHAIN.ETHEREUM]: "0x392017161a9507F19644E8886A237C58809212B5",
    },
    V2_MANAGER: {
        [CHAIN.ETHEREUM]: "0x03ACc35286bAAE6D73d99a9f14Ef13752208C8dC",
    },
}

const YIELD_SEGMENTS = 10

const PROTOCOL_START_TS: Record<string, number> = {
    [CHAIN.ETHEREUM]: Math.floor(new Date("2024-11-11T00:00:00Z").getTime() / 1000),
    [CHAIN.BSC]: Math.floor(new Date("2025-07-27T00:00:00Z").getTime() / 1000),
}

async function fetchVaultDeployedLogs(options: FetchOptions, vaultDeployer: string) {
    const startTs = PROTOCOL_START_TS[options.chain]
    if (startTs === undefined) return []
    const deployFromBlock = await options.getBlock(startTs, options.chain, {})
    const toBlock = await options.getToBlock()
    if (deployFromBlock > toBlock) return []
    const span = toBlock - deployFromBlock
    const seen = new Set<string>()
    const merged: any[] = []
    for (let i = 0; i < YIELD_SEGMENTS; i++) {
        const chunkFrom = deployFromBlock + Math.floor((i * span) / YIELD_SEGMENTS)
        const chunkTo = i === YIELD_SEGMENTS - 1 ? toBlock : deployFromBlock + Math.floor(((i + 1) * span) / YIELD_SEGMENTS) - 1
        if (chunkFrom > chunkTo) continue
        const chunkLogs = await options.getLogs({
            target: vaultDeployer,
            eventAbi: ABI.DEPLOY_VAULT,
            cacheInCloud: true,
            fromBlock: chunkFrom,
            toBlock: chunkTo,
        })
        for (const log of chunkLogs) {
            const key = String(log.vault).toLowerCase()
            if (seen.has(key)) continue
            seen.add(key)
            merged.push(log)
        }
    }
    return merged
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();

    const yieldProxy = CONTRACTS.YIELD_PROXY[options.chain];
    const manager = CONTRACTS.V2_MANAGER[options.chain];
    const navManager = CONTRACTS.NAV_MANAGER[options.chain];
    const vaultDeployer = CONTRACTS.VAULT_DEPLOYER[options.chain];

    if (yieldProxy) {
        const yieldDistributedLogs = await options.getLogs({ target: yieldProxy, eventAbi: ABI.YIELD_PROXY });
        const feeCollectedLogs = await options.getLogs({ target: manager, eventAbi: ABI.ASSET_SHARED });

        yieldDistributedLogs.forEach((log: any) => dailyFees.add(log.asset, log.amount));

        feeCollectedLogs.forEach((log: any) => {
            dailyFees.add(log.yToken, log.assetAmount);
            dailyRevenue.add(log.yToken, log.assetAmount);
        });
    }

    if (navManager) {
        const navManagerLogs = await options.getLogs({
            target: navManager,
            eventAbi: ABI.NAV,
        });
        const vaultDeployedLogs = await fetchVaultDeployedLogs(options, vaultDeployer);

        navManagerLogs.forEach((log: any) => {
            dailyFees.add(log.vault, log.managementFee + log.performanceFee);
            dailyRevenue.add(log.vault, log.managementFee + log.performanceFee);
        });

        const vaults = vaultDeployedLogs.map((log: any) => log.vault);
        const assets = await options.api.multiCall({ abi: 'address:asset', calls: vaults, permitFailure: true });
        const decimals = await options.api.multiCall({ abi: 'uint8:decimals', calls: vaults, permitFailure: true });
        const assetDecimals = await options.api.multiCall({ abi: 'uint8:decimals', calls: assets, permitFailure: true });

        const fromFeeBlock = await options.getFromBlock();
        const toFeeBlock = await options.getToBlock();
        const feeSpan = toFeeBlock - fromFeeBlock;
        const boundaryBlocks: number[] = [];
        for (let j = 0; j <= YIELD_SEGMENTS; j++) {
            boundaryBlocks.push(j === YIELD_SEGMENTS ? toFeeBlock : fromFeeBlock + Math.floor((j * feeSpan) / YIELD_SEGMENTS));
        }

        const suppliesAt: any[][] = [];
        const ratesAt: any[][] = [];
        for (const block of boundaryBlocks) {
            suppliesAt.push(await options.api.multiCall({ abi: 'uint256:totalSupply', calls: vaults, permitFailure: true, block }));
            ratesAt.push(await options.api.multiCall({ abi: 'uint256:getRate', calls: vaults, permitFailure: true, block }));
        }

        for (let i = 0; i < vaults.length; i++) {
            if (!assets[i] || decimals[i] == null || assetDecimals[i] == null) continue;
            let acc = 0;
            for (let k = 0; k < YIELD_SEGMENTS; k++) {
                const s0 = suppliesAt[k][i];
                const s1 = suppliesAt[k + 1][i];
                const r0 = ratesAt[k][i];
                const r1 = ratesAt[k + 1][i];
                if (s0 == null || s1 == null || r0 == null || r1 == null) continue;
                const avgSupply = (Number(s0) + Number(s1)) / 2;
                const rateDelta = Number(r1) - Number(r0);
                acc += (avgSupply / 10 ** decimals[i]) * rateDelta / 10 ** (decimals[i] - assetDecimals[i]);
            }
            if (acc !== 0) dailyFees.add(assets[i], acc);
        }
    }
    const dailySupplySideRevenue = dailyFees.clone();
    dailySupplySideRevenue.subtract(dailyRevenue);

    return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue: dailyRevenue };
};


const methodology = {
    Fees: "Total yield generated by YieldFi across all supported chains + management fees, performance fees by YieldFi",
    Revenue: "Total management fees and performance fees charged by YieldFi.",
    ProtocolRevenue: "Total management fees and performance fees charged by YieldFi.",
    SupplySideRevenue: "Total yield generated and distributed to vaults depositors.",
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    methodology,
    allowNegativeValue: true, //NAV can go down
    adapter: {
        [CHAIN.ETHEREUM]: {
            start: '2024-11-11',
        },
        [CHAIN.BSC]: {
            start: '2025-07-27',
        },
    },
};


export default adapter;
