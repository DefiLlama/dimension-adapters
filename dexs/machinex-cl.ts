import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getConfig } from "../helpers/cache";
import { getUniV3LogAdapter } from "../helpers/uniswap";

const poolsEndpoint = 'https://machinex-api-production.up.railway.app/data'

async function fetch(options: FetchOptions) {
  const { pairs } = await getConfig('machinex-cl-peaq', poolsEndpoint)
  const pools = pairs.filter((pair: any) => !pair.hasOwnProperty('stable')).map((pair: any) => pair.id)

  const { dailyVolume } = await getUniV3LogAdapter({ pools })(options)

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.PEAQ]: { fetch },
  },
  methodology: {
    Volume: "Swap events on the MachineX concentrated liquidity pools, read on chain.",
  },
}

export default adapter
