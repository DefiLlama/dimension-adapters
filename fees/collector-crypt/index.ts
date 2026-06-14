import { SimpleAdapter, FetchOptions, Dependencies } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const GACHA_TIERS = [25, 50, 75, 80, 100, 250, 1000, 2500];

const CARDS_MINT = 'CARDSccUMFKoPRZxt5vt3ksUbxEFEcnZ3H2pd3dKxYjp';

// Buyback hubs: DCA bots are funded with USDC from here, market-buy CARDS across the
// pools and send the bought CARDS back here. CARDS received here from non-team wallets
// is the open-market buyback (value accrual to CARDS holders), live since 2026-06-11.
// Extend this list if the team rotates to a new hub.
const BUYBACK_ADDRESSES = [
  'jrS7Pbn38wKiPsXbyNhGCr3icfXuJxdytZr1N4TwdFu',
];

//https://dune.com/queries/7450765
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
  'jrS7Pbn38wKiPsXbyNhGCr3icfXuJxdytZr1N4TwdFu' // buyback hub (since 2026-06-11)
]

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const query = `
    WITH gacha_in AS (
      SELECT
        SUM(CASE WHEN amount / POWER(10, 6) = 25 THEN amount / POWER(10, 6) ELSE 0 END) AS gacha_spend_25,
        SUM(CASE WHEN amount / POWER(10, 6) = 50 THEN amount / POWER(10, 6) ELSE 0 END) AS gacha_spend_50,
        SUM(CASE WHEN amount / POWER(10, 6) = 75 THEN amount / POWER(10, 6) ELSE 0 END) AS gacha_spend_75,
        SUM(CASE WHEN amount / POWER(10, 6) = 80 THEN amount / POWER(10, 6) ELSE 0 END) AS gacha_spend_80,
        SUM(CASE WHEN amount / POWER(10, 6) = 100 THEN amount / POWER(10, 6) ELSE 0 END) AS gacha_spend_100,
        SUM(CASE WHEN amount / POWER(10, 6) = 250 THEN amount / POWER(10, 6) ELSE 0 END) AS gacha_spend_250,
        SUM(CASE WHEN amount / POWER(10, 6) = 1000 THEN amount / POWER(10, 6) ELSE 0 END) AS gacha_spend_1000,
        SUM(CASE WHEN amount / POWER(10, 6) = 2500 THEN amount / POWER(10, 6) ELSE 0 END) AS gacha_spend_2500
      FROM tokens_solana.transfers
      WHERE to_owner IN ('GachazZscHZ5bn3vnq1yEC4zpYdhAYJBzuKJwSJksc9z','GachaNgyXTU3zFogQ8Z5jR2BLXs8215X2AtEH18VxJq3','96DULv1BqYfe5wyMr6pVUNC6Uyrtj6yr3tNi6VtfwW9s')
        AND from_owner NOT IN (${TEAM_ADDRESSES.map(addr => `'${addr}'`).join(', ')})
        AND amount / power(10, 6) IN (${GACHA_TIERS.map(tier => tier).join(', ')})
        AND token_mint_address = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
        AND TIME_RANGE
    ),
    fees AS (
      SELECT
        SUM(amount / POWER(10, 6)) AS inflow
      FROM tokens_solana.transfers
      WHERE to_owner = 'DQPERZ9e86pNJ4mhUnCEP8V75yxZofsipoVrRWT5Wdxd'
        AND token_mint_address = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
        AND TIME_RANGE
    ),
    buyback AS (
      SELECT
        SUM(amount / POWER(10, 6)) AS buyback
      FROM tokens_solana.transfers
      WHERE from_owner IN ('GachazZscHZ5bn3vnq1yEC4zpYdhAYJBzuKJwSJksc9z','GachaNgyXTU3zFogQ8Z5jR2BLXs8215X2AtEH18VxJq3')
        AND to_owner NOT IN (${TEAM_ADDRESSES.map(addr => `'${addr}'`).join(', ')})
        AND token_mint_address = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
        AND TIME_RANGE
    ),
    cards_buyback AS (
      SELECT
        SUM(amount) AS cards_bought
      FROM tokens_solana.transfers
      WHERE to_owner IN (${BUYBACK_ADDRESSES.map(addr => `'${addr}'`).join(', ')})
        AND from_owner NOT IN (${TEAM_ADDRESSES.map(addr => `'${addr}'`).join(', ')})
        AND token_mint_address = '${CARDS_MINT}'
        AND TIME_RANGE
    )
    SELECT
      COALESCE(g.gacha_spend_25, 0) AS gacha_spend_25,
      COALESCE(g.gacha_spend_50, 0) AS gacha_spend_50,
      COALESCE(g.gacha_spend_75, 0) AS gacha_spend_75,
      COALESCE(g.gacha_spend_80, 0) AS gacha_spend_80,
      COALESCE(g.gacha_spend_100, 0) AS gacha_spend_100,
      COALESCE(g.gacha_spend_250, 0) AS gacha_spend_250,
      COALESCE(g.gacha_spend_1000, 0) AS gacha_spend_1000,
      COALESCE(g.gacha_spend_2500, 0) AS gacha_spend_2500,
      COALESCE(f.inflow, 0) AS fees_royalty,
      COALESCE(b.buyback, 0) AS buyback,
      COALESCE(cb.cards_bought, 0) AS cards_buyback
    FROM gacha_in g
      CROSS JOIN fees f
      CROSS JOIN buyback b
      CROSS JOIN cards_buyback cb
  `;

  const data = await queryDuneSql(options, query);

  let cardsBought = 0;
  if (data && data.length > 0) {
    const result = data[0];
    for (const tier of GACHA_TIERS) {
      const spend = result[`gacha_spend_${tier}`] || 0;
      if (spend) {
        dailyVolume.addUSDValue(spend);
        dailyFees.addUSDValue(spend, `Gacha $${tier} Pack Sales`);
      }
    }
    dailyFees.addUSDValue(result.fees_royalty, 'Royalty Fees');
    dailyFees.addUSDValue(-result.buyback, 'Pack Buyback Spends');
    cardsBought = Number(result.cards_buyback || 0);
  }

  // Open-market CARDS bought back by the team and accumulated -> holders revenue.
  // Counted as value redirected to holders, so it is subtracted from protocol revenue
  // (total fees/revenue are unchanged). Priced by the framework via the CARDS mint.
  if (cardsBought > 0) {
    dailyHoldersRevenue.add(CARDS_MINT, cardsBought, 'Token Buyback');
  }
  const dailyProtocolRevenue = dailyFees.clone();
  if (cardsBought > 0) {
    dailyProtocolRevenue.add(CARDS_MINT, -cardsBought, 'Token Buyback');
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
  Volume: "Volume from gacha (card pack sales).",
  Fees: "Total fees from gacha (card pack sales) and marketplace transactions.",
  Revenue: "Revenue from gacha sales + marketplace fees/royalties.",
  UserFees: "Total fees paid by users for gacha and marketplace transactions.",
  HoldersRevenue: "USD value of CARDS bought back on the open market by the team and accumulated, returned to CARDS holders (since June 2026).",
  ProtocolRevenue: "Revenue retained by the protocol after gacha pack buybacks and CARDS token buybacks."
}

const gachaBreakdown = {
  "Gacha $25 Pack Sales": "Gacha pack sales at $25.",
  "Gacha $50 Pack Sales": "Gacha pack sales at $50.",
  "Gacha $75 Pack Sales": "Gacha pack sales at $75.",
  "Gacha $80 Pack Sales": "Gacha pack sales at $80.",
  "Gacha $100 Pack Sales": "Gacha pack sales at $100.",
  "Gacha $250 Pack Sales": "Gacha pack sales at $250.",
  "Gacha $1000 Pack Sales": "Gacha pack sales at $1000.",
  "Gacha $2500 Pack Sales": "Gacha pack sales at $2500.",
  "Royalty Fees": "Royalty fees from marketplace transactions.",
  "Pack Buyback Spends": "Expenditures on gacha pack buybacks.",
}

const breakdownMethodology = {
  Fees: gachaBreakdown,
  Revenue: gachaBreakdown,
  ProtocolRevenue: {
    ...gachaBreakdown,
    "Token Buyback": "CARDS bought back on the open market, subtracted from protocol revenue and credited to holders.",
  },
  HoldersRevenue: {
    "Token Buyback": "USD value of CARDS bought back on the open market by the team and accumulated.",
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-06-04',
  dependencies: [Dependencies.DUNE],
  methodology,
  breakdownMethodology,
  allowNegativeValue: true, // fees from marketplace transactions can be lower than gacha buyback expenses
}

export default adapter;
