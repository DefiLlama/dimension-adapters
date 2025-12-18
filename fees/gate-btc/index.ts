
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import coreAssets from "../../helpers/coreAssets.json";
import { ChainApi } from "@defillama/sdk";
import { queryAllium } from "../../helpers/allium"


const gtBTC = '0xc2d09CF86b9ff43Cb29EF8ddCa57A4Eb4410D5f3'
const gtBTCSolana = 'gtBTCGWvSRYYoZpU9UZj6i3eUGUpgksXzzsbHk2K9So'
const wbtc = coreAssets.ethereum.WBTC
const gtBTCDecimals = 1e8
const exchangeRateDecimals = 1e6
const exchangeRateUpdatedAbi = 'event ExchangeRateUpdated(uint256 oldRate, uint256 newRate, address indexed updater)'

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    let growthRate = 0
    const evmSupplies = await Promise.all([
        options.toApi.call({ target: gtBTC, abi: "uint256:totalSupply"}),
        new ChainApi({ chain: CHAIN.BSC, timestamp: options.fromTimestamp}).call({ target: gtBTC, abi: "uint256:totalSupply"}),
        new ChainApi({ chain: CHAIN.BASE, timestamp: options.fromTimestamp}).call({ target: gtBTC, abi: "uint256:totalSupply"})
    ])
    const solanaQuery =`
        SELECT amount AS supply
        FROM solana.raw.spl_token_total_supply
        WHERE mint = '${gtBTCSolana}'
        AND snapshot_block_timestamp <= TO_TIMESTAMP_NTZ('${options.fromTimestamp}')
        ORDER BY snapshot_block_timestamp DESC LIMIT 1
    `;
    const solanaSupply = await queryAllium(solanaQuery)
    const gtBTCSupply = (evmSupplies.reduce((total, value) => total + Number(value), 0) / gtBTCDecimals) + Number(solanaSupply[0].amount)
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

const methodology= {
    Fees: "Rewards generated from staking",
    SupplySideRevenue: "The staking rewards are redistributed to gtBTC",
    Revenue: "No Revenue",
  }

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.ETHEREUM],
    start: '2025-08-01',
    methodology,
}

export default adapter;
