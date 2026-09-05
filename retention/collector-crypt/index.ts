import { CHAIN } from "../../helpers/chains";
import {
  createRetentionFetchAdapter,
  defineRetentionManifest,
} from "../../helpers/retention";

// Wallet and volume retention (W4/W12) for Collector Crypt on Solana.
//
// A pack purchase is a USDC transfer into one of the on-chain gacha sinks. Each
// query scans only the requested date range of tokens_solana.transfers.
// Both sinks are observed: the current one went live on 2025-12-07, while its
// predecessor carries the history before that. Without it every buyer who
// migrated across would look like a brand new wallet.
// - Sink labels and transfers: https://solscan.io/account/GachaNgyXTU3zFogQ8Z5jR2BLXs8215X2AtEH18VxJq3
// - First transaction on the current sink (2025-12-07): https://solscan.io/tx/2iSpTcqEc85tjD6VJ4i9Q9NCvEdf8pZ3axSw287FSmpgVahpErv5911ntuALUGxvzYCBTNZ28vhHrXBsJeatXjq6
// - Solana USDC mint: https://solscan.io/token/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
//
// The fiat/credit-card rail (96DULv…, part of TEAM_ADDRESSES) is deliberately not
// a sink: those top-ups settle off-chain in bundles and carry no per-buyer
// identity, so card purchases are out of scope - a narrower perimeter than
// fees/collector-crypt.
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// Kept local so loading this manifest does not execute the existing Allium fee adapter.
const GACHA_ONCHAIN_ADDRESSES = [
  "GachazZscHZ5bn3vnq1yEC4zpYdhAYJBzuKJwSJksc9z", // decommissioned pre-Dec-2025, kept for history
  "GachaNgyXTU3zFogQ8Z5jR2BLXs8215X2AtEH18VxJq3", // primary on-chain sink
];

// Protocol-controlled wallets excluded from buyer cohorts. This is the same
// public exclusion set used by fees/collector-crypt.
const TEAM_ADDRESSES = [
  "BAxTk97HsaJqbnbFmTiQTaL4KSRvJ8Y65ArZCsP6vA5M",
  "21KhtC7y2JGYvwc8dcGqTdbrudbM8fgMPJsVwxRQqdY8",
  "DFEstpYN3fsz93AC9v2ujzPPngPgodqH2xxopuyfSsAE",
  "HW2HRqN1pXQGH9GfP9xet4XwqtLqFyYGDNRKjUAVgh9u",
  "HighJBfnAaqH9cKkeMErQFJZ4ATxQJwxqFupX6zaKTns",
  "LGNDXqcm6U57QQ6Ad7icZ6oizkAVKRWrw97KwZy5nVf",
  "EpicWWZspT1trKndbDDr29ULViN56rN5vofWSKZp8ePF",
  "Mid9NeCpPNxP59fAdsLgMLy7BYexxXFw52ZP58Jrney",
  "Lowq9dkpY43VpjfYeRjtKfGA6JtB7HaMmwQgXkjHLvN",
  "Low6UekJP3QrFVMfNRTL8CPK2SiGFhvp57sgF2pkmVu",
  "miDtj3vgdxVykHzRyFwyG8MXpvK8eQqamSLVdBr7WPt",
  "HiGHqwYddP5N2waqUmXPdaASpMpUEvfqPr2fSawctEb",
  "epiC3zkqa1RfcPMMM1Kc8m3GZGDwF2RmjbfA3g1BBjn",
  "LGNDfXQFMiRMz3qqTNAREmRFQutMvazqqRrzn5i98uj",
  "SPrT7eFrCM9UJ4j7Xf9iktKCoBwJjfykFbiNbRsKQm8",
  "Cc4pHGnoaRWL1WnHsV517T3YvQn5gLDBMiuVXkF9rZhK",
  "8373hLiAEXxaJ3oV7SRzx4KHwurEg9rEG98tUPj1sdtX",
  "onePMfirJs2Rx3eixoPnjY6NHiaC74pkQ2k313K2Lxs",
  "SportGmqffp9zC3VZV7Wwz6s2nCkEB5Q3nVwKGU4esD",
  "DQPERZ9e86pNJ4mhUnCEP8V75yxZofsipoVrRWT5Wdxd",
  "cc3novbXuNSe292qKH2gGhxToaWjuBvJbA7zQf8NVxi",
  "GachaNgyXTU3zFogQ8Z5jR2BLXs8215X2AtEH18VxJq3",
  "GachazZscHZ5bn3vnq1yEC4zpYdhAYJBzuKJwSJksc9z",
  "96DULv1BqYfe5wyMr6pVUNC6Uyrtj6yr3tNi6VtfwW9s",
  "jrS7Pbn38wKiPsXbyNhGCr3icfXuJxdytZr1N4TwdFu",
];

const sinks = GACHA_ONCHAIN_ADDRESSES.map((address) => `'${address}'`).join(", ");
const excluded = TEAM_ADDRESSES.map((address) => `'${address}'`).join(", ");

const purchases = {
  id: "pack-purchases",
  type: "duneSql" as const,
  sql: `
SELECT cast(date_trunc('day', t.block_time) AS date) AS day,
       t.from_owner AS wallet,
       sum(t.amount_display) AS volume_usd
FROM tokens_solana.transfers t
WHERE t.block_date >= date '{{fromDay}}' AND t.block_date < date '{{toDayExclusive}}'
  AND t.token_mint_address = '${USDC_MINT}'
  AND t.to_owner IN (${sinks})
  AND t.from_owner IS NOT NULL
  AND t.from_owner NOT IN (${excluded})
  AND t.amount_display > 0
GROUP BY 1, 2
  `,
  output: {
    day: "day",
    wallet: "wallet",
    volumeUsd: "volume_usd",
  },
};

export const retentionManifest = defineRetentionManifest({
  project: "collector-crypt",
  chain: CHAIN.SOLANA,
  stateVersion: 1,
  observationStart: "2025-01-01",
  // The current sink went live on Sunday 2025-12-07; cohorts start with the next
  // full UTC week, backed by eleven months of predecessor history.
  firstCohortStart: "2025-12-08",
  // Dune's indexed Solana tables can trail the completed UTC day.
  dataAvailabilityLagHours: 10,
  sources: [purchases],
  methodology:
    "Daily rolling weekly cohort retention for Collector Crypt on Solana. Each daily row ends a complete seven-day return window; W4 and W12 compare it with the same seven-day window shifted 4 or 12 weeks earlier. The cohort contains wallets whose first observed USDC pack purchase into one of the on-chain gacha sinks occurred in that earlier window, with team and treasury wallets excluded. Purchases paid by card settle off-chain in bundled top-ups without a per-buyer identity and are not counted. Activity is observed from 2025-01-01 across both the current sink and its predecessor, so buyers who migrated to the 2025-12-07 sink are not counted as new; cohorts start on 2025-12-08.",
});

export default createRetentionFetchAdapter(retentionManifest);
