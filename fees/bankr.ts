import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";
import { METRIC } from "../helpers/metrics";

const feeWallets = [
  '0x2fE8D03556FDb94A0ce1e46bbb5945794a50a046',
];

// wallet receive fees from clanker
const clankerFeesRecipient = [
  '0xF60633D02690e2A15A54AB919925F3d038Df163e',
];

const feeToken = '0x22af33fe49fd1fa80c7149773dde5890d3c76f3b';
const clankerFeeToken = '0x4200000000000000000000000000000000000006'; // WETH

// bankr bot revenue come from membership subs in $BNKR token
// no trading fees for now
const fetch = async (options: FetchOptions) => {
  const subscriptionsFees = await addTokensReceived({
    options,
    targets: feeWallets,
    token: feeToken,
  });
  const creatorFees = await addTokensReceived({
    options,
    targets: clankerFeesRecipient,
    token: clankerFeeToken,
    fromAdddesses: ['0xf3622742b1e446d92e45e22923ef11c2fcd55d68'], // Clanker Fees Claim
  });
  
  const dailyFees = options.createBalances();
  dailyFees.add(subscriptionsFees, 'Club Membership Subscriptions');
  dailyFees.add(creatorFees, METRIC.CREATOR_FEES);
  
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyHoldersRevenue: 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  start: '2026-01-01',
  chains: [CHAIN.BASE],
  methodology: {
    Fees: 'All fees come from membership subscriptions paid in $BNKR tokens + creator fees from Clanker.',
    Revenue: 'All fees are collected as revenue by Bankr Bot.',
    ProtocolRevenue: 'All fees are collected as revenue by Bankr Bot.',
    HoldersRevenue: 'No revenue share to token holders.',
  },
  breakdownMethodology: {
    Fees: {
      'Club Membership Subscriptions': 'Recurring membership subscriptions paid in $BNKR tokens for access to Bankr Bot club features and services',
      [METRIC.CREATOR_FEES]: 'Creator fees earned from tokens launched via Clanker integration, paid in WETH',
    },
    Revenue: {
      'Club Membership Subscriptions': 'Recurring membership subscriptions paid in $BNKR tokens for access to Bankr Bot club features and services',
      [METRIC.CREATOR_FEES]: 'Creator fees earned from tokens launched via Clanker integration, paid in WETH',
    },
    ProtocolRevenue: {
      'Club Membership Subscriptions': 'Recurring membership subscriptions paid in $BNKR tokens for access to Bankr Bot club features and services',
      [METRIC.CREATOR_FEES]: 'Creator fees earned from tokens launched via Clanker integration, paid in WETH',
    },
  }
};

export default adapter;
