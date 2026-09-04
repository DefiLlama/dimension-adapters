import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// OKX books each referral commission with one of these events. There are two generations: the
// original three-argument pair, and a four-argument pair that adds the commission rate and so
// hashes to a different topic. The four-argument pair first fired on 2025-11-14 and the
// three-argument pair last fired on 2026-03-31, so both are needed to cover the full history.
const CommissionFromTokenRecordEvent = 'event CommissionFromTokenRecord(address tokenAddress, uint256 commissionAmount, address referrerAddress)';
const CommissionToTokenRecordEvent = 'event CommissionToTokenRecord(address tokenAddress, uint256 commissionAmount, address referrerAddress)';
const CommissionFromTokenRecordEventV2 = 'event CommissionFromTokenRecord(address tokenAddress, uint256 commissionAmount, address referrerAddress, uint256 commissionRate)';
const CommissionToTokenRecordEventV2 = 'event CommissionToTokenRecord(address tokenAddress, uint256 commissionAmount, address referrerAddress, uint256 commissionRate)';

const REFERRAL_COMMISSIONS = 'Referral commissions';

const V2_EVENTS_START = 1761955200; // Nov-01-2025 00:00:00 UTC, two weeks before the first one
const V1_EVENTS_END = 1777507200; // Apr-30-2026 00:00:00 UTC, a month after the last one

const endOfDay = (day: string) => Math.floor(Date.parse(`${day}T23:59:59Z`) / 1e3);

interface IRouter {
  // Each entry is a router and, for the ones OKX has already replaced, the day its last commission
  // event fired. OKX rotates its routers roughly every four months and does it on every chain on
  // the same day, so a chain accumulates several over time but only one or two can produce logs in
  // any given window. Retired routers are skipped for windows that start after they stopped; some
  // of these chains have a single public RPC and querying every router on every window trips it.
  addresses: Array<{ address: string, retiredOn?: string }>;
}

// Every contract that has emitted a commission event and paid the referrer
// 0x6ea08ca8f313d860808ef7431fc72c6fbcf4a72d, which is also the dominant payee of the routers
// previously configured here. Listed oldest-first.
//
// To refresh this list after the next rotation, or to check the dates above, run this query; it
// returns the routers configured for a chain, oldest-first, and its first_log / last_log are what
// date V2_EVENTS_START and V1_EVENTS_END above (first and last log of each event generation, plus a
// margin). Drop the blockchain filter to cover every chain in one pass, at the cost of a far longer
// scan.
//
//   SELECT blockchain, contract_address, min(block_time) AS first_log, max(block_time) AS last_log
//   FROM evms.logs
//   WHERE blockchain = 'ethereum'
//     AND block_time >= timestamp '2025-09-01'
//     AND topic0 IN (
//       0x0d3b1268ca3dbb6d3d8a0ea35f44f8f9d58cf578d732680b71b6904fb2733e0d,  -- CommissionFromTokenRecord
//       0xf171268de859ec269c52bbfac94dcb7715e784de194342abb284bf34fd30b32d,  -- CommissionToTokenRecord
//       0xcd5eae9d9d0b96532bd1b7dbf6628ce436b2af735829087a03c548439f8bf850,  -- ...FromTokenRecord, 4 args
//       0x3cfb523a4c38d88561dd3bf04805a31715c8b5fc468a03b8d684356f360dea99)  -- ...ToTokenRecord, 4 args
//     AND bytearray_substring(data, 65, 32)  -- the referrer is the third word of `data`
//       = 0x0000000000000000000000006ea08ca8f313d860808ef7431fc72c6fbcf4a72d
//   GROUP BY 1, 2
//   ORDER BY 1, 3
//
// `retiredOn` is a router's last commission log to ANY referrer, which is the same query without
// the referrer line: a router can keep paying other referrers after it stops paying this one, and
// cutting it off at the earlier date would drop those fees. Metis and Blast have to be read from
// the chains directly, since Dune does not index either.
const routers: Record<string, IRouter> = {
  [CHAIN.ETHEREUM]: {
    addresses: [
      { address: '0xDcB7028E5EAA1d7bB82B7152Cb0e7adC12e7457c', retiredOn: '2026-08-03' },
      { address: '0x2E1Dee213BA8d7af0934C49a23187BabEACa8764', retiredOn: '2025-12-04' },
      { address: '0xF6801D319497789f934ec7F83E142a9536312B08', retiredOn: '2025-12-17' },
      { address: '0x5E1f62Dac767b0491e3CE72469C217365D5B48cC', retiredOn: '2026-05-12' },
      { address: '0x28b1Dc1a5E3699A428BC51d234DFab7C9CB2a183', retiredOn: '2026-08-24' },
      { address: '0x8feAB81D36E7576107D5dE0758c1b839Be31B4F6' },
    ],
  },
  [CHAIN.SONIC]: {
    addresses: [
      { address: '0xcc96b656b6dff0B5318d53271b82B7E7183b95D2', retiredOn: '2025-11-17' },
      { address: '0x49E10cAee23d198CEE1E44b2a222232A85Df62Bb', retiredOn: '2025-12-17' },
      { address: '0x86F752f1F662f39BFbcBeF95EE56B6C20d178969', retiredOn: '2026-04-23' },
      { address: '0x79f7C6C6dc16Ed3154E85A8ef9c1Ef31CEFaEB19', retiredOn: '2026-08-24' },
      { address: '0xd72f9Af181A0eB1B8550a00124ECdb71Bb758C89' },
    ],
  },
  [CHAIN.ERA]: {
    addresses: [
      { address: '0x010BC6B1014E5ed8284ab0667b116AAb99588159', retiredOn: '2025-11-17' },
      { address: '0xa081120347e57EB74DE8a9bE4a0441EbcB0A35F6', retiredOn: '2025-12-17' },
      { address: '0x3163Ed233a3Cb5E6B7F10A6f02b01F15867a8779', retiredOn: '2026-04-23' },
      { address: '0x6f7c20464258c732577c87a9B467619e03e5C158', retiredOn: '2026-08-24' },
      { address: '0x46eDEcEa0228f04Ab88dC34BE98314863bA40bE0' },
    ],
  },
  [CHAIN.OPTIMISM]: {
    addresses: [
      { address: '0x86F752f1F662f39BFbcBeF95EE56B6C20d178969', retiredOn: '2025-11-17' },
      { address: '0xC44C6550a3B13116F6fD593e1ec963d5aE78C4C8', retiredOn: '2025-12-17' },
      { address: '0x6733Eb2E75B1625F1Fe5f18aD2cB2BaBDA510d19', retiredOn: '2026-04-23' },
      { address: '0xDd5E9B947c99Aa60bab00ca4631Dce63b49983E7', retiredOn: '2026-08-24' },
      { address: '0x1f5B43127414E36c31eCb5Ff5567262997CD24D0' },
    ],
  },
  [CHAIN.POLYGON]: {
    addresses: [
      { address: '0xF5402CCC5fC3181B45D7571512999D3Eea0257B6', retiredOn: '2025-11-17' },
      { address: '0x5e11D6A2184c321e69c6443DedB980F943DB7836', retiredOn: '2025-12-17' },
      { address: '0x057cFd839AA88994d1A8A8C6D336CF21550F05Ef', retiredOn: '2026-04-27' },
      { address: '0xF6E1B4b201e220FC3741bd7a75675ffEA25c02AD' },
      { address: '0x3C4829196BFadFF4394726b45159aeaAC6FCd41c' },
    ],
  },
  [CHAIN.BSC]: {
    addresses: [
      { address: '0xF4858d71e5d7D27e3F7270390Cd57545DcA35aa9', retiredOn: '2026-05-07' },
      { address: '0x6015126d7D23648C2e4466693b8DeaB005ffaba8', retiredOn: '2025-12-11' },
      { address: '0xd547Eafde2410e63300Fc5308CceA0b356E7b5d8', retiredOn: '2025-12-18' },
      { address: '0x3156020dfF8D99af1dDC523ebDfb1ad2018554a0' },
      { address: '0x62cceF0b4545166f721cAa9fEe13c1d3767E27dc' },
      { address: '0x5994814f2C4040b863A0125A45DE152a8c2A4DEc' },
    ],
  },
  [CHAIN.AVAX]: {
    addresses: [
      { address: '0x79f7C6C6dc16Ed3154E85A8ef9c1Ef31CEFaEB19', retiredOn: '2025-11-17' },
      { address: '0x2E84246828ddae18500Bc0CF23dd8A8d1Aa5Cf1f', retiredOn: '2025-12-17' },
      { address: '0x8aDFb0D24cdb09c6eB6b001A41820eCe98831B91', retiredOn: '2026-04-23' },
      { address: '0xa94Fcf9fc56a864f8DE51e6315aee5863AD63C91', retiredOn: '2026-08-24' },
      { address: '0xAB96dcFA7A7D669d9BF5918faB8641479973dD0A' },
    ],
  },
  [CHAIN.ARBITRUM]: {
    addresses: [
      { address: '0xfFb8322DEEeADF0d61589211493Fb2Dc668D3CC0', retiredOn: '2026-04-28' },
      { address: '0x5e2F47bD7D4B357fCfd0Bb224Eb665773B1B9801', retiredOn: '2025-11-19' },
      { address: '0x3608c8186fF3dCa322DeEFb8c27162162d581081', retiredOn: '2026-03-31' },
      { address: '0x368E01160C2244B0363a35B3fF0A971E44a89284', retiredOn: '2026-04-23' },
      { address: '0x7CF6b330b437E9fb432B1400DE17B03357Cf049A', retiredOn: '2026-08-24' },
      { address: '0x09f94b5Fc68e227C323A6FbaE3Bd98C97fD8c849' },
    ],
  },
  [CHAIN.LINEA]: {
    addresses: [
      { address: '0x6f7c20464258c732577c87a9B467619e03e5C158', retiredOn: '2025-11-17' },
      { address: '0x5Eb082A0713481d29cDCd19B2Af5736007571472', retiredOn: '2025-12-17' },
      { address: '0x9EaBF1D34819D9eC9Fe5fd3Db4e9DCD12Fa05284', retiredOn: '2026-04-23' },
      { address: '0x2E1Dee213BA8d7af0934C49a23187BabEACa8764', retiredOn: '2026-08-24' },
      { address: '0xdfcb0cEcC10e78F3F3749F3f3d3EE4047b2c9829' },
    ],
  },
  [CHAIN.BASE]: {
    addresses: [
      { address: '0xBb686278C6EB5B0a9Cc4406F8Db5A79BfaF53a99', retiredOn: '2026-04-29' },
      { address: '0x5e2F47bD7D4B357fCfd0Bb224Eb665773B1B9801', retiredOn: '2025-11-19' },
      { address: '0x2bD541Ab3b704F7d4c9DFf79EfaDeaa85EC034f1', retiredOn: '2026-03-05' },
      { address: '0x4409921Ae43a39a11D90F7B7F96cfd0B8093d9fC', retiredOn: '2026-04-23' },
      { address: '0xC8F6b8Ba0DC0f175B568B99440B0867F69A29265', retiredOn: '2026-08-24' },
      { address: '0x67d03631FE51B741C0C00c4E16eb662AC84381df' },
    ],
  },
  [CHAIN.MANTLE]: {
    addresses: [
      { address: '0x69C236E021F5775B0D0328ded5EaC708E3B869DF', retiredOn: '2025-11-17' },
      { address: '0x1f16A607a7f3F3044E477abFFc8BD33952cE306b', retiredOn: '2025-12-17' },
      { address: '0xF5402CCC5fC3181B45D7571512999D3Eea0257B6', retiredOn: '2026-04-23' },
      { address: '0xcF76984119C7f6ae56fAfE680d39C08278b7eCF4', retiredOn: '2026-08-24' },
      { address: '0x472fc4f7fd3C9F06f0b8637c5505815ac80938Ad' },
    ],
  },
  [CHAIN.BLAST]: {
    addresses: [
      { address: '0x69C236E021F5775B0D0328ded5EaC708E3B869DF', retiredOn: '2025-09-26' },
      { address: '0x472fc4f7fd3C9F06f0b8637c5505815ac80938Ad' },
    ],
  },
  [CHAIN.UNICHAIN]: {
    addresses: [
      { address: '0x411d2C093e4c2e69Bf0D8E94be1bF13DaDD879c6', retiredOn: '2025-11-17' },
      { address: '0x1e3143b9cB44170098092e53bfbCE76E1Ce53E00', retiredOn: '2025-12-16' },
      { address: '0x23E2f2FA1967FAffde2e05fDecbb3fa787A5D3E5', retiredOn: '2026-04-22' },
      { address: '0x6733Eb2E75B1625F1Fe5f18aD2cB2BaBDA510d19', retiredOn: '2026-08-24' },
      { address: '0xe3dAb8Bf5187F9B4E8E89FF5414D7CF71E2C82e1' },
    ],
  },
  [CHAIN.PLASMA]: {
    addresses: [
      { address: '0xd30D8CA2E7715eE6804a287eB86FAfC0839b1380', retiredOn: '2025-11-17' },
      { address: '0x509c370Da4Dc569f45D48A2318a54c5442Bc23CF', retiredOn: '2025-12-17' },
      { address: '0x5C1c902e7E04DE98b49aCd3De68E12BEE2d7908D', retiredOn: '2026-04-22' },
      { address: '0x19D345f95A80cc136d898f41b490E023cFF78658', retiredOn: '2026-08-24' },
      { address: '0xd72f9Af181A0eB1B8550a00124ECdb71Bb758C89' },
    ],
  },
  [CHAIN.METIS]: {
    addresses: [
      { address: '0x25e7f77F33206d311A0130D4b5B881E5Db1181b1' },
      { address: '0x472fc4f7fd3C9F06f0b8637c5505815ac80938Ad' },
    ],
  },
  [CHAIN.MONAD]: {
    addresses: [
      { address: '0xb1E4E25b1938c78Ec0b21cCb2D6a0Be60aA7E63f', retiredOn: '2025-12-17' },
      { address: '0x6088d94C5a40CEcd3ae2D4e0710cA687b91c61d0', retiredOn: '2026-04-23' },
      { address: '0x7A7AD9aa93cd0A2D0255326E5Fb145CEc14997FF', retiredOn: '2026-08-24' },
      { address: '0xc1C76E784Db8D68585fb608ce68FC5DcFF14000E' },
    ],
  },
  [CHAIN.HYPERLIQUID]: {
    addresses: [
      { address: '0x9Ac7b1FFEE0f58c0a3c89AA54Afb62efD25DC9fd', retiredOn: '2026-08-24' },
      { address: '0xb193874f0C77948d2bCFeC2EfAF8Bc65B4C2ca89' },
    ],
  },
  [CHAIN.CRONOS]: {
    addresses: [
      { address: '0xC589a4eD6A9fc3354d7eeF88bA87b51AFC272783', retiredOn: '2025-11-16' },
      { address: '0xB21A65a68A6abEed1A344AEB69AF146D64B06127', retiredOn: '2025-12-17' },
      { address: '0xcF76984119C7f6ae56fAfE680d39C08278b7eCF4', retiredOn: '2026-04-23' },
      { address: '0x25e7f77F33206d311A0130D4b5B881E5Db1181b1', retiredOn: '2026-08-24' },
      { address: '0xc86fB5Bf6bfdE081fd627C639C05E70D23cf7717' },
    ],
  },
  [CHAIN.FANTOM]: {
    addresses: [
      { address: '0x5e2F47bD7D4B357fCfd0Bb224Eb665773B1B9801', retiredOn: '2025-11-17' },
      { address: '0x4f61d47f5942AD214A0fE93DAE2e82f4cB871D81', retiredOn: '2025-12-17' },
      { address: '0xcF76984119C7f6ae56fAfE680d39C08278b7eCF4', retiredOn: '2026-04-23' },
      { address: '0x25e7f77F33206d311A0130D4b5B881E5Db1181b1', retiredOn: '2026-08-24' },
      { address: '0xd72f9Af181A0eB1B8550a00124ECdb71Bb758C89' },
    ],
  },
  [CHAIN.INK]: {
    addresses: [
      { address: '0x9bf3f60252be1a2fD3Ed38086ED3d02b25B4EeAD', retiredOn: '2026-08-24' },
      { address: '0x8F98a825ac89501AFE33299DdB561829A24C0CC4' },
    ],
  },
  [CHAIN.SCROLL]: {
    addresses: [
      { address: '0x86F752f1F662f39BFbcBeF95EE56B6C20d178969', retiredOn: '2025-11-17' },
      { address: '0x6702E6db3d5cc50E0040E7876A48faA5a4706148', retiredOn: '2025-12-17' },
      { address: '0x6733Eb2E75B1625F1Fe5f18aD2cB2BaBDA510d19', retiredOn: '2026-04-23' },
      { address: '0x5e2F47bD7D4B357fCfd0Bb224Eb665773B1B9801', retiredOn: '2026-08-24' },
      { address: '0x6148d68Ec192DF0a7d36d97BDaBBEBb014c69938' },
    ],
  },
  [CHAIN.APECHAIN]: {
    addresses: [
      { address: '0x69C236E021F5775B0D0328ded5EaC708E3B869DF', retiredOn: '2025-11-16' },
      { address: '0x1e3143b9cB44170098092e53bfbCE76E1Ce53E00', retiredOn: '2025-12-13' },
      { address: '0x23E2f2FA1967FAffde2e05fDecbb3fa787A5D3E5', retiredOn: '2026-04-22' },
      { address: '0xcF76984119C7f6ae56fAfE680d39C08278b7eCF4', retiredOn: '2026-08-23' },
      { address: '0x472fc4f7fd3C9F06f0b8637c5505815ac80938Ad' },
    ],
  },
}

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const targets = routers[options.chain].addresses
    .filter(({ retiredOn }) => !retiredOn || options.fromTimestamp <= endOfDay(retiredOn))
    .map(({ address }) => address)

  // Outside the overlap only one generation can produce logs, so querying the other is wasted work.
  const eventAbis = [
    ...(options.fromTimestamp < V1_EVENTS_END ? [CommissionFromTokenRecordEvent, CommissionToTokenRecordEvent] : []),
    ...(options.toTimestamp >= V2_EVENTS_START ? [CommissionFromTokenRecordEventV2, CommissionToTokenRecordEventV2] : []),
  ]

  const events = await Promise.all(eventAbis.map((eventAbi) => options.getLogs({ eventAbi, targets, flatten: true })))

  for (const event of events.flat()) {
    dailyFees.add(event.tokenAddress, event.commissionAmount, REFERRAL_COMMISSIONS)
  }

  return {
    dailyFees: dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: 0,
    dailySupplySideRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  methodology: {
    Fees: 'Total comission fees from every trade.',
    UserFees: 'Users pay small amount of fees on trades.',
    Revenue: 'No revenue',
    SupplySideRevenue: 'All comission fees distributed to referrer addresses.',
  },
  breakdownMethodology: {
    Fees: {
      [REFERRAL_COMMISSIONS]: "Commission each OKX router records on the swaps it routes, counted in whichever token the commission was taken in.",
    },
    UserFees: {
      [REFERRAL_COMMISSIONS]: "The same commissions, which are paid by the user out of the swap.",
    },
    SupplySideRevenue: {
      [REFERRAL_COMMISSIONS]: "Every commission is booked against the referrer that brought the trade, so all of it is supply side.",
    },
  },
  chains: Object.keys(routers),
  start: '2025-08-05',
}

export default adapter;
