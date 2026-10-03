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

// Holders revenue, two flows that both end in the CARDS burn wallet:
// - buyback bot: funded with USDC from the gacha sink, buys CARDS on the CARDS/USDC pool and
//   forwards them to the burn wallet. Counted at purchase (CARDS received by the bot).
// - LP fees: the treasury earns CARDS LP fees on the CARDS/USDC pool and sends them to the burn
//   wallet. Counted at the transfer to the burn wallet (claims also include liquidity withdrawals).
// Other burn-wallet inflows (advisor/investor token returns) are not revenue funded and are ignored.
const BUYBACK_BOT = '3nGNwiz1qevPjhEoQi1dLj16oTkjmbevTnpV9piWY7Kq'; // active since 2026-04-19
const TREASURY = '3PnVBrb4wPLFLW38oaYR7dA6HSfKpawxHGESPj5kF1QB'; // Squads multisig
const BURN_WALLET = 'BLuefR7NzdAu9dTUp43dzAnDW9EcCXwM4w2i3sT132z4'; // first burn 2026-08-29

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

  // The buyback is paid out of gacha revenue, so it moves from protocol revenue to holders.
  // LP fees are never counted in fees/revenue, so burning them only adds to holders revenue.
  const dailyProtocolRevenue = dailyFees.clone();
  if (cardsBought > 0) {
    dailyHoldersRevenue.add(CARDS_MINT, cardsBought, 'Token Buyback');
    dailyProtocolRevenue.add(CARDS_MINT, -cardsBought, 'Token Buyback');
  }
  if (lpFeesBurned > 0) {
    dailyHoldersRevenue.add(CARDS_MINT, lpFeesBurned, 'LP Fees Burned');
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
  HoldersRevenue: "CARDS bought back with gacha revenue (since April 2026) and CARDS LP fees sent to the burn wallet (since August 2026). Excludes advisor and investor token returns.",
  ProtocolRevenue: "Revenue minus the gacha revenue spent on CARDS buybacks. LP fees are not part of revenue, so burning them does not reduce it."
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
    "Token Buyback": "CARDS bought back with gacha revenue, moved from protocol revenue to holders.",
  },
  HoldersRevenue: {
    "Token Buyback": "CARDS bought back with gacha revenue, counted at purchase.",
    "LP Fees Burned": "CARDS LP fees earned on the CARDS/USDC pool, counted when sent to the burn wallet.",
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
