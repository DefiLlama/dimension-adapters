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

function addToBalances(balances: any, token: any, amount: any) {
    if (!balances[token]) {
        balances[token] = 0
    }
    balances[token] += amount
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
      start: 1723690984,
    },
    [CHAIN.BASE]: {
        fetch: (async ({ getLogs, createBalances}) => {

            const router = "0x791Fee7b66ABeF59630943194aF17B029c6F487B";
            const pools = ["0xa83a20F4dCaB1a63a9118E9E432932c8BEB39b85", "0x123456C6C27bb57013F4b943A0f032a0ab9c12eB"];
            const assets = ["0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", "0x4200000000000000000000000000000000000006"];
            
            const dailyVolume = createBalances()
            const volumeLogs = await getLogs({
                target: router,
                eventAbi: abis.router.swapEvent
            });
    
            volumeLogs.forEach((e, i) => {
                dailyVolume.add(e.tokenIn, e.amountIn)
            })

            const dailyFees = createBalances()
            const dailyUserFees = createBalances()
            const dailyRevenue = createBalances()
            const logs = await Promise.all(pools.map(pool => getLogs({
                    target: pool,
                    eventAbi: abis.swapPool.chargedSwapFeesEvent
                })
            ));
            logs.forEach((log, i) => {
                log.forEach((e: any) => {
                    dailyFees.add(assets[i], e.lpFees+e.backstopFees+e.protocolFees) 
                    dailyUserFees.add(assets[i], e.lpFees+e.backstopFees+e.protocolFees) 
                    dailyRevenue.add(assets[i], e.protocolFees) 
                })
            })
            return { dailyFees, dailyRevenue, dailyUserFees, dailyVolume }
        }) as FetchV2,
        start: 1726157219,
        meta: {
            methodology 
        }
      },
  },
  version: 2,
} as Adapter