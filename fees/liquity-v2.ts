import { FetchOptions } from "../adapters/types"
import { getLiquityV2LogAdapter } from "../helpers/liquity"

async function fetch(options: FetchOptions) {
  const v0DeploymentRes = await getLiquityV2LogAdapter({ collateralRegistry: '0xd99dE73b95236F69A559117ECD6F519Af780F3f7' })(options)
  const dailyFees = v0DeploymentRes.dailyFees.clone()
  let v1DeploymentRes = null
  if (options.startTimestamp >= 1747526400) {
    v1DeploymentRes = await getLiquityV2LogAdapter({ collateralRegistry: '0xf949982b91c8c61e952b3ba942cbbfaef5386684' })(options)
    dailyFees.addBalances(v1DeploymentRes.dailyFees);
  }
  return { dailyFees, dailyRevenue: dailyFees }
}

export default {
  version: 2,
  adapter: {
    ethereum: {
      fetch,
    }
  },
  methodology: {
    Fees: 'Total interest, redemption fees paid by borrowers and liquidation profit',
    Revenue: 'Total interest, redemption fees paid by borrowers and liquidation profit',
  }
}