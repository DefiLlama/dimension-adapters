import { abi } from "@defillama/sdk/build/api";
import { Adapter, FetchV2, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


const config = {
    [CHAIN.ARBITRUM]: {
        registry: "0xcB94Eee869a2041F3B44da423F78134aFb6b676B",
        backfill: {
            routers : ["0x7bcFc8b8ff61456ad7C5E2be8517D01df006d18d"],
            pools : [
                "0xE70292D6054B753214D555930e0F11CD7206Efeb", 
                "0x058a0875DB2168AF97bbf01043C3e8F751cCd9A8",
                "0xcC5544C63392952B6f94a695f8f9e153F4284A87",
                "0x411eF79fE9Df8Ba82A09c7e93FdE85AF5732BF12",
                "0x272dF896f4D0c97F65e787f861bb6e882776a155"
            ],
            assets : [
                "0x912ce59144191c1204e64559fe8253a0e49e6548",
                "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
                "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
                "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f",
                "0x82af49447d8a07e3bd95bd0d56f35241523fbab1"
            ],
        }
    },
    [CHAIN.BASE]: {
        registry: "0xd24d145f5E351de52934A7E1f8cF55b907E67fFF",
        backfill: {
            routers : ["0x791Fee7b66ABeF59630943194aF17B029c6F487B"],
            pools : ["0xa83a20F4dCaB1a63a9118E9E432932c8BEB39b85", "0x123456C6C27bb57013F4b943A0f032a0ab9c12eB"],
            assets : ["0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", "0x4200000000000000000000000000000000000006"],
        }
    }
}

const abis = {
    portal : {
        routers: "function getRouters() external view returns (address[] memory)",
        routerAssets: "function getRouterAssets(address router) external view returns (address[] memory)"
    },
    router: {
        poolByAsset: "function poolByAsset(address asset) external view returns (address)",
        swapEvent: "event Swap(address indexed,uint256,uint256 amountOut,address tokenIn,address tokenOut,address indexed to)",
    },
    swapPool: {
        chargedSwapFeesEvent: 'event ChargedSwapFees(uint256 lpFees, uint256 backstopFees, uint256 protocolFees)'
    }
}

const methodology = {
    UserFees: "User pays between 0.01% and 0.1% fees on each swap.",
    ProtocolRevenue: "Currently no fees are taken by the protocl.",
    Fees: "All fees comes from the user."
}

async function getAddresses(chain, api) {
    const {registry} = config[chain];
    let routers;
    let pools;
    let assets;
    try {
        routers = await api.call({abi: abis.portal.routers, target: registry, block: "latest"});
        const assetsResponse = await api.multiCall({
            abi: abis.portal.routerAssets,
            calls: routers.map((router: any) => ({
                target: registry,
                params: router
            }))
        });
        assets = assetsResponse.reduce((acc, a: any[]) => [...acc,...a], [])
        const poolsCalls: any[] = [];
        routers.forEach((router: any, i) => {
            assetsResponse[i].forEach((asset: any) => {
                poolsCalls.push({
                    target: router,
                    params: asset
                })
            });
        });
        pools = await api.multiCall({
            abi: abis.router.poolByAsset,
            calls: poolsCalls
        });

    } catch (e) {
        routers = config[chain].backfill.routers;
        pools = config[chain].backfill.pools;
        assets = config[chain].backfill.assets;
        
    }
    return {routers, pools, assets}
}

export default {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: (async ({ getLogs, createBalances, api}) => {
        const {routers, pools, assets} = await getAddresses(CHAIN.ARBITRUM, api)
        

        const dailyVolume = createBalances()
        const volumeLogs = await Promise.all(routers.map(router => getLogs({
                target: router,
                eventAbi: abis.router.swapEvent
            })
        ));

        volumeLogs.forEach((logs, i) => {
            logs.forEach((e: any) => {
                dailyVolume.add(e.tokenOut, e.amountOut)
            })
        })

        const dailyFees = createBalances()
        const dailyUserFees = createBalances()
        const dailyProtocolRevenue = createBalances()
        const logs = await Promise.all(pools.map(pool => getLogs({
                target: pool,
                eventAbi: abis.swapPool.chargedSwapFeesEvent
            })
        ));
        logs.forEach((log, i) => {
            log.forEach((e: any) => {
                dailyFees.add(assets[i], e.lpFees+e.backstopFees+e.protocolFees)
                dailyUserFees.add(assets[i], e.lpFees+e.backstopFees+e.protocolFees)
                dailyProtocolRevenue.add(assets[i], e.protocolFees)
            })
        })
        return { dailyFees, dailyProtocolRevenue, dailyUserFees, dailyVolume, }
      }) as FetchV2,
      meta: {
        methodology
      },
      start: '2024-08-15',
    },
    [CHAIN.BASE]: {
        fetch: (async ({ getLogs, createBalances, api}) => {

            const {routers, pools, assets} = await getAddresses(CHAIN.BASE, api)

            const dailyVolume = createBalances()
            const volumeLogs = await Promise.all(routers.map(router => getLogs({
                target: router,
                eventAbi: abis.router.swapEvent
              })
            ));

            volumeLogs.forEach((logs, i) => {
                logs.forEach((e: any) => {
                    dailyVolume.add(e.tokenOut, e.amountOut)
                })
            })

            const dailyFees = createBalances()
            const dailyUserFees = createBalances()
            const dailyProtocolRevenue = createBalances()
            const logs = await Promise.all(pools.map(pool => getLogs({
                target: pool,
                eventAbi: abis.swapPool.chargedSwapFeesEvent
            })
            ));
            logs.forEach((log, i) => {
                log.forEach((e: any) => {
                    dailyFees.add(assets[i], e.lpFees+e.backstopFees+e.protocolFees) 
                    dailyUserFees.add(assets[i], e.lpFees+e.backstopFees+e.protocolFees) 
                    dailyProtocolRevenue.add(assets[i], e.protocolFees) 

                })
            })
            return { dailyFees, dailyRevenue, dailyUserFees, dailyVolume }
        }) as FetchV2,
        start: '2024-09-12',
        meta: {
            methodology
        }
      },
  },
  version: 2,
} as Adapter
