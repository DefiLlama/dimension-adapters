import { CHAIN } from "../helpers/chains"
import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, FetchResultV2, FetchV2 } from "../adapters/types"

const RP8_ADDRESS: any = {
  [CHAIN.ETHEREUM]: '0x2905d7e4D048d29954F81b02171DD313F457a4a4',
  [CHAIN.ARBITRUM]: '0x2905d7e4D048d29954F81b02171DD313F457a4a4',
  [CHAIN.OPTIMISM]: '0x2905d7e4D048d29954F81b02171DD313F457a4a4',
  [CHAIN.BASE]: '0x2905d7e4D048d29954F81b02171DD313F457a4a4',
  [CHAIN.POLYGON]: '0x2905d7e4D048d29954F81b02171DD313F457a4a4',
  [CHAIN.MOONBEAM]: '0x2905d7e4D048d29954F81b02171DD313F457a4a4',
  [CHAIN.POLYGON_ZKEVM]: '0x2905d7e4D048d29954F81b02171DD313F457a4a4',
  [CHAIN.MANTLE]: '0x2905d7e4D048d29954F81b02171DD313F457a4a4',
  [CHAIN.KATANA]: '0x2905d7e4D048d29954F81b02171DD313F457a4a4',
}

const ROUTE_RP7_EVENT = 'event Route(address indexed from, address to, address indexed tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, int256 slippage, uint32 indexed referralCode)'

// https://etherscan.io/tx/0x2124a56218f4b7b1675fab0ece6c2cd6adee55bcc3e2bfb4dc1fc88db6bc91ee
const FLAT_FEE = 0.002;

const fetch: FetchV2 = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances()

  const logs = await options.getLogs({ target: RP8_ADDRESS[options.chain], eventAbi: ROUTE_RP7_EVENT })
  for (const log of logs) {
    if (Number(log.amountIn) < 0) throw new Error(`Amount cannot be negative. Current value: ${log.amountIn}`)
    if (log.tokenIn.toLowerCase() === ADDRESSES.GAS_TOKEN_2.toLowerCase()) {
      dailyFees.addGasToken(Number(log.amountIn) * FLAT_FEE)
    }
    else {
      dailyFees.add(log.tokenIn, Number(log.amountIn) * FLAT_FEE)
    }
  }

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const info = {
  methodology: {
    Fees: 'Trading fees paid by users while using Sushi Aggregator Routers.',
    Revenue: 'Trading fees collected by Sushi.',
    ProtocolRevenue: 'Trading fees collected by Sushi.',
  }
}

export default {
  fetch, methodology: info.methodology,
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2025-07-04', },
    [CHAIN.ARBITRUM]: { start: '2025-07-04', },
    [CHAIN.OPTIMISM]: { start: '2025-07-04', },
    [CHAIN.BASE]: { start: '2025-07-04', },
    [CHAIN.POLYGON]: { start: '2025-07-04', },
    [CHAIN.MOONBEAM]: { start: '2025-07-04', },
    [CHAIN.POLYGON_ZKEVM]: { start: '2025-07-04', },
    [CHAIN.MANTLE]: { start: '2025-07-04', },
    [CHAIN.KATANA]: { start: '2025-07-04', },
  }
}
