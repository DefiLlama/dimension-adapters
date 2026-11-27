import { Interface, zeroPadValue } from 'ethers';
import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';

// AnglesVault proxy and its verified implementation (_processRewards, _rebase, totalValue):
// https://sonicscan.org/address/0xe5203Be1643465b3c0De28fd2154843497Ef4269#code
// https://sonicscan.org/address/0xD4012c5F3CBcC383D358c5086dA694757463E1f2#code
const VAULT = '0xe5203Be1643465b3c0De28fd2154843497Ef4269';
// Sonic's staking contract: https://github.com/0xsoniclabs/sonic-sfc/blob/main/contracts/sfc/SFC.sol
const SFC = '0xFC00FACE00000000000000000000000000000000';
// Proxy initialization, 2025-01-21 11:06:03 UTC. Earlier snapshots genuinely have no vault assets.
// https://sonicscan.org/tx/0x722e83f56ac55efd29b98bd28dab6beef6ec101f63013263d58619741d4cb90d
const INITIALIZED_BLOCK = 4_808_484;

const abi = {
  validators: 'function validatorsIndexed(uint256) view returns (uint256 validatorId, uint8 weight, uint256 limit, uint256 SInTransit)',
  pending: 'function pendingRewards(address delegator, uint256 toValidatorID) view returns (uint256)',
  distribution: 'event YieldDistribution(address _to, uint256 _yield, uint256 _fee)',
  claim: 'event ClaimedRewards(address indexed delegator, uint256 indexed toValidatorID, uint256 rewards)',
  restake: 'event RestakedRewards(address indexed delegator, uint256 indexed toValidatorID, uint256 rewards)',
};

const LABELS = {
  rewards: 'Staking Rewards',
  protocol: 'Staking Rewards To Angles',
  depositors: 'Staking Rewards To anS Holders',
};

type Snapshot = {
  initialized: boolean;
  validators: string[];
  value: bigint;
  supply: bigint;
  feeNom: bigint;
  feeDenom: bigint;
  hasFeeRecipient: boolean;
};

async function snapshot(api: FetchOptions['api']): Promise<Snapshot> {
  if (api.block == null) throw new Error('Angles Stake: a historical block is required');
  if (Number(api.block) < INITIALIZED_BLOCK) {
    return { initialized: false, validators: [], value: 0n, supply: 0n, feeNom: 0n, feeDenom: 1n, hasFeeRecipient: false };
  }

  // Full signatures keep mutable values block-specific (the SDK caches address: shorthands).
  const [count, value, ans, feeNom, feeDenom, feeRecipient, sfc] = await api.batchCall([
    { target: VAULT, abi: 'function numberOfValidators() view returns (uint256)' },
    { target: VAULT, abi: 'function totalValue() view returns (uint256)' },
    { target: VAULT, abi: 'function ans() view returns (address)' },
    { target: VAULT, abi: 'function feeNom() view returns (uint256)' },
    { target: VAULT, abi: 'function feeDenom() view returns (uint256)' },
    { target: VAULT, abi: 'function feeContainerAddress() view returns (address)' },
    { target: VAULT, abi: 'function sfc() view returns (address)' },
  ]);
  if (sfc.toLowerCase() !== SFC.toLowerCase()) throw new Error(`Angles Stake: unrecognized SFC ${sfc}`);
  if (BigInt(feeDenom) === 0n || BigInt(feeNom) >= BigInt(feeDenom)) {
    throw new Error(`Angles Stake: invalid performance fee ${feeNom}/${feeDenom} at block ${api.block}`);
  }
  const validators = await api.multiCall({
    target: VAULT,
    abi: abi.validators,
    calls: Array.from({ length: Number(count) }, (_, i) => i),
  });
  const supply = await api.call({ target: ans, abi: 'function totalSupply() view returns (uint256)' });
  return {
    initialized: true,
    validators: validators.map((v: any) => String(v.validatorId)),
    value: BigInt(value),
    supply: BigInt(supply),
    feeNom: BigInt(feeNom),
    feeDenom: BigInt(feeDenom),
    hasFeeRecipient: BigInt(feeRecipient) !== 0n,
  };
}

async function pendingRewards(api: FetchOptions['api'], state: Snapshot, validators: string[]): Promise<bigint> {
  if (!state.initialized || !validators.length) return 0n;
  const rewards = await api.multiCall({
    target: SFC,
    abi: abi.pending,
    calls: validators.map(id => ({ params: [VAULT, id] })),
  });
  return rewards.reduce<bigint>((sum, value) => sum + BigInt(value), 0n);
}

// Fees already earned but not minted to the fee recipient yet. totalValue excludes SFC pending rewards;
// its surplus over anS supply includes rewards already claimed/restaked but not rebased. Deposits and
// withdrawal requests change backing and supply equally. _rebase charges only positive surplus, and
// exits without a fee when supply is zero. Read the actual fee fraction at each historical boundary.
function accruedFee(state: Snapshot, pending: bigint) {
  const surplus = state.value + pending - state.supply;
  if (!state.hasFeeRecipient || state.supply === 0n || surplus <= 0n) return 0n;
  return surplus * state.feeNom / state.feeDenom;
}

const fetch = async (options: FetchOptions) => {
  const opening = await snapshot(options.fromApi);
  const closing = await snapshot(options.toApi);
  const validators = new Set([...opening.validators, ...closing.validators]);
  let collected = 0n;

  // Both SFC implementations emit either ClaimedRewards or RestakedRewards, never both for one payout.
  // Filter the indexed delegator at the source; Delegated also includes deposits and is NOT income.
  for (const eventAbi of [abi.claim, abi.restake]) {
    const iface = new Interface([eventAbi]);
    const eventName = eventAbi === abi.claim ? 'ClaimedRewards' : 'RestakedRewards';
    const logs = await options.getLogs({
      target: SFC,
      eventAbi,
      topics: [iface.getEvent(eventName)!.topicHash, zeroPadValue(VAULT, 32)],
    });
    for (const log of logs) {
      collected += BigInt(log.rewards);
      validators.add(String(log.toValidatorID));
    }
  }

  // Include validators present at either boundary or paid during the window. A validator can only be
  // removed from Angles after its stake, pending rewards and funds in transit are all zero.
  const ids = [...validators];
  const pendingBefore = await pendingRewards(options.fromApi, opening, ids);
  const pendingAfter = await pendingRewards(options.toApi, closing, ids);
  const rewards = collected + pendingAfter - pendingBefore;

  const distributions = await options.getLogs({ target: VAULT, eventAbi: abi.distribution });
  const mintedFees = distributions.reduce<bigint>((sum, log) => sum + BigInt(log._fee), 0n);
  const protocolFee = mintedFees + accruedFee(closing, pendingAfter) - accruedFee(opening, pendingBefore);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  dailyFees.addGasToken(rewards, LABELS.rewards);
  dailyRevenue.addGasToken(protocolFee, LABELS.protocol);
  dailySupplySideRevenue.addGasToken(rewards - protocolFee, LABELS.depositors);
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SONIC],
  start: '2025-01-21',
  // Do not discard reductions in accrued rewards or fee entitlement (e.g. losses or a fee-rate change).
  allowNegativeValue: true,
  methodology: {
    Fees: 'S staking rewards earned by the Angles vault before its performance fee, including rewards not yet claimed from Sonic validators; excludes deposits, withdrawals and Angles Liquid.',
    Revenue: 'Angles performance fees accrued on staking yield, using the historical on-chain fee settings and actual fees minted at rebases.',
    ProtocolRevenue: 'Angles performance fees accrued to its configured fee recipient, including fees not yet minted at a rebase.',
    SupplySideRevenue: 'Staking yield accruing to anS depositors after the Angles performance fee; anS is a deposit receipt, not a governance token.',
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.rewards]: 'SFC rewards claimed or restaked by the Angles vault plus the change in its pending SFC rewards, measured between the window boundaries; validator commissions already withheld by SFC are excluded.',
    },
    Revenue: {
      [LABELS.protocol]: 'Actual anS performance fees minted in YieldDistribution events plus the change in the fee due on positive unrebased backing surplus and pending SFC rewards, using feeNom/feeDenom at each boundary.',
    },
    ProtocolRevenue: {
      [LABELS.protocol]: 'Performance fees allocated to the Angles fee recipient, recognized when earned by reconciling minted fees with the opening and closing accrued fee entitlement.',
    },
    SupplySideRevenue: {
      [LABELS.depositors]: 'Accrued delegator staking rewards minus accrued Angles performance fees; includes yield on anS held directly or through wanS, counted once.',
    },
  },
};

export default adapter;
