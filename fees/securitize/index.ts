import {FetchOptions, FetchResultFees, SimpleAdapter} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import {gql, GraphQLClient} from "graphql-request";
import {getTokenSupply} from "../../helpers/solana";
import {httpGet} from "../../utils/fetchURL";

const EVM_ABI = {
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

// bps Source : https://securitize.io/blackrock/buidl (verified against static.primary_market_listing)
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
        dailyAccrualFeed: 'BUIDL_POLYGON_DAILY_ACCRUAL',
      },
    ],
    bps: 20,
    start: '2024-11-04',
  },
  [CHAIN.AVAX]: {
    contracts: [
      {
        address: '0x53fc82f14f009009b440a706e31c9021e1196a2f',
        dailyAccrualFeed: 'BUIDL_AVALANCHE_DAILY_ACCRUAL',
      },
    ],
    bps: 20,
    start: '2024-11-04',
  },
  [CHAIN.OPTIMISM]: {
    contracts: [
      {
        address: '0xa1cdab15bba75a80df4089cafba013e376957cf5',
        dailyAccrualFeed: 'BUIDL_OPTIMISM_DAILY_ACCRUAL',
      },
    ],
    bps: 50,
    start: '2024-11-04',
  },
  [CHAIN.ARBITRUM]: {
    contracts: [
      {
        address: '0xa6525ae43edcd03dc08e775774dcabd3bb925872',
        dailyAccrualFeed: 'BUIDL_ARBITRUM_DAILY_ACCRUAL',
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

// Each chain uses its own RedStone daily-accrual feed when it has one (net of that
// chain's fee). Ethereum-standard, BSC and Aptos have no feed, so for those we derive
// the rate from the fund-wide GROSS accrual (identical across chains) minus that
// chain's management fee: gross = anyFeedNet + itsBps, netForChain = gross − chainBps.
// The reference below supplies that gross for the feed-less chains only.
// Verified against Securitize's published per-chain daily-rate sheet (ETH 3.15%,
// Polygon/Avax/Solana/Aptos 3.45%, BNB 3.47%, Optimism/Arbitrum 3.15%) and on-chain drips.
// NOTE: RedStone's /prices API only retains ~30 days — a fresh backfill older than 30
// days can't be priced (same limitation the BUIDL-I feed already had).
const GROSS_REF_FEED = 'BUIDL_POLYGON_DAILY_ACCRUAL';
const GROSS_REF_BPS = 20;

const getPeriodFraction = (options: FetchOptions, denominator: number) =>
  (options.toTimestamp - options.fromTimestamp) / denominator;

const getSupplyInUsd = (totalSupply: bigint | number | string) => Number(totalSupply) / 1e6;

const estimateManagementFee = (totalSupply: bigint | number | string, bps: number, options: FetchOptions) => {
  return getSupplyInUsd(totalSupply) * (bps / 10_000) * getPeriodFraction(options, SECONDS_PER_YEAR);
}

const getRedstonePrices = (symbol: string, fromTimestamp: number, toTimestamp: number) => {
  const url = `https://api.redstone.finance/prices?symbol=${encodeURIComponent(symbol)}&provider=redstone&limit=1&fromTimestamp=${fromTimestamp * 1000}&toTimestamp=${toTimestamp * 1000}`;
  try {
    return httpGet(url);
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

// Net daily accrual for a chain: use the share class's own feed if it has one
// (BUIDL-I), otherwise take the fund-wide gross and subtract this chain's fee.
const getNetDailyAccrual = async (options: FetchOptions, bps: number, ownFeed?: string): Promise<number> => {
  if (ownFeed) return getRedstoneDailyAccrual(ownFeed, options);
  const refNet = await getRedstoneDailyAccrual(GROSS_REF_FEED, options);
  const grossDaily = refNet + (GROSS_REF_BPS / 10_000) / 365;
  return grossDaily - (bps / 10_000) / 365;
}

type Balances = { dailyFees: any; dailyRevenue: any; dailySupplySideRevenue: any };

// Management fee (protocol revenue) + net yield (supply-side revenue), both derived
// from the token supply. Yield = supply × net daily accrual × period days.
const addFeesAndYield = async (options: FetchOptions, b: Balances, totalSupply: bigint | number | string, bps: number, ownFeed?: string) => {
  const mngmtFee = estimateManagementFee(totalSupply, bps, options);
  b.dailyFees.addUSDValue(mngmtFee, METRIC.ManagementFeesBuidl);
  b.dailyRevenue.addUSDValue(mngmtFee, METRIC.ManagementFeesBuidl);

  const netDaily = await getNetDailyAccrual(options, bps, ownFeed);
  const yieldForPeriod = getSupplyInUsd(totalSupply) * netDaily * getPeriodFraction(options, SECONDS_PER_DAY);
  b.dailyFees.addUSDValue(yieldForPeriod, METRIC.AssetYields);
  b.dailySupplySideRevenue.addUSDValue(yieldForPeriod, METRIC.AssetYieldsToLP);
}

const fetchEvm: any = async (options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  for (const contract of EVM_CONTRACTS[options.chain].contracts as EvmContract[]) {
    const bps = contract.bps ?? EVM_CONTRACTS[options.chain].bps;

    const totalSupply = await options.fromApi.call({
      target: contract.address,
      abi: EVM_ABI.totalSupply,
      permitFailure: true,
    })

    // No supply: not deployed yet, or a transient read failure. Log so a recoverable
    // RPC failure isn't silently dropped as "not deployed".
    if (!totalSupply) {
      console.error(`securitize: no totalSupply for ${contract.address} on ${options.chain} — skipping (not deployed yet or RPC failure)`)
      continue;
    }

    await addFeesAndYield(options, { dailyFees, dailyRevenue, dailySupplySideRevenue }, totalSupply, bps, contract.dailyAccrualFeed);
  }

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }
};

const fetchAptos: any = async (options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  // BUIDL fungible-asset object on Aptos (symbol BUIDL, 6 decimals).
  const APTOS_BUIDL_CONTRACT = '0x50038be55be5b964cfa32cf128b5cf05f123959f286b4cc02b86cafd48945f89'
  const APTOS_GRAPHQL_ENDPOINT = 'https://indexer.mainnet.aptoslabs.com/v1/graphql'
  // 20 bps management fee. Source: static.primary_market_listing (BUIDL / aptos).
  const APTOS_BPS = 20

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

  await addFeesAndYield(options, { dailyFees, dailyRevenue, dailySupplySideRevenue }, totalSupply, APTOS_BPS);

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
  // 20 bps management fee. Source: static.primary_market_listing (BUIDL / solana).
  const SOLANA_BPS = 20

  // getTokenSupply returns the UI amount; scale back to raw 6-decimal units to match
  // the other chains' totalSupply.
  const totalSupplyUiAmount = await getTokenSupply(SOLANA_BUIDL_CONTRACT);
  const totalSupply = Math.round(totalSupplyUiAmount) * 1e6

  await addFeesAndYield(options, { dailyFees, dailyRevenue, dailySupplySideRevenue }, totalSupply, SOLANA_BPS, 'BUIDL_SOLANA_DAILY_ACCRUAL');

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }
};

const adapters: SimpleAdapter = {
  version: 1,
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
    SupplySideRevenue: "Net yields accrued to BUIDL holders (fund yield after management fees)",
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
      [METRIC.AssetYieldsToLP]: "Net yields accrued to holders after deducting management fees",
    },
  }
};

export default adapters;
