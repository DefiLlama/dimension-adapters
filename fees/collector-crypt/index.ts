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

// CARDS flows:
// - buyback bot: funded with USDC from the gacha sink, buys CARDS on the Raydium CARDS/USDC pool
//   and later burns them. Holders revenue, counted at purchase (CARDS received from the pool).
// - LP fees: the treasury is an LP of the same pool and claims fees in both tokens. The USDC side
//   stays with the protocol (fees, revenue, protocol revenue); the CARDS side has been burned so far
//   and is counted as holders revenue at claim time. Only fee-only claims are counted (Raydium
//   decrease_liquidity with liquidity = 0), so liquidity withdrawals are excluded.
const BUYBACK_BOT = '3nGNwiz1qevPjhEoQi1dLj16oTkjmbevTnpV9piWY7Kq'; // active since 2026-04-19
const TREASURY = '3PnVBrb4wPLFLW38oaYR7dA6HSfKpawxHGESPj5kF1QB'; // Squads multisig
const CARDS_USDC_POOL = 'HnhpJPJgBG2KwniMTNW8cVBHvk1hFog3RC3kjnyc23tD'; // Raydium CLMM pool state (owner of the vaults)
const RAYDIUM_CLMM = 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK';
// Anchor discriminators of decrease_liquidity_v2 and decrease_liquidity; the u128 liquidity
// argument follows the discriminator, 16 zero bytes means a fee-only claim.
const DECREASE_LIQUIDITY_DISCRIMINATORS = ['3a7fbc3e4f52c460', 'a026d06f685b2c01'];

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
  'jrS7Pbn38wKiPsXbyNhGCr3icfXuJxdytZr1N4TwdFu', // CC bot wallet, sends USDC into the gacha sink
  '3nGNwiz1qevPjhEoQi1dLj16oTkjmbevTnpV9piWY7Kq', // buyback bot: its USDC funding from the gacha sink is not a pack buyback spend
]

const timeRange = (options: FetchOptions) =>
  `block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})`;

const teamAddresses = TEAM_ADDRESSES.map(addr => `'${addr}'`).join(', ');
const decreaseLiquidityDiscriminators = DECREASE_LIQUIDITY_DISCRIMINATORS.map(d => `'${d}'`).join(', ');
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
        AND from_address = '${CARDS_USDC_POOL}'
        AND mint = '${CARDS_MINT}'
        AND ${timeRange(options)}
    ),
    lp_claim_txs AS (
      SELECT txn_id
      FROM (
        SELECT txn_id, data_hex FROM solana.raw.inner_instructions
        WHERE program_id = '${RAYDIUM_CLMM}'
          AND data_hex_first16 IN (${decreaseLiquidityDiscriminators})
          AND accounts[0]::string = '${TREASURY}'
          AND ${timeRange(options)}
        UNION ALL
        SELECT txn_id, data_hex FROM solana.raw.instructions
        WHERE program_id = '${RAYDIUM_CLMM}'
          AND data_hex_first16 IN (${decreaseLiquidityDiscriminators})
          AND accounts[0]::string = '${TREASURY}'
          AND ${timeRange(options)}
      )
      GROUP BY txn_id
      HAVING MAX(CASE WHEN SUBSTR(data_hex, 17, 32) = REPEAT('0', 32) THEN 0 ELSE 1 END) = 0
    ),
    lp_fees AS (
      SELECT
        COALESCE(SUM(CASE WHEN t.mint = '${USDC_MINT}' THEN t.amount END), 0) AS usdc,
        COALESCE(SUM(CASE WHEN t.mint = '${CARDS_MINT}' THEN t.raw_amount END), 0) AS cards_raw
      FROM solana.assets.transfers t
      JOIN lp_claim_txs c ON t.txn_id = c.txn_id
      WHERE t.from_address = '${CARDS_USDC_POOL}'
        AND t.to_address = '${TREASURY}'
        AND t.mint IN ('${USDC_MINT}', '${CARDS_MINT}')
        AND ${timeRange(options)}
    )
    SELECT
      COALESCE(g.onchain_spend, 0) AS gacha_spend_onchain,
      COALESCE(gf.fiat_spend, 0) AS gacha_spend_fiat,
      COALESCE(f.inflow, 0) AS fees_royalty,
      COALESCE(b.buyback, 0) AS buyback,
      COALESCE(cb.cards_bought, 0) AS cards_buyback,
      COALESCE(lf.usdc, 0) AS lp_fees_usdc,
      COALESCE(lf.cards_raw, 0) AS lp_fees_cards
    FROM gacha_in g
      CROSS JOIN gacha_fiat gf
      CROSS JOIN fees f
      CROSS JOIN buyback b
      CROSS JOIN cards_buyback cb
      CROSS JOIN lp_fees lf
  `;

  const data = await queryAllium(query);

  let cardsBought = 0;
  let lpFeesCards = 0;
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
    lpFeesCards = Number(result.lp_fees_cards || 0);
    dailyFees.addUSDValue(result.lp_fees_usdc, 'LP Fees');
    dailyFees.add(CARDS_MINT, lpFeesCards, 'LP Fees');
  }

  // Protocol revenue keeps the USDC side of the LP fees. The CARDS side of the LP fees and the
  // gacha-funded buyback go to holders instead.
  const dailyProtocolRevenue = dailyFees.clone();
  if (cardsBought > 0) {
    dailyHoldersRevenue.add(CARDS_MINT, cardsBought, 'Token Buyback');
    dailyProtocolRevenue.add(CARDS_MINT, -cardsBought, 'Token Buyback');
  }
  if (lpFeesCards > 0) {
    dailyHoldersRevenue.add(CARDS_MINT, lpFeesCards, 'LP Fees');
    dailyProtocolRevenue.add(CARDS_MINT, -lpFeesCards, 'LP Fees');
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
  Fees: "Gacha card pack sales (on-chain and fiat/credit-card) and marketplace royalties, net of gacha pack buybacks, plus the LP fees the treasury claims from the CARDS/USDC pool.",
  Revenue: "Same as Fees: gacha sales and royalties net of pack buybacks, plus claimed LP fees.",
  UserFees: "Total fees paid by users for gacha and marketplace transactions.",
  HoldersRevenue: "CARDS bought back with gacha revenue (since April 2026) and the CARDS side of the treasury's claimed LP fees, which is burned.",
  ProtocolRevenue: "Revenue minus the CARDS that go to holders: gacha revenue spent on buybacks and the CARDS side of LP fees. The USDC side of LP fees stays with the protocol."
}

const gachaBreakdown = {
  "Gacha Pack Sales": "Gacha pack sales settled onchain: all non-team USDC inflows to the gacha sink wallets, across every price tier.",
  "Gacha Fiat Pack Sales": "Gacha pack sales settled via the CC fiat/credit-card rail: all non-team inflows to the fiat-rail wallet, which arrive bundled across packs.",
  "Royalty Fees": "Royalty fees from marketplace transactions.",
  "Pack Buyback Spends": "Expenditures on gacha pack buybacks.",
  "LP Fees": "USDC and CARDS LP fees claimed by the treasury from the CARDS/USDC pool (fee-only claims, liquidity withdrawals excluded).",
}

const breakdownMethodology = {
  Fees: gachaBreakdown,
  Revenue: gachaBreakdown,
  ProtocolRevenue: {
    ...gachaBreakdown,
    "LP Fees": "USDC side of the claimed LP fees; the CARDS side is moved to holders.",
    "Token Buyback": "CARDS bought back with gacha revenue, moved from protocol revenue to holders.",
  },
  HoldersRevenue: {
    "Token Buyback": "CARDS bought back with gacha revenue, counted at purchase.",
    "LP Fees": "CARDS side of the claimed LP fees, burned by the team, counted at claim.",
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
