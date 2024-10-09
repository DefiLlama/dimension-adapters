import { CHAIN } from "../../helpers/chains"
import { Interface, id, EventLog } from "ethers"
import { BaseAdapter, BreakdownAdapter, FetchV2 } from "../../adapters/types"

const orderbooks: Record<string, { address: string, start: number }> = {
  [CHAIN.ARBITRUM]: {
    address: "0x550878091b2b1506069f61ae59e3a5484bca9166",
    start: 1727110056,
  },
  [CHAIN.BASE]: {
    address: "0xd2938e7c9fe3597f78832ce780feb61945c377d7",
    start: 1724856007,
  },
  [CHAIN.BSC]: {
    address: "0xd2938e7c9fe3597f78832ce780feb61945c377d7",
    start: 1727110200,
  },
  [CHAIN.FLARE]: {
    address: "0xcee8cd002f151a536394e564b84076c41bbbcd4d",
    start: 1725430973,
  },
  [CHAIN.LINEA]: {
    address: "0x22410e2a46261a1b1e3899a072f303022801c764",
    start: 1727718941,
  },
  [CHAIN.POLYGON]: {
    address: "0x7d2f700b1f6fd75734824ea4578960747bdf269a",
    start: 1726792922,
  },
} as const

const abi = {
  AfterClear: "event AfterClear(address sender, (uint256 aliceOutput, uint256 bobOutput, uint256 aliceInput, uint256 bobInput) clearStateChange)",
  TakeOrderV2: "event TakeOrderV2(address sender, ((address owner, (address interpreter, address store, bytes bytecode) evaluable, (address token, uint8 decimals, uint256 vaultId)[] validInputs, (address token, uint8 decimals, uint256 vaultId)[] validOutputs, bytes32 nonce) order, uint256 inputIOIndex, uint256 outputIOIndex, (address signer, uint256[] context, bytes signature)[] signedContext) config, uint256 input, uint256 output)",
  ClearV2: "event ClearV2(address sender, (address owner, (address interpreter, address store, bytes bytecode) evaluable, (address token, uint8 decimals, uint256 vaultId)[] validInputs, (address token, uint8 decimals, uint256 vaultId)[] validOutputs, bytes32 nonce) alice, (address owner, (address interpreter, address store, bytes bytecode) evaluable, (address token, uint8 decimals, uint256 vaultId)[] validInputs, (address token, uint8 decimals, uint256 vaultId)[] validOutputs, bytes32 nonce) bob, (uint256 aliceInputIOIndex, uint256 aliceOutputIOIndex, uint256 bobInputIOIndex, uint256 bobOutputIOIndex, uint256 aliceBountyVaultId, uint256 bobBountyVaultId) clearConfig)",
} as const

const fetchIntVol: FetchV2 = async function({ createBalances, api, fromTimestamp, toTimestamp }) {
  const dailyVolume = createBalances()
  const clearInterface = new Interface([ abi.ClearV2 ])
  const afterclearInterface = new Interface([ abi.AfterClear ])

  const [afterClearLogs, clearLogs] = await Promise.all([
    api.getLogs({
      toTimestamp,
      fromTimestamp,
      entireLog: true,
      chain: api.chain,
      target: orderbooks[api.chain].address,
      topic: id(afterclearInterface.fragments[0].format()),
    }),
    api.getLogs({
      toTimestamp,
      fromTimestamp,
      entireLog: true,
      chain: api.chain,
      target: orderbooks[api.chain].address,
      topic: id(clearInterface.fragments[0].format()),
      
    })
  ]) as EventLog[][]

  afterClearLogs.forEach(log => {
    const clearLog = clearLogs.find(v => v.transactionHash === log.transactionHash)
    if (clearLog) {
      const { 
        clearStateChange: { aliceOutput, bobOutput, aliceInput, bobInput } 
      } = afterclearInterface.decodeEventLog("AfterClear", log.data)
      const { 
        alice: { validInputs, validOutputs },
        clearConfig: { aliceOutputIOIndex, aliceInputIOIndex } 
      } = clearInterface.decodeEventLog("ClearV2", clearLog.data)

      const token0 = validInputs[Number(aliceInputIOIndex)]
      const token1 = validOutputs[Number(aliceOutputIOIndex)]

      dailyVolume.add(token0.token, aliceInput.toString())
      dailyVolume.add(token0.token, bobOutput.toString())

      dailyVolume.add(token1.token, aliceOutput.toString())
      dailyVolume.add(token1.token, bobInput.toString())
    }
  })

  return { dailyVolume }
}

const fetchExtVol: FetchV2 = async function({ createBalances, api, fromTimestamp, toTimestamp }) {
  const dailyVolume = createBalances()
  const takeOrderInterface = new Interface([ abi.TakeOrderV2 ])

  const logs = await api.getLogs({
    toTimestamp,
    fromTimestamp,
    entireLog: true,
    chain: api.chain,
    target: orderbooks[api.chain].address,
    topic: id(takeOrderInterface.fragments[0].format()),
  }) as EventLog[]

  logs.forEach(log => {
    const { 
      input, 
      output,
      config: { outputIOIndex, inputIOIndex, order },
    } = takeOrderInterface.decodeEventLog("TakeOrderV2", log.data)

    const orderInput = order.validInputs[Number(inputIOIndex)]
    const orderOutput = order.validOutputs[Number(outputIOIndex)]

    dailyVolume.add(orderInput.token, output.toString())
    dailyVolume.add(orderOutput.token, input.toString())
  })

  return { dailyVolume }
}

const intVolAdapter: BaseAdapter = {}
const extVolAdapter: BaseAdapter = {}
Object.keys(orderbooks).forEach(chain => {
  intVolAdapter[chain] = {
    fetch: fetchIntVol,
    runAtCurrTime: false,
    start: orderbooks[chain].start,
    meta: {
      methodology: {
        Volume: "Volume of internal trades (between Rain Orderbook orders and vaults)"
      }
    }
  }
  extVolAdapter[chain] = {
    fetch: fetchExtVol,
    runAtCurrTime: false,
    start: orderbooks[chain].start,
    meta: {
      methodology: {
        Volume: "Volume of external trades (against onchain liquidity such as Uniswap pools)"
      }
    }
  }
})

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    internal: intVolAdapter,
    external: extVolAdapter,
  },
}

export default adapter
