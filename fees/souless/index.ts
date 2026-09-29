import ADDRESSES from '../../helpers/coreAssets.json';
import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { METRIC } from '../../helpers/metrics';

const USDC = ADDRESSES.arc.USDC;
// https://explorer.arc.io/address/0xf4A46363CAC72e839823B96EE7832B6CBE683D0E
const LAUNCH_FEE_VAULT = '0xf4A46363CAC72e839823B96EE7832B6CBE683D0E';
// https://explorer.arc.io/address/0x56cb8D3549cdD2E67E79d9Df3229F3A52C82Df03
const OPENING_FEE_VAULT = '0x56cb8D3549cdD2E67E79d9Df3229F3A52C82Df03';
// https://explorer.arc.io/address/0x0C8C98B7976E114fea895e827182B5dA0b3B9dcc
const FEE_DISPATCHER = '0x0C8C98B7976E114fea895e827182B5dA0b3B9dcc';
// https://explorer.arc.io/address/0x7F78bA801587E143c0D79b230ff1Dc903A53Fc5f
const COMMUNITY_REWARDS_DISTRIBUTOR = '0x7F78bA801587E143c0D79b230ff1Dc903A53Fc5f';

const BPS_DENOMINATOR = 10_000n;
const LAUNCH_FEE = 'Launch Fees';
const OPENING_FEE = 'Guarded Opening Fees';
const LP_FEE = METRIC.LP_FEES;
const TO_PROTOCOL = 'Fees to Protocol';
const TO_PROTECTION_HOLDERS = 'Fees to Narrative Protection Holders';
const TO_CREATORS = METRIC.CREATOR_FEES;
const TO_STAKERS = 'Fees to Community Stakers';
const TO_INFOFI = 'Fees to InfoFi Contributors';
const TO_PARTNERS = 'Fees to Launch Partners';
const TO_REFERRERS = 'Fees to Referrers';

const LAUNCH_FEE_CREDITED = 'event LaunchFeeCredited(bytes32 indexed launchId, address indexed payer, address indexed protectionHolderRecipient, uint256 totalAmount, uint256 protectionHolderAmount, uint256 protocolAmount, bytes32 feePolicyVersionHash)';
const OPENING_FEE_DEPOSITED = 'event OpeningFeeDeposited(bytes32 indexed launchId, address indexed guard, uint256 amount)';
const FEES_CREDITED = 'event FeesCredited(bytes32 indexed launchId, uint256 totalAmount, uint256 creatorAmount, uint256 communityAmount, uint256 launchPartnerAmount, uint256 referrerAmount, uint256 protocolAmount, bool referralActive)';
const EPOCH_FEES_CREDITED = 'event EpochFeesCredited(address indexed token, uint64 indexed epochId, uint256 amount)';
const EPOCH = 'function epoch(address token, uint64 epochId) view returns (tuple(uint64 startTime, uint64 endTime, uint64 attributionDeadline, uint256 feesAttributed, uint256 communityPool, uint256 stakingPool, uint256 infoFiPool, uint256 totalClaimed, uint16 stakingShareOfCommunityBps, bytes32 rewardRoot, string manifestCid, uint8 status))';

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const [launchFees, openingFees, lpFees, communityFees] = await Promise.all([
    options.getLogs({ target: LAUNCH_FEE_VAULT, eventAbi: LAUNCH_FEE_CREDITED }),
    options.getLogs({ target: OPENING_FEE_VAULT, eventAbi: OPENING_FEE_DEPOSITED }),
    options.getLogs({ target: FEE_DISPATCHER, eventAbi: FEES_CREDITED }),
    options.getLogs({ target: COMMUNITY_REWARDS_DISTRIBUTOR, eventAbi: EPOCH_FEES_CREDITED }),
  ]);

  for (const fee of launchFees) {
    dailyFees.add(USDC, fee.totalAmount, LAUNCH_FEE);
    dailyRevenue.add(USDC, fee.protocolAmount, TO_PROTOCOL);
    dailyProtocolRevenue.add(USDC, fee.protocolAmount, TO_PROTOCOL);
    dailySupplySideRevenue.add(USDC, fee.protectionHolderAmount, TO_PROTECTION_HOLDERS);
  }
  for (const fee of openingFees) {
    dailyFees.add(USDC, fee.amount, OPENING_FEE);
    dailyRevenue.add(USDC, fee.amount, TO_PROTOCOL);
    dailyProtocolRevenue.add(USDC, fee.amount, TO_PROTOCOL);
  }
  for (const fee of lpFees) {
    dailyFees.add(USDC, fee.totalAmount, LP_FEE);
    dailyRevenue.add(USDC, fee.protocolAmount, TO_PROTOCOL);
    dailyProtocolRevenue.add(USDC, fee.protocolAmount, TO_PROTOCOL);
    dailySupplySideRevenue.add(USDC, fee.creatorAmount, TO_CREATORS);
    // Community fees are split below from EpochFeesCredited so the historical
    // Staking/InfoFi policy is visible without double-counting communityAmount.
    dailySupplySideRevenue.add(USDC, fee.launchPartnerAmount, TO_PARTNERS);
    dailySupplySideRevenue.add(USDC, fee.referrerAmount, TO_REFERRERS);
  }

  if (communityFees.length) {
    const uniqueEpochs = new Map<string, { token: string; epochId: any }>();
    for (const fee of communityFees) {
      const key = `${fee.token.toLowerCase()}:${fee.epochId.toString()}`;
      if (!uniqueEpochs.has(key)) uniqueEpochs.set(key, { token: fee.token, epochId: fee.epochId });
    }
    const epochKeys = [...uniqueEpochs.entries()];
    const epochs = await options.api.multiCall({
      abi: EPOCH,
      calls: epochKeys.map(([, { token, epochId }]) => ({
        target: COMMUNITY_REWARDS_DISTRIBUTOR,
        params: [token, epochId],
      })),
    });
    const stakingShareByEpoch = new Map<string, bigint>(
      epochKeys.map(([key], index): [string, bigint] => {
        const epoch: any = epochs[index];
        const stakingShareBps = epoch.stakingShareOfCommunityBps ?? epoch[8];
        return [key, BigInt(stakingShareBps.toString())];
      }),
    );

    for (const fee of communityFees) {
      const key = `${fee.token.toLowerCase()}:${fee.epochId.toString()}`;
      const stakingShareBps = stakingShareByEpoch.get(key);
      if (stakingShareBps === undefined) throw new Error(`Missing Souless community epoch policy for ${key}`);
      const amount = BigInt(fee.amount);
      const stakingAmount = (amount * stakingShareBps) / BPS_DENOMINATOR;
      const infoFiAmount = amount - stakingAmount;
      dailySupplySideRevenue.add(USDC, stakingAmount, TO_STAKERS);
      dailySupplySideRevenue.add(USDC, infoFiAmount, TO_INFOFI);
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: 'USDC paid to launch a token, the 0.1% fee on public USDC committed during a guarded opening, and USDC-side Uniswap v3 LP fees generated by permanently locked Souless launch positions and collected on-chain.',
  Revenue: 'The protocol-retained share of launch and collected LP fees, plus all guarded-opening fees. LP-fee revenue is the residual after creator, Community, launch-partner, and active-referrer allocations.',
  ProtocolRevenue: 'The protocol-retained share of launch and collected LP fees, plus all guarded-opening fees, sent or claimable by the Souless treasury.',
  SupplySideRevenue: 'Launch fees allocated to narrative-protection holders and collected LP fees allocated on-chain to token creators, Community Mode stakers and InfoFi contributors, eligible launch partners, and active referrers. Each Community allocation is split using the staking share stored for the credited token epoch, so historical governance changes are preserved.',
};

const breakdownMethodology = {
  Fees: {
    [LAUNCH_FEE]: 'USDC charged when a token is launched. Protected exact-name-and-ticker duplicates can pay a higher launch fee while protection is active.',
    [OPENING_FEE]: 'The 0.1% fee deducted from public USDC commitments when a guarded launch finalizes.',
    [LP_FEE]: 'USDC-side Uniswap v3 trading fees harvested from permanently locked Souless launch positions. These fees are also present in Uniswap v3 fee reporting on Arc.',
  },
  Revenue: {
    [TO_PROTOCOL]: 'The protocol-retained portion emitted when launch and LP fees are credited, plus 100% of guarded-opening fees.',
  },
  ProtocolRevenue: {
    [TO_PROTOCOL]: 'The protocol-retained portion emitted when launch and LP fees are credited, plus 100% of guarded-opening fees.',
  },
  SupplySideRevenue: {
    [TO_PROTECTION_HOLDERS]: 'The protected-duplicate launch-fee share credited to the holder of the protected narrative.',
    [TO_CREATORS]: 'The collected USDC LP-fee share credited to the launched token creator.',
    [TO_STAKERS]: 'The Staking portion of a Community Mode LP-fee allocation, calculated from the credited epoch\'s stored on-chain staking share.',
    [TO_INFOFI]: 'The InfoFi portion of a Community Mode LP-fee allocation, calculated as the complement of the credited epoch\'s stored on-chain staking share.',
    [TO_PARTNERS]: 'The collected LP-fee share credited while the eligible launch-partner campaign is active.',
    [TO_REFERRERS]: 'The collected LP-fee share credited while a launch\'s referral allocation is active.',
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ARC],
  fetch,
  methodology,
  breakdownMethodology,
  // LP fees are already included by the Uniswap v3 adapter. Launch and opening fees are not,
  // but the LP component is material enough that the combined adapter must carry this flag.
  doublecounted: true,
  start: '2026-09-10',
};

export default adapter;
