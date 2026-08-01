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

const RP9_ADDRESS: any = {
  [CHAIN.ETHEREUM]: '0x81602EF321C46d73f5Ba7f476947AE1a862957dc',
  [CHAIN.ARBITRUM]: '0x81602EF321C46d73f5Ba7f476947AE1a862957dc',
  [CHAIN.OPTIMISM]: '0x81602EF321C46d73f5Ba7f476947AE1a862957dc',
  [CHAIN.BASE]: '0x81602EF321C46d73f5Ba7f476947AE1a862957dc',
  [CHAIN.POLYGON]: '0x81602EF321C46d73f5Ba7f476947AE1a862957dc',
  [CHAIN.MOONBEAM]: '0x81602EF321C46d73f5Ba7f476947AE1a862957dc',
  [CHAIN.POLYGON_ZKEVM]: '0x81602EF321C46d73f5Ba7f476947AE1a862957dc',
  [CHAIN.MANTLE]: '0x81602EF321C46d73f5Ba7f476947AE1a862957dc',
  [CHAIN.KATANA]: '0x81602EF321C46d73f5Ba7f476947AE1a862957dc',
}

const RP9_1_ADDRESS: any = {
  [CHAIN.ETHEREUM]: '0x3b0aa7d38bf3c103bf02d1de2e37568cbed3d6e8',
  [CHAIN.ARBITRUM]: '0x3b0aa7d38bf3c103bf02d1de2e37568cbed3d6e8',
  [CHAIN.OPTIMISM]: '0x3b0aa7d38bf3c103bf02d1de2e37568cbed3d6e8',
  [CHAIN.BASE]: '0x3b0aa7d38bf3c103bf02d1de2e37568cbed3d6e8',
  [CHAIN.POLYGON]: '0x3b0aa7d38bf3c103bf02d1de2e37568cbed3d6e8',
  [CHAIN.POLYGON_ZKEVM]: '0x3b0aa7d38bf3c103bf02d1de2e37568cbed3d6e8',
  [CHAIN.MANTLE]: '0x3b0aa7d38bf3c103bf02d1de2e37568cbed3d6e8',
  [CHAIN.KATANA]: '0x3b0aa7d38bf3c103bf02d1de2e37568cbed3d6e8',
}

const RP9_2_ADDRESS: any = {
  [CHAIN.ETHEREUM]: '0xd2b37ade14708bf18904047b1e31f8166d39612b',
  [CHAIN.ARBITRUM]: '0xd2b37ade14708bf18904047b1e31f8166d39612b',
  [CHAIN.OPTIMISM]: '0xd2b37ade14708bf18904047b1e31f8166d39612b',
  [CHAIN.BASE]: '0xd2b37ade14708bf18904047b1e31f8166d39612b',
  [CHAIN.POLYGON]: '0xd2b37ade14708bf18904047b1e31f8166d39612b',
  [CHAIN.POLYGON_ZKEVM]: '0xd2b37ade14708bf18904047b1e31f8166d39612b',
  [CHAIN.MANTLE]: '0xd2b37ade14708bf18904047b1e31f8166d39612b',
  [CHAIN.KATANA]: '0xd2b37ade14708bf18904047b1e31f8166d39612b',
}

const RP10_ADDRESS: any = {
  [CHAIN.ETHEREUM]: '0xe89aab725a2b2c0656248dcccc894a04661be55a',
  [CHAIN.ARBITRUM]: '0xe89aab725a2b2c0656248dcccc894a04661be55a',
  [CHAIN.OPTIMISM]: '0xe89aab725a2b2c0656248dcccc894a04661be55a',
  [CHAIN.BASE]: '0xe89aab725a2b2c0656248dcccc894a04661be55a',
  [CHAIN.POLYGON]: '0xe89aab725a2b2c0656248dcccc894a04661be55a',
  [CHAIN.POLYGON_ZKEVM]: '0xe89aab725a2b2c0656248dcccc894a04661be55a',
  [CHAIN.MANTLE]: '0xe89aab725a2b2c0656248dcccc894a04661be55a',
  [CHAIN.KATANA]: '0xe89aab725a2b2c0656248dcccc894a04661be55a',
}

const RP11_ADDRESS: any = {
  [CHAIN.ETHEREUM]: '0xc10ee9031f2a0b84766a86b55a8d90f357910fb4',
  [CHAIN.ARBITRUM]: '0xc10ee9031f2a0b84766a86b55a8d90f357910fb4',
  [CHAIN.OPTIMISM]: '0xc10ee9031f2a0b84766a86b55a8d90f357910fb4',
  [CHAIN.BASE]: '0xc10ee9031f2a0b84766a86b55a8d90f357910fb4',
  [CHAIN.POLYGON]: '0xc10ee9031f2a0b84766a86b55a8d90f357910fb4',
  [CHAIN.POLYGON_ZKEVM]: '0xc10ee9031f2a0b84766a86b55a8d90f357910fb4',
  [CHAIN.MANTLE]: '0xc10ee9031f2a0b84766a86b55a8d90f357910fb4',
  [CHAIN.KATANA]: '0xc10ee9031f2a0b84766a86b55a8d90f357910fb4',
  [CHAIN.ERA]: '0xc10ee9031f2a0b84766a86b55a8d90f357910fb4',
  [CHAIN.LINEA]: '0xc10ee9031f2a0b84766a86b55a8d90f357910fb4',
}

const ROUTE_RP7_EVENT = 'event Route(address indexed from, address to, address indexed tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, int256 slippage, uint32 indexed referralCode)'
const ROUTE_RP9_EVENT = 'event Route(address indexed from, address to, address indexed tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, int256 slippage, uint32 indexed referralCode, bytes32 diagnosticsFirst32)'

// https://etherscan.io/tx/0x2124a56218f4b7b1675fab0ece6c2cd6adee55bcc3e2bfb4dc1fc88db6bc91ee
const FLAT_FEE = 0.002;

const fetch: FetchV2 = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances()
  const chain = options.chain
  let logs: any[] = []

  if (RP8_ADDRESS[chain]) logs = logs.concat(await options.getLogs({ target: RP8_ADDRESS[chain], eventAbi: ROUTE_RP7_EVENT }))
  if (RP9_ADDRESS[chain]) logs = logs.concat(await options.getLogs({ target: RP9_ADDRESS[chain], eventAbi: ROUTE_RP9_EVENT }))
  if (RP9_1_ADDRESS[chain]) logs = logs.concat(await options.getLogs({ target: RP9_1_ADDRESS[chain], eventAbi: ROUTE_RP9_EVENT }))
  if (RP9_2_ADDRESS[chain]) logs = logs.concat(await options.getLogs({ target: RP9_2_ADDRESS[chain], eventAbi: ROUTE_RP9_EVENT }))
  if (RP10_ADDRESS[chain]) logs = logs.concat(await options.getLogs({ target: RP10_ADDRESS[chain], eventAbi: ROUTE_RP9_EVENT }))
  if (RP11_ADDRESS[chain]) logs = logs.concat(await options.getLogs({ target: RP11_ADDRESS[chain], eventAbi: ROUTE_RP9_EVENT }))

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
  pullHourly: true,
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
    [CHAIN.ERA]: { start: '2026-02-08', },
    [CHAIN.LINEA]: { start: '2026-02-08', },
  }
}
