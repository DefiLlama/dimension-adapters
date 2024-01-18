import { Chain } from "@defillama/sdk/build/general"
import { FetchResultFees, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { ethers } from "ethers";
import { getPrices } from "../utils/prices";

const abis: any[] = [
  {
    "anonymous": false,
    "inputs": [
        {
            "indexed": false,
            "internalType": "uint256",
            "name": "amount",
            "type": "uint256"
        },
        {
            "indexed": false,
            "internalType": "uint256",
            "name": "originChainId",
            "type": "uint256"
        },
        {
            "indexed": true,
            "internalType": "uint256",
            "name": "destinationChainId",
            "type": "uint256"
        },
        {
            "indexed": false,
            "internalType": "int64",
            "name": "relayerFeePct",
            "type": "int64"
        },
        {
            "indexed": true,
            "internalType": "uint32",
            "name": "depositId",
            "type": "uint32"
        },
        {
            "indexed": false,
            "internalType": "uint32",
            "name": "quoteTimestamp",
            "type": "uint32"
        },
        {
            "indexed": false,
            "internalType": "address",
            "name": "originToken",
            "type": "address"
        },
        {
            "indexed": false,
            "internalType": "address",
            "name": "recipient",
            "type": "address"
        },
        {
            "indexed": true,
            "internalType": "address",
            "name": "depositor",
            "type": "address"
        },
        {
            "indexed": false,
            "internalType": "bytes",
            "name": "message",
            "type": "bytes"
        }
    ],
    "name": "FundsDeposited",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
        {
            "indexed": false,
            "internalType": "uint256",
            "name": "amount",
            "type": "uint256"
        },
        {
            "indexed": false,
            "internalType": "uint256",
            "name": "totalFilledAmount",
            "type": "uint256"
        },
        {
            "indexed": false,
            "internalType": "uint256",
            "name": "fillAmount",
            "type": "uint256"
        },
        {
            "indexed": false,
            "internalType": "uint256",
            "name": "repaymentChainId",
            "type": "uint256"
        },
        {
            "indexed": true,
            "internalType": "uint256",
            "name": "originChainId",
            "type": "uint256"
        },
        {
            "indexed": false,
            "internalType": "uint256",
            "name": "destinationChainId",
            "type": "uint256"
        },
        {
            "indexed": false,
            "internalType": "int64",
            "name": "relayerFeePct",
            "type": "int64"
        },
        {
            "indexed": false,
            "internalType": "int64",
            "name": "realizedLpFeePct",
            "type": "int64"
        },
        {
            "indexed": true,
            "internalType": "uint32",
            "name": "depositId",
            "type": "uint32"
        },
        {
            "indexed": false,
            "internalType": "address",
            "name": "destinationToken",
            "type": "address"
        },
        {
            "indexed": false,
            "internalType": "address",
            "name": "relayer",
            "type": "address"
        },
        {
            "indexed": true,
            "internalType": "address",
            "name": "depositor",
            "type": "address"
        },
        {
            "indexed": false,
            "internalType": "address",
            "name": "recipient",
            "type": "address"
        },
        {
            "indexed": false,
            "internalType": "bytes",
            "name": "message",
            "type": "bytes"
        },
        {
            "components": [
                {
                    "internalType": "address",
                    "name": "recipient",
                    "type": "address"
                },
                {
                    "internalType": "bytes",
                    "name": "message",
                    "type": "bytes"
                },
                {
                    "internalType": "int64",
                    "name": "relayerFeePct",
                    "type": "int64"
                },
                {
                    "internalType": "bool",
                    "name": "isSlowRelay",
                    "type": "bool"
                },
                {
                    "internalType": "int256",
                    "name": "payoutAdjustmentPct",
                    "type": "int256"
                }
            ],
            "indexed": false,
            "internalType": "struct SpokePool.RelayExecutionInfo",
            "name": "updatableRelayData",
            "type": "tuple"
        }
    ],
    "name": "FilledRelay",
    "type": "event"
}
]
const topic0_fund_disposit_v2 = '0xafc4df6845a4ab948b492800d3d8a25d538a102a2bc07cd01f1cfa097fddcff6';
const topic0_filled_replay_v2 = '0x8ab9dc6c19fe88e69bc70221b339c84332752fdd49591b7c51e66bae3947b73c';

const contract_interface = new ethers.Interface(abis);

type TAddress = {
  [key: string]: string;
}

interface IDataDispositFund {
  token: string;
  amount: number;
  lp_fee_pct: number;
}

interface IDataReplay {
  token: string;
  amount: number;
  relay_fee_pct: number;
  lp_fee_pct: number;
}
const address: TAddress = {
  [CHAIN.ETHEREUM]: '0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5',
  [CHAIN.ARBITRUM]: '0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A',
  [CHAIN.OPTIMISM]: '0x6f26Bf09B1C792e3228e5467807a900A503c0281',
  [CHAIN.POLYGON]: '0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096'
}

const graph = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp

    const fromBlock = (await getBlock(fromTimestamp, chain, {}));
    const toBlock = (await getBlock(toTimestamp, chain, {}));

    const logs_fund_disposit: IDataDispositFund[] = (await sdk.getEventLogs({
      target: address[chain],
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: chain,
      topics: [topic0_fund_disposit_v2]
    })).map((a: any) => contract_interface.parseLog(a))
      .filter((a: any) => Number(a!.args.destinationChainId) === 288)
      .map((a: any) => {
        return {
          token: a!.args.originToken.toLowerCase(),
          amount: Number(a!.args.amount),
          lp_fee_pct: Number(a!.args.relayerFeePct) / 10 ** 18
        } as IDataDispositFund
      });

    const logs_filled_replay: IDataReplay[] = (await sdk.getEventLogs({
      target: address[chain],
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: chain,
      topics: [topic0_filled_replay_v2]
    })).map((a: any) => {
      const data = a.data.replace('0x','');
      const destinationToken = data.slice(448, 512) // 7
      const token = '0x' + destinationToken.slice(24, address.length)
      const amount = data.slice(0, 64)
      const realizedLpFeePct = data.slice(384, 448) // 6
      const appliedRelayerFeePct = data.slice(320, 384) // 5
      return {
        token: token.toLowerCase(),
        amount: Number('0x'+amount),
        relay_fee_pct: Number('0x'+realizedLpFeePct) / 10 ** 18,
        lp_fee_pct: Number('0x'+appliedRelayerFeePct) / 10 ** 18,
      } as IDataReplay
    });

    const tokens = [...new Set([
      ...logs_fund_disposit.map((a: IDataDispositFund) => `${chain}:${a.token}`),
      ...logs_filled_replay.map((a: IDataReplay) => `${chain}:${a.token}`)
    ])];

    const prices = (await getPrices(tokens, timestamp));

    const fees_fund_disposit = logs_fund_disposit.map((a: IDataDispositFund) => {
      const decimals = prices[`${chain}:${a.token}`].decimals;
      const price = prices[`${chain}:${a.token}`].price;
      const amount = ((a.amount * a.lp_fee_pct) / 10 ** decimals) * price;
      return amount;
    });

    const fees_relay = logs_filled_replay.map((a: IDataReplay) => {
      const decimals = prices[`${chain}:${a.token}`].decimals;
      const price = prices[`${chain}:${a.token}`].price;
      const amount = ((a.amount * (a.lp_fee_pct + a.relay_fee_pct)) / 10 ** decimals) * price;
      return amount;
    });
    const amount  = fees_fund_disposit
      .concat(fees_relay)
      .reduce((sum: number, amount: number) => sum + amount, 0)
    return {
      dailyFees: `${amount}`,
      dailySupplySideRevenue: `${amount}`,
      timestamp
    }
  }
}


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: graph(CHAIN.ETHEREUM),
      start: async () => 1682840443,
    },
    [CHAIN.ARBITRUM]: {
      fetch: graph(CHAIN.ARBITRUM),
      start: async () => 1682840443,
    },
    [CHAIN.OPTIMISM]: {
      fetch: graph(CHAIN.OPTIMISM),
      start: async () => 1682840443,
    },
    [CHAIN.POLYGON]: {
      fetch: graph(CHAIN.POLYGON),
      start: async () => 1682840443,
    },
  }
};

export default adapter;
