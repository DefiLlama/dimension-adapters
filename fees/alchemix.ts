import ADDRESSES from '../helpers/coreAssets.json'
import type { FetchOptions, } from "../adapters/types";
import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { formatAddress } from "../utils/utils";

const chainConfigs: Record<string, any> = {
  [CHAIN.ETHEREUM]: {
    alchemists: [
      '0x5C6374a2ac4EBC38DeA0Fc1F8716e5Ea1AdD94dd', // alUSD
      '0x062Bf725dC4cDF947aa79Ca2aaCCD4F385b13b5c', // alETH
    ],
    start: '2022-02-25',
  },
  [CHAIN.ARBITRUM]: {
    alchemists: [
      '0xb46eE2E4165F629b4aBCE04B7Eb4237f951AC66F', // alUSD
      '0x654e16a0b161b150F5d1C8a5ba6E7A7B7760703A', // alETH
    ],
    customAssets: {
      [formatAddress('0x248a431116c6f6FCD5Fe1097d16d0597E24100f5')]: ADDRESSES.arbitrum.USDC_CIRCLE,
    },
    start: '2023-07-03',
  },
  [CHAIN.OPTIMISM]: {
    alchemists: [
      '0x10294d57A419C8eb78C648372c5bAA27fD1484af', // alUSD
      '0xe04Bb5B4de60FA2fBa69a93adE13A8B3B569d5B4', // alETH
    ],
    customAssets: {
      [formatAddress('0x0A86aDbF58424EE2e304b395aF0697E850730eCD')]: ADDRESSES.optimism.DAI,
    },
    start: '2022-09-17',
  },
}

const HarvestEvent = 'event Harvest(address indexed yieldToken, uint256 minimumAmountOut, uint256 totalHarvested, uint256 credit)';

// AlchemistV2 protocolFee is in basis points. Denominator is 10000.
// https://github.com/alchemix-finance/v2-foundry/blob/master/src/AlchemistV2.sol
const FEE_DENOMINATOR_BPS = 10000n;

/**
 * Fetches the daily fees and revenue for Alchemix V2.
 * Harvest events report gross yield. protocolFee is read once per alchemist
 * and applied to every harvest in the window.
 */
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  
  const alchemists = chainConfigs[options.chain].alchemists;
  const [harvestLogs, protocolFees] = await Promise.all([
    options.getLogs({
      targets: alchemists,
      eventAbi: HarvestEvent,
      flatten: true,
      onlyArgs: false,
    }),
    options.api.multiCall({
      abi: 'uint256:protocolFee',
      calls: alchemists,
    }),
  ]);

  const feeRateByAlchemist: Record<string, bigint> = {};
  alchemists.forEach((alchemist: string, index: number) => {
    feeRateByAlchemist[formatAddress(alchemist)] = BigInt(protocolFees[index]);
  });

  for (const log of harvestLogs) {
    const args = (log as any).args || log;
    const _token = formatAddress(args.yieldToken);
    const token = chainConfigs[options.chain].customAssets && chainConfigs[options.chain].customAssets[_token] ? chainConfigs[options.chain].customAssets[_token] : _token;
    
    const totalYield = BigInt(args.totalHarvested);
    const feeRate = feeRateByAlchemist[formatAddress(log.address)];
    
    const protocolYield = (totalYield * feeRate) / FEE_DENOMINATOR_BPS;
    const supplySideYield = totalYield - protocolYield;

    dailyFees.add(token, totalYield, METRIC.ASSETS_YIELDS);
    dailyRevenue.add(token, protocolYield, 'Yields To Protocol');
    dailySupplySideRevenue.add(token, supplySideYield, 'Yields To Self-Repay Loans');
  }
  
  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0, // no revenue share to ALCX
  }
}

const methodology = {
  Fees: "Alchemix generates revenue from various lending and yield optimization activities across its protocol.",
  Revenue: "Protocol fee share from gross yield harvested.",
  SupplySideRevenue: "Net yield distributed to users/borrowers for self-repaying loans after protocol fees.",
  ProtocolRevenue: "Protocol fee share from gross yield harvested.",
  HoldersRevenue: "No revenue share to ALCX token holders.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: "Alchemix generates revenue from various lending and yield optimization activities across its protocol.",
  },
  Revenue: {
    'Yields To Protocol': 'Share of protocol fee on all yields.',
  },
  SupplySideRevenue: {
    'Yields To Self-Repay Loans': 'Share of all yields left to borrowers for self-repaying loans.',
  },
  ProtocolRevenue: {
    'Yields To Protocol': 'Share of protocol fee on all yields.',
  },
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfigs,
  methodology,
  breakdownMethodology,
}

export default adapter;
