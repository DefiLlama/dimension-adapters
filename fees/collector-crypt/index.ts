import ADDRESSES from '../../helpers/coreAssets.json'
import { SimpleAdapter, FetchOptions, Dependencies } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

const USDC_MINT = ADDRESSES.solana.USDC;

// On-chain crypto gacha sinks. All non-team USDC inflows are pack purchases, so there is no
// price-tier filter: CC keeps launching new tiers (150/151/420/5000 in Jul-2026) and a hardcoded
// tier list silently drops their revenue until someone notices. Same rule as the fiat rail below.
const GACHA_ONCHAIN_ADDRESSES = [
  'GachazZscHZ5bn3vnq1yEC4zpYdhAYJBzuKJwSJksc9z', // decommissioned pre-Dec-2025, kept for history
  'GachaNgyXTU3zFogQ8Z5jR2BLXs8215X2AtEH18VxJq3', // primary on-chain sink
];

// CC fiat/credit-card rail. Card-pack purchases settle off-chain (card/Coinbase) and then
// top this wallet up in BUNDLED amounts (e.g. $200 = 2 packs, $750 = 3 packs).
const GACHA_FIAT_ADDRESS = '96DULv1BqYfe5wyMr6pVUNC6Uyrtj6yr3tNi6VtfwW9s';

const CARDS_MINT = 'CARDSccUMFKoPRZxt5vt3ksUbxEFEcnZ3H2pd3dKxYjp';

// CARDS value accrual to holders comes from two flows, both ending in the burn wallet:
//
// 1. Open-market buyback bot (team-named wallet). It is funded with USDC straight from the gacha
//    sink, market-buys CARDS on the CARDS/USDC pool (since 2026-04-19) and forwards everything
//    bought to the burn wallet. CARDS received by the bot = revenue-funded buyback, counted once
//    at purchase; the later transfer to the burn wallet and the burn itself are not counted again.
// 2. LP-fee harvests. The treasury (Squads multisig) is the LP of the CARDS/USDC pool, claims the
//    CARDS side of its LP fees and sends them to the burn wallet. Counted when the treasury
//    transfers CARDS to the burn wallet (first tranche 2026-08-28), not at claim time, because
//    claims mix fee collection with liquidity withdrawals and only the burned part is value to holders.
//
// Other burn-wallet inflows (an earlier bot funded by a market-making wallet, vesting tranches
// returned by advisors) are not revenue-funded and are ignored.
const BUYBACK_BOT = '3nGNwiz1qevPjhEoQi1dLj16oTkjmbevTnpV9piWY7Kq'; // open-market CARDS buyback bot
const TREASURY = '3PnVBrb4wPLFLW38oaYR7dA6HSfKpawxHGESPj5kF1QB'; // CC treasury (Squads), LP of the CARDS/USDC pool
const BURN_WALLET = 'BLuefR7NzdAu9dTUp43dzAnDW9EcCXwM4w2i3sT132z4'; // CARDS burn wallet (burns 2026-08-29, 2026-10-01, ...)
// 'jrS7Pbn38wKiPsXbyNhGCr3icfXuJxdytZr1N4TwdFu' was once tracked as a buyback hub (seen since 2026-06-11); never confirmed, kept only as a team exclusion below

const TEAM_ADDRESSES = [
  'BAxTk97HsaJqbnbFmTiQTaL4KSRvJ8Y65ArZCsP6vA5M',
  '21KhtC7y2JGYvwc8dcGqTdbrudbM8fgMPJsVwxRQqdY8',
  'DFEstpYN3fsz93AC9v2ujzPPngPgodqH2xxopuyfSsAE',
  'HW2HRqN1pXQGH9GfP9xet4XwqtLqFyYGDNRKjUAVgh9u',
  'HighJBfnAaqH9cKkeMErQFJZ4ATxQJwxqFupX6zaKTns',
  'LGNDXqcm6U57QQ6Ad7icZ6oizkAVKRWrw97KwZy5nVf',
  'EpicWWZspT1trKndbDDr29ULViN56rN5vofWSKZp8ePF',
  'Mid9NeCpPNxP59fAdsLgMLy7BYexxXFw52ZP58Jrney',
  'Lowq9dkpY43VpjfYeRjtKfGA6JtB7HaMmwQgXkjHLvN',
  'Low6UekJP3QrFVMfNRTL8CPK2SiGFhvp57sgF2pkmVu',
  'miDtj3vgdxVykHzRyFwyG8MXpvK8eQqamSLVdBr7WPt',
  'HiGHqwYddP5N2waqUmXPdaASpMpUEvfqPr2fSawctEb',
  'epiC3zkqa1RfcPMMM1Kc8m3GZGDwF2RmjbfA3g1BBjn',
  'LGNDfXQFMiRMz3qqTNAREmRFQutMvazqqRrzn5i98uj',
  'SPrT7eFrCM9UJ4j7Xf9iktKCoBwJjfykFbiNbRsKQm8',
  'Cc4pHGnoaRWL1WnHsV517T3YvQn5gLDBMiuVXkF9rZhK',
  '8373hLiAEXxaJ3oV7SRzx4KHwurEg9rEG98tUPj1sdtX',
  'onePMfirJs2Rx3eixoPnjY6NHiaC74pkQ2k313K2Lxs',
  'SportGmqffp9zC3VZV7Wwz6s2nCkEB5Q3nVwKGU4esD',
  'DQPERZ9e86pNJ4mhUnCEP8V75yxZofsipoVrRWT5Wdxd',
  'cc3novbXuNSe292qKH2gGhxToaWjuBvJbA7zQf8NVxi',
  'GachaNgyXTU3zFogQ8Z5jR2BLXs8215X2AtEH18VxJq3',
  'GachazZscHZ5bn3vnq1yEC4zpYdhAYJBzuKJwSJksc9z',
  '96DULv1BqYfe5wyMr6pVUNC6Uyrtj6yr3tNi6VtfwW9s',
  'jrS7Pbn38wKiPsXbyNhGCr3icfXuJxdytZr1N4TwdFu', // unofficial CC bot wallet; kept as an exclusion (it sends USDC into the gacha sink) even though its buyback role is no longer tracked
  '3nGNwiz1qevPjhEoQi1dLj16oTkjmbevTnpV9piWY7Kq', // CARDS buyback bot: its USDC funding from the gacha sink is a token buyback, not a pack buyback spend (was wrongly netted out of fees before 2026-10-03)
]

const timeRange = (options: FetchOptions) =>
  `block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})`;

const teamAddresses = TEAM_ADDRESSES.map(addr => `'${addr}'`).join(', ');
const gachaOnchainAddresses = GACHA_ONCHAIN_ADDRESSES.map(addr => `'${addr}'`).join(', ');

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const query = `
    WITH gacha_in AS (
      SELECT
        COALESCE(SUM(amount), 0) AS onchain_spend
      FROM solana.assets.transfers
      WHERE to_address IN (${gachaOnchainAddresses})
        AND from_address NOT IN (${teamAddresses})
        AND mint = '${USDC_MINT}'
        AND ${timeRange(options)}
    ),
    gacha_fiat AS (
      SELECT
        COALESCE(SUM(amount), 0) AS fiat_spend
      FROM solana.assets.transfers
      WHERE to_address = '${GACHA_FIAT_ADDRESS}'
        AND from_address NOT IN (${teamAddresses})
        AND mint = '${USDC_MINT}'
        AND ${timeRange(options)}
    ),
    fees AS (
      SELECT
        COALESCE(SUM(amount), 0) AS inflow
      FROM solana.assets.transfers
      WHERE to_address = 'DQPERZ9e86pNJ4mhUnCEP8V75yxZofsipoVrRWT5Wdxd'
        AND mint = '${USDC_MINT}'
        AND ${timeRange(options)}
    ),
    buyback AS (
      SELECT
        COALESCE(SUM(amount), 0) AS buyback
      FROM solana.assets.transfers
      WHERE from_address IN ('GachazZscHZ5bn3vnq1yEC4zpYdhAYJBzuKJwSJksc9z','GachaNgyXTU3zFogQ8Z5jR2BLXs8215X2AtEH18VxJq3')
        AND to_address NOT IN (${teamAddresses})
        AND mint = '${USDC_MINT}'
        AND ${timeRange(options)}
    ),
    cards_buyback AS (
      SELECT COALESCE(SUM(raw_amount), 0) AS cards_bought
      FROM solana.assets.transfers
      WHERE to_address = '${BUYBACK_BOT}'
        AND from_address NOT IN (${teamAddresses})
        AND mint = '${CARDS_MINT}'
        AND ${timeRange(options)}
    ),
    lp_fees_burned AS (
      SELECT COALESCE(SUM(raw_amount), 0) AS cards_burned
      FROM solana.assets.transfers
      WHERE from_address = '${TREASURY}'
        AND to_address = '${BURN_WALLET}'
        AND mint = '${CARDS_MINT}'
        AND ${timeRange(options)}
    )
    SELECT
      COALESCE(g.onchain_spend, 0) AS gacha_spend_onchain,
      COALESCE(gf.fiat_spend, 0) AS gacha_spend_fiat,
      COALESCE(f.inflow, 0) AS fees_royalty,
      COALESCE(b.buyback, 0) AS buyback,
      COALESCE(cb.cards_bought, 0) AS cards_buyback,
      COALESCE(lb.cards_burned, 0) AS lp_fees_burned
    FROM gacha_in g
      CROSS JOIN gacha_fiat gf
      CROSS JOIN fees f
      CROSS JOIN buyback b
      CROSS JOIN cards_buyback cb
      CROSS JOIN lp_fees_burned lb
  `;

  const data = await queryAllium(query);

  let cardsBought = 0;
  let lpFeesBurned = 0;
  if (data && data.length > 0) {
    const result = data[0];
    const onchainSpend = Number(result.gacha_spend_onchain || 0);
    if (onchainSpend) {
      dailyVolume.addUSDValue(onchainSpend);
      dailyFees.addUSDValue(onchainSpend, 'Gacha Pack Sales');
    }
    const fiatSpend = Number(result.gacha_spend_fiat || 0);
    if (fiatSpend) {
      dailyVolume.addUSDValue(fiatSpend);
      dailyFees.addUSDValue(fiatSpend, 'Gacha Fiat Pack Sales');
    }
    dailyFees.addUSDValue(result.fees_royalty, 'Royalty Fees');
    dailyFees.addUSDValue(-result.buyback, 'Pack Buyback Spends');
    cardsBought = Number(result.cards_buyback || 0);
    lpFeesBurned = Number(result.lp_fees_burned || 0);
  }

  // CARDS bought back on the open market and CARDS LP fees sent to the burn wallet -> holders
  // revenue. Both are value redirected to holders, so they are subtracted from protocol revenue
  // (total fees/revenue are unchanged). Priced by the framework via the CARDS mint.
  const dailyProtocolRevenue = dailyFees.clone();
  if (cardsBought > 0) {
    dailyHoldersRevenue.add(CARDS_MINT, cardsBought, 'Token Buyback');
    dailyProtocolRevenue.add(CARDS_MINT, -cardsBought, 'Token Buyback');
  }
  if (lpFeesBurned > 0) {
    dailyHoldersRevenue.add(CARDS_MINT, lpFeesBurned, 'LP Fees Burned');
    dailyProtocolRevenue.add(CARDS_MINT, -lpFeesBurned, 'LP Fees Burned');
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyUserFees: dailyFees,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
  }
}

const methodology = {
  Volume: "Gacha pack sales across Collector Crypt and integrated storefronts, including Jupiter Gacha, settled onchain or through the CC fiat/credit-card rail.",
  Fees: "Total fees from gacha card pack sales (on-chain and fiat/credit-card) and marketplace transactions, net of gacha pack buybacks.",
  Revenue: "Revenue from gacha sales (on-chain and fiat/credit-card) + marketplace fees/royalties, net of gacha pack buybacks.",
  UserFees: "Total fees paid by users for gacha and marketplace transactions.",
  HoldersRevenue: "USD value of CARDS removed from supply for holders: CARDS bought on the open market by the gacha-revenue-funded buyback bot (since April 2026, counted at purchase) and CARDS LP fees earned by the treasury on the CARDS/USDC pool that are sent to the burn wallet (since August 2026, counted when burned). Excludes advisor and investor token returns that are also burned.",
  ProtocolRevenue: "Revenue retained by the protocol after gacha pack buybacks, minus the value of CARDS bought back or burned for holders."
}

const gachaBreakdown = {
  "Gacha Pack Sales": "Gacha pack sales settled onchain: all non-team USDC inflows to the gacha sink wallets, across every price tier.",
  "Gacha Fiat Pack Sales": "Gacha pack sales settled via the CC fiat/credit-card rail: all non-team inflows to the fiat-rail wallet, which arrive bundled across packs.",
  "Royalty Fees": "Royalty fees from marketplace transactions.",
  "Pack Buyback Spends": "Expenditures on gacha pack buybacks.",
}

const breakdownMethodology = {
  Fees: gachaBreakdown,
  Revenue: gachaBreakdown,
  ProtocolRevenue: {
    ...gachaBreakdown,
    "Token Buyback": "CARDS bought back on the open market by the gacha-revenue-funded bot, subtracted from protocol revenue and credited to holders.",
    "LP Fees Burned": "CARDS LP fees earned by the treasury on the CARDS/USDC pool and sent to the burn wallet, subtracted from protocol revenue and credited to holders.",
  },
  HoldersRevenue: {
    "Token Buyback": "USD value of CARDS bought back on the open market by the gacha-revenue-funded bot, counted at purchase.",
    "LP Fees Burned": "USD value of CARDS LP fees earned by the treasury on the CARDS/USDC pool, counted when sent to the burn wallet.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-06-04',
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
  allowNegativeValue: true, // fees from marketplace transactions can be lower than gacha buyback expenses
}

export default adapter;
