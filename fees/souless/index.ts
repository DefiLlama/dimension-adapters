import ADDRESSES from '../../helpers/coreAssets.json';
import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { METRIC } from '../../helpers/metrics';

const USDC = ADDRESSES.arc.USDC;
const LAUNCH_FEE_VAULT = '0xf4A46363CAC72e839823B96EE7832B6CBE683D0E';
const OPENING_FEE_VAULT = '0x56cb8D3549cdD2E67E79d9Df3229F3A52C82Df03';
const FEE_DISPATCHER = '0x0C8C98B7976E114fea895e827182B5dA0b3B9dcc';

const LAUNCH_FEE = 'Launch Fees';
const OPENING_FEE = 'Guarded Opening Fees';
const LP_FEE = METRIC.LP_FEES;
const TO_PROTOCOL = 'Fees to Protocol';
const TO_PROTECTION_HOLDERS = 'Fees to Narrative Protection Holders';
const TO_CREATORS = METRIC.CREATOR_FEES;
const TO_COMMUNITIES = 'Fees to Launch Communities';
const TO_PARTNERS = 'Fees to Launch Partners';
const TO_REFERRERS = 'Fees to Referrers';

const LAUNCH_FEE_CREDITED = 'event LaunchFeeCredited(bytes32 indexed launchId, address indexed payer, address indexed protectionHolderRecipient, uint256 totalAmount, uint256 protectionHolderAmount, uint256 protocolAmount, bytes32 feePolicyVersionHash)';
const OPENING_FEE_DEPOSITED = 'event OpeningFeeDeposited(bytes32 indexed launchId, address indexed guard, uint256 amount)';
const FEES_CREDITED = 'event FeesCredited(bytes32 indexed launchId, uint256 totalAmount, uint256 creatorAmount, uint256 communityAmount, uint256 launchPartnerAmount, uint256 referrerAmount, uint256 protocolAmount, bool referralActive)';

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const [launchFees, openingFees, lpFees] = await Promise.all([
    options.getLogs({ target: LAUNCH_FEE_VAULT, eventAbi: LAUNCH_FEE_CREDITED }),
    options.getLogs({ target: OPENING_FEE_VAULT, eventAbi: OPENING_FEE_DEPOSITED }),
    options.getLogs({ target: FEE_DISPATCHER, eventAbi: FEES_CREDITED }),
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
    dailySupplySideRevenue.add(USDC, fee.communityAmount, TO_COMMUNITIES);
    dailySupplySideRevenue.add(USDC, fee.launchPartnerAmount, TO_PARTNERS);
    dailySupplySideRevenue.add(USDC, fee.referrerAmount, TO_REFERRERS);
  }
  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: 'USDC paid as the fixed fee to launch a token, the 0.1% fee on public USDC committed during a guarded opening, and Uniswap v3 LP fees earned by Souless permanently locked launch positions when those fees are collected on-chain.',
  Revenue: 'The protocol share of launch and collected LP fees, plus all guarded-opening fees.',
  ProtocolRevenue: 'The protocol share of launch and collected LP fees, plus all guarded-opening fees, sent or claimable by the Souless treasury.',
  SupplySideRevenue: 'Launch fees allocated to narrative-protection holders and collected LP fees allocated to token creators, launch communities, launch partners, and referrers.',
};

const breakdownMethodology = {
  Fees: {
    [LAUNCH_FEE]: 'The fixed USDC fee charged when a token is launched. A protected duplicate has a higher fee than a standard launch.',
    [OPENING_FEE]: 'The 0.1% fee deducted from public USDC commitments when a guarded launch finalizes.',
    [LP_FEE]: 'USDC-denominated Uniswap v3 trading fees harvested from permanently locked Souless launch positions. These are also present in Uniswap v3 fee reporting on Arc.',
  },
  Revenue: { [TO_PROTOCOL]: 'The protocol portion emitted when launch and LP fees are credited, plus 100% of guarded-opening fees.' },
  ProtocolRevenue: { [TO_PROTOCOL]: 'The protocol portion emitted when launch and LP fees are credited, plus 100% of guarded-opening fees.' },
  SupplySideRevenue: {
    [TO_PROTECTION_HOLDERS]: 'The protected-duplicate launch-fee share credited to the holder of the protected narrative.',
    [TO_CREATORS]: 'The collected LP-fee share credited to the launched token creator.',
    [TO_COMMUNITIES]: 'The collected LP-fee share credited to the launched token community rewards pool.',
    [TO_PARTNERS]: 'The collected LP-fee share credited to the time-limited launch-partner campaign.',
    [TO_REFERRERS]: 'The collected LP-fee share credited to an active launch referrer.',
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
