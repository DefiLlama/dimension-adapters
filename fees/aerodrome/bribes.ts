import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

const event_notify_reward = 'event NotifyReward(address indexed from,address indexed reward,uint256 indexed epoch,uint256 amount)';

const gurar = '0x066D31221152f1f483DA474d1Ce47a4F50433e22';

const abis: any = {
  "all": {
    "stateMutability": "view",
    "type": "function",
    "name": "all",
    "inputs": [
        {
            "name": "_limit",
            "type": "uint256"
        },
        {
            "name": "_offset",
            "type": "uint256"
        }
    ],
    "outputs": [
        {
            "name": "",
            "type": "tuple[]",
            "components": [
                {
                    "name": "lp",
                    "type": "address"
                },
                {
                    "name": "symbol",
                    "type": "string"
                },
                {
                    "name": "decimals",
                    "type": "uint8"
                },
                {
                    "name": "liquidity",
                    "type": "uint256"
                },
                {
                    "name": "type",
                    "type": "int24"
                },
                {
                    "name": "tick",
                    "type": "int24"
                },
                {
                    "name": "sqrt_ratio",
                    "type": "uint160"
                },
                {
                    "name": "token0",
                    "type": "address"
                },
                {
                    "name": "reserve0",
                    "type": "uint256"
                },
                {
                    "name": "staked0",
                    "type": "uint256"
                },
                {
                    "name": "token1",
                    "type": "address"
                },
                {
                    "name": "reserve1",
                    "type": "uint256"
                },
                {
                    "name": "staked1",
                    "type": "uint256"
                },
                {
                    "name": "gauge",
                    "type": "address"
                },
                {
                    "name": "gauge_liquidity",
                    "type": "uint256"
                },
                {
                    "name": "gauge_alive",
                    "type": "bool"
                },
                {
                    "name": "fee",
                    "type": "address"
                },
                {
                    "name": "bribe",
                    "type": "address"
                },
                {
                    "name": "factory",
                    "type": "address"
                },
                {
                    "name": "emissions",
                    "type": "uint256"
                },
                {
                    "name": "emissions_token",
                    "type": "address"
                },
                {
                    "name": "pool_fee",
                    "type": "uint256"
                },
                {
                    "name": "unstaked_fee",
                    "type": "uint256"
                },
                {
                    "name": "token0_fees",
                    "type": "uint256"
                },
                {
                    "name": "token1_fees",
                    "type": "uint256"
                }
            ]
        }
    ]
}
}

export const fees_bribes = async ({ getLogs, api, createBalances }: FetchOptions)=> {
  const dailyFees = createBalances()
  const bribeVotingReward: string[] = (await Promise.all([0, 400, 800].map(async (offset) => api.call({
    target: gurar,
    abi: abis.all,
    params: [400, offset],
    chain: CHAIN.BASE
  })))).flat().map((e: any) => e.bribe)
  const bribe_contracct = [...new Set(bribeVotingReward)];
  const logs = await getLogs({
    targets: bribe_contracct,
    eventAbi: event_notify_reward,
  })
  logs.map((e: any) => {
    dailyFees.add(e.reward, e.amount)
  })
  return dailyFees;
}
