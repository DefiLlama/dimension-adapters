import ADDRESSES from "../../helpers/coreAssets.json";
import { Adapter, FetchOptions, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const config = {
    [CHAIN.ARBITRUM]: {
        registry: "0xcB94Eee869a2041F3B44da423F78134aFb6b676B",
        backfill: {
            routers: ["0x7bcFc8b8ff61456ad7C5E2be8517D01df006d18d"],
            pools: [
                "0xE70292D6054B753214D555930e0F11CD7206Efeb", // ARB
                "0x058a0875DB2168AF97bbf01043C3e8F751cCd9A8", // USDC
                "0xcC5544C63392952B6f94a695f8f9e153F4284A87", // USDT
                "0x411eF79fE9Df8Ba82A09c7e93FdE85AF5732BF12", // WBTC
                "0x272dF896f4D0c97F65e787f861bb6e882776a155", // WETH
            ],
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
            pools: [
                "0xa83a20F4dCaB1a63a9118E9E432932c8BEB39b85", // CBBTC
                "0x123456C6C27bb57013F4b943A0f032a0ab9c12eB", // WETH
                "0xdd8f26dea84b13600039747b59797E615767Dab0", // DEGEN
            ],
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
            pools: [
                "0xBa8cC2Ac11CbB65f542FF59A3af5655940fB3282", // WETH
                "0x896BDED4b4A89C1104587dd045C1B441110B8B5f", // WBTC
                "0xE971445787DCB0BB577610126287DED493DDDAE7", // USDC
            ],
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
            routers: ["0xe62b7C96F9b804742d2Cbd57613F19Bda82D426F"],
            pools: [
                "0x5C542cE2e3dC25B4EF197b79B239261AAE27b3Dd", // UETH
                "0xB5E4C3Ca3D1D804DA0c1808cF60ddED6FF3b65e5", // UBTC
                "0x8426d3de775f77c7226f89eed6839b288639ad73", // USDT
                "0x5c235275583048BF99C14C1e20DE35Eeb23AADd7", // WHYPE
            ],
            assets: [
                "0xBe6727B535545C67d5cAa73dEa54865B92CF7907",
                "0x9FDBdA0A5e284c32744D2f17Ee5c74B284993463",
                ADDRESSES.hyperliquid.USDT0,
                ADDRESSES.hyperliquid.WHYPE,
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
        pools = config[chain].backfill.pools;
        assets = config[chain].backfill.assets;
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
            dailyFees.add(
                assets[i],
                log.lpFees + log.backstopFees + log.protocolFees
            );
            dailyUserFees.add(
                assets[i],
                log.lpFees + log.backstopFees + log.protocolFees
            );
            dailyProtocolRevenue.add(assets[i], log.protocolFees);
        });
    });

    return {
        dailyFees,
        dailyUserFees,
        dailyRevenue: dailyProtocolRevenue,
        dailyProtocolRevenue,
        dailyVolume,
    };
};

const methodology = {
    Fees: "Users pay between 0.01% and 0.1% fees on each swap.",
    UserFees: "Users pay between 0.01% and 0.1% fees on each swap.",
    Revenue: "Protocol fees will be allocated to the Nabla DAO Treasury.",
    ProtocolRevenue: "Protocol fees will be allocated to the Nabla DAO Treasury.",
    Volume: "Swap Volume on Nabla AMM.",
};

export default {
    version: 2,
    methodology,
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
    },
} as Adapter;
