import { EventFragment, zeroPadValue } from 'ethers';
import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { METRIC } from '../helpers/metrics';

// AnglesVault proxy; implementation: https://sonicscan.org/address/0xD4012c5F3CBcC383D358c5086dA694757463E1f2#code
const VAULT = '0xe5203Be1643465b3c0De28fd2154843497Ef4269';
// Sonic SFC staking contract: https://github.com/0xsoniclabs/sonic-sfc/blob/main/contracts/sfc/SFC.sol
const SFC = '0xFC00FACE00000000000000000000000000000000';

const abi = {
  numberOfValidators: 'function numberOfValidators() view returns (uint256)',
  validatorsIndexed: 'function validatorsIndexed(uint256) view returns (uint256 validatorId, uint8 weight, uint256 limit, uint256 SInTransit)',
  feeNom: 'function feeNom() view returns (uint256)',
  feeDenom: 'function feeDenom() view returns (uint256)',
  pendingRewards: 'function pendingRewards(address delegator, uint256 toValidatorID) view returns (uint256)',
  claimedRewards: 'event ClaimedRewards(address indexed delegator, uint256 indexed toValidatorID, uint256 rewards)',
  restakedRewards: 'event RestakedRewards(address indexed delegator, uint256 indexed toValidatorID, uint256 rewards)',
};

const LABELS = {
  protocol: 'Staking Rewards To Angles',
  depositors: 'Staking Rewards To anS Holders',
};

async function getValidators(api: FetchOptions['api']): Promise<string[]> {
  const count = await api.call({ target: VAULT, abi: abi.numberOfValidators });
  const validators = await api.multiCall({
    target: VAULT,
    abi: abi.validatorsIndexed,
    calls: Array.from({ length: Number(count) }, (_, i) => i),
  });
  return validators.map((v: any) => String(v.validatorId));
}

async function getPendingRewards(api: FetchOptions['api'], validators: string[]) {
  const rewards = await api.multiCall({
    target: SFC,
    abi: abi.pendingRewards,
    calls: validators.map(id => ({ params: [VAULT, id] })),
  });
  return rewards.reduce((sum: number, reward: any) => sum + Number(reward), 0);
}

const fetch = async (options: FetchOptions) => {
  const validators = [...new Set([...await getValidators(options.fromApi), ...await getValidators(options.toApi)])];
  const pendingBefore = await getPendingRewards(options.fromApi, validators);
  const pendingAfter = await getPendingRewards(options.toApi, validators);

  // rewards is the only non-indexed field of both events, so it is the whole log data
  const rewardLogs = await options.getLogs({
    target: SFC,
    topics: [[abi.claimedRewards, abi.restakedRewards].map(e => EventFragment.from(e).topicHash), zeroPadValue(VAULT, 32)] as any,
    onlyArgs: false,
  });
  const paidOut = rewardLogs.reduce((sum: number, log: any) => sum + Number(log.data), 0);

  // 10% since launch, read once per window
  const [feeNom, feeDenom] = await options.api.batchCall([
    { target: VAULT, abi: abi.feeNom },
    { target: VAULT, abi: abi.feeDenom },
  ]);
  const feeRate = Number(feeNom) / Number(feeDenom);

  const dailyFees = options.createBalances();
  dailyFees.addGasToken(paidOut + pendingAfter - pendingBefore, METRIC.STAKING_REWARDS);
  const dailyRevenue = dailyFees.clone(feeRate, LABELS.protocol);
  const dailySupplySideRevenue = dailyFees.clone(1 - feeRate, LABELS.depositors);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SONIC],
  start: '2025-01-22',
  methodology: {
    Fees: 'S staking rewards earned on S deposited into Angles (anS), counted as they accrue at Sonic validators, before the Angles performance fee; excludes Angles Liquid.',
    Revenue: 'Angles performance fee (currently 10%) on anS staking rewards.',
    ProtocolRevenue: 'Angles performance fee (currently 10%) on anS staking rewards, minted as anS to the Angles fee wallet.',
    SupplySideRevenue: 'Staking rewards (currently 90%) left to anS and wanS holders after the Angles performance fee.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]: 'S rewards the Angles vault claimed or restaked at Sonic validators plus the change in its unclaimed rewards, net of validator commission.',
    },
    Revenue: {
      [LABELS.protocol]: 'Angles performance fee (currently 10%) on staking rewards.',
    },
    ProtocolRevenue: {
      [LABELS.protocol]: 'Angles performance fee (currently 10%) on staking rewards, minted as anS to the Angles fee wallet.',
    },
    SupplySideRevenue: {
      [LABELS.depositors]: 'Staking rewards left to anS and wanS holders after the Angles performance fee.',
    },
  },
};

export default adapter;
