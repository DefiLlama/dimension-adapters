import * as sdk from '@defillama/sdk';

export const PRE_LAUNCH_TOKEN_PRICING = {
  '0x11dc28d01984079b7efe7763b533e6ed9e3722b9': {
    decimals: 18,
    conversionRate: 1.5887,
    cutoffTimestamp: 1758240000
  },
  '0xF732A566121Fa6362E9E0FBdd6D66E5c8C925E49': {
    decimals: 18,
    conversionRate: 0.15,
    cutoffTimestamp: 1761782400
  },
  '0x9126236476eFBA9Ad8aB77855c60eB5BF37586Eb': {
    decimals: 18,
    conversionRate: 0.025,
    cutoffTimestamp: 1766188800
  },
  '0x194f360D130F2393a5E9F3117A6a1B78aBEa1624': {
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
