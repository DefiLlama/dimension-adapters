import * as sdk from '@defillama/sdk';



export const handleBribeToken = (
  token: string,
  amount: string,
  currentTimestamp: number,
  dailyBribesRevenue: sdk.Balances
): void => {

  dailyBribesRevenue.add(token, amount)
  return


}
