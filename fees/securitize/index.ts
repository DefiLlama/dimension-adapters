import {Dependencies, FetchOptions, FetchResultFees, SimpleAdapter} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import {queryDuneSql} from "../../helpers/dune";
import {queryAllium} from "../../helpers/allium";
import {gql, GraphQLClient} from "graphql-request";
import {getTokenSupply} from "../../helpers/solana";
import {httpGet} from "../../utils/fetchURL";

const EVM_ABI = {
  issue: 'event Issue(address indexed to, uint256 value, uint256 valueLocked)',
  totalSupply: "uint256:totalSupply",
}

const METRIC = {
  AssetYields: 'BUIDL Underlying Assets Yields.',
  AssetYieldsToLP: 'BUIDL Underlying Assets Yields To LPs.',
  ManagementFeesBuidl: 'Management Fees - BUIDL',
}

type EvmContract = {
  address: string;
  bps?: number;
  dailyAccrualFeed?: string;
}

// bps Source : https://securitize.io/blackrock/buidl
// Contracts: https://www.blackrock.com/corporate/compliance/scams-and-fraud/resources?referrer=grok.com#blackrock-token-addresses
const EVM_CONTRACTS: Record<string, any> = {
  [CHAIN.ETHEREUM]: {
    contracts: [
      {
        address: '0x7712c34205737192402172409a8f7ccef8aa2aec',
      },
      {
        address: '0x6a9DA2D710BB9B700acde7Cb81F10F1fF8C89041',
        bps: 20,
        dailyAccrualFeed: 'BUIDL_I_ETHEREUM_DAILY_ACCRUAL',
      }
    ],
    bps: 50,
    start: '2024-03-01',
  },
  [CHAIN.POLYGON]: {
    contracts: [
      {
        address: '0x2893ef551b6dd69f661ac00f11d93e5dc5dc0e99',
      },
    ],
    bps: 20,
    start: '2024-11-04',
  },
  [CHAIN.AVAX]: {
    contracts: [
      {
        address: '0x53fc82f14f009009b440a706e31c9021e1196a2f',
      },
    ],
    bps: 20,
    start: '2024-11-04',
  },
  [CHAIN.OPTIMISM]: {
    contracts: [
      {
        address: '0xa1cdab15bba75a80df4089cafba013e376957cf5',
      },
    ],
    bps: 50,
    start: '2024-11-04',
  },
  [CHAIN.ARBITRUM]: {
    contracts: [
      {
        address: '0xa6525ae43edcd03dc08e775774dcabd3bb925872',
      },
    ],
    bps: 50,
    start: '2024-11-04',
  },
  [CHAIN.BSC]: {
    contracts: [
      {
        address: '0x2d5bdc96d9c8aabbdb38c9a27398513e7e5ef84f',
      },
    ],
    bps: 18,
    start: '2025-10-08',
  },
}
const SECONDS_PER_DAY = 24 * 60 * 60;
const SECONDS_PER_YEAR = 365 * SECONDS_PER_DAY;

// A yield drip mints a tiny fraction of a holder's balance (~the daily T-bill
// rate, e.g. 0.0086%/day); new subscriptions/principal mint a large fraction.
// Classifying each on-chain Issue event by mintValue/recipientBalance cleanly
// separates the two. Validated against labelled Securitize data (issuance_drip
// vs issuance_fiat) with real balances: a 0.5% cut keeps ~97.6% of yield by
// value and leaks 0% of principal. Being purely on-chain, it has full history
// (no 30-day feed limit) and needs no distribution-time window.
const YIELD_RATIO_THRESHOLD = 0.005;

const getPeriodFraction = (options: FetchOptions, denominator: number) =>
  (options.toTimestamp - options.fromTimestamp) / denominator;

const getSupplyInUsd = (totalSupply: bigint | number | string) => Number(totalSupply) / 1e6;

const estimateManagementFee = (totalSupply: bigint | number | string, bps: number, options: FetchOptions) => {
  return getSupplyInUsd(totalSupply) * (bps / 10_000) * getPeriodFraction(options, SECONDS_PER_YEAR);
}

const getRedstonePrices = (symbol: string, fromTimestamp: number, toTimestamp: number) => {
  const url = `https://api.redstone.finance/prices?symbol=${encodeURIComponent(symbol)}&provider=redstone&limit=1&fromTimestamp=${fromTimestamp * 1000}&toTimestamp=${toTimestamp * 1000}`;
  try {
    return httpGet(`https://api.redstone.finance/prices?symbol=${encodeURIComponent(symbol)}&provider=redstone&limit=1&fromTimestamp=${fromTimestamp * 1000}&toTimestamp=${toTimestamp * 1000}`);
  } catch (e: any) {
    console.log('failed to query', url);
    throw e;
  }
}

const getRedstoneDailyAccrual = async (symbol: string, options: FetchOptions) => {
  const prices = await getRedstonePrices(symbol, options.fromTimestamp, options.toTimestamp);
  if (prices?.[0]?.value == null) throw new Error(`Missing RedStone daily accrual for ${symbol}`);
  return prices[0].value;
}

const fetchEvm: any = async (options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const fromBlock = await options.getFromBlock()
  const toBlock = await options.getToBlock()

  for (const contract of EVM_CONTRACTS[options.chain].contracts as EvmContract[]) {
    const bps = contract.bps ?? EVM_CONTRACTS[options.chain].bps;

    // Management fee on AUM (token supply), prorated for the period.
    const totalSupply = await options.fromApi.call({
      target: contract.address,
      abi: EVM_ABI.totalSupply,
      permitFailure: true,
    })

    // contract was not deployed yet
    if (!totalSupply) continue;

    const mngmtFee = estimateManagementFee(totalSupply, bps, options);
    dailyFees.addUSDValue(mngmtFee, METRIC.ManagementFeesBuidl)
    dailyRevenue.addUSDValue(mngmtFee, METRIC.ManagementFeesBuidl)

    // Share classes with their own RedStone accrual feed (BUIDL-I) use it directly.
    if (contract.dailyAccrualFeed) {
      const dailyAccrual = await getRedstoneDailyAccrual(contract.dailyAccrualFeed, options);
      const yieldForPeriod = getSupplyInUsd(totalSupply) * dailyAccrual * getPeriodFraction(options, SECONDS_PER_DAY);
      dailyFees.addUSDValue(yieldForPeriod, METRIC.AssetYields)
      dailySupplySideRevenue.addUSDValue(yieldForPeriod, METRIC.AssetYieldsToLP)
      continue;
    }

    // Yield is distributed by minting to holders. Capture every Issue (mint) over
    // the whole period and keep only the ones that are a small fraction of the
    // recipient's balance (a yield drip), discarding large mints (new principal /
    // subscriptions). See YIELD_RATIO_THRESHOLD. Balances are read at the start of
    // the period (prior balance), matching the classification it was validated on.
    const issueEvents: Array<any> = await options.getLogs({
      target: contract.address,
      eventAbi: EVM_ABI.issue,
      fromBlock,
      toBlock,
    })
    if (!issueEvents.length) continue;

    const recipients: string[] = [...new Set(issueEvents.map(e => e.to))];
    const balances = await options.fromApi.multiCall({
      abi: 'erc20:balanceOf',
      target: contract.address,
      calls: recipients,
      permitFailure: true,
    })
    const balanceOf: Record<string, number> = {};
    recipients.forEach((r, i) => { balanceOf[r] = Number(balances[i] ?? 0); });

    for (const e of issueEvents) {
      const bal = balanceOf[e.to] ?? 0;
      const ratio = bal > 0 ? Number(e.value) / bal : Infinity;
      if (ratio < YIELD_RATIO_THRESHOLD) {
        dailyFees.addToken(contract.address, e.value, METRIC.AssetYields)
        dailySupplySideRevenue.addToken(contract.address, e.value, METRIC.AssetYieldsToLP)
      }
    }
  }

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }
};

interface IData {
  total_yield: number;
}

// Reconstruct each wallet's prior balance from its net transfer flow, then keep
// only mints that are a small fraction of that balance (a yield drip), discarding
// large mints (new principal / subscriptions). Same classifier as the EVM path,
// run warehouse-side because Aptos/Solana lack cheap historical per-account
// balance reads. Validated against labelled data on both chains: drips land on
// the daily rate (~0.0097%/day), subscriptions sit well above the threshold.
const fetchAptos: any = async (options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const APTOS_BUIDL_CONTRACT = '0x50038be55be5b964cfa32cf128b5cf05f123959f286b4cc02b86cafd48945f89'
  const APTOS_GRAPHQL_ENDPOINT = 'https://indexer.mainnet.aptoslabs.com/v1/graphql'
  const APTOS_BPS = 20

  // VERIFY: mints appear in aptos.assets.fungible_transfers as rows with NULL from_address.
  const sql = `
      WITH t AS (
        SELECT block_timestamp, from_address, to_address, raw_amount AS amt
        FROM aptos.assets.fungible_transfers
        WHERE fa_address = '${APTOS_BUIDL_CONTRACT}'
          AND block_timestamp <= TO_TIMESTAMP_NTZ(${options.toTimestamp})
      ),
      deltas AS (
        SELECT block_timestamp, to_address AS wallet, amt AS delta, (from_address IS NULL) AS is_mint
          FROM t WHERE to_address IS NOT NULL
        UNION ALL
        SELECT block_timestamp, from_address AS wallet, -amt AS delta, FALSE AS is_mint
          FROM t WHERE from_address IS NOT NULL
      ),
      seq AS (
        SELECT wallet, block_timestamp, delta, is_mint,
          SUM(delta) OVER (PARTITION BY wallet ORDER BY block_timestamp
                           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS bal_before
        FROM deltas
      )
      SELECT COALESCE(SUM(delta), 0) AS total_yield
      FROM seq
      WHERE is_mint
        AND block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${options.fromTimestamp}) AND TO_TIMESTAMP_NTZ(${options.toTimestamp})
        AND bal_before > 0
        AND delta / bal_before < ${YIELD_RATIO_THRESHOLD}
  `
  const yieldData = await queryAllium(sql) as IData[];
  if (yieldData[0]?.total_yield) {
    dailyFees.addToken(APTOS_BUIDL_CONTRACT, yieldData[0].total_yield, METRIC.AssetYields)
    dailySupplySideRevenue.addToken(APTOS_BUIDL_CONTRACT, yieldData[0].total_yield, METRIC.AssetYieldsToLP)
  }


  const graphQuery = gql`query BUIDLTotalSupply {
  total_supply: current_fungible_asset_balances_aggregate(
    where: { asset_type: { _eq: "${APTOS_BUIDL_CONTRACT}" } }
  ) {
    amount: aggregate {
      sum {
        value: amount
      }
    }
  }
}`
  const totalSupplyData = await new GraphQLClient(APTOS_GRAPHQL_ENDPOINT).request(graphQuery);
  const totalSupply = BigInt(totalSupplyData.total_supply.amount.sum.value);
  const mngmtFee = estimateManagementFee(totalSupply, APTOS_BPS, options);
  dailyFees.addUSDValue(mngmtFee, METRIC.ManagementFeesBuidl)
  dailyRevenue.addUSDValue(mngmtFee, METRIC.ManagementFeesBuidl)

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }
};

const fetchSolana: any = async (options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const SOLANA_BUIDL_CONTRACT = 'GyWgeqpy5GueU2YbkE8xqUeVEokCMMCEeUrfbtMw6phr'
  const SOLANA_BPS = 20

  // VERIFY: sender/recipient column names in tokens_solana.transfers (to_address/from_address).
  const sql = `
      WITH t AS (
        SELECT block_time, action, CAST(amount AS double) AS amt,
               to_address AS to_w, from_address AS from_w
        FROM tokens_solana.transfers
        WHERE token_mint_address = '${SOLANA_BUIDL_CONTRACT}'
          AND block_time <= FROM_UNIXTIME(${options.toTimestamp})
      ),
      deltas AS (
        SELECT block_time, to_w AS wallet, amt AS delta, action FROM t WHERE to_w IS NOT NULL
        UNION ALL
        SELECT block_time, from_w AS wallet, -amt AS delta, CAST(NULL AS varchar) AS action FROM t WHERE from_w IS NOT NULL
      ),
      seq AS (
        SELECT wallet, block_time, delta, action,
          SUM(delta) OVER (PARTITION BY wallet ORDER BY block_time
                           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS bal_before
        FROM deltas
      )
      SELECT COALESCE(SUM(delta), 0) AS total_yield
      FROM seq
      WHERE action = 'mint'
        AND block_time BETWEEN FROM_UNIXTIME(${options.fromTimestamp}) AND FROM_UNIXTIME(${options.toTimestamp})
        AND bal_before > 0
        AND delta / bal_before < ${YIELD_RATIO_THRESHOLD}
  `
  const yieldData = await queryDuneSql(options, sql) as IData[];
  if (yieldData[0]?.total_yield) {
    dailyFees.addToken(SOLANA_BUIDL_CONTRACT, yieldData[0].total_yield, METRIC.AssetYields)
    dailySupplySideRevenue.addToken(SOLANA_BUIDL_CONTRACT, yieldData[0].total_yield, METRIC.AssetYieldsToLP)
  }


  const totalSupplyUiAmount = await getTokenSupply(SOLANA_BUIDL_CONTRACT);
  // the getTokenSupply helper function returns value in UI amount, we first turn it back with decimals to be consistent with other networks
  const totalSupply = Math.round(totalSupplyUiAmount) * 1e6
  const mngmtFee = estimateManagementFee(Math.round(totalSupply), SOLANA_BPS, options);
  dailyFees.addUSDValue(mngmtFee, METRIC.ManagementFeesBuidl)
  dailyRevenue.addUSDValue(mngmtFee, METRIC.ManagementFeesBuidl)

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }
};

const adapters: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE, Dependencies.ALLIUM],
  adapter: {
    ...Object.fromEntries(
      Object.entries(EVM_CONTRACTS).map(([chain, config]) => [
        chain,
        { ...config, fetch: fetchEvm },
      ])
    ),
    [CHAIN.APTOS]: {
      fetch: fetchAptos,
      start: '2024-12-17',
    },
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: '2025-03-24',
    },
  },
  methodology: {
    Fees: "Total yields generated from the fund's underlying assets (U.S. Treasuries and repo agreements) plus the management fees charged by BlackRock",
    Revenue: "Management fees (18-50 bps depending on the blockchain and BUIDL share class)",
    ProtocolRevenue: "Management fees (18-50 bps depending on the blockchain and BUIDL share class)",
    SupplySideRevenue: "All yields distributed on-chain to BUIDL token holders after management fees",
  },

  breakdownMethodology: {
    Fees: {
      [METRIC.AssetYields]: "Gross yields generated from the fund's underlying assets",
      [METRIC.ManagementFeesBuidl]: "18-50 bps Management fees depending on the blockchain and BUIDL share class",
    },
    Revenue: {
      [METRIC.ManagementFeesBuidl]: "18-50 bps Management fees depending on the blockchain and BUIDL share class",
    },
    ProtocolRevenue: {
      [METRIC.ManagementFeesBuidl]: "18-50 bps Management fees depending on the blockchain and BUIDL share class",
    },
    SupplySideRevenue: {
      [METRIC.AssetYieldsToLP]: "Net yields distributed after deducting management fees",
    },
  }
};

export default adapters;
