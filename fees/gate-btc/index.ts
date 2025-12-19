
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import coreAssets from "../../helpers/coreAssets.json";
import { ChainApi } from "@defillama/sdk";

const gtBTC = '0xc2d09CF86b9ff43Cb29EF8ddCa57A4Eb4410D5f3'
const wbtc = coreAssets.ethereum.WBTC
const gtBTCDecimals = 1e8
const exchangeRateDecimals = 1e6
const exchangeRateUpdatedAbi = 'event ExchangeRateUpdated(uint256 oldRate, uint256 newRate, address indexed updater)'

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  let growthRate = 0
  const evmSupplies = await Promise.all([
    options.toApi.call({ target: gtBTC, abi: "uint256:totalSupply" }),
    new ChainApi({ chain: CHAIN.BSC, timestamp: options.fromTimestamp }).call({ target: gtBTC, abi: "uint256:totalSupply" }),
    new ChainApi({ chain: CHAIN.BASE, timestamp: options.fromTimestamp }).call({ target: gtBTC, abi: "uint256:totalSupply" })
  ])
  const gtBTCSupply = (evmSupplies.reduce((total, value) => total + Number(value), 0) / gtBTCDecimals)
  const exchangeRateLog = await options.getLogs({
    eventAbi: exchangeRateUpdatedAbi,
    target: gtBTC
  })
  exchangeRateLog.forEach(log => {
    growthRate = (Number(log.newRate) - Number(log.oldRate)) / exchangeRateDecimals
  })
  const fees = growthRate * gtBTCSupply
  dailyFees.add(wbtc, fees * gtBTCDecimals, METRIC.STAKING_REWARDS)

  return {
    dailyFees,
    dailyRevenue: 0,
    dailySupplySideRevenue: dailyFees
  }
}

const methodology = {
  Fees: "Rewards generated from staking",
  Revenue: "No Revenue",
  SupplySideRevenue: "The staking rewards are redistributed to gtBTC holders",
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2025-08-01',
  methodology,
}

export default adapter;
