import {Dependencies, FetchOptions, FetchResultFees, SimpleAdapter} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import {queryAllium} from "../../helpers/allium";
import {APTOS_RPC, getVersionFromTimestamp} from "../../helpers/aptos";
import fetchURL from "../../utils/fetchURL";
import * as sdk from "@defillama/sdk";

const EVM_ABI = {
  totalSupply: "uint256:totalSupply",
}

const METRIC = {
  AssetYields: 'BUIDL Underlying Assets Yields.',
  AssetYieldsToHolders: 'BUIDL Underlying Assets Yields To BUIDL Holders.',
  ManagementFeesBuidl: 'Management Fees - BUIDL',
}

type EvmContract = {
  address: string;
  bps?: number;
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
const ETHEREUM_YIELD_FEED = '0xd6156F8177aA1a6E0c5278CE437A9BDB32F203ef';
const GROSS_REF_BPS = 20;
const YIELD_FEED_DECIMALS = 8;

async function prefetch(options: FetchOptions) {
  const api = new sdk.ChainApi({ chain: CHAIN.ETHEREUM, timestamp: options.fromTimestamp })

  const dailyYield = await api.call({
      target: ETHEREUM_YIELD_FEED,
      abi: 'function latestAnswer() view returns (int256)',
  })

  const yieldPostDecimals = dailyYield / 10 ** YIELD_FEED_DECIMALS;
  const annualizedYield = yieldPostDecimals * 365;
  const annualizedYieldWithFeeBps = annualizedYield + (GROSS_REF_BPS / 10_000);

  return {
    annualizedYieldWithFeeBps
  }
}

const getPeriodFraction = (options: FetchOptions, denominator: number) =>
  (options.toTimestamp - options.fromTimestamp) / denominator;

const getSupplyInUsd = (totalSupply: bigint | number | string) => Number(totalSupply) / 1e6;

const estimateManagementFee = (totalSupply: bigint | number | string, bps: number, options: FetchOptions) => {
  return getSupplyInUsd(totalSupply) * (bps / 10_000) * getPeriodFraction(options, SECONDS_PER_YEAR);
}

type Balances = { dailyFees: any; dailyRevenue: any; dailySupplySideRevenue: any };

// Management fee (protocol revenue) + net yield (supply-side revenue), both derived
// from the token supply. Yield = supply × net daily accrual × period days.
const addFeesAndYield = async (options: FetchOptions, b: Balances, totalSupply: bigint | number | string, bps: number) => {
  const mngmtFee = estimateManagementFee(totalSupply, bps, options);
  b.dailyFees.addUSDValue(mngmtFee, METRIC.ManagementFeesBuidl);
  b.dailyRevenue.addUSDValue(mngmtFee, METRIC.ManagementFeesBuidl);

  const annualYield = options.preFetchedResults.annualizedYieldWithFeeBps;
  const yieldForPeriod = getSupplyInUsd(totalSupply) * annualYield * getPeriodFraction(options, SECONDS_PER_YEAR);
  b.dailyFees.addUSDValue(yieldForPeriod, METRIC.AssetYields);
  b.dailySupplySideRevenue.addUSDValue(yieldForPeriod, METRIC.AssetYieldsToHolders);
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
    })

    await addFeesAndYield(options, { dailyFees, dailyRevenue, dailySupplySideRevenue }, totalSupply, bps);
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
  // 20 bps management fee. Source: static.primary_market_listing (BUIDL / aptos).
  const APTOS_BPS = 20

  // Point-in-time FA supply at period start (matches EVM fromApi). getTokenSupply /
  // current REST only return latest state, which breaks backfills when supply changes.
  const ledgerVersion = await getVersionFromTimestamp(new Date(options.fromTimestamp * 1000));
  const res = await fetchURL(
    `${APTOS_RPC}/v1/accounts/${APTOS_BUIDL_CONTRACT}/resource/0x1::fungible_asset::ConcurrentSupply?ledger_version=${ledgerVersion}`
  );
  const totalSupply = Number(res.data.current.value);

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

  // RPC getTokenSupply only returns current supply. Read point-in-time supply from
  // Allium mint/burn snapshots at period start (matches EVM fromApi).
  const rows = await queryAllium(`
    SELECT COALESCE(amount, 0) AS supply
    FROM solana.raw.spl_token_total_supply
    WHERE mint = '${SOLANA_BUIDL_CONTRACT}'
      AND snapshot_block_timestamp <= TO_TIMESTAMP_NTZ(${options.fromTimestamp})
    ORDER BY snapshot_block_slot DESC
    LIMIT 1
  `);
  const totalSupply = Math.round(rows[0].supply) * 1e6;

  await addFeesAndYield(options, { dailyFees, dailyRevenue, dailySupplySideRevenue }, totalSupply, SOLANA_BPS);

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }
};

const adapters: SimpleAdapter = {
  version: 1, // oracle updates once a day
  prefetch,
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
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
      [METRIC.AssetYieldsToHolders]: "Net yields accrued to holders after deducting management fees",
    },
  }
};

export default adapters;
