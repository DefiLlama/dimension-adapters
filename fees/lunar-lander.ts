import ADDRESSES from '../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { queryAllium } from '../helpers/allium'

// documented tip accounts: https://docs.hellomoon.io/reference/lunar-lander
const PUBLIC_TIP_ACCOUNTS = [
  'moon17L6BgxXRX5uHKudAmqVF96xia9h8ygcmG2sL3F',
  'moon26Sek222Md7ZydcAGxoKG832DK36CkLrS3PQY4c',
  'moon7fwyajcVstMoBnVy7UBcTx87SBtNoGGAaH2Cb8V',
  'moonBtH9HvLHjLqi9ivyrMVKgFUsSfrz9BwQ9khhn1u',
  'moonCJg8476LNFLptX1qrK8PdRsA1HD1R6XWyu9MB93',
  'moonF2sz7qwAtdETnrgxNbjonnhGGjd6r4W4UC9284s',
  'moonKfftMiGSak3cezvhEqvkPSzwrmQxQHXuspC96yj',
  'moonQBUKBpkifLcTd78bfxxt4PYLwmJ5admLW6cBBs8',
  'moonXwpKwoVkMegt5Bc776cSW793X1irL5hHV1vJ3JA',
  'moonZ6u9E2fgk6eWd82621eLPHt9zuJuYECXAYjMY1C',
]

const AXIOM_TIP_ACCOUNTS = [
  '7nFkbKooThkybP6NJLDEhayK54JHA9ziSSgcv3FG33ND',
  '2qDoKXbts4ePAv5NVhHZLuG7eFqB1ik58Nsb9aDArecj',
  'HrMfuQdaM2mu3Krx7ZZ7TrTQyVaKra7sFgb7Cds3bif2',
  '8d5jPhXwjEa9cPkQG2aFHw5cwE6KjytnPFJbmH1RgN1M',
  '8GV86MhDQST6rh56oTMU9v5TdHwRtXnFQ3zdGD3WT3mG',
  '46qnt5Lg1uPk6qkgMuuMisxACzwHVv4P2Nuv3wELCqk3',
  'YYVEwYxUif4zSGdnBxLdHU1ej4kQTgxKrkD5VXDU8RC',
  'H9bSW2VTrRU7LuT5Zo5XEx3uuGhLDTeAJdEUxQX39314',
  'CH5jhgNAb15UypNJxCUYU3RYK2FBkeojE5SCsrvTgAdD',
  'DU3oUMrzewfvuUN8HNA3rXTvbscCA3krY365mzfFixrT',
  '3rXRVo9hPjtWNJEhsN6WDmxD8ubBjTjHXugRVYyH5gC3',
  '5qLPs1V6j9MDFHk9G1ygimtLJCjUWmkbMBEiPX7toBvB',
  '7KKNPiFyi3b3VSM81sNEwHPxUGVZJHCTucqoh7rAABw4',
  '6TYd5ytzKVDUP4jsuXyUA6BA8SmN57mzwJjw5XvnXqmG',
  'J4PeVZhx2496eXjAMpbm7nrCxRBgAUfRDwhZ1YSdzTSE',
  'jqvQkwWbqZY5C4gp5avEDnB7Mr3bfUuKqowe4UbBZwN',
  'Cd8XGYwot9rvaiGjmQiGoRMhdqLYiYKpW5CEUWfMNk6C',
  '5KoVA9x6rwgZi1CnRKr4MLFS21dnqAooN1avECN8LaUX',
  'FTkHWtbM8ouMhkiY8Pu9XnN6NMafgsiqtCnQdzo5eHnA',
  'AHofGcZ6cPBaZWmy6MPeCDpm3g5EWYiuEQfP5d8wst8h',
  '6ZM1ZSPfpPdwFVyjMVrc46cVrfHNXsnWRXw3ZFHuYiR',
  '3mFs2bth5NNGBFj8UsFK7wqqwQXkPs1nS41Rvczfy5BG',
  'FdeHzjSw24zmeo3AxsRQPwUL95YeWyk9NUjgMmcr9NWG',
  'HxfyyYfsVXiJPRWXf18BCmqYTSnSpnbFBctharGVCiki',
  'JBD645FWMpz4m4PGX7jz8DFTaYsgVT9DZzoPWZ4xVVNo',
  'DhkvC2tPvc8J8ft7nWEPSoXFD5reo4nPexFWXUnvbKZS',
  'CSW5zZWx6QCjJXempjFGSEQRynTH1oVnT9FUetQvzYV8',
  'Fg4pcMDwrvujjTzmjzAuYckte1tUGVXTiqS1mWvEGdSv',
  'CKgKtFBQqGtgiXDbP66nDNC3eyBLnUzTSewS8vge4fNQ',
  'mTxAYHd5QqyKXEmA2nDrnN21KXpoNDziiVpET2s4jDi',
  '4XjzLKgH5RHdf5qqSsze4dhTKs4e7CATDoGhckyzk16L',
  'FRuq9ycekuv8G88RyehJS5equTNpEvs7Fh9L19m2A9MH',
  'ma57KCXCggBiiUepZRHTNbuUaL6qQZydrKsQBaLUhRd',
  '4J4XduyqQjjQ5nfz9bccBuzr4Vy1vn1w5eLuMnDfaRcU',
  'AqYizJnhd9xMpLRAVt8XMbE8KanswdtcLM1GpaTGMKtD',
  '9RBivmnQyhf78wxXFJZgTJFc1cRJ5U7FpQ4XbKUYiZBi',
  'HXxqUCCmBDHqCyMhby3TFCDFzA9HuJdKBAZHCrA62hWv',
  '2aoZgJinNZRNT9CLKQTjSck8RPSS2ddzWEBS4Ga3CZCE',
  'BREYc98ztAJzEcSNqRPUM9ZFxfP3a2FWApUomDah16fW',
  'Ai197jF3Ab2WeFD6DS3d3mnXNjLyj4eJ2mZ1PYd7QgfJ',
  'ENYzEJkKUKo44wspVXCppXPBz3fPB2j2nqQCKLX18THH',
  '7tgbPNtTrVTfgi7DDMeiEjtTuy7wReDhTpayF3c5Jhxo',
  '5PoBPdJNxyHPQPYGMMcpfZ5o4HKHDCZwwfJ3AzocxCwN',
  'C9CHgYZeGQ1EQpwf98Szfb4cMaLNFCUdb8oyZbyyc2ZK',
  'AH4nNu72cHX4L2jAzoAqw4dqeCximSe6YyDGW14LHiFG',
  '7VsV8ji1nUp7PXuWf3ZVFRPSBwATd6XR2NJrGretm4ET',
  'FoYueTHX4EuyUFyaD8q57tWAJQ721hYTMbSvQDWPEXRo',
  '3QMfrbPmsoz6qF8KKvKbySwbuVtwxMo56xDvLDvFnY6L',
  '78dEEu3qAusrP2J4YWdWVDrDdivKvx1dBESPf5pM2ZZr',
  'D9deygKdHWsqzkio28p2TVucrVaDFsqPNPm2VnBrRogt',
  'CjfMmJiuC4xkZEfq9f8QbLDMdJTv7eotXPrUa6zF6Kxq',
  'Bngat1ubyrxEfKgFHhz7ym6pufMR4PWK2QTyACNxZfDB',
  'CtEf7s7ARojfG7k4YWo4nrF36yWodRBzX3fcN9Le5psd',
  'EULk1rtn1zxt37mxeY3YuVLio6eMrKfM79HPFbG2yMuJ',
  'FPtSyB1KouT5CgY7bsu8WffvZxBnpsWgbkRzmZANiojU',
  'J6PaToLehY9sGQsFDMj66RFbPJeXsiaPgBi1j1c4BaQt',
  '2E7uCAY7G2Fd6PbhSRghxWDqfKMeTwou3HbgowW5UjFB',
  '5ZYrecfeS7dwA18LPqhAYVpLUUUsjuFpY1sE2VQmEVqW',
  '4nRZJWGqJkLwaYsBrD7CVoayuaeoeQAFYhvnaKZMbPtf',
  'Hec3f8iwAroauvk6SJnq9DftdSxdzw4qhiZJbMLiUaFn',
  'FsmHeVbT3z567gNVxFycHA33ULTf5n6u5uUPzL2oYMqz',
  'DKbvWuh6NeDTAbeZ8stnMkobcZM4umbXmeAHXSzKXfsi',
  'EdoDCSjer2J5yNbftVYB44T52gNvVAezbXzTxQULFxCr',
  'AJwrjU2n7ac7Ho318pUyKfKhpH3JwX2MEpv3cyR8E3rk',
  '5Etz6SenyQygxPXPdP6PGhpTHVXaAo34NesDTFUNiZpV',
  '2oB5JB7gzjMhSVG71H6PFmu7CFto9nRFN5xHTwxTNQSH',
  'GffwJecfN3F2WTLCigDGJswt76tdV9hEf6BAqE4FANdi',
  'Fxu7ariKvdmk4kWZeDJ6r7Kbm4vvCAcTs1NxY9EJWJ6W',
  '2RWodbTqMHEkmNiKZu9zxgh83D769UrDY1pGkb4FggR2',
  'HG7xFM7bHnewhn7fv5Zb3FaGbkGNkSARhobNmdn832nZ',
  '4d9zZbtqqTdjJorHMApht4ZRoL3CfgD42JTKzMh8oZth',
  '7rQeRXgYVxnGMNE4yGMyGPjBaDncWhx77T8TLCrT4CzM',
  'J1jnSfGcQM7jtZNtuqz33saMnPSAeGhbqntQANDko2KS',
  '3DrRLMDbXMDGfuLf392WRqC7Kditw49FqbxK5sHQ3MYR',
  '9H7MTkmQympXk16b5Emnsbwe2Wba4D4S2a8bvs53w8am',
  'DZHgaRK3dA85fWVxVeKehPXRD4zyeV4nQfwL4zhWmtum',
  '2v7abH44qFAxyUkafoMZ6hF3o1tvDx3MddQhmvZeUsTe',
  'J4DeM2vEEMoDCVoDzPLs6gN2C7vFupxQxQMdzUNnTFdr',
  'F1bJz7e9XbF324VYuj9Vzs64tBS9yvfcUvBfx2z3ZqZv',
  '56HVPv1WeKhTAzDWCXYfxxSihZGK9iupcRQoo9eFJcmB',
  'A9SFYn1kqLmeomBtAatKKgn74Cn19j2YXVtAFA6qXs7P',
  '3uToTDw4QsNyfer4ieYh6uLaLthZaLWzmkUFF356BCjc',
  '6VKAsKRaSjqAbRMY3hEnpj5cmtZ7M2AxveC92XZNmzc9',
  'HXEwYwjCDmoRSJEgakEyPURkwDqJb4SDvqPEvKjntG9A',
  '7sMh3XCdHUGWQzjqDc91QoYsyb5eVozrXSyBskLPUXaG',
  'GY4ymSHLqYRv4cB9CPScze9ZibAicnoupr3PEukJ5Jfx',
  'BrMZSrmVBimd5LyQPVJmmL5giQQ5wtmJYrmCVmSCgXjR',
  '63Wypm9UvKDLASapZnyAERku96opxa91QtML8UbuCURM',
  'Dh8Wx5BCZS5EZtKe2HUNx7i4QQmivnJtD4jAzj314qfa',
  '6YUToMWPHMqgxoCFEDBXAAynqrgCTE82x2Fdh8iVnDJn',
  'EgSQNKbkqK5PghXx9qTpvdAcHmwvWKy4Pw8fcpE2Mzcv',
  'DPXuPbnAe8Xv28CEDHK9tAzTTWWjMX29k2Cj48JUZfjd',
  'F71njDc9uRjiAKtzqB77NXiwQDXPT9ZdQFNTKrgCQN2Z',
  'Hx2e9cqrwAjb5TNqhwkw29CM6uL6iVCqQrTpXhmwX4M7',
  '8R5n4nyuNbPfdzCRWKXGgDk1kZgrRamcdQ4E1ojQsobf',
  'Hd6RFbUx6DAjE5tThmNpiq8YSZ26Rp3SEWWwtKQ4fntH',
  'CQm61T6irUEBgHvutShhArNjKWjRrkyaV7CnuzsSaqtC',
  '7Wnwuo2uvnjfJJL4u2WaEEDombMfVZLk1UE41mW4h7Y4',
  'BXLSULRDkHwzgaEqx3KLqM6kY6JeFsc6fVG5hC94LqSw',
  '5ovf6jB5sQDfjRAAj77jzbQ1d9K5x5aiNKaDsfRU2DZC',
]

const CONTINUOUS_TIPS_FROM = 1772323200 // 2026-03-01

const LABELS = {
  TIPS: 'Transaction Landing Tips',
}

const toList = (accounts: string[]) => accounts.map((account) => `'${account}'`).join(',')

const fetch = async (options: FetchOptions) => {
  const [row] = await queryAllium(`
    SELECT SUM(raw_amount) AS tips
    FROM solana.assets.transfers
    WHERE mint = '${ADDRESSES.solana.SOL}'
      AND to_address IN (${toList([...PUBLIC_TIP_ACCOUNTS, ...AXIOM_TIP_ACCOUNTS])})
      AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `)

  if (row?.tips == null && options.startTimestamp >= CONTINUOUS_TIPS_FROM)
    throw new Error(`No Lunar Lander tips found between ${options.startTimestamp} and ${options.endTimestamp}`)

  const dailyFees = options.createBalances()
  dailyFees.add(ADDRESSES.solana.SOL, Number(row?.tips ?? 0), LABELS.TIPS)

  return { dailyFees }
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-12-12',
  pullHourly: true,
  skipBreakdownValidation: true, // validator and partner payouts are off-chain, so no revenue split (see methodology)
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: "SOL tips traders pay to land transactions through Lunar Lander, at the tip accounts in Hello Moon's docs plus the 100 accounts that receive Axiom users' bribes (published by Circular and confirmed on-chain to be landed by Lunar); revenue is not reported because what Lunar pays validators and order-flow partners happens off-chain.",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.TIPS]: "Tips sent to the 10 Lunar Lander tip accounts in Hello Moon's docs (https://docs.hellomoon.io/reference/lunar-lander) and to the 100 Axiom bribe accounts listed at https://github.com/Circular-fi/axiom-lunar-addresses.",
    },
  },
}

export default adapter
