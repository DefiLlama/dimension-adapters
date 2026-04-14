import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived, getETHReceived } from "../helpers/token";

const feeWallets = [
  '0x2fE8D03556FDb94A0ce1e46bbb5945794a50a046',
];

// Wallet receiving Bankr's portion of Clanker fees
// ClankerFeeLocker (0xf3622742b1e446d92e45e22923ef11c2fcd55d68) holds 100% of LP fees
// and distributes according to rewardBps config. This wallet receives Bankr's 43% share.
const clankerFeesRecipients = [
  '0xF60633D02690e2A15A54AB919925F3d038Df163e',
];

// Wallet collecting swap fees from Uniswap V4 pools
// IMPORTANT: This wallet appears to receive protocol's portion only (43% = Bankr 36.1% + Ecosystem 1.9% + Doppler 5%)
// Creators' 57% is claimed directly from Uniswap V4 pools to individual creator wallets
// If this is incorrect and wallet receives 100%, the calculations below need adjustment
const swapFeesRecipients = [
  '0xBa2304D1f48AC01CF01427fc9d9aE3D21e71b536',
];

const feeToken = '0x22af33fe49fd1fa80c7149773dde5890d3c76f3b';
const clankerFeeToken = '0x4200000000000000000000000000000000000006'; // WETH

// bankr bot revenue come from:
// 1. membership subs in $BNKR token
// 2. 1.2% swap fees on tokens launched via Bankr (split: 57% creators, 36.1% Bankr, 1.9% ecosystem, 5% protocol)
// 3. 43% of creator fees from legacy Clanker integration
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  
  // Subscription fees: 100% to Bankr
  const subscriptionsFees = await addTokensReceived({
    options,
    targets: feeWallets,
    token: feeToken,
  });
  dailyFees.addBalances(subscriptionsFees, 'Club Subscriptions');
  dailyRevenue.addBalances(subscriptionsFees, 'Club Subscriptions');
  
  // Clanker integration fees: This wallet receives only Bankr's 43% portion from ClankerFeeLocker
  // ClankerFeeLocker holds 100% of LP fees and distributes according to rewardBps configuration
  // Creators' 57% goes to their individual wallets (not tracked here)
  const clankerFeesProtocolPortion = await addTokensReceived({
    options,
    targets: clankerFeesRecipients,
    token: clankerFeeToken,
    fromAdddesses: ['0xf3622742b1e446d92e45e22923ef11c2fcd55d68'], // Clanker Fees Claim
  });
  
  // Scale up to estimate total Clanker fees (we receive 43%)
  const estimatedTotalClankerFees = clankerFeesProtocolPortion.clone(1 / 0.43);
  
  dailyFees.addBalances(estimatedTotalClankerFees, 'Clanker Integration Fees');
  dailyRevenue.addBalances(clankerFeesProtocolPortion, 'Clanker Integration Fees'); // Our 43%
  dailySupplySideRevenue.add(estimatedTotalClankerFees.clone(0.57), 'Clanker Integration Fees'); // Estimated 57%
  
  // Token swap fees: This wallet receives protocol's 43% portion (Bankr 36.1% + Ecosystem 1.9% + Doppler 5%)
  // Creators' 57% goes directly to individual creator wallets (not tracked here)
  const swapFeesProtocolPortion = await getETHReceived({
    options,
    targets: swapFeesRecipients,
  });
  await addTokensReceived({
    balances: swapFeesProtocolPortion,
    options,
    targets: swapFeesRecipients,
  });
  
  // Calculate proportions from what we receive (43% of total)
  const bankrShare = 0.361 / 0.43; // 0.8395 (83.95% of protocol portion)
  const ecosystemShare = 0.019 / 0.43; // 0.0442 (4.42% of protocol portion)
  const dopplerShare = 0.05 / 0.43; // 0.1163 (11.63% of protocol portion)
  
  dailyRevenue.add(swapFeesProtocolPortion.clone(bankrShare), 'Swap Fees');
  dailyRevenue.add(swapFeesProtocolPortion.clone(ecosystemShare), 'Swap Fees');
  dailyRevenue.add(swapFeesProtocolPortion.clone(dopplerShare), 'Swap Fees');
  
  // Estimate total fees by scaling up protocol portion
  const estimatedTotalSwapFees = swapFeesProtocolPortion.clone(1 / 0.43);
  dailyFees.addBalances(estimatedTotalSwapFees, 'Swap Fees');
  dailySupplySideRevenue.add(estimatedTotalSwapFees.clone(0.57), 'Swap Fees');

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: '2025-08-11',
  chains: [CHAIN.BASE],
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: 'Membership subscriptions in $BNKR + LP fees from Clanker integration + 1.2% swap fees on Bankr token launches. Total fees estimated from protocol portions tracked (43% for both Clanker and swap fees).',
    Revenue: 'Bankr receives 43% of Clanker LP fees, 36.1% of swap fees. Ecosystem gets 1.9% of swap fees. Doppler gets 5% of swap fees. All subscriptions go to Bankr.',
    SupplySideRevenue: 'Token creators receive 57% of Clanker LP fees and swap fees.',
  },
  breakdownMethodology: {
    Fees: {
      'Club Subscriptions': 'Membership fees in $BNKR tokens for premium features',
      'Clanker Integration Fees': 'LP fees from Clanker token launches, denominated in WETH',
      'Swap Fees': '1.2% trading fees from Uniswap V4 pools on Bankr-launched tokens',
    },
    Revenue: {
      'Club Subscriptions': 'All subscription revenue retained by Bankr',
      'Clanker Integration Fees': 'Bankr receives 43% of Clanker LP fees',
      'Swap Fees': 'Bankr 36.1%, Ecosystem 1.9%, Doppler 5% of the 1.2% swap fee',
    },
    SupplySideRevenue: {
      'Clanker Integration Fees': 'Token creators receive 57% of Clanker LP fees',
      'Swap Fees': 'Token creators receive 57% of the 1.2% swap fee',
    },
  }
};

export default adapter;
