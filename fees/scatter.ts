import { Adapter, Dependencies, FetchOptions, } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { queryAllium } from '../helpers/allium';

const PROTOCOL_FEE_LABEL = "Protocol fees";

// Scatter (Archetype) factories; all deployed by 0x60A59d7003345843BE285c15c7C78B62b61e0d7c
// Each emits CollectionAdded(sender, receiver, collection) when it clones a new collection
const FACTORIES = [
  '0xba014601414c63f7E98B4BfC3f47f05fF7b57203', // 2022-04
  '0xcc847c1a6B16f7040D2Ec593F45c3101b917Dda7', // 2022-04
  '0x8E76AD190F259Cd5444A642cD897896E6511D215', // 2022-09
  '0x7354936bC7a72C8Baf5A2F9262e70a52C427bE4A', // 2023-01 (main, ~1075 collections)
  '0x7af783905F8a4cc64565c6E8945AA27F9cF29BD3', // 2023-01
  '0x35a87150afa8AC5e85516d21129AC9fae9B2D777', // 2023-04
  '0xAFd4B4b1dAF837dC48F2d791170D6c17044b4C01', // 2024-02
]
const FACTORY_FROM_BLOCK = 14597496
const COLLECTION_ADDED = 'event CollectionAdded(address indexed sender, address indexed receiver, address collection)'
// Scatter mint/purchase entrypoints on collection contracts; 5% of msg.value is the protocol fee
const FEE_SELECTORS = ['0x4a21a2df', '0x1fff79b0']
const PROTOCOL_FEE_RATE = 0.05

// Directly deployed (non-factory) contracts that were listed by the old Scatter API
const LEGACY_CONTRACTS = [
  '0xa2185b3a0d8788e007d0c9ca261f154721c2acea',
  '0xae163dcd61248fb25d03dd29cf282b664d012850',
  '0xe61443f7db3ca8b7fc083602dcc52726db3d5ff6',
  '0xd3d9ddd0cf0a5f0bfb8f7fceae075df687eaebab',
  '0xde6b6090d32eb3eeae95453ed14358819ea30d33',
  '0x5af0d9827e0c53e4799bb226655a1de152a425a5',
  '0xc19ced6633f0da7cef642b7a3f6b3ff0bb2465c0',
  '0x50c2537522592088bf028c68462fcf0213e6ea49',
  '0x63e0b14bad37108014ccd02f0a56df985567ec8c',
  '0xaa8a4e15e21f1ae899f74f3acd7505219a1947e1',
  '0x74ece89f9fc34643eacf79bfb4165d29ca5d92cc',
  '0xeb990dbd3b651e61f0221a07928c03a657ea0a08',
  '0x28e08d2eb66231b3b23fff90e85a9a165951029c',
  '0x09f66a094a0070ebddefa192a33fa5d75b59d46b',
  '0x750ee3529d13819e00e4e67063d6e500870d5af3',
  '0xd3607bc8c7927b348bac50dc224c28e3ce933ca6',
  '0x4ebe43af0ac2d08f52bd844fb3519b85a947dc2d',
]

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()

  const logs = await options.getLogs({
    targets: FACTORIES,
    eventAbi: COLLECTION_ADDED,
    fromBlock: FACTORY_FROM_BLOCK,
    cacheInCloud: true,
  })
  const contracts = [...new Set([
    ...logs.map((l: any) => l.collection.toLowerCase()),
    ...LEGACY_CONTRACTS,
  ])]

  if (contracts.length === 0) {
    return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
  }

  const contractList = contracts.map((c) => `'${c}'`).join(', ')
  const selectorFilter = FEE_SELECTORS.map((s) => `LEFT(input, 10) = '${s}'`).join(' OR ')

  const [row] = await queryAllium(`
    SELECT COALESCE(SUM(value), 0) * ${PROTOCOL_FEE_RATE} AS protocol_fees
    FROM ethereum.raw.transactions
    WHERE to_address IN (${contractList})
      AND (${selectorFilter})
      AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `)

  dailyFees.addGasToken(row?.protocol_fees ?? 0, PROTOCOL_FEE_LABEL)
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const methodology = {
  Fees: "5% protocol fee collected on smart contract interactions",
  Revenue: "All protocol fees go to the Scatter treasury",
  ProtocolRevenue: "All protocol fees go to the Scatter treasury"
}

const breakdownMethodology = {
  Fees: {
    [PROTOCOL_FEE_LABEL]: "5% protocol fee charged on smart contract interactions through the Scatter platform"
  },
  Revenue: {
    [PROTOCOL_FEE_LABEL]: "5% protocol fee charged on smart contract interactions, retained by the protocol treasury"
  },
  ProtocolRevenue: {
    [PROTOCOL_FEE_LABEL]: "5% protocol fee charged on smart contract interactions, retained by the protocol treasury"
  }
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2022-07-01',
  dependencies: [Dependencies.ALLIUM],
  methodology,
  breakdownMethodology
}

export default adapter;