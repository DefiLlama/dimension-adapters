import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { ethers } from "ethers";
import { Log } from "@ethersproject/abstract-provider"
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";
import { Chain } from "@defillama/sdk/build/general";
import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import { Address } from "@defillama/sdk/build/types";


type IConfig = {
  [s: string | Chain]: {
    endpoint: string;
    treasury: string;
  };
}

const gqlQuery = gql`
  {
    assets(first: 1000, where: {
      type_in: ["SY"]
    }) {
      id,
      type
    }
  }
`

const STETH_ETHEREUM = "ethereum:0xae7ab96520de3a18e5e111b5eaab095312d7fe84"
const SY_WSTETH_ARBITRUM = "0x80c12d5b6cc494632bf11b03f09436c8b61cc5df";
const SY_WSTETH_OP = "0x96a528f4414ac3ccd21342996c93f2ecdec24286"

const chainConfig: IConfig = {
  [CHAIN.ETHEREUM]: {
    endpoint: 'https://api.thegraph.com/subgraphs/name/pendle-finance/core-mainnet-23-dec-18',
    treasury: '0x8270400d528c34e1596ef367eedec99080a1b592'
  },
  [CHAIN.ARBITRUM]: {
    endpoint: 'https://api.thegraph.com/subgraphs/name/pendle-finance/core-arbitrum-23-dec-18',
    treasury: '0xcbcb48e22622a3778b6f14c2f5d258ba026b05e6',
  },
  [CHAIN.BSC]: {
    endpoint: 'https://api.thegraph.com/subgraphs/name/pendle-finance/core-bsc-23-dec-18',
    treasury: '0xd77e9062c6df3f2d1cb5bf45855fa1e7712a059e',
  },
  [CHAIN.OPTIMISM]: {
    endpoint: 'https://api.thegraph.com/subgraphs/name/pendle-finance/core-optimism-23-dec-18',
    treasury: '0xe972d450ec5b11b99d97760422e0e054afbc8042',
  }
}

const interface_parser = new ethers.Interface([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp
    const startblock = (await getBlock(fromTimestamp, chain, {}));
    const endblock = (await getBlock(toTimestamp, chain, {}));
    const allSy: string[] = (await request(chainConfig[chain].endpoint, gqlQuery)).assets.filter((token: any) => token.type === 'SY').map((token: any) => token.id.toLowerCase())

    const rewardTokens: string[] = (await sdk.api.abi.multiCall({
      permitFailure: true,
      abi: getRewardTokensABI,
      calls: allSy.map((sy: string) => ({
        target: sy,
      })),
      chain: chain,
    })).output.map((output: any) => output.output).flat().map((a: string) => a.toLowerCase())

    const assetInfos = (await sdk.api.abi.multiCall({
      permitFailure: true,
      abi: assetInfoABI,
      calls: allSy.map((sy: string) => ({
        target: sy,
      })),
      chain: chain,
    })).output.map((output: any) => output.output)

    const allAssets: string[] = assetInfos.map((assetInfo: any) => assetInfo.assetAddress)

    const allSyType0: string[] = allSy.filter((_: any, i: number) => assetInfos[i].assetType === '0')
    const exchangeRatesType0 = (await sdk.api.abi.multiCall({
      permitFailure: true,
      abi: exchangeRateABI,
      calls: allSyType0.map((sy: string) => ({
        target: sy,
      })),
      chain: chain,
    })).output.map((output: any) => output.output)

    const rewardTokensSet = new Set(rewardTokens)
    const allRewardTokens: string[] = Array.from(rewardTokensSet)


    const prices = await getPrices(allRewardTokens.concat(allAssets).map((a) => `${chain}:${a.toLowerCase()}`).concat([STETH_ETHEREUM]), timestamp)

    function getPriceFor(token: string) {
      if (!prices[`${chain}:${token.toLowerCase()}`]) return null;
      return prices[`${chain}:${token.toLowerCase()}`];
    }

    const treasuryFilter = ethers.zeroPadValue(chainConfig[chain].treasury, 32)

    const allTransferEvents = (await Promise.all(allRewardTokens.concat(allSy).map((address: any) => getLogs({
      target: address,
      topic: '',
      toBlock: endblock,
      fromBlock: startblock,
      keys: [],
      chain: chain,
      topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', null, treasuryFilter]
    }))))
      .map((p: any) => p)
      .map((a: any) => a.output).flat()
      .map((e) => {
        return { address: e.address.toLowerCase(), args: interface_parser.parseLog(e)!.args, tx: e.transactionHash }
      });
    let totalFee = 0;

    for (let e of allTransferEvents) {
      if (allRewardTokens.includes(e.address)) {
        const tokenPrice = getPriceFor(e.address)
        if (tokenPrice) {
          totalFee += e.args.value * tokenPrice.price / (10 ** tokenPrice.decimals)
        }
      } else {
        const idAll = allSy.indexOf(e.address)
        if (idAll === -1) {
          continue;
        }
        const assetPrice = [SY_WSTETH_ARBITRUM, SY_WSTETH_OP].includes(e.address) ? prices[STETH_ETHEREUM] : getPriceFor(assetInfos[idAll].assetAddress)
        if (!assetPrice) {
          continue;
        }

        let amount;
        if (assetInfos[idAll].assetType === '1') {
          amount = e.args.value;
        } else {
          const idAsset0 = allSyType0.indexOf(e.address)
          amount = e.args.value * exchangeRatesType0[idAsset0] / (10 ** 18)
        }
        totalFee += amount * assetPrice.price / (10 ** assetInfos[idAll].assetDecimals);
      }
    }
    const dailyRevenue = totalFee * 0.3;
    const dailySupplySideRevenue = totalFee - dailyRevenue;
    return {
      dailyFees: `${totalFee}`,
      dailyRevenue: `${totalFee}`,
      dailyHoldersRevenue: `${dailyRevenue}`,
      dailySupplySideRevenue: `${dailySupplySideRevenue}`,
      timestamp
    }
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch(CHAIN.ETHEREUM),
      start: async () => 1686268800,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: async () => 1686268800,
    },
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC),
      start: async () => 1686268800,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: async () => 1691733600,
    }
  }
};


// SMALL INCOMPATIBILITY: On the old API we don't return ids but we should
export async function getLogs(params: {
  target: Address;
  topic: string;
  keys: string[]; // This is just used to select only part of the logs
  fromBlock: number;
  toBlock: number; // DefiPulse's implementation is buggy and doesn't take this into account
  topics: (string | null)[]; // This is an outdated part of DefiPulse's API which is still used in some old adapters
  chain?: Chain;
}) {
  if (params.toBlock === undefined || params.fromBlock === undefined) {
    throw new Error(
      "toBlock and fromBlock need to be defined in all calls to getLogs"
    );
  }
  const filter = {
    address: params.target,
    topics: params.topics,
    fromBlock: params.fromBlock,
    toBlock: params.toBlock // We don't replicate Defipulse's bug because the results end up being the same anyway and hopefully they'll eventually fix it
  };
  let logs: Log[] = [];
  let blockSpread = params.toBlock - params.fromBlock;
  let currentBlock = params.fromBlock;
  while (currentBlock < params.toBlock) {
    const nextBlock = Math.min(params.toBlock, currentBlock + blockSpread);
    try {
      const partLogs = await sdk.api.config.getProvider(params.chain).getLogs({
        ...filter,
        fromBlock: currentBlock,
        toBlock: nextBlock
      });
      logs = logs.concat(partLogs as unknown as Log[]);
      currentBlock = nextBlock;
    } catch (e) {
      if (blockSpread >= 2e3) {
        // We got too many results
        // We could chop it up into 2K block spreads as that is guaranteed to always return but then we'll have to make a lot of queries (easily >1000), so instead we'll keep dividing the block spread by two until we make it
        blockSpread = Math.floor(blockSpread / 2);
      } else {
        throw e;
      }
    }
  }
  if (params.keys.length > 0) {
    if (params.keys[0] !== "topics") {
      throw new Error("Unsupported");
    }
    return {
      output: logs.map((log) => log.topics)
    };
  }
  return {
    output: logs
  };
}

const getRewardTokensABI = {
  "inputs": [],
  "name": "getRewardTokens",
  "outputs": [
    {
      "internalType": "address[]",
      "name": "",
      "type": "address[]"
    }
  ],
  "stateMutability": "view",
  "type": "function"
};

const assetInfoABI = {
  "inputs": [],
  "name": "assetInfo",
  "outputs": [
    {
      "internalType": "enum IStandardizedYield.AssetType",
      "name": "assetType",
      "type": "uint8"
    },
    {
      "internalType": "address",
      "name": "assetAddress",
      "type": "address"
    },
    {
      "internalType": "uint8",
      "name": "assetDecimals",
      "type": "uint8"
    }
  ],
  "stateMutability": "view",
  "type": "function"
}

const exchangeRateABI = {
  "inputs": [],
  "name": "exchangeRate",
  "outputs": [
    {
      "internalType": "uint256",
      "name": "res",
      "type": "uint256"
    }
  ],
  "stateMutability": "view",
  "type": "function"
}

const decimalsABI = {
  "inputs": [],
  "name": "decimals",
  "outputs": [
    {
      "internalType": "uint8",
      "name": "",
      "type": "uint8"
    }
  ],
  "stateMutability": "view",
  "type": "function"
}


export default adapter;
