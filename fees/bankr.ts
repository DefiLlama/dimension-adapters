import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";
import fetchURL from "../utils/fetchURL";

interface DailyProtocolFees {
  date: string;
  bankrFees: number;
  creatorFees: number;
}

interface DailyByChain {
  date: string;
  base: number;
  robinhood: number;
}

interface BankrDashboard {
  dailyProtocolFees: DailyProtocolFees[];
  dailyFeesByChain: DailyByChain[];
  dailyVolumeByChain: DailyByChain[];
}

// Bankr's own fee leg is read on-chain from this day on, on both chains. It is the
// first day of the Robinhood leg, so from here on the leg can be split per chain.
// Before it, the dashboard's combined bankrFees series is booked on Base, as before.
// The dashboard fills each day in over the following 1-3 days, so a reading taken
// right after the day closes is low; transfers on-chain are final once mined.
const ONCHAIN_START = '2026-07-03';

// Bankr's fee recipients. The same three addresses receive Bankr's fees on Base
// and on Robinhood Chain. Reconciled day by day against Bankr's dashboard for
// September 2026: https://chainward.ai/decodes/bankr-on-chain
const BANKR_FEE_RECIPIENTS = [
  // Bankr fee wallet: BankrFeeRouterV2.bankrFeeWallet(), buybackDst on the Rehype hooks,
  // LP-fee beneficiary on the multicurve pools, reward recipient on Clanker v4
  '0xF60633D02690e2A15A54AB919925F3d038Df163e',
  // Safe owned by the fee wallet, 1/3 beneficiary share on Rehype hook 0x9982
  '0x042455f9990098e11592be1fbd72e6dc68419b13',
  // Safe, 2/3 beneficiary share on Rehype hook 0x9982
  '0x5f8da8f88ec81e27f2e22fcb9ca5d926c595e508',
];
const BANKR_FEE_RECIPIENTS_SET = new Set(BANKR_FEE_RECIPIENTS.map(a => a.toLowerCase()));

// Tokens launched through Bankr are deployed at addresses mined to end in "ba3"
// (97,058 of the 189,413 Doppler launches on Robinhood Chain by 2026-09-30, against
// the 97,771 tokens Bankr's dashboard reports for that chain). Fees Bankr receives
// in its own launched tokens are left out: they only trade in thin pools, and
// Bankr's dashboard does not count them either. Every other token is priced by
// the DefiLlama price API, and tokens it cannot price are left out.
const BANKR_LAUNCHED_TOKEN = 'ba3$';

const CREATOR_FEES = "Creator Fees";
// dashboard figure, used before ONCHAIN_START
const BANKR_FEES = "Bankr Launch and Integration Fees";
const HOOK_FEES = "Launch Pool Hook Fees";
const LP_FEES = "Launch Pool LP Fees";
const CLANKER_FEES = "Clanker Pool LP Fees";
const INTEGRATION_FEES = "Integration Fees";
const STAKING_REWARDS = "BNKR Staking Rewards From Bankr Fees";
const STAKING_DONATIONS = "BNKR Staking Rewards From Others";
// protocol revenue line, negative: fee proceeds Bankr moved to stakers
const FEES_TO_STAKERS = "Bankr Fees Sent To BNKR Stakers";

const toBankr = (label: string) => `${label} To Bankr`;

// BnkrStakingV3, deployed 2026-09-26 (Base block 51806100). Notifiers fund the BNKR
// reward stream with notifyRewardAmount and anyone can add with donate(); both emit
// RewardNotified(from, amount). The two notifiers set at deploy are Bankr's fee Safes
// (NotifierSet in txs 0x3fb6546a… and 0x5fba854d…); the first funding came from the
// 1/3 Safe on 2026-09-29, tx 0xc4bb37ac3e1bb17907d4f1fc8734f7b1a9dd28c3ec5d94941220355e2775c167
const BNKR_STAKING = '0x88470240ff0663faefa68b1d7621b472ddd9584a';
const BNKR = '0x22af33fe49fd1fa80c7149773dde5890d3c76f3b';
const BNKR_STAKING_START = '2026-09-26';

const chainConfig: Record<string, { start: string; dashboardKey: keyof Omit<DailyByChain, "date">; feeSources: Record<string, string[]> }> = {
  [CHAIN.BASE]: {
    start: '2025-08-11',
    dashboardKey: 'base',
    feeSources: {
      [HOOK_FEES]: [
        // RehypeDopplerHookInitializer: swaps the hook fee into the numeraire and pays the fee
        // wallet on every swap, e.g. tx 0x9eb7814904de8a594779d1c57b836036941ed45ebf8e7be38fc23e0cd7ac6ed9
        '0xbf4195ab0b03e1eb3345dd1e83bed7650b1ed123',
        '0x6ab5ae3191c914de8437431091776fc90f314be4',
        // RehypeDopplerHookInitializer: accrues the hook fee for the two Safes, which claim it,
        // e.g. tx 0x5eb5b649d7df82e80ec87c6a89bef75ea6179acc36b370aaf3e852f7165fbf4d
        '0x9982538f41f2ae29ddb9d3d9307010052984fdbb',
      ],
      [LP_FEES]: [
        // DecayMulticurveInitializer and UniswapV4ScheduledMulticurveInitializer: the fee wallet's
        // LP-fee share, e.g. tx 0x89e8a8ed8de0b6773cff20d7c5bcb5fae9a7f7c7c51584d3b02b53cb51bf4346
        '0xd59ce43e53d69f190e15d9822fb4540dccc91178',
        '0xa36715da46ddf4a769f3290f49af58bf8132ed8e',
      ],
      [CLANKER_FEES]: [
        // ClankerFeeLocker (v4), shared by every Clanker deployer; only its payouts to Bankr's
        // fee wallet count, e.g. tx 0xa09bcde0b045367e3dfff9ac5d1bca0c1d153187d711a8b7ff6e62a39fe3c457
        '0xf3622742b1e446d92e45e22923ef11c2fcd55d68',
      ],
      [INTEGRATION_FEES]: [
        // BankrFeeRouterV2
        '0x8aee621035d93deb3c0c1177fac252dc2dd501a0',
      ],
    },
  },
  [CHAIN.ROBINHOOD]: {
    // first day the dashboard reports a non-zero Robinhood leg
    start: '2026-07-03',
    dashboardKey: 'robinhood',
    feeSources: {
      [HOOK_FEES]: [
        // RehypeDopplerHookInitializer, pays the fee wallet on every swap,
        // e.g. tx 0xb6a61ac4f9e5407b3d9ed7a0e94b9a3188f342c6c3633d2921407bcd4e98136f
        '0x6f02324d20cc679d0e585290caa6b16bacbc0f77',
        // same contract and mode as on Base, claimed by the two Safes,
        // e.g. tx 0xf99c984255bd1ffa6f38bac7ae362dbea9bb3755606b2a9026f25cac565a07c9
        '0x9982538f41f2ae29ddb9d3d9307010052984fdbb',
      ],
    },
  },
};

// API structure:
// dailyProtocolFees.bankrFees   -> protocol revenue, all chains combined
// dailyProtocolFees.creatorFees -> creator fees, all chains combined
// dailyFeesByChain              -> creator fees split per chain
// dailyVolumeByChain            -> trade volume split per chain
//
// Creator fees and volume still come from the dashboard: creators claim from shared
// contracts (the Clanker fee locker serves every Clanker deployer), so separating
// Bankr's creators on-chain would mean enumerating every Bankr launch. Bankr's own
// leg comes from the chain from ONCHAIN_START on.
const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const feesToHolders = options.createBalances();

  const dashboard: BankrDashboard = await fetchURL('https://api.bankr.bot/public/dashboard');

  const { dashboardKey, feeSources } = chainConfig[options.chain];
  const targetDate = options.dateString;

  // the volume series has no gaps anywhere in its history, so a missing row is a
  // broken response rather than a quiet day and must not publish as a zero.
  const volumeRow = dashboard.dailyVolumeByChain.find(d => d.date === targetDate);
  if (!volumeRow) throw new Error(`Bankr: no dailyVolumeByChain row for ${targetDate}`);
  dailyVolume.addUSDValue(volumeRow[dashboardKey] ?? 0, 'Trade Volume');

  // the fee series does have real gaps (2025-10-07 and 2025-12-06 among them), so
  // a missing row here keeps the existing behaviour of reporting nothing.
  const feesByChain = dashboard.dailyFeesByChain.find(d => d.date === targetDate);
  const creatorFees = feesByChain ? feesByChain[dashboardKey] ?? 0 : 0;

  dailyFees.addUSDValue(creatorFees, CREATOR_FEES);
  dailySupplySideRevenue.addUSDValue(creatorFees, CREATOR_FEES);

  if (targetDate < ONCHAIN_START) {
    // the dashboard reports bankrFees combined across chains with no split, so the
    // whole protocol leg is booked on Base. Adding it to both chains would double
    // count it, and splitting it pro rata would be a guess.
    if (options.chain === CHAIN.BASE) {
      const protocolData = dashboard.dailyProtocolFees.find(d => d.date === targetDate);
      if (protocolData) {
        dailyFees.addUSDValue(protocolData.bankrFees, BANKR_FEES);
        dailyRevenue.addUSDValue(protocolData.bankrFees, BANKR_FEES);
      }
    }
  } else {
    // only transfers sent by Bankr's fee contracts count, which leaves out transfers
    // between Bankr's own wallets, bridge refunds and the proceeds of their own swaps
    for (const [label, contracts] of Object.entries(feeSources)) {
      const received = await addTokensReceived({ options, targets: BANKR_FEE_RECIPIENTS, fromAdddesses: contracts });
      received.removeTokenBalance(BANKR_LAUNCHED_TOKEN);
      dailyFees.addBalances(received, label);
      dailyRevenue.addBalances(received.clone(), toBankr(label));
    }
  }

  if (options.chain === CHAIN.BASE && targetDate >= BNKR_STAKING_START) {
    const rewards = await options.getLogs({
      target: BNKR_STAKING,
      eventAbi: 'event RewardNotified(address indexed from, uint256 amount)',
    });
    rewards.forEach((log: any) => {
      // BNKR from Bankr's fee addresses was bought with fees already counted in dailyRevenue,
      // so it moves from protocol revenue to holders revenue. BNKR anyone else adds is value
      // to holders that never was Bankr's revenue.
      if (BANKR_FEE_RECIPIENTS_SET.has(log.from.toLowerCase())) {
        dailyHoldersRevenue.add(BNKR, log.amount, STAKING_REWARDS);
        feesToHolders.add(BNKR, log.amount, STAKING_REWARDS);
      } else {
        dailyHoldersRevenue.add(BNKR, log.amount, STAKING_DONATIONS);
      }
    });
  }

  const dailyProtocolRevenue = dailyRevenue.clone();
  dailyProtocolRevenue.subtract(feesToHolders, FEES_TO_STAKERS);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  // stays on version 1: creator fees and volume come from the dashboard's daily series
  version: 1,
  // Bankr funds the BNKR staking stream in lump sums out of fees it received earlier, and the
  // fee-funded part is subtracted from protocol revenue on the funding day. On those days Base
  // protocol revenue is negative (2026-09-29: about $4.1K of fees received, about $51.7K funded).
  allowNegativeValue: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    Volume: 'Trade volume routed through Bankr, taken per chain from the dashboard\'s dailyVolumeByChain series.',
    Fees: 'Creator fees plus Bankr\'s own fees from token launches and integrations. Bankr\'s fees are the tokens its fee contracts pay to Bankr\'s three fee addresses on each chain, priced with DefiLlama prices; fees paid in Bankr-launched tokens are left out. Creator fees come from Bankr\'s dashboard, per chain.',
    Revenue: 'Bankr\'s fees from token launches and integrations, read on-chain per chain since 2026-07-03. Before that, the dashboard\'s combined figure is reported on Base.',
    ProtocolRevenue: 'Bankr\'s fees from token launches and integrations, minus the BNKR Bankr sends from its fee addresses into the BNKR staking stream (negative on the days it funds the stream).',
    SupplySideRevenue: 'Fees paid out to token creators, split per chain, from Bankr\'s dashboard.',
    HoldersRevenue: 'BNKR paid into the BNKR staking reward stream (BnkrStakingV3) since 2026-09-26, on the day it is paid in: from Bankr\'s fee addresses (out of fees counted in Revenue) or from anyone else.',
  },
  breakdownMethodology: {
    Volume: {
      'Trade Volume': 'Buy and sell volume routed through Bankr on this chain',
    },
    Fees: {
      [CREATOR_FEES]: 'Fees paid out to token creators on this chain',
      [BANKR_FEES]: 'Bankr\'s own cut of token launches and integrations from the dashboard, reported combined across chains on Base (before 2026-07-03)',
      [HOOK_FEES]: 'Hook fee on swaps in tokens launched through Bankr\'s Doppler Rehype hooks, paid to Bankr per swap or claimed by Bankr\'s Safes',
      [LP_FEES]: 'Bankr\'s beneficiary share of LP fees in Doppler multicurve launch pools, claimed by Bankr\'s fee wallet',
      [CLANKER_FEES]: 'Bankr\'s share of LP fees on Clanker v4 tokens it deployed, claimed from the Clanker fee locker',
      [INTEGRATION_FEES]: 'Fees paid to Bankr through BankrFeeRouterV2 by integrations',
    },
    Revenue: {
      [BANKR_FEES]: 'Bankr\'s own cut of token launches and integrations from the dashboard, reported combined across chains on Base (before 2026-07-03)',
      [toBankr(HOOK_FEES)]: 'Hook fee on launched-token swaps received by Bankr',
      [toBankr(LP_FEES)]: 'Bankr\'s share of multicurve launch pool LP fees',
      [toBankr(CLANKER_FEES)]: 'Bankr\'s share of Clanker v4 LP fees',
      [toBankr(INTEGRATION_FEES)]: 'Integration fees received by Bankr',
    },
    ProtocolRevenue: {
      [BANKR_FEES]: 'Bankr\'s own cut of token launches and integrations from the dashboard, reported combined across chains on Base (before 2026-07-03)',
      [toBankr(HOOK_FEES)]: 'Hook fee on launched-token swaps received by Bankr',
      [toBankr(LP_FEES)]: 'Bankr\'s share of multicurve launch pool LP fees',
      [toBankr(CLANKER_FEES)]: 'Bankr\'s share of Clanker v4 LP fees',
      [toBankr(INTEGRATION_FEES)]: 'Integration fees received by Bankr',
      [FEES_TO_STAKERS]: 'BNKR Bankr sends from its fee addresses into the BNKR staking stream, subtracted here because it was bought with fees already counted above (negative on funding days)',
    },
    SupplySideRevenue: {
      [CREATOR_FEES]: 'Fees paid out to token creators on this chain',
    },
    HoldersRevenue: {
      [STAKING_REWARDS]: 'BNKR Bankr sends from its fee addresses into the BnkrStakingV3 reward stream, paid out to BNKR stakers over 7 days; bought with fees counted in Revenue',
      [STAKING_DONATIONS]: 'BNKR other addresses add to the BnkrStakingV3 reward stream (donate or notify); not Bankr revenue',
    },
  }
};

export default adapter;
