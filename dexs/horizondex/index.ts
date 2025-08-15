import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

const poolCreatedEvent = 'event Pool (address indexed token0, address indexed token1, address pool)'
const swapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick)'
const fetchLinea = async (options: FetchOptions) => {
  const univ3Adapter = getUniV3LogAdapter({ factory: '0x9Fe607e5dCd0Ea318dBB4D8a7B04fa553d6cB2c5' })
  const algebraAdapter = getUniV3LogAdapter({ factory: '0xec4f2937e57a6F39087187816eCc83191E6dB1aB', isAlgebraVe: true, poolCreatedEvent, swapEvent })

  const { dailyVolume: univ3DailyVolume } = await univ3Adapter(options)
  const { dailyVolume: algebraDailyVolume } = await algebraAdapter(options)

  univ3DailyVolume.addBalances(algebraDailyVolume)

  return { dailyVolume: univ3DailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.LINEA]: { fetch: fetchLinea },
    [CHAIN.BASE]: { fetch: getUniV3LogAdapter({ factory: '0x07AceD5690e09935b1c0e6E88B772d9440F64718' }) },
  },
}

export default adapter;
