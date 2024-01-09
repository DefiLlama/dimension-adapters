import * as sdk from "@defillama/sdk";
import { getPrices } from "../../utils/prices";
import { ethers } from "ethers";
import { CHAIN } from "../../helpers/chains";

const event_notify_reward = 'event NotifyReward(address indexed from,address indexed reward,uint256 indexed epoch,uint256 amount)';
const event_geuge_created = 'event GaugeCreated(address indexed poolFactory,address indexed votingRewardsFactory,address indexed gaugeFactory,address pool,address bribeVotingReward,address feeVotingReward,address gauge,address creator)'

const topic0_geuge_created = '0xef9f7d1ffff3b249c6b9bf2528499e935f7d96bb6d6ec4e7da504d1d3c6279e1';
const contract_interface = new ethers.Interface([
  event_notify_reward,
  event_geuge_created
]);

type TPrice = {
  [s: string]: {
    price: number;
    decimals: number
  };
}
interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}

interface IBribes {
  token: string;
  amount: number;
}


const gurar = '0x2073D8035bB2b0F2e85aAF5a8732C6f397F9ff9b';

const abis: any = {
  all: {
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
        },
        {
            "name": "_account",
            "type": "address"
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
                    "name": "stable",
                    "type": "bool"
                },
                {
                    "name": "total_supply",
                    "type": "uint256"
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
                    "name": "claimable0",
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
                    "name": "claimable1",
                    "type": "uint256"
                },
                {
                    "name": "gauge",
                    "type": "address"
                },
                {
                    "name": "gauge_total_supply",
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
                    "name": "account_balance",
                    "type": "uint256"
                },
                {
                    "name": "account_earned",
                    "type": "uint256"
                },
                {
                    "name": "account_staked",
                    "type": "uint256"
                },
                {
                    "name": "pool_fee",
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

export const fees_bribes = async (fromBlock: number, toBlock: number, timestamp: number): Promise<number> => {
  try {
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
    const bribeVotingReward: string[] = (await sdk.api2.abi.call({
      target: gurar,
      params: [1000, 0, '0x0000000000000000000000000000000000000000'],
      abi: abis.all,
      chain: CHAIN.BASE,
    })).map((e: any) => {
      return e.bribe;
    }).filter((e: string) => e !== ZERO_ADDRESS);
    const bribe_contracct = [...new Set(bribeVotingReward)];
    const logs: ILog[] = (await Promise.all(bribe_contracct.map((address: string) => sdk.getEventLogs({
      target: address,
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: CHAIN.BASE,
      topics: ['0x52977ea98a2220a03ee9ba5cb003ada08d394ea10155483c95dc2dc77a7eb24b']
    })))).flat() as ILog[];

    const logs_bribes = logs.map((e: ILog) => {
      const value = contract_interface.parseLog(e)
      return {
        token: value!.args.reward,
        amount: Number(value!.args.amount)
      } as IBribes
    })
    const coins = [...new Set(logs_bribes.map((e: IBribes) => `${CHAIN.BASE}:${e.token.toLowerCase()}`))]
    const coins_split: string[][] = [];
    for(let i = 0; i < coins.length; i+=100) {
      coins_split.push(coins.slice(i, i + 100))
    }
    const prices_result: any =  (await Promise.all(coins_split.map((a: string[]) =>  getPrices(a, timestamp)))).flat().flat().flat();
    const prices: TPrice = Object.assign({}, {});
    prices_result.map((a: any) => Object.assign(prices, a))
    const fees_bribes_usd = logs_bribes.map((e: IBribes) => {
      const price = prices[`${CHAIN.BASE}:${e.token.toLowerCase()}`]?.price || 0;
      const decimals = prices[`${CHAIN.BASE}:${e.token.toLowerCase()}`]?.decimals || 0;
      return (Number(e.amount) / 10 ** decimals) * price;
    }).reduce((a: number, b: number) => a+b, 0);
    return fees_bribes_usd;
  } catch (error) {
    console.error(error);
    throw error;
  }
}
