import { FetchOptions } from "../adapters/types"
import { getLiquityV2LogAdapter } from "../helpers/liquity"

async function fetch(options: FetchOptions) {
  const deploymentRes = await getLiquityV2LogAdapter({ collateralRegistry: '0xce9f80a0dcd51fb3dd4f0d6bec3afdcaea10c912' })(options)
  const dailyFees = deploymentRes.dailyFees
  return { dailyFees }
}

export default {
  version: 2,
  adapter: {
    swellchain: {
      fetch,
      start: '2025-05-14',
    }
  }
}