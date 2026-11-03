import ADDRESSES from "../../helpers/coreAssets.json";
import { Adapter, FetchOptions, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const config = {
    [CHAIN.ARBITRUM]: {
        registry: "0xcB94Eee869a2041F3B44da423F78134aFb6b676B",
        backfill: {
            routers: ["0x7bcFc8b8ff61456ad7C5E2be8517D01df006d18d"],
            assets: [
                ADDRESSES.arbitrum.ARB,
                ADDRESSES.arbitrum.USDC_CIRCLE,
                ADDRESSES.arbitrum.USDT,
                ADDRESSES.arbitrum.WBTC,
                ADDRESSES.arbitrum.WETH,
            ],
        },
    },
    [CHAIN.BASE]: {
        registry: "0xd24d145f5E351de52934A7E1f8cF55b907E67fFF",
        backfill: {
            routers: ["0x791Fee7b66ABeF59630943194aF17B029c6F487B"],
            assets: [
                ADDRESSES.base.cbBTC,
                ADDRESSES.base.WETH,
                "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed", // DEGEN
            ],
        },
    },
    [CHAIN.BERACHAIN]: {
        registry: "0x1F917Fe724F186a1fFA7744A73afed18C335b9eC",
        backfill: {
            routers: ["0x8756fd992569E0389bF357EB087f5827F364D2a4"],
            assets: [
                ADDRESSES.berachain.WETH,
                ADDRESSES.berachain.WBTC,
                ADDRESSES.berachain.USDC,
            ],
        },
    },
    [CHAIN.HYPERLIQUID]: {
        registry: "0x45a2C9FBc307A13c2737Cef9e00C1555c2F8C948",
        backfill: {
            routers: [
                "0xe62b7C96F9b804742d2Cbd57613F19Bda82D426F",
                "0xca51650D3840c2E628A95AC0096592a2aEa9daE8",
            ],
            assets: [
                "0xBe6727B535545C67d5cAa73dEa54865B92CF7907",
                "0x9FDBdA0A5e284c32744D2f17Ee5c74B284993463",
                ADDRESSES.hyperliquid.USDT0,
                ADDRESSES.hyperliquid.WHYPE,
            ],
        },
    },
    [CHAIN.MONAD]: {
        registry: "0x11B06EF8Adc5ea73841023CB39Be614f471213cc",
        backfill: {
            routers: ["0x610748f49774C062467c7AE1eC9E4729FFE94577"],
            assets: [
                ADDRESSES.monad.WETH, // WETH
                ADDRESSES.monad.USDC, // USDC
                ADDRESSES.bsc.WBTC, // WBTC
                ADDRESSES.monad.WMON, // WMON
            ],
        },
    },
};

const abis = {
    portal: {
        getRouters:
            "function getRouters() external view returns (address[] memory routers)",
        getRouterAssets:
            "function getRouterAssets(address router) external view returns (address[] memory routerAssets)",
    },
    router: {
        poolByAsset:
            "function poolByAsset(address asset) external view returns (address swapPool)",
        swapEvent:
            "event Swap(address indexed sender, uint256 amountIn, uint256 amountOut, address tokenIn, address tokenOut, address indexed to)",
    },
    swapPool: {
        chargedSwapFeesEvent:
            "event ChargedSwapFees(uint256 lpFees, uint256 backstopFees, uint256 protocolFees)",
    },
};

async function getAddresses(chain, api) {
    const registry = config[chain].registry;
    let routers;
    let pools;
    let assets;

    try {
        // routers
        routers = await api.call({
            abi: abis.portal.getRouters,
            target: registry,
            block: "latest",
        });

        // assets
        const assetsResponse = await api.multiCall({
            abi: abis.portal.getRouterAssets,
            calls: routers.map((router: any) => ({
                target: registry,
                params: router,
            })),
        });
        assets = assetsResponse.reduce((acc, a: any[]) => [...acc, ...a], []);

        // pools
        const poolsCalls: any[] = [];
        routers.forEach((router: any, i) => {
            assetsResponse[i].forEach((asset: any) => {
                poolsCalls.push({
                    target: router,
                    params: asset,
                });
            });
        });
        pools = await api.multiCall({
            abi: abis.router.poolByAsset,
            calls: poolsCalls,
        });
    } catch (e) {
        routers = config[chain].backfill.routers;
        const backfillCalls: any[] = [];
        assets = [];
        routers.forEach((router: any) => {
            config[chain].backfill.assets.forEach((asset: any) => {
                backfillCalls.push({
                    target: router,
                    params: asset,
                });
                assets.push(asset);
            });
        });
        pools = await api.multiCall({
            abi: abis.router.poolByAsset,
            calls: backfillCalls,
        });
    }

    return { routers, pools, assets };
}

const fetch = async (options: FetchOptions) => {
    const { routers, pools, assets } = await getAddresses(
        options.chain,
        options.api
    );

    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailyUserFees = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const swapLogsOfRouters = await Promise.all(
        routers.map((router: string) =>
            options.getLogs({
                target: router,
                eventAbi: abis.router.swapEvent,
            })
        )
    );
    swapLogsOfRouters.forEach((swapLogsOfRouter) => {
        swapLogsOfRouter.forEach((log: any) => {
            dailyVolume.add(log.tokenOut, log.amountOut);
        });
    });

    const chargedSwapFeesLogsOfPools = await Promise.all(
        pools.map((pool: string) =>
            options.getLogs({
                target: pool,
                eventAbi: abis.swapPool.chargedSwapFeesEvent,
            })
        )
    );
    chargedSwapFeesLogsOfPools.forEach((chargedSwapFeesLogsOfPool, i) => {
        chargedSwapFeesLogsOfPool.forEach((log: any) => {
            const totalFees = log.lpFees + log.backstopFees + log.protocolFees;
            dailyFees.add(assets[i], totalFees, METRIC.SWAP_FEES);
            dailyUserFees.add(assets[i], totalFees, METRIC.SWAP_FEES);
            dailyProtocolRevenue.add(assets[i], log.protocolFees, METRIC.PROTOCOL_FEES);
            dailySupplySideRevenue.add(assets[i], log.lpFees, 'Swap Fees To LPs');
            dailySupplySideRevenue.add(assets[i], log.backstopFees, 'Swap Fees To Backstop Depositors');
        });
    });

    return {
        dailyFees,
        dailyUserFees,
        dailyRevenue: dailyProtocolRevenue,
        dailyProtocolRevenue,
        dailySupplySideRevenue,
        dailyVolume,
    };
};

const methodology = {
    Fees: "Users pay between 0.01% and 0.1% fees on each swap.",
    UserFees: "Users pay between 0.01% and 0.1% fees on each swap.",
    Revenue: "The share of each swap fee kept by the protocol, allocated to the Nabla DAO Treasury.",
    ProtocolRevenue: "The share of each swap fee kept by the protocol, allocated to the Nabla DAO Treasury.",
    SupplySideRevenue: "The rest of each swap fee, paid to the liquidity providers of the swap pool and to the depositors backstopping it.",
    Volume: "Swap Volume on Nabla AMM.",
};

const breakdownMethodology = {
    Fees: {
        [METRIC.SWAP_FEES]: "Total fee charged on each swap, before it is split between liquidity providers, the backstop pool and the treasury.",
    },
    UserFees: {
        [METRIC.SWAP_FEES]: "Total fee charged on each swap.",
    },
    Revenue: {
        [METRIC.PROTOCOL_FEES]: "The protocol's share of each swap fee.",
    },
    ProtocolRevenue: {
        [METRIC.PROTOCOL_FEES]: "The protocol's share of each swap fee, allocated to the Nabla DAO Treasury.",
    },
    SupplySideRevenue: {
        'Swap Fees To LPs': "The share of each swap fee paid to the liquidity providers of the swap pool.",
        'Swap Fees To Backstop Depositors': "The share of each swap fee paid to depositors in the backstop pool that covers the swap pool.",
    },
};

export default {
    version: 2,
    pullHourly: true,
    methodology,
    breakdownMethodology,
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch,
            start: "2024-08-15",
        },
        [CHAIN.BASE]: {
            fetch,
            start: "2024-09-12",
        },
        [CHAIN.BERACHAIN]: {
            fetch,
            start: "2025-05-14",
        },
        [CHAIN.HYPERLIQUID]: {
            fetch,
            start: "2025-11-19",
        },
        [CHAIN.MONAD]: {
            fetch,
            start: "2025-11-24",
        },
    },
} as Adapter;
