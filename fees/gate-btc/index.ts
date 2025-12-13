
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import coreAssets from "../../helpers/coreAssets.json";
import { getPrices, getMcaps } from "@defillama/sdk/build/util/coins";


const gBTC = '0xc2d09CF86b9ff43Cb29EF8ddCa57A4Eb4410D5f3'
const coingeckoId = 'coingecko:gate-wrapped-btc'
const wbtc = coreAssets.ethereum.WBTC

const exchangeRateUpdatedAbi = 'event ExchangeRateUpdated(uint256 oldRate, uint256 newRate, address indexed updater)'

const fetch = async (_t: number, _c: any, options: FetchOptions) => {
    const dailyFees = options.createBalances();
    let growthRate = 0
    const [gtBTCPrice, gtBTCMcap] = await Promise.all([
        getPrices([coingeckoId], 'now'),
        getMcaps([coingeckoId], 'now')
    ])
    const gtBTCSupply = gtBTCMcap[coingeckoId].mcap/gtBTCPrice[coingeckoId].price
    const exchangeRateLog = await options.getLogs({
        eventAbi: exchangeRateUpdatedAbi,
        target: gBTC
    })
    exchangeRateLog.forEach(log => {
        growthRate = (Number(log.newRate) - Number(log.oldRate))
    })
    const fees = (growthRate * gtBTCSupply) * 1e2
    dailyFees.add(wbtc, fees, METRIC.STAKING_REWARDS)
    return {
        dailyFees,
        dailyRevenue: options.createBalances()
    }
}

const methodology= {
    Fees: "Rewards generated from staking",
    Revenue: "No Revenue",
  }

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.ETHEREUM],
    start: '2024-08-02',
    methodology,
}

export default adapter;
