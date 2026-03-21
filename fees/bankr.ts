import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived, getETHReceived } from "../helpers/token";

const feeWallets = [
  '0x2fE8D03556FDb94A0ce1e46bbb5945794a50a046',
];

// wallet receive fees from clanker
const clankerFeesRecipients = [
  '0xF60633D02690e2A15A54AB919925F3d038Df163e',
];

const swapFeesRecipients = [
  '0xBa2304D1f48AC01CF01427fc9d9aE3D21e71b536',
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
    targets: clankerFeesRecipients,
    token: clankerFeeToken,
    fromAdddesses: ['0xf3622742b1e446d92e45e22923ef11c2fcd55d68'], // Clanker Fees Claim
  });
  const swapFees = await getETHReceived({
    options,
    targets: swapFeesRecipients,
  });
  await addTokensReceived({
    balances: swapFees,
    options,
    targets: swapFeesRecipients,
  });
  
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  dailyFees.add(subscriptionsFees, 'Club Membership Subscriptions');
  dailyFees.add(creatorFees, 'Creators Fees');
  dailyFees.add(swapFees, 'Token Swap Fees');
  dailyRevenue.add(creatorFees.clone(0.43), 'Creators Fees To Bankr');
  dailyRevenue.add(swapFees, 'Token Swap Fees To Bankr');
  dailySupplySideRevenue.add(creatorFees.clone(0.57), 'Creators Fees To Creators');
  
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: '2026-01-01',
  chains: [CHAIN.BASE],
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: 'All fees come from membership subscriptions paid in $BNKR tokens + creator fees from Clanker + 0.8% per swap fees via Bankr.',
    Revenue: 'Share of 43% creator fees from Clanker and all subscriptions + swap fees are collected as revenue by Bankr Bot.',
    ProtocolRevenue: 'All revenue are collected as revenue by Bankr Bot.',
    SupplySideRevenue: 'Share of 57% creator fees from Clanker to token creators.',
    HoldersRevenue: 'No revenue share to token holders.',
  },
  breakdownMethodology: {
    Fees: {
      'Club Membership Subscriptions': 'Recurring membership subscriptions paid in $BNKR tokens for access to Bankr Bot club features and services',
      'Creators Fees': 'Creator fees earned from tokens launched via Clanker integration, paid in WETH',
      'Token Swap Fees': 'Users pay 0.8% per swao while trading via Bankr bot.',
    },
    Revenue: {
      'Club Membership Subscriptions': 'Recurring membership subscriptions paid in $BNKR tokens for access to Bankr Bot club features and services',
      'Creators Fees To Bankr': 'Creator fees earned from tokens launched via Clanker integration, paid in WETH',
      'Token Swap Fees To Bankr': 'Users pay 0.8% per swao while trading via Bankr bot.',
    },
    ProtocolRevenue: {
      'Club Membership Subscriptions': 'Recurring membership subscriptions paid in $BNKR tokens for access to Bankr Bot club features and services',
      'Creators Fees To Bankr': 'Creator fees earned from tokens launched via Clanker integration, paid in WETH',
      'Token Swap Fees To Bankr': 'Users pay 0.8% per swao while trading via Bankr bot.',
    },
    SupplySideRevenue: {
      'Creators Fees To Creators': 'Share of 57% creator fees from Clanker to token creators',
    },
  }
};

export default adapter;
