import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const BAL_TOKEN = '0xba100000625a3754423978a60c9317c58a424e3D';
const AURA_COLLECTOR = '0xaF52695E1bB01A16D33D7194C28C42b10e0Dbec2';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const VOTE_INCENTIVE_SOURCES = new Set([
  '0x26743984e3357efc59f2fd6c1afdc310335a61c9',
  '0xd3cf852898b21fc233251427c2dc93d3d604f3bb',
]);

const padAddress = (address: string) => '0x' + address.slice(2).toLowerCase().padStart(64, '0');

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const logs = await options.getLogs({
    target: BAL_TOKEN,
    eventAbi: 'event Transfer(address indexed from, address indexed to, uint256 value)',
    topics: [TRANSFER_TOPIC, null as any, padAddress(AURA_COLLECTOR)],
  });

  logs.forEach((log: any) => {
    const metric = VOTE_INCENTIVE_SOURCES.has(log.from.toLowerCase()) ? METRIC.STAKING_REWARDS : METRIC.ASSETS_YIELDS;
    dailyFees.add(BAL_TOKEN, log.value, metric)
  });


  const dailySupplySideRevenue = dailyFees.clone();
  dailySupplySideRevenue.resizeBy(0.75);
  const dailyRevenue = dailyFees.clone();
  dailyRevenue.resizeBy(0.25);
  const dailyHoldersRevenue = dailyFees.clone();
  const dailyProtocolRevenue = dailyFees.clone();
  dailyHoldersRevenue.resizeBy(0.04);
  dailyProtocolRevenue.resizeBy(0.21);

  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyHoldersRevenue, dailyProtocolRevenue }
}

const adapter: Adapter = {
  version: 2,
  chains: [CHAIN.ETHEREUM],
  fetch,
  start: '2022-12-01',
  methodology: {
    Fees: "Staking rewards from all staking pools from users.",
    Revenue: "Staking rewards collected by Aura.",
    HoldersRevenue: "Staking rewards earned by AURA holders.",
    ProtocolRevenue: "Staking rewards retained by the Aura protocol.",
    SupplySideRevenue: "Staking rewards distributed to depositors."
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]: 'BAL tokens received from vote incentive contracts to the Aura collector.',
      [METRIC.ASSETS_YIELDS]: 'BAL tokens received from other yield sources to the Aura collector.',
    },
    Revenue: {
      [METRIC.STAKING_REWARDS]: 'BAL vote incentive rewards retained by the Aura protocol and holders.',
      [METRIC.ASSETS_YIELDS]: '25% of BAL yield rewards retained by the Aura protocol and holders.',
    },
    SupplySideRevenue: {
      [METRIC.STAKING_REWARDS]: '75% of BAL vote incentive rewards distributed to depositors.',
      [METRIC.ASSETS_YIELDS]: '75% of BAL yield rewards distributed to depositors.',
    },
    HoldersRevenue: {
      [METRIC.STAKING_REWARDS]: '4% of BAL vote incentive rewards earned by AURA holders.',
      [METRIC.ASSETS_YIELDS]: '4% of BAL yield rewards earned by AURA holders.',
    },
    ProtocolRevenue: {
      [METRIC.STAKING_REWARDS]: '21% of BAL vote incentive rewards retained by the Aura protocol.',
      [METRIC.ASSETS_YIELDS]: '21% of BAL yield rewards retained by the Aura protocol.',
    },
  }

}

export default adapter;
