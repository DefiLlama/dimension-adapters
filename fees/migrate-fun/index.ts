import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json';
import { queryAllium } from "../../helpers/allium";

const treasuryAddress = 'h7HnoyxPxBW25UaG6ayo4jSSmFARX9DmpYhbNZsLfiP'
const ethContract = '0x33bb3dc7d524f71dd14C8595B65a10cFe15F9820'
const event = "event EvmInboundFeesAccrued(bytes16 indexed projectId, uint256 grossAmount, uint256 platformFee, uint256 bridgeFee, uint256 netAmount)"
const MIGRATION_FEES = "Migration Fees"
const BRIDGE_FEES = "Bridge Fees"

const fetchSolana = async (options: FetchOptions) => {
  const query = `
    SELECT
      SUM(usd_amount) as total_usd_amount
    FROM solana.assets.transfers
    WHERE to_address = '${treasuryAddress}'
      AND from_address != '${treasuryAddress}'
      AND mint IN ('${ADDRESSES.solana.USDC}', '${ADDRESSES.solana.SOL}', 'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB')
      AND outer_program_id IN ('migK824DsBMp2eZXdhSBAWFS6PbvA6UN8DV15HfmstR')
      AND block_timestamp >= TO_TIMESTAMP_NTZ('${options.startTimestamp}')
      AND block_timestamp <= TO_TIMESTAMP_NTZ('${options.endTimestamp}')
  `;
  const res = await queryAllium(query);
  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(res[0]?.total_usd_amount || 0, MIGRATION_FEES);

  return { dailyFees, dailyRevenue: dailyFees, dailySupplySideRevenue: 0, dailyProtocolRevenue: dailyFees, dailyUserFees: dailyFees }
}

const fetchEth = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const logs = await options.getLogs({ target: ethContract, eventAbi: event})
  logs.forEach(log => {
    dailyFees.addGasToken(log.platformFee, MIGRATION_FEES)
    dailyFees.addGasToken(log.bridgeFee, BRIDGE_FEES)
    dailyRevenue.addGasToken(log.platformFee, MIGRATION_FEES)
    dailySupplySideRevenue.addGasToken(log.bridgeFee, BRIDGE_FEES)
  })
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue, dailyUserFees: dailyFees }
}

// https://docs.emblem.wiki/migratefun/project-guide
const methodology = {
  Fees: "Platform fees are 7.5% of total liquidity migrated, plus bridge fees paid during EVM migrations.",
  UserFees: "Platform fees are 7.5% of total liquidity migrated, plus bridge fees paid during EVM migrations.",
  Revenue: "Platform fees are 7.5% of total liquidity migrated.",
  ProtocolRevenue: "Platform fees are 7.5% of total liquidity migrated.",
  SupplySideRevenue: "Bridge fees paid during EVM migrations.",
}

const breakdownMethodology = {
  Fees: {
    [MIGRATION_FEES]: "Platform fees are 7.5% of total liquidity migrated.",
    [BRIDGE_FEES]: "Bridge fees paid by users during EVM migrations.",
  },
  UserFees: {
    [MIGRATION_FEES]: "Platform fees are 7.5% of total liquidity migrated.",
    [BRIDGE_FEES]: "Bridge fees paid by users during EVM migrations.",
  },
  Revenue: {
    [MIGRATION_FEES]: "Platform fees are 7.5% of total liquidity migrated.",
  },
  ProtocolRevenue: {
    [MIGRATION_FEES]: "Platform fees are 7.5% of total liquidity migrated.",
  },
  SupplySideRevenue: {
    [BRIDGE_FEES]: "Bridge fees paid during EVM migrations.",
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      start: '2025-09-19',
      fetch: fetchSolana
    },
    [CHAIN.ETHEREUM]: {
      start: '2026-05-01',
      fetch: fetchEth
    }
  },
  dependencies: [Dependencies.ALLIUM],
  methodology,
  breakdownMethodology,
}

export default adapter
