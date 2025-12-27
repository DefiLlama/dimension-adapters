import { Balances } from "@defillama/sdk"
import { CHAIN } from "../../helpers/chains"
import { Interface, id, EventLog } from "ethers"
import { BaseAdapter, FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types"

type Orderbook = { address: string, start: string }
type Orderbooks = { v3: Orderbook[], v4: Orderbook[], v5: Orderbook[] }

const floats: Record<string, string> = {
  [CHAIN.ARBITRUM]: "0x2265980d35d97F5f65C73e954D2022380bcA4A77",
  [CHAIN.BASE]: "0x2F665EcE3345bF09197DAd22A50dFB623BD310A7",
  [CHAIN.BSC]: "0xDbcb964760d021e18A31C9A731d8589c361E0E20",
  [CHAIN.ETHEREUM]: "0x83e4c7732e715b5E7310796A4A2a21d89f3FB59A",
  [CHAIN.FLARE]: "0x2F665EcE3345bF09197DAd22A50dFB623BD310A7",
  [CHAIN.LINEA]: "0x83e4c7732e715b5E7310796A4A2a21d89f3FB59A",
  [CHAIN.POLYGON]: "0xb92aD1A33930aB64e0A7DC1AcD9EDDf9d4F8bc91",
}

const orderbooks: Record<string, Orderbooks> = {
  [CHAIN.ARBITRUM]: {
    v3: [
      { address: "0x90caf23ea7e507bb722647b0674e50d8d6468234", start: '2024-03-16' },
    ],
    v4: [
      { address: "0x550878091b2b1506069f61ae59e3a5484bca9166", start: '2024-09-23' },
    ],
    v5: [
      { address: "0x8df8075e4077dabf1e95f49059e4c1eea33094ab", start: '2025-09-07' },
    ]
  },
  [CHAIN.BASE]: {
    v3: [
      { address: "0x2aee87d75cd000583daec7a28db103b1c0c18b76", start: '2024-03-16' },
    ],
    v4: [
      { address: "0xd2938e7c9fe3597f78832ce780feb61945c377d7", start: '2024-08-28' },
      { address: "0xa2f56f8f74b7d04d61f281be6576b6155581dcba", start: '2024-07-02' },
      { address: "0x32aCbdF51abe567C91b7a5cd5E52024a5Ca56844", start: '2024-08-24' },
      { address: "0x80DE00e3cA96AE0569426A1bb1Ae22CD4181dE6F", start: '2024-08-20' },
      { address: "0x7A44459893F99b9d9a92d488eb5d16E4090f0545", start: '2024-08-11' },
      { address: "0x881cf4c0764e733d9c387f3858ee87cca04affe0", start: '2025-08-18' },
    ],
    v5: [
      { address: "0x52ceb8ebef648744ffdde89f7bc9c3ac35944775", start: '2025-10-10' },
    ]
  },
  [CHAIN.BSC]: {
    v3: [
      { address: "0xb1d6d10561d4e1792a7c6b336b0529e4bfb5ea8f", start: '2024-03-16' },
    ],
    v4: [
      { address: "0xd2938e7c9fe3597f78832ce780feb61945c377d7", start: '2024-09-23' },
    ],
    v5: []
  },
  [CHAIN.ETHEREUM]: {
    v3: [
      { address: "0xf1224a483ad7f1e9aa46a8ce41229f32d7549a74", start: '2024-02-06' },
    ],
    v4: [
      { address: "0x0eA6d458488d1cf51695e1D6e4744e6FB715d37C", start: '2024-10-25' },
    ],
    v5: []
  },
  [CHAIN.FLARE]: {
    v3: [
      { address: "0xb06202aA3Fe7d85171fB7aA5f17011d17E63f382", start: '2024-04-06' },
    ],
    v4: [
      { address: "0xcee8cd002f151a536394e564b84076c41bbbcd4d", start: '2024-09-04' },
      { address: "0xaa3b14Af0e29E3854E4148f43321C4410db002bC", start: '2024-08-19' },
      { address: "0xA2Ac77b982A9c0999472c1De378A81d7363d926F", start: '2024-08-19' },
      { address: "0x582d9e838FE6cD9F8147C66A8f56A3FBE513a6A2", start: '2024-07-11' },
    ],
    v5: []
  },
  [CHAIN.LINEA]: {
    v3: [],
    v4: [
      { address: "0x22410e2a46261a1b1e3899a072f303022801c764", start: '2024-09-30' },
      { address: "0xF97DE1c2d864d90851aDBcbEe0A38260440B8D90", start: '2024-07-29' },
    ],
    v5: []
  },
  // not supported?
  // matchain: {
  //   v3: [],
  //   v4: [
  //     { address: "0x40312EDAB8Fe65091354172ad79e9459f21094E2", start: '2024-09-02' },
  //   ]
  // },
  [CHAIN.POLYGON]: {
    v3: [
      { address: "0xde5abe2837bc042397d80e37fb7b2c850a8d5a6c", start: '2024-01-22' },
      { address: "0x34200e026fbac0c902a0ff18e77a49265ca6ac99", start: '2023-08-03' },
      { address: "0xd3edafeb9eaa454ce26e60a66ccda73939c343a4", start: '2023-11-02' },
      { address: "0xc95a5f8efe14d7a20bd2e5bafec4e71f8ce0b9a6", start: '2024-03-15' },
      { address: "0x95c9bf235435b660aa69f519904c3f175aab393d", start: '2023-11-01' },
      { address: "0xdcdee0e7a58bba7e305db3abc42f4887ce8ef729", start: '2023-12-04' },
      { address: "0x16d518706d666c549da7bd31110623b09ef23abb", start: '2023-12-08' },
    ],
    v4: [
      { address: "0x7d2f700b1f6fd75734824ea4578960747bdf269a", start: '2024-09-20' },
      { address: "0x2f209e5b67a33b8fe96e28f24628df6da301c8eb", start: '2024-07-23' },
      { address: "0xb8CD71e3b4339c8B718D982358cB32Ed272e4174", start: '2024-08-15' },
      { address: "0x001B302095D66b777C04cd4d64b86CCe16de55A1", start: '2024-08-15' },
      { address: "0xAfD94467d2eC43D9aD39f835BA758b61b2f41A0E", start: '2024-07-23' },
    ],
    v5: [
      { address: "0x8a3c8e610d827093f7437e0c45efa648563c0dda", start: '2025-09-22' },
    ]
  },
} as const

const IO = "(address token, uint8 decimals, uint256 vaultId)" as const;
const SignedContextV1 = "(address signer, uint256[] context, bytes signature)" as const;
const ClearConfig = "(uint256 aliceInputIOIndex, uint256 aliceOutputIOIndex, uint256 bobInputIOIndex, uint256 bobOutputIOIndex, uint256 aliceBountyVaultId, uint256 bobBountyVaultId)" as const

const ABI_V3 = {
  AfterClear: "event AfterClear(address sender, (uint256 aliceOutput, uint256 bobOutput, uint256 aliceInput, uint256 bobInput) clearStateChange)",
  TakeOrder: `event TakeOrder(address sender, ((address owner, bool handleIO, (address interpreter, address store, address expression) evaluable, ${IO}[] validInputs, ${IO}[] validOutputs) order, uint256 inputIOIndex, uint256 outputIOIndex, ${SignedContextV1}[] signedContext) config, uint256 input, uint256 output)`,
  Clear: `event Clear(address sender, (address owner, bool handleIO, (address interpreter, address store, address expression) evaluable, ${IO}[] validInputs, ${IO}[] validOutputs) alice, (address owner, bool handleIO, (address interpreter, address store, address expression) evaluable, ${IO}[] validInputs, ${IO}[] validOutputs) bob, ${ClearConfig} clearConfig)`,
} as const
const ABI_V4 = {
  AfterClear: "event AfterClear(address sender, (uint256 aliceOutput, uint256 bobOutput, uint256 aliceInput, uint256 bobInput) clearStateChange)",
  TakeOrderV2: `event TakeOrderV2(address sender, ((address owner, (address interpreter, address store, bytes bytecode) evaluable, ${IO}[] validInputs, ${IO}[] validOutputs, bytes32 nonce) order, uint256 inputIOIndex, uint256 outputIOIndex, ${SignedContextV1}[] signedContext) config, uint256 input, uint256 output)`,
  ClearV2: `event ClearV2(address sender, (address owner, (address interpreter, address store, bytes bytecode) evaluable, ${IO}[] validInputs, ${IO}[] validOutputs, bytes32 nonce) alice, (address owner, (address interpreter, address store, bytes bytecode) evaluable, ${IO}[] validInputs, ${IO}[] validOutputs, bytes32 nonce) bob, ${ClearConfig} clearConfig)`,
} as const

// v5 orderbook abi
export namespace ABI_V5 {
  // structs
  export const Float = "bytes32" as const;
  export const IOV2 = `(address token, bytes32 vaultId)` as const;
  export const EvaluableV4 = `(address interpreter, address store, bytes bytecode)` as const;
  export const SignedContextV2 = "(address signer, bytes32[] context, bytes signature)" as const;
  export const ClearStateChangeV2 =
      `(${Float} aliceOutput, ${Float} bobOutput, ${Float} aliceInput, ${Float} bobInput)` as const;
  export const OrderV4 =
      `(address owner, ${EvaluableV4} evaluable, ${IOV2}[] validInputs, ${IOV2}[] validOutputs, bytes32 nonce)` as const;
  export const TakeOrderConfigV4 =
      `(${OrderV4} order, uint256 inputIOIndex, uint256 outputIOIndex, ${SignedContextV2}[] signedContext)` as const;
  export const ClearConfigV2 =
      "(uint256 aliceInputIOIndex, uint256 aliceOutputIOIndex, uint256 bobInputIOIndex, uint256 bobOutputIOIndex, bytes32 aliceBountyVaultId, bytes32 bobBountyVaultId)" as const;

  // events
  export const events = {
      AfterClearV2: `event AfterClearV2(address sender, ${ClearStateChangeV2} clearStateChange)` as const,
      ClearV3: `event ClearV3(address sender, ${OrderV4} alice, ${OrderV4} bob, ${ClearConfigV2} clearConfig)` as const,
      TakeOrderV3: `event TakeOrderV3(address sender, ${TakeOrderConfigV4} config, ${Float} input, ${Float} output)` as const,
    } as const;

  export const float = {
    toFixedDecimalLossy: `function toFixedDecimalLossy(${Float} float, uint8 decimals) returns (uint256, bool)` as const,
    toFixedDecimalsLossless: `function toFixedDecimalLossless(${Float} float, uint8 decimals) returns (uint256)` as const,
  } as const;
}

const abi_v3 = new Interface([ABI_V3.Clear, ABI_V3.AfterClear, ABI_V3.TakeOrder])
const abi_v4 = new Interface([ABI_V4.ClearV2, ABI_V4.AfterClear, ABI_V4.TakeOrderV2])
const abi_v5 = new Interface([ABI_V5.events.ClearV3, ABI_V5.events.AfterClearV2, ABI_V5.events.TakeOrderV3])

async function fetchV3Vol({ api, getLogs }: FetchOptions, dailyVolume: Balances) {
  const targets = orderbooks[api.chain].v3.map(v => v.address)
  if (!targets.length) return

  const [afterClearLogs, clearLogs, takeOrderLogs] = await Promise.all([
    getLogs({
      targets,
      flatten: false,
      entireLog: true,
      topic: id(abi_v3.getEvent("AfterClear")!.format()),
    }),
    getLogs({
      targets,
      flatten: false,
      entireLog: true,
      topic: id(abi_v3.getEvent("Clear")!.format()),
    }),
    getLogs({
      targets,
      flatten: false,
      entireLog: true,
      topic: id(abi_v3.getEvent("TakeOrder")!.format()),
    })
  ]) as EventLog[][][]

  afterClearLogs.forEach((orderbookLogs, i) => {
    orderbookLogs.forEach(log => {
      const clearLog = clearLogs[i].find(v => v.transactionHash === log.transactionHash)
      if (clearLog) {
        const {
          clearStateChange: { aliceOutput, bobInput }
        } = abi_v3.decodeEventLog("AfterClear", log.data)
        const {
          alice: { validOutputs },
          clearConfig: { aliceOutputIOIndex }
        } = abi_v3.decodeEventLog("Clear", clearLog.data)

        const token1 = validOutputs[Number(aliceOutputIOIndex)]

        dailyVolume.add(token1.token, aliceOutput.toString())
        dailyVolume.add(token1.token, bobInput.toString())
      }
    })
  })

  takeOrderLogs.flat().forEach(log => {
    const {
      input,
      config: { outputIOIndex, order },
    } = abi_v3.decodeEventLog("TakeOrder", log.data)

    dailyVolume.add(order.validOutputs[Number(outputIOIndex)].token, input.toString())
  })
}

async function fetchV4Vol({ api, getLogs }: FetchOptions, dailyVolume: Balances) {
  const targets = orderbooks[api.chain].v4.map(v => v.address)
  if (!targets.length) return

  const [afterClearLogs, clearLogs, takeOrderLogs] = await Promise.all([
    getLogs({
      targets,
      flatten: false,
      entireLog: true,
      topic: id(abi_v4.getEvent("AfterClear")!.format()),
    }),
    getLogs({
      targets,
      flatten: false,
      entireLog: true,
      topic: id(abi_v4.getEvent("ClearV2")!.format()),
    }),
    getLogs({
      targets,
      flatten: false,
      entireLog: true,
      topic: id(abi_v4.getEvent("TakeOrderV2")!.format()),
    })
  ]) as EventLog[][][]

  afterClearLogs.forEach((orderbookLogs, i) => {
    orderbookLogs.forEach(log => {
      const clearLog = clearLogs[i].find(v => v.transactionHash === log.transactionHash)
      if (clearLog) {
        const {
          clearStateChange: { aliceOutput, bobInput }
        } = abi_v4.decodeEventLog("AfterClear", log.data)
        const {
          alice: { validOutputs },
          clearConfig: { aliceOutputIOIndex }
        } = abi_v4.decodeEventLog("ClearV2", clearLog.data)

        const token1 = validOutputs[Number(aliceOutputIOIndex)]

        dailyVolume.add(token1.token, aliceOutput.toString())
        dailyVolume.add(token1.token, bobInput.toString())
      }
    })
  })

  takeOrderLogs.flat().forEach(log => {
    const {
      input,
      config: { outputIOIndex, order },
    } = abi_v4.decodeEventLog("TakeOrderV2", log.data)

    dailyVolume.add(order.validOutputs[Number(outputIOIndex)].token, input.toString())
  })
}

async function fetchV5Vol({ api, getLogs }: FetchOptions, dailyVolume: Balances) {
  const targets = orderbooks[api.chain].v5.map(v => v.address)
  if (!targets.length) return

  const [afterClearLogs, clearLogs, takeOrderLogs] = await Promise.all([
    getLogs({
      targets,
      flatten: false,
      entireLog: true,
      topic: id(abi_v5.getEvent("AfterClearV2")!.format()),
    }),
    getLogs({
      targets,
      flatten: false,
      entireLog: true,
      topic: id(abi_v5.getEvent("ClearV3")!.format()),
    }),
    getLogs({
      targets,
      flatten: false,
      entireLog: true,
      topic: id(abi_v5.getEvent("TakeOrderV3")!.format()),
    })
  ]) as EventLog[][][]

  // use set to avoid dups
  const tokenSet = new Set<string>();

  // list of raw float values paired with token and float contract addresses
  const rawVols: { token: string; rawFloat: string }[] = [];

  afterClearLogs.forEach((orderbookLogs, i) => {
    orderbookLogs.forEach(log => {
      const clearLog = clearLogs[i].find(v => v.transactionHash === log.transactionHash)
      if (clearLog) {
        const {
          clearStateChange: { aliceOutput, bobInput }
        } = abi_v5.decodeEventLog("AfterClearV2", log.data)
        const {
          alice: { validOutputs },
          clearConfig: { aliceOutputIOIndex }
        } = abi_v5.decodeEventLog("ClearV3", clearLog.data)

        const token = validOutputs[Number(aliceOutputIOIndex)].token.toLowerCase()
        tokenSet.add(token)
        rawVols.push({ token, rawFloat: aliceOutput.toString() })
        rawVols.push({ token, rawFloat: bobInput.toString() })
      }
    })
  })

  takeOrderLogs.flat().forEach(log => {
    const {
      input,
      config: { outputIOIndex, order },
    } = abi_v5.decodeEventLog("TakeOrderV3", log.data)

    const token = order.validOutputs[Number(outputIOIndex)].token.toLowerCase()
    tokenSet.add(token)
    rawVols.push({ token, rawFloat: input.toString() })
  })

  // convert the set to list for indexing
  const tokenList = Array.from(tokenSet);

  // get decimals of the tokens
  const decimals = await api.multiCall({
    permitFailure: true,
		abi: 'uint8:decimals',
		calls: tokenList.map((target) => ({ target })),
	});

  // format the floats to actual token value
  const vols = await api.multiCall({
    permitFailure: true,
    target: orderbooks[api.chain].float,
		abi: ABI_V5.float.toFixedDecimalLossy,
		calls: rawVols
      .filter((rawVol) => {
        const index = tokenList.indexOf(rawVol.token);
        return index > -1 && typeof decimals[index] !== undefined && decimals[index] !== null
      })
      .map((rawVol) => ({
        params: [rawVol.rawFloat, decimals[tokenList.indexOf(rawVol.token)]]
      })),
	});

  // add vols
  vols.forEach((vol, i) => {
    if (!vol) return // skip error results
    dailyVolume.add(rawVols[i].token, vol[0].toString())
  })
}

const fetchVolume: FetchV2 = async function (options: FetchOptions) {
  const dailyVolume = options.createBalances()
  await Promise.allSettled([
    fetchV3Vol(options, dailyVolume),
    fetchV4Vol(options, dailyVolume),
    fetchV5Vol(options, dailyVolume),
  ])

  return { dailyVolume }
}

const volAdapter: BaseAdapter = {}
Object.keys(orderbooks).forEach(chain => {
  volAdapter[chain] = {
    fetch: fetchVolume,
    start: Object.values(orderbooks[chain])
      .flat()
      .reduce((a, b) => a.start < b.start ? a : b)
      .start,
  }
})

const adapter: SimpleAdapter = {
  version: 2,
  adapter: volAdapter,
  methodology: {
    Volume: "Volume of trades"
  }
}

export default adapter
