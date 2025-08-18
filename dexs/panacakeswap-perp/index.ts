
// https://api.dodoex.io/dodo-contract/list
const config = {
  arbitrum: { contract: '0xb3879e95a4b8e3ee570c232b19d520821f540e48', },
  bsc: { contract: '0x1b6f2d3844c6ae7d56ceb3c3643b9060ba28feb0', },
  //op_bnb: { contract: '0x5A5454A6030FB50ceb3eb78977D140198A27be5e' },
  base: {contract: '0x9D93e5B2364070bC9837e91833F162430246DD57' },
}

import { ChainBlocks, FetchOptions } from "../../adapters/types";

const abis = {
  "OpenMarketTrade": "event OpenMarketTrade(address indexed user, bytes32 indexed tradeHash, (address user, uint32 userOpenTradeIndex, uint64 entryPrice, address pairBase, address tokenIn, uint96 margin, uint64 stopLoss, uint64 takeProfit, uint24 broker, bool isLong, uint96 openFee, int256 longAccFundingFeePerShare, uint96 executionFee, uint40 timestamp, uint80 qty, uint40 holdingFeeRate, uint256 openBlock) ot)",
}

const fetch = async (timestamp: number, _: ChainBlocks, { createBalances, getLogs, chain, api }: FetchOptions) => {
  const dailyVolume = createBalances()
  const target = config[chain].contract

  const openLogs = await getLogs({ target, eventAbi: abis.OpenMarketTrade, topics:['0xa858fcdefab65cbd1997932d8ac8aa1a9a8c46c90b20947575525d9a2a437f8c'], skipCacheRead: true})
  let tokens = new Set()
  openLogs.forEach(({ ot }: any) => {
    tokens.add(ot.tokenIn.toLowerCase())
  })
  const tokensArray = Array.from(tokens)
  const decimals = await api.multiCall({  abi: 'erc20:decimals', calls: tokensArray as any})
  const decimalMapping: any = {}
  decimals.forEach((d: any, idx) => {
    decimalMapping[tokensArray[idx] as any] = d
  })

  openLogs.forEach(({ ot }: any) => {
    dailyVolume.addCGToken('tether', Number(ot.entryPrice) * Number(ot.qty) * 10 **(-18))
  })
  return { timestamp, dailyVolume }
};

const adapter: any = {
  adapter: {},
};

Object.keys(config).forEach((chain) => adapter.adapter[chain] = { fetch, start: '2023-08-01', });

export default adapter;
