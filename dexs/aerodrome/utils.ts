import * as sdk from '@defillama/sdk';

export const PRE_LAUNCH_TOKEN_PRICING = {
  '0x11dc28d01984079b7efe7763b533e6ed9e3722b9': {
    decimals: 18,
    conversionRate: 1.5887,
    cutoffTimestamp: 1758240000
  },
  '0xf732a566121fa6362e9e0fbdd6d66e5c8c925e49': {
    decimals: 18,
    conversionRate: 0.15,
    cutoffTimestamp: 1761782400
  },
  '0x9126236476efba9ad8ab77855c60eb5bf37586eb': {
    decimals: 18,
    conversionRate: 0.025,
    cutoffTimestamp: 1766188800
  },
  '0x194f360d130f2393a5e9f3117a6a1b78abea1624': {
    decimals: 18,
    conversionRate: 0.01208,
    cutoffTimestamp: 1769126400
  },
}

export const handleBribeToken = (
  token: string,
  amount: string,
  currentTimestamp: number,
  dailyBribesRevenue: sdk.Balances
): void => {
  const tokenConfig = PRE_LAUNCH_TOKEN_PRICING[token.toLowerCase()]
  
  if (!tokenConfig || currentTimestamp >= tokenConfig.cutoffTimestamp) {
    dailyBribesRevenue.add(token, amount)
    return
  }
  
  const convertedAmount = (Number(amount) * tokenConfig.conversionRate) / (10 ** tokenConfig.decimals)
  dailyBribesRevenue.addUSDValue(convertedAmount)
}
