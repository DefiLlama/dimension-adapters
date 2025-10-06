import * as sdk from '@defillama/sdk';

export const PRE_LAUNCH_TOKEN_PRICING = {
  '0x11dc28d01984079b7efe7763b533e6ed9e3722b9': {
    decimals: 18,
    conversionRate: 1.5887,
    cutoffTimestamp: 1758240000
  }
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
