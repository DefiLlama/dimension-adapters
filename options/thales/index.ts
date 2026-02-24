/**
 * Thales Options Adapter
 *
 * Fee/Revenue/HoldersRevenue Calculation (all equal):
 * - SafeBoxFeePaid events from AMM contracts (AMM fees)
 * - SafeBoxSharePaid events from LP contracts (LP performance fees)
 * - Volume: Tracked from various market creation and trading events
 */

import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { OVERTIME_CONTRACT_ADDRESSES, LP_CONTRACT_COLLATERAL_MAPPING } from './config';
import { OVERTIME_EVENT_ABI } from './abis';
import {
  parseTicketCreatedEvent,
  parseBoughtFromAmmEvent,
  parseSpeedMarketCreatedEvent,
  parseChainedMarketCreatedEvent,
  parseSafeBoxFeePaidEvent,
  parseSafeBoxSharePaidEvent
} from './parsers';
import { CHAIN } from "../../helpers/chains";

const CONTRACT_EVENT_MAPPING = {
  sportsAMMV2: { abi: 'ticketCreated', parser: parseTicketCreatedEvent },
  thalesAMM: { abi: 'boughtFromAmm', parser: parseBoughtFromAmmEvent },
  rangedAMM: { abi: 'boughtFromAmm', parser: parseBoughtFromAmmEvent },
  speedMarket: { abi: 'speedMarketCreated', parser: parseSpeedMarketCreatedEvent },
  chainedSpeedMarket: { abi: 'chainedMarketCreated', parser: parseChainedMarketCreatedEvent },
} as const;

function getChainContractsToQuery(
  chain: string,
  dailyNotionalVolume: ReturnType<FetchOptions['createBalances']>,
  dailyPremiumVolume: ReturnType<FetchOptions['createBalances']>
) {
  const contracts = OVERTIME_CONTRACT_ADDRESSES[chain];
  if (!contracts) throw new Error(`No contracts found for chain: ${chain}`);

  return Object.entries(contracts)
    .filter(([, address]) => address)
    .map(([contractType, address]) => {
      const config = CONTRACT_EVENT_MAPPING[contractType as keyof typeof CONTRACT_EVENT_MAPPING];
      const abiKey = config.abi as keyof typeof OVERTIME_EVENT_ABI;
      return {
        address: address as string,
        eventAbi: OVERTIME_EVENT_ABI[abiKey] as string,
        parser: (log: any) => config.parser(log, dailyNotionalVolume, dailyPremiumVolume)
      };
    });
}

export async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyLPPerformanceFee = options.createBalances();
  const collateralMapping = LP_CONTRACT_COLLATERAL_MAPPING[options.chain] || {};

  await Promise.all([
    // Volume events from AMM contracts
    ...getChainContractsToQuery(options.chain, dailyNotionalVolume, dailyPremiumVolume)
      .map(async ({ address, eventAbi, parser }) => {
        const logs = await options.getLogs({ target: address, eventAbi, onlyArgs: true });
        logs.forEach(parser);
      }),

    // Revenue from SafeBoxFeePaid events (AMM contracts)
    ...Object.values(OVERTIME_CONTRACT_ADDRESSES[options.chain] || {})
      .map(async (address) => {
        const logs = await options.getLogs({
          target: address as string,
          eventAbi: OVERTIME_EVENT_ABI.safeboxFeePaid,
          onlyArgs: true,
        });
        logs.forEach(log => parseSafeBoxFeePaidEvent(log, dailyRevenue));
      }),

    // LP performance fees from SafeBoxSharePaid events (LP contracts)
    ...Object.keys(collateralMapping)
      .map(async (address) => {
        const logs = await options.getLogs({
          target: address,
          eventAbi: OVERTIME_EVENT_ABI.safeboxSharePaid,
          onlyArgs: true,
        });
        logs.forEach(log => parseSafeBoxSharePaidEvent(log, address, collateralMapping, dailyLPPerformanceFee));
      })
  ]);

  // Fee = Revenue + LP Performance Fee
  const dailyFees = options.createBalances();
  dailyFees.addBalances(dailyRevenue);
  dailyFees.addBalances(dailyLPPerformanceFee);

  return {
    dailyNotionalVolume,
    dailyPremiumVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue: dailyFees,
    dailyProtocolRevenue: 0,
  };
}

const adapter: Adapter = {
  version: 2,
  fetch,
  adapter: {
    [CHAIN.ARBITRUM]: { start: '2024-08-01' },
    [CHAIN.OPTIMISM]: { start: '2024-08-01' },
    [CHAIN.BASE]: { start: '2024-08-01' },
    [CHAIN.POLYGON]: { start: '2025-04-01' },
  },
  methodology: {
    Fees: "Fees collected from AMM trades and LP performance fees",
    Revenue: "Total revenue from AMM fees and LP performance fees, all distributed to $OVER token holders",
    ProtocolRevenue: "Protocol doesn't keep any revenue",
    HoldersRevenue: "100% of revenue (AMM fees + LP fees) goes to $OVER token buybacks",
  },
};

export default adapter;
