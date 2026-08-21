import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { httpGet } from "../../utils/fetchURL";

// Docs: https://api.hylo.so/docs
const FEES_URL = "https://api.hylo.so/v1/protocol/fees";
const DIGEST_URL = "https://api.hylo.so/v1/protocol/digest";
const VALIDATOR_URL = "https://api.hylo.so/v1/validator/revenue";

interface FeeRow {
  operation: string;
  token: string;
  market?: string;
  fee: string;
  usd: string;
}

interface FeeDay {
  date: string;
  byToken: { token: string; fee: string; usd: string }[];
  byOperation: FeeRow[];
}

interface DigestDay {
  date: string;
  markets: { market: string; yieldToPool?: { token: string; amount: string; usd: string } }[];
}

interface ValidatorDay {
  date: string;
  total?: string; // SOL
}

// Hylo validator: inflation commission + Jito tips + block rewards, in SOL.
// Inflation and Jito settle once per epoch; days with no activity are omitted.
const addValidatorRevenue = async (options: FetchOptions, balances: any) => {
  const date = options.dateString;
  const res = await httpGet(`${VALIDATOR_URL}?from=${date}&to=${date}`);
  const day: ValidatorDay | undefined = (res?.daily || []).find((d: ValidatorDay) => d.date === date);
  if (!day) return;
  const sol = Number(day.total ?? 0);
  if (!Number.isFinite(sol)) throw new Error(`Hylo API returned a bad validator total for ${date}: ${JSON.stringify(day)}`);
  balances.addCGToken("solana", sol, "Validator Revenue");
};

const OPERATION_LABELS: Record<string, string> = {
  MintStablecoin: "Mint/Redeem Fees",
  RedeemStablecoin: "Mint/Redeem Fees",
  MintLevercoin: "Mint/Redeem Fees",
  RedeemLevercoin: "Mint/Redeem Fees",
  MintLevercoinExo: "Mint/Redeem Fees",
  RedeemLevercoinExo: "Mint/Redeem Fees",
  SwapStableToLever: "Swap Fees",
  SwapLeverToStable: "Swap Fees",
  SwapStableToLeverExo: "Swap Fees",
  SwapLeverToStableExo: "Swap Fees",
  SwapLst: "Swap Fees",
  UserWithdraw: "Earn Pool Withdrawal Fees",
  HarvestYield: "Yield Fees",
  HarvestBorrowRate: "Yield Fees",
};

const fetchFromApi = async (options: FetchOptions) => {
  const date = options.dateString;
  const [feesRes, digestRes] = await Promise.all([
    httpGet(`${FEES_URL}?from=${date}&to=${date}`),
    httpGet(`${DIGEST_URL}?from=${date}&to=${date}`),
  ]);
  const feeDay: FeeDay | undefined = (feesRes?.daily || []).find((d: FeeDay) => d.date === date);
  if (!feeDay) throw new Error(`Hylo API returned no fee data for ${date}`);
  const digestDay: DigestDay | undefined = (digestRes?.daily || []).find((d: DigestDay) => d.date === date);
  if (!digestDay) throw new Error(`Hylo API returned no digest data for ${date}`);

  const dailyRevenue = options.createBalances();
  for (const row of feeDay.byOperation) {
    const usd = Number(row.usd);
    if (!Number.isFinite(usd)) throw new Error(`Hylo API returned a bad usd value for ${date}: ${JSON.stringify(row)}`);
    dailyRevenue.addUSDValue(usd, OPERATION_LABELS[row.operation] ?? "Other Fees");
  }

  const dailySupplySideRevenue = options.createBalances();
  for (const market of digestDay.markets || []) {
    if (!market.yieldToPool) continue;
    const usd = Number(market.yieldToPool.usd);
    if (!Number.isFinite(usd)) throw new Error(`Hylo API returned a bad yieldToPool value for ${date}: ${JSON.stringify(market)}`);
    dailySupplySideRevenue.addUSDValue(usd, "Earn Pool Yield");
  }

  await addValidatorRevenue(options, dailyRevenue);

  const dailyFees = options.createBalances();
  dailyFees.addBalances(dailyRevenue);
  dailyFees.addBalances(dailySupplySideRevenue);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

// Dune fallback: transfers into the fee authority PDAs + hyUSD minted to the earn pool on harvests.
const HYUSD_MINT = "5YMkXAYccHSGnHn9nob9xEvv6Pvka9DZWH7nTbotTu9E";
const EARN_POOL_HYUSD_OWNER = "5YrRAQag9BbJkauDtJkd1vsTquXT6N46oU8rJ66GDxHd";
const VALIDATOR_IDENTITY = "hy1oMaD3ViyJ8i6w1xjP79zAWBBaRd1zWdTW8zYXnwu";

const FEE_ACCOUNTS: { owner: string; mint: string; label: string }[] = [
  { owner: "3HT6dD6APJh89XJs9rkn3BmsvkXE9jPG9dWJmUjWu6TS", mint: HYUSD_MINT, label: "hyUSD" },
  { owner: "FpLaqELxKRm6S3bjfNSknwZu43TL89VYkwuMDwsRMj59", mint: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn", label: "JitoSOL" },
  { owner: "925PhdF3ZXqEEWvgnSQDSSHZVoS3rhMLEfBot2cWmgpu", mint: "hy1oXYgrBW6PVcJ4s6s2FKavRdwgWTXdfE69AxT7kPT", label: "HyloSOL" },
  { owner: "39ACqviD7R5XyGBcwwV1YVru4uvSmz5Pgt7S9RxPRPkL", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", label: "USDC" },
  { owner: "BqhiD7AdKeYfR6mex2zYhhheoEXpPTfsYG6vnTJ9ERk2", mint: "cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij", label: "cbBTC" },
  { owner: "8Xrf6qAvuH3kXfVWJGT49aBLSEUGHyG8ETuvvnu5VRSr", mint: "98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g", label: "HYPE" },
];

const fetchFromDune = async (options: FetchOptions) => {
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyFees = options.createBalances();

  const feeFilter = FEE_ACCOUNTS
    .map((a) => `(to_owner = '${a.owner}' AND token_mint_address = '${a.mint}')`)
    .join("\n        OR ");

  const query = `
    WITH revenue_data AS (
      SELECT
        token_mint_address,
        SUM(amount) AS total_fees,
        'revenue' AS data_type
      FROM tokens_solana.transfers
      WHERE TIME_RANGE
        AND (
        ${feeFilter}
        )
      GROUP BY token_mint_address
    ),
    earn_pool_yields AS (
      SELECT tx_id, token_mint_address, amount
      FROM tokens_solana.transfers
      WHERE TIME_RANGE
        AND to_owner = '${EARN_POOL_HYUSD_OWNER}'
        AND token_mint_address = '${HYUSD_MINT}'
        AND from_owner IS NULL  -- Only actual mints
    ),
    other_token_txs AS (
      SELECT DISTINCT tx_id
      FROM tokens_solana.transfers
      WHERE TIME_RANGE
        AND tx_id IN (SELECT tx_id FROM earn_pool_yields)
        AND token_mint_address <> '${HYUSD_MINT}'
        AND amount > 0
    ),
    yields_data AS (
      -- Swaps, rebalances and pool deposits also mint hyUSD to the pool; only
      -- harvests touch hyUSD alone, so drop txs that move any other token.
      SELECT
        s.token_mint_address,
        SUM(s.amount) AS total_fees,
        'yield' AS data_type
      FROM earn_pool_yields s
      LEFT JOIN other_token_txs x ON s.tx_id = x.tx_id
      WHERE x.tx_id IS NULL
      GROUP BY s.token_mint_address
    ),
    validator_data AS (
      -- Block fee rewards credited to the validator identity. Inflation
      -- commission is 0% and Jito tips are claimed via merkle proofs, so
      -- solana.rewards does not carry them.
      SELECT
        'SOL' AS token_mint_address,
        CAST(SUM(lamports) AS DOUBLE) AS total_fees,
        'validator' AS data_type
      FROM solana.rewards
      WHERE TIME_RANGE
        AND recipient = '${VALIDATOR_IDENTITY}'
        AND reward_type = 'Fee'
    )
    SELECT * FROM revenue_data
    UNION ALL
    SELECT * FROM yields_data
    UNION ALL
    SELECT * FROM validator_data
  `;
  const rows = await queryDuneSql(options, query);

  rows.forEach((row: any) => {
    const amount = Number(row.total_fees) || 0;
    if (row.data_type === "revenue") {
      if (row.token_mint_address === HYUSD_MINT) dailyRevenue.addUSDValue(amount / 1e6);
      else dailyRevenue.add(row.token_mint_address, amount);
    } else if (row.data_type === "yield" && row.token_mint_address === HYUSD_MINT) {
      dailySupplySideRevenue.addUSDValue(amount / 1e6);
    } else if (row.data_type === "validator") {
      dailyRevenue.addCGToken("solana", amount / 1e9, "Validator Revenue");
    }
  });

  dailyFees.addBalances(dailyRevenue);
  dailyFees.addBalances(dailySupplySideRevenue);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const fetch = async (options: FetchOptions) => {
  try {
    return await fetchFromApi(options);
  } catch (e) {
    console.error("Hylo API failed, falling back to Dune", e);
    return await fetchFromDune(options);
  }
};

const methodology = {
  Fees: "Protocol fees collected from users (api.hylo.so/v1/protocol/fees), Hylo validator revenue (api.hylo.so/v1/validator/revenue), plus the yield paid to earn pool depositors (api.hylo.so/v1/protocol/digest).",
  Revenue: "Protocol fees (mint/redeem, hyUSD/levercoin swaps, earn pool withdrawals, protocol share of harvested LST yield and borrow rate) and Hylo validator revenue (inflation commission, Jito tips, block rewards).",
  ProtocolRevenue: "Same as Revenue; all protocol fees accrue to the protocol.",
  SupplySideRevenue: "Harvested LST yield and borrow rate (in hyUSD) distributed to earn pool depositors.",
};

const breakdownMethodology = {
  Fees: {
    "Mint/Redeem Fees": "Fees on minting and redeeming hyUSD and levercoins (xSOL, xBTC, ...) against the collateral vaults.",
    "Swap Fees": "Fees on swaps between hyUSD and levercoins, and on LST swaps.",
    "Earn Pool Withdrawal Fees": "Fees on withdrawals from the hyUSD earn pool.",
    "Yield Fees": "Protocol share of harvested LST yield and exo pair borrow rate.",
    "Validator Revenue": "Hylo validator inflation commission, Jito tips and block rewards (SOL).",
    "Earn Pool Yield": "Harvested LST yield and borrow rate paid out to earn pool depositors.",
  },
  SupplySideRevenue: {
    "Earn Pool Yield": "Harvested LST yield and borrow rate paid out to earn pool depositors.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  start: "2025-04-01",
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
