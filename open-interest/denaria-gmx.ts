import { FetchOptions, FetchResultV2, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'

// Denaria (https://denaria.finance) trades on GMX V2 (Arbitrum One) through per-user
// smart accounts; see dexs/denaria-gmx.ts for the attribution model.
//
// Account discovery: the Denaria app sets its referral code (DENARIA) on every order,
// and GMX ReferralStorage emits SetTraderReferralCode(account, code) the first time an
// account trades with that code. The accounts carrying the DENARIA code are the
// Denaria user set (the staging environment uses a different code).
//
// Open interest: notional (sizeInUsd) of those accounts' open GMX V2 positions, read
// from the GMX Reader at the end of the window. Each position is counted once, matching
// the one-sided convention of the GMX V2 open-interest adapter. The same positions are
// part of GMX V2 open interest, hence doublecounted.

// https://arbiscan.io/address/0xe6fab3F0c7199b0d34d7FbE83394fc0e0D06e99d
const REFERRAL_STORAGE = '0xe6fab3F0c7199b0d34d7FbE83394fc0e0D06e99d'
// https://arbiscan.io/address/0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8
const DATA_STORE = '0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8'
// GMX V2 Reader (https://arbiscan.io/address/0xe739e72E0e434A2626d6bE07590AcA74C00c764C)
const READER = '0xe739e72E0e434A2626d6bE07590AcA74C00c764C'
// bytes32("DENARIA")
const DENARIA_REFERRAL_CODE = '0x44454e4152494100000000000000000000000000000000000000000000000000'
// registerCode("DENARIA") tx 0x6823c6d2de6ada7463c7142e2ce85e93049b3828f3fe6fbac7603f295562332c (2026-08-28):
// no account can carry the code before this block.
const DENARIA_CODE_REGISTERED_BLOCK = 499310837

const SET_TRADER_REFERRAL_CODE_ABI = 'event SetTraderReferralCode(address account, bytes32 code)'
const GET_ACCOUNT_POSITIONS_ABI = 'function getAccountPositions(address dataStore, address account, uint256 start, uint256 end) view returns (tuple(tuple(address account, address market, address collateralToken) addresses, tuple(uint256 sizeInUsd, uint256 sizeInTokens, uint256 collateralAmount, int256 pendingImpactAmount, uint256 borrowingFactor, uint256 fundingFeeAmountPerSize, uint256 longTokenClaimableFundingAmountPerSize, uint256 shortTokenClaimableFundingAmountPerSize, uint256 increasedAtTime, uint256 decreasedAtTime) numbers, tuple(bool isLong) flags)[])'

// GMX V2 USD values are 30-decimal fixed point; keep 6 decimals of USD precision.
function usd30(amount: bigint): number {
  return Number(amount / 10n ** 24n) / 1e6
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  // Small, append-only list (one event per account), safe to cache.
  const codeLogs = await options.getLogs({
    target: REFERRAL_STORAGE,
    eventAbi: SET_TRADER_REFERRAL_CODE_ABI,
    fromBlock: DENARIA_CODE_REGISTERED_BLOCK,
    toBlock: Number(options.toApi.block),
    cacheInCloud: true,
  })
  const accounts = [...new Set(
    codeLogs
      .filter((log: any) => String(log.code).toLowerCase() === DENARIA_REFERRAL_CODE)
      .map((log: any) => String(log.account).toLowerCase()),
  )]

  let longOpenInterest = 0n
  let shortOpenInterest = 0n
  if (accounts.length) {
    const positionsPerAccount: any[][] = await options.toApi.multiCall({
      target: READER,
      abi: GET_ACCOUNT_POSITIONS_ABI,
      calls: accounts.map((account) => ({ params: [DATA_STORE, account, 0, 100] })),
    })
    for (const positions of positionsPerAccount) {
      for (const position of positions) {
        const sizeInUsd = BigInt(position.numbers.sizeInUsd.toString())
        if (position.flags.isLong) longOpenInterest += sizeInUsd
        else shortOpenInterest += sizeInUsd
      }
    }
  }

  const openInterestAtEnd = options.createBalances()
  const longOpenInterestAtEnd = options.createBalances()
  const shortOpenInterestAtEnd = options.createBalances()
  openInterestAtEnd.addUSDValue(usd30(longOpenInterest + shortOpenInterest))
  longOpenInterestAtEnd.addUSDValue(usd30(longOpenInterest))
  shortOpenInterestAtEnd.addUSDValue(usd30(shortOpenInterest))

  return { openInterestAtEnd, longOpenInterestAtEnd, shortOpenInterestAtEnd }
}

const methodology = {
  OpenInterest: 'Notional USD size of the open GMX V2 positions held by accounts that trade through Denaria (accounts carrying the DENARIA referral code on GMX ReferralStorage), read from the GMX Reader at the end of the period. Each position is counted once; the same positions are part of GMX V2 Perps open interest.',
}

const adapter: SimpleAdapter = {
  version: 2,
  // Snapshot metric read at the window end; hourly pulls would only repeat the same Reader calls.
  pullHourly: false,
  doublecounted: true, // positions live on GMX V2, whose open interest is already tracked
  chains: [CHAIN.ARBITRUM],
  start: '2026-09-01', // first executed Denaria trade on GMX: 2026-09-02 10:40 UTC (block 500951478); same start as dexs/denaria-gmx.ts (the runner only computes a window whose day is after start)
  fetch,
  methodology,
}

export default adapter
