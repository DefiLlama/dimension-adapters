import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { ethers } from "ethers";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";
import { Chain } from "@defillama/sdk/build/general";
import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";


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

    const rewardTokens: string[] = (await sdk.api2.abi.multiCall({
      permitFailure: true,
      abi: getRewardTokensABI,
      calls: allSy.map((sy: string) => ({
        target: sy,
      })),
      chain: chain,
    })).flat().map((a: string) => a.toLowerCase())

    const assetInfos = (await sdk.api2.abi.multiCall({
      permitFailure: true,
      abi: assetInfoABI,
      calls: allSy.map((sy: string) => ({
        target: sy,
      })),
      chain: chain,
    }))

    const allAssets: string[] = assetInfos.map((assetInfo: any) => assetInfo.assetAddress)

    const allSyType0: string[] = allSy.filter((_: any, i: number) => assetInfos[i].assetType === '0')
    const exchangeRatesType0 = (await sdk.api2.abi.multiCall({
      permitFailure: true,
      abi: exchangeRateABI,
      calls: allSyType0.map((sy: string) => ({
        target: sy,
      })),
      chain: chain,
    }))

    const rewardTokensSet = new Set(rewardTokens)
    const allRewardTokens: string[] = Array.from(rewardTokensSet)


    const prices = await getPrices(allRewardTokens.concat(allAssets).map((a) => `${chain}:${a.toLowerCase()}`).concat([STETH_ETHEREUM]), timestamp)

    function getPriceFor(token: string) {
      if (!prices[`${chain}:${token.toLowerCase()}`]) return null;
      return prices[`${chain}:${token.toLowerCase()}`];
    }

    const treasuryFilter = ethers.zeroPadValue(chainConfig[chain].treasury, 32)

    const allTransferEvents = (await Promise.all(allRewardTokens.concat(allSy).map((address: any) => sdk.getEventLogs({
      target: address,
      toBlock: endblock,
      fromBlock: startblock,
      chain: chain,
      topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', null as any, treasuryFilter],
    })))).flat()
      .map((e) => {
        return { address: e.address.toLowerCase(), args: interface_parser.parseLog(e)!.args, tx: e.transactionHash }
      });
    let totalFee = 0;

    for (let e of allTransferEvents) {
      if (allRewardTokens.includes(e.address)) {
        const tokenPrice = getPriceFor(e.address)
        if (tokenPrice) {
          totalFee += Number(e!.args.value) * tokenPrice.price / (10 ** tokenPrice.decimals)
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
          amount = Number(e!.args.value);
        } else {
          const idAsset0 = allSyType0.indexOf(e.address)
          amount = Number(e!.args.value) * exchangeRatesType0[idAsset0] / (10 ** 18)
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

const getRewardTokensABI = "address[]:getRewardTokens"

const assetInfoABI =  "function assetInfo() view returns (uint8 assetType, address assetAddress, uint8 assetDecimals)"

const exchangeRateABI = "uint256:exchangeRate"

export default adapter;
