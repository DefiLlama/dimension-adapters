import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// Reference query: https://dune.com/queries/6696115
// SafePal Card uses Fiat24 card infrastructure on Arbitrum. Spend is emitted by
// the shared Fiat24 card spend contract, so attribution must be narrowed to the
// SafePal cohort through the SafePal anchor wallet found in the Fiat24 NFT mint tx.

const chainConfig: Record<string, { start: string; rateContract: string; usd24: string; rateDivisor: number }> = {
  [CHAIN.ARBITRUM]: {
    start: "2024-11-27",
    rateContract: "0x4582f67698843Dfb6A9F195C0dDee05B0A8C973F",
    usd24: "0xbE00f3db78688d9704BCb4e0a827aea3a9Cc0D62",
    rateDivisor: 1e4,
  },
};

// Query shape:
// 1. Start from time-bounded card spend logs. The event stores the spend wallet
//    in topic2, the Fiat24 currency token in data word 2, and the amount in data
//    word 4 with 2 decimals.
// 2. Keep only spends whose wallet was assigned a Fiat24 account NFT in a tx
//    that also includes the SafePal anchor log. This distinguishes SafePal from
//    Bitget and other Fiat24 card cohorts.
// 3. Return Fiat24 token amounts by currency. The fetch step prices them via RPC.
const buildQuery = (options: FetchOptions) => `
WITH spend AS (
  SELECT
    bytearray_substring(topic2, 13, 20) AS wallet,
    bytearray_substring(bytearray_substring(data, 65, 32), 13, 20) AS currency,
    TRY_CAST(from_base(substring(to_hex(data), 193, 64), 16) AS DECIMAL(38, 0)) / 100 AS amount
  FROM arbitrum.logs
  WHERE
    TIME_RANGE
    AND block_date >= CAST(from_unixtime(${options.startTimestamp}) AS DATE)
    AND block_date <= CAST(from_unixtime(${options.endTimestamp}) AS DATE)
    AND contract_address = 0xe2e3B88B9893e18D0867c08f9cA93f8aB5935b14
    AND topic0 = 0xccd892fadc4aff70d2a87e68be8c4ea12542363d8f405acbf0949c6816b99ccb
    AND bytearray_substring(bytearray_substring(data, 65, 32), 13, 20) IN (
      0xbe00f3db78688d9704bcb4e0a827aea3a9cc0d62,
      0x2c5d06f591d0d8cd43ac232c2b654475a142c7da,
      0xd41f1f0cf89fd239ca4c1f8e8ada46345c86b0a4,
      0x7288ac74d211735374a23707d1518dcbbc0144fd
    )
)
SELECT
  CONCAT('0x', TO_HEX(currency)) AS currency,
  SUM(amount) AS amount
FROM spend s
WHERE EXISTS (
  SELECT 1
  FROM arbitrum.logs nft
  WHERE
    nft.block_time >= TIMESTAMP '2024-10-01'
    AND nft.block_date >= DATE '2024-10-01'
    AND nft.contract_address = 0x133CAEecA096cA54889db71956c7f75862Ead7A0
    AND nft.topic0 = 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
    AND bytearray_substring(nft.topic2, 13, 20) = s.wallet
    AND EXISTS (
      SELECT 1
      FROM arbitrum.logs anchor
      WHERE
        anchor.block_time >= TIMESTAMP '2024-10-01'
        AND anchor.block_date >= DATE '2024-10-01'
        AND anchor.tx_hash = nft.tx_hash
        AND anchor.contract_address = 0x22043fDdF353308B4F2e7dA2e5284E4D087449e1
        AND anchor.topic0 = 0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925
        AND anchor.topic1 = 0x000000000000000000000000c2005d5ae1fe27a481674fe7a12a012dfe35ee04
    )
)
GROUP BY 1
`;

const prefetch = (options: FetchOptions) =>
  queryDuneSql(options, buildQuery(options));

const fetch = async (options: FetchOptions) => {
  const rows = (options.preFetchedResults || []) as { currency: string; amount: number }[];
  const dailyVolume = options.createBalances();
  const { rateContract, usd24, rateDivisor } = chainConfig[options.chain];

  // Convert the Fiat24 token amounts returned by Dune to USD using the live
  // Fiat24 exchange-rate contract. getExchangeRate(USD24, currency) returns how
  // many currency units equal 1 USD24, scaled by 1e4, so USD value is:
  // amount * 1e4 / rate.
  const rates = await options.api.multiCall({
    target: rateContract,
    abi: "function getExchangeRate(address inputToken, address outputToken) view returns (uint256)",
    calls: rows.map(({ currency }) => ({ params: [usd24, currency] })),
  });

  rows.forEach(({ amount }, i) => {
    const rate = Number(rates[i]);
    if (rate) dailyVolume.addUSDValue(Number(amount) * rateDivisor / rate);
  });

  return { dailyVolume };
};

const methodology = {
  Volume: "Total USD value spent by SafePal card holders via Fiat24 issuer.",
};

const adapter: SimpleAdapter = {
  version: 1,
  prefetch,
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.DUNE],
  methodology,
};

export default adapter;
