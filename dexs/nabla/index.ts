import { abi } from "@defillama/sdk/build/api";
import { Adapter, FetchV2, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


const config = {
    [CHAIN.ARBITRUM]: {
        registry: "0xcB94Eee869a2041F3B44da423F78134aFb6b676B",
    },
    // [CHAIN.BASE]: {
    //     registry: "0xcB94Eee869a2041F3B44da423F78134aFb6b676B",
    // }
}

const abis = {
    portal : {
        routers: "function getRouters() external view returns (address[] memory)",
        routerAssets: "function getRouterAssets(address router) external view returns (address[] memory)"
    },
    router: {
        poolByAsset: "function poolByAsset(address asset) external view returns (address)",
    },
    swapPool: {
        chargedSwapFeesEvent: 'event ChargedSwapFees(uint256 lpFees, uint256 backstopFees, uint256 protocolFees)'
    }
}

const methodology = {
    UserFees: "User pays between 0.01% and 0.1% fees on each swap.",
    ProtocolRevenue: "Currently no fees are taken by the protocl.",
    // SupplySideRevenue: "LPs receive 0.17% of the fees.",
    // HoldersRevenue: "0.0575% is used to facilitate CAKE buyback and burn.",
    // Revenue: "All revenue generated comes from user fees.",
    Fees: "All fees comes from the user."
}
export default {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: (async ({ getLogs, createBalances, api}) => {
        const {registry} = config[CHAIN.ARBITRUM];
        const routers = await api.call({abi: abis.portal.routers, target: registry, block: "latest"})
        const assetsResponse = await api.multiCall({
            abi: abis.portal.routerAssets,
            calls: routers.map((router: any) => ({
                target: registry,
                params: router
            }))
        });
        const assets = assetsResponse.reduce((acc, a: any[]) => [...acc,...a], [])
        const poolsCalls: any[] = [];
        routers.forEach((router: any, i) => {
            assetsResponse[i].forEach((asset: any) => {
                poolsCalls.push({
                    target: router,
                    params: asset
                })
            });
        });
        const pools = await api.multiCall({
            abi: abis.router.poolByAsset,
            calls: poolsCalls
        });
        
      
 
        const dailyFees = createBalances()
        const dailyUserFees = createBalances()
        const dailyProtocolRevenue = createBalances()
        const logs = await Promise.all(pools.map(pool => getLogs({
                target: pool,
                eventAbi: abis.swapPool.chargedSwapFeesEvent
            })
        ));
        logs.forEach((log, i) => {
            log.map((e: any) => {
                dailyFees.add(assets[i], e.lpFees+e.backstopFees+e.protocolFees) 
                dailyUserFees.add(assets[i], e.lpFees+e.backstopFees+e.protocolFees) 
                dailyProtocolRevenue.add(assets[i], e.protocolFees) 
            })
        })
        return { dailyFees, dailyProtocolRevenue, }
      }) as FetchV2,
      meta: {
        methodology 
      },
      start: 1723690984,
    },
    [CHAIN.BASE]: {
        fetch: (async ({ getLogs, createBalances}) => {

            const pools = ["0xa83a20F4dCaB1a63a9118E9E432932c8BEB39b85", "0x123456C6C27bb57013F4b943A0f032a0ab9c12eB"];
            const assets = ["0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", "0x4200000000000000000000000000000000000006"];
            
            const dailyFees = createBalances()
            const dailyRevenue = createBalances()
            const logs = await Promise.all(pools.map(pool => getLogs({
                    target: pool,
                    eventAbi: abis.swapPool.chargedSwapFeesEvent
                })
            ));
            logs.forEach((log, i) => {
                log.map((e: any) => {
                    dailyFees.add(assets[i], e.lpFees+e.backstopFees+e.protocolFees) 
                    dailyRevenue.add(assets[i], e.protocolFees) 
                })
            })
            return { dailyFees, dailyRevenue, }
        }) as FetchV2,
        start: 1726157219,
        meta: {
            methodology 
        }
      },
  },
  version: 2,
} as Adapter