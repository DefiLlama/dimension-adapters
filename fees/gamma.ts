import { Chain } from "@defillama/sdk/build/general"
import { FetchResultFees, SimpleAdapter } from "../adapters/types"
import { getBlock } from "../helpers/getBlock"
import * as sdk from "@defillama/sdk";
import { CHAIN } from "../helpers/chains";
import { getPrices } from "../utils/prices";
import { queryFlipside } from "../helpers/flipsidecrypto";

const abis: any = {
  counter: {
    "inputs": [],
    "name": "counter",
    "outputs": [
        {
            "internalType": "int256",
            "name": "",
            "type": "int256"
        }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  hypeByIndex: {
    "inputs": [
        {
            "internalType": "uint256",
            "name": "index",
            "type": "uint256"
        }
    ],
    "name": "hypeByIndex",
    "outputs": [
        {
            "internalType": "address",
            "name": "",
            "type": "address"
        },
        {
            "internalType": "uint256",
            "name": "",
            "type": "uint256"
        }
    ],
    "stateMutability": "view",
    "type": "function"
  }
}
interface IFeesAmount {
  fees: number;
  amount0: number;
  amount1: number;
}
interface IFees {
  fees: number;
  rev: number;
}
interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}

interface IReward {
  user: string;
  rewardToken: string;
  amount: number;
}

type TAddress = {
  [s: Chain | string]: string;
}

const registy_address_zybswap: TAddress = {
  [CHAIN.ARBITRUM]: '0x37595FCaF29E4fBAc0f7C1863E3dF2Fe6e2247e9'
}

const registy_address_quiswap: TAddress = {
  [CHAIN.POLYGON]: '0xAeC731F69Fa39aD84c7749E913e3bC227427Adfd',
  [CHAIN.POLYGON_ZKEVM]: '0xD08B593eb3460B7aa5Ce76fFB0A3c5c938fd89b8'
}

const registy_address: TAddress = {
  [CHAIN.ETHEREUM]: '0x31CcDb5bd6322483bebD0787e1DABd1Bf1f14946',
  [CHAIN.ARBITRUM]: '0x66cd859053c458688044d816117d5bdf42a56813',
  [CHAIN.POLYGON]: '0x0Ac4C7b794f3D7e7bF1093A4f179bA792CF15055',
  [CHAIN.OPTIMISM]: '0xF5BFA20F4A77933fEE0C7bB7F39E7642A070d599',
  [CHAIN.BSC]: '0xd4bcFC023736Db5617E5638748E127581d5929bd',
  [CHAIN.CELO]: '0x0F548d7AD1A0CB30D1872b8C18894484d76e1569'
}

const topic0_burn = '0x4606b8a47eb284e8e80929101ece6ab5fe8d4f8735acc56bd0c92ca872f2cfe7';

const PAIR_TOKEN_ABI = (token: string): object => {
  return {
    "constant": true,
    "inputs": [],
    "name": token,
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
};

const fetchFees = (chain: Chain, address: TAddress) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp
    try {
      const counter = (await sdk.api2.abi.call({
        target: address[chain],
        chain: chain,
        abi: abis.counter,
        params: [],
      }));
      const poolsRes = (await sdk.api2.abi.multiCall({
        abi: abis.hypeByIndex,
        calls: Array.from(Array(Number(counter)).keys()).map((i) => ({
          target: address[chain],
          params: i,
        })),
        chain: chain
      }));
      const pools = poolsRes.map((a: any) => a[0])

      const [underlyingToken0, underlyingToken1] = await Promise.all(
        ['token0', 'token1'].map((method) =>
          sdk.api2.abi.multiCall({
            abi: PAIR_TOKEN_ABI(method),
            calls: pools.map((address: string) => ({
              target: address,
            })),
            chain: chain,
            permitFailure: true,
          })
        )
      );
      const tokens0 = underlyingToken0;
      const tokens1 = underlyingToken1;

      const rawCoins = [...tokens0, ...tokens1].map((e: string) => `${chain}:${e}`);
      const coins = [...new Set(rawCoins)]
      const prices = await getPrices(coins, timestamp);
      const fromBlock = (await getBlock(fromTimestamp, chain, {}));
      const toBlock = (await getBlock(toTimestamp, chain, {}));
      const logs: ILog[][] = (await Promise.all(pools.map((address: string) => sdk.getEventLogs({
        target: address,
        toBlock: toBlock,
        fromBlock: fromBlock,
        chain: chain,
        topics: [topic0_burn]
      })))) as any
      const untrackVolumes: IFees[] = pools.map((_: string, index: number) => {
          const token0Decimals = prices[`${chain}:${tokens0[index]}`]?.decimals || 0
          const token1Decimals = prices[`${chain}:${tokens1[index]}`]?.decimals || 0
          const log: IFeesAmount[] = logs[index]
            .map((e: ILog) => { return { ...e } })
            .map((p: ILog) => {
              const amount0 = Number('0x' + p.data.replace('0x', '').slice(64, 128)) / 10 ** token0Decimals;
              const amount1 = Number('0x' + p.data.replace('0x', '').slice(128, 192)) / 10 ** token1Decimals
              const fees = Number('0x' + p.data.replace('0x', '').slice(0, 64))
              return {
                amount0: amount0,
                amount1: amount1,
                fees
              } as IFeesAmount
            });

            const token0Price = (prices[`${chain}:${tokens0[index]}`]?.price || 0);
            const token1Price = (prices[`${chain}:${tokens1[index]}`]?.price || 0);
          const amount0 = log
            .reduce((a: number, b: IFeesAmount) => Number(b.amount0) + a, 0)  * token0Price;
            const amount1 = log
            .reduce((a: number, b: IFeesAmount) => Number(b.amount1) + a, 0)  * token1Price;
            const revAmount0 = log
            .reduce((a: number, b: IFeesAmount) => (Number(b.amount0)*(1/b.fees)) + a, 0)  * token0Price;
            const revAmount1 = log
            .reduce((a: number, b: IFeesAmount) => (Number(b.amount1)*(1/b.fees)) + a, 0)  * token1Price;
          return { fees: (amount0+amount1), rev: (revAmount0+revAmount1) }
        });
        const dailyFees = untrackVolumes.reduce((a: number, b: IFees) => a + b.fees, 0);
        const dailyRevenue = untrackVolumes.reduce((a: number, b: IFees) => a + b.rev, 0);
      return {
        timestamp,
        dailyFees: `${dailyFees}`,
        dailyRevenue: `${dailyRevenue}`,
        dailySupplySideRevenue: `${dailyFees-dailyRevenue}`
      }
    } catch(error) {
      console.error(error);
      throw error;
    }
  }
}

const fetchBSC = async (timestamp: number) => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  try {
    const startblock = (await getBlock(fromTimestamp, CHAIN.BSC, {}));
    const endblock = (await getBlock(toTimestamp, CHAIN.BSC, {}));
    const query = `
      select
        *
      from
        bsc.core.fact_event_logs
      WHERE
        BLOCK_NUMBER  > 28305604
        and topics[0] = '0x540798df468d7b23d11f156fdb954cb19ad414d150722a7b6d55ba369dea792e'
        and topics[1] = '0x0000000000000000000000000f40a22e8c2ae737f12007cb88e8ef0ff3109483'
        and BLOCK_NUMBER > ${startblock} AND BLOCK_NUMBER < ${endblock}
    `
    const value: any[] = (await queryFlipside(query, 260))
    const logs: IReward[] = value.map((a: any) => {
      return {
        user: a[8][0],
        rewardToken: '0x'+a[8][2].slice(26, 66),
        amount: a[9]
      }
    })
    const rawCoins = logs.filter((e: IReward) => e.rewardToken).map((e: IReward) => `${CHAIN.BSC}:${e.rewardToken.toLowerCase()}`);
    const coins = [...new Set(rawCoins)]
    const prices = await getPrices(coins, timestamp);
    const dailyFees = logs.map((a: IReward) => {
      const price = prices[`${CHAIN.BSC}:${a.rewardToken.toLowerCase()}`]?.price || 0;
      const decimals = prices[`${CHAIN.BSC}:${a.rewardToken.toLowerCase()}`]?.decimals || 0;
      return (Number(a.amount) / 10 ** decimals) * price;
    }).reduce((a: number, b: number) => a + b, 0);
    const dailyRevenue  = dailyFees;
    return {
      dailyFees: `${dailyFees}`,
      dailyRevenue: `${dailyRevenue}`,
      dailySupplySideRevenue: `${dailyRevenue}`,
      timestamp
    }
  } catch (error) {
    console.error(error);
    throw error;
  }

}


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees(CHAIN.ETHEREUM, registy_address),
      start: async () => 1682121600,
    },
    [CHAIN.ARBITRUM]: {
    fetch: async (timestamp: number) => {
        const fees1 = await fetchFees(CHAIN.ARBITRUM, registy_address)(timestamp);
        const fees2 = await fetchFees(CHAIN.ARBITRUM, registy_address_zybswap)(timestamp);
        return {
          dailyFees: `${Number(fees1.dailyFees) + (Number(fees2.dailyFees))}`,
          dailyRevenue: `${Number(fees1.dailyRevenue) + Number(fees2.dailyRevenue)}`,
          dailySupplySideRevenue: `${Number(fees1.dailySupplySideRevenue) + (Number(fees2.dailySupplySideRevenue))}`,
          timestamp
        }
    },
      start: async () => 1682121600,
    },
    [CHAIN.POLYGON]: {
      fetch: async (timestamp: number) => {
        const fees1 = await fetchFees(CHAIN.POLYGON, registy_address)(timestamp);
        const fees2 = await fetchFees(CHAIN.POLYGON, registy_address_quiswap)(timestamp);
        return {
          dailyFees: `${Number(fees1.dailyFees) + (Number(fees2.dailyFees) / 2)}`,
          dailyRevenue: `${Number(fees1.dailyRevenue) + Number(fees2.dailyRevenue) / 2}`,
          dailySupplySideRevenue: `${Number(fees1.dailySupplySideRevenue) + (Number(fees2.dailySupplySideRevenue)/2)}`,
          timestamp
        }
      },
      start: async () => 1682121600,
    },
    [CHAIN.POLYGON_ZKEVM]: {
      fetch: async (timestamp: number) => {
        const fees1 = await fetchFees(CHAIN.POLYGON_ZKEVM, registy_address_quiswap)(timestamp);
        return {
          dailyFees: `${Number(fees1.dailyFees) / 2}`,
          dailyRevenue: `${Number(fees1.dailyRevenue) / 2}`,
          dailySupplySideRevenue: `${Number(fees1.dailySupplySideRevenue) / 2}`,
          timestamp
        }
      },
      start: async () => 1682121600,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetchFees(CHAIN.OPTIMISM, registy_address),
      start: async () => 1682121600,
    },
    [CHAIN.BSC]: {
      fetch: fetchBSC,
      start: async () => 1682121600,
    },
    [CHAIN.CELO]: {
      fetch: fetchFees(CHAIN.CELO, registy_address),
      start: async () => 1682121600,
    },
  }
};

export default adapter;
