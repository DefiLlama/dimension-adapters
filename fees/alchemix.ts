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
      [formatAddress('0x248a431116c6f6FCD5Fe1097d16d0597E24100f5')]: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    },
    start: '2023-07-03',
  },
  [CHAIN.OPTIMISM]: {
    alchemists: [
      '0x10294d57A419C8eb78C648372c5bAA27fD1484af', // alUSD
      '0xe04Bb5B4de60FA2fBa69a93adE13A8B3B569d5B4', // alETH
    ],
    customAssets: {
      [formatAddress('0x0A86aDbF58424EE2e304b395aF0697E850730eCD')]: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    },
    start: '2022-09-17',
  },
}

const HarvestEvent = 'event Harvest(address indexed yieldToken, uint256 minimumAmountOut, uint256 totalHarvested, uint256 credit)';

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  
  const harvestLogs = await options.getLogs({
    targets: chainConfigs[options.chain].alchemists,
    eventAbi: HarvestEvent,
    flatten: true,
  })
  for (const log of harvestLogs) {
    const _token = formatAddress(log.yieldToken);
    const token = chainConfigs[options.chain].customAssets && chainConfigs[options.chain].customAssets[_token] ? chainConfigs[options.chain].customAssets[_token] : _token
    const totalYield = Number(log.totalHarvested);

    dailyFees.add(token, totalYield, METRIC.ASSETS_YIELDS);
    dailyRevenue.add(token, totalYield * 0.1, 'Yields To Protocol');
    dailySupplySideRevenue.add(token, totalYield * 0.9, 'Yields To Self-Repay Loans');
  }
  
  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0, // no revenue share to ALCX
  }
}

const methodology = {
  Fees: "Alchemix generates revenue from various lending and yield optimization activities across its protocol.",
  Revenue: "Revenue share from 10% yield collected.",
  SupplySideRevenue: "There are 90% yield are distibuted to users/borrowers.",
  ProtocolRevenue: "Revenue share from 10% yield collected.",
  HoldersRevenue: "No revenue share to ALCX token holders.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: "Alchemix generates revenue from various lending and yield optimization activities across its protocol.",
  },
  Revenue: {
    'Yields To Protocol': 'Share of 10% all yields.',
  },
  SupplySideRevenue: {
    'Yields To Self-Repay Loans': 'Share of 90% all yields to borrowers for self-repay loans.',
  },
  ProtocolRevenue: {
    'Yields To Protocol': 'Share of 10% all yields.',
  },
}

const adapter: Adapter = {
  version: 2,
  fetch,
  adapter: chainConfigs,
  methodology,
  breakdownMethodology,
}

export default adapter;

