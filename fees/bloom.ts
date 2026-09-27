import ADDRESSES from '../helpers/coreAssets.json'
// source: https://dune.com/queries/4966713/8220253

import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { METRIC } from '../helpers/metrics';

const topic: string = '0x2d720abb2e4bf42730e89955397ce0f5b08db0caff9be7e08ca184a8b1b2db2f';

const LABELS = {
  TRADING_FEES_TO_PROTOCOL: 'Trading Fees To Protocol',
  REFERRAL_CASHBACK_PAYOUT: 'Referral/Cashback Payout',
}

const chainConfig: any = {
  [CHAIN.SOLANA]: {
    start: '2024-10-01',
    // Solana wallets below are our own on-chain research, not protocol/team-provided.
    // Found by tracing SOL/wSOL flows from the fee wallet on Dune/Helius: 77k/6yj are reward relayers,
    // while the internal wallets receive operational/team transfers and are excluded from reward payouts.
    feesWallet: '7HeD6sLLqAnKVRuSfc1Ko3BSPMNKWgGTiWLKXJF31vKM',
    rewardRelayers: [
      '77k7gzmr7UAtGUrWeL3oA5ZHvmufavZWFzCkQstb3w1c',
      '6yjgxVSev9QRe7CB3H3xziWysgtCa3qEuwnUWQQuQfAi',
    ],
    internalWallets: [
      '9PbhcxBs4u6v6a21seg1SGCNxhqSVb2rChDHgSBZhjm8',
      '8LMsKein81fYRsoyvMjNhNrTiZu5WsS1uqM9itSJZY8N',
      '5iJius1vmqAAUYYYU8fHLAJR9Mf2F8tYAZLfrG7VCYu4',
      'FBaFVAhRztehfyY1eGufZZib7XpvZZG53HkM6nGzaoG',
      '9JcLbWSVjBMujSfqxUBeZgFwgTu9VJZVfXoYzeu5WQxB',
      'CTyFguG69kwYrzk24P3UuBvY1rR5atu9kf2S6XEwAU8X',
      '2PjC7fw76prHWxP4sKRnvjUdXT5QX4AKeKSXMeJsigfb',
      '7P7sHjhTeSCdeR6zD8MmLA3yvE8gUvHXztHhgpSQ6S72',
      'Bu1WfCjd8xF3VhArDWf1CgiDu6r3dbmu5hVrWo8QrZKy',
      '7uobGeZaqfMELPLPTPkk14eijBFCiWmVdXjzrpQTKciZ',
      'BdiaKYXV69zuu2iJmPapxvoRS3Y1xuK875V4zDLoQs5f',
      'C9zDTyy9GeuoZNoTuJ5fXcx8KH6KWzecyU5Pie1tuUAe',
      'sBWcWyiG51qdad9f7xkJPe4vjkQyNBw1TZF3wG5p3NN',
      '3SSV7AbKcjgtUrTQXM8QuJroLBbSnmEAQerYHGHT6yiV',
      'EgMp6MRqnJ7RNiJAMymXA518bma8pfsuqCp6RdcJpx5e',
      '5sUSHnxvcKzDkkj9xQuxj5rzqj1bkvnwMUVQbfRMtJpY',
      'toAPhdPcxDZsm2ziAgKcLLb5FMvhsUxqWpRvxTnYfnP',
    ],
    // Before this date, referral/cashback rewards were only paid out via the reward relayers above.
    // From this date on, some payouts also go directly from the fees wallet to recipients, so we start
    // counting direct fees-wallet outflows (to non-internal, non-relayer wallets) as rewards too.
    // This is a manual cutoff from on-chain tracing (Dune/Helius), not a protocol-provided value -
    // revisit if the payout mechanism changes again.
    directRewardRelayerStart: '2026-01-20 00:00:00',
  },
  [CHAIN.BSC]: {
    start: '2024-12-12',
    contracts: [
      '0xb1000058c87d843fc0154591ff9d72af5e7213d5',
      '0x8f2d511be49919722358d3217a0775e54b1368fb',
      '0x3b95a6b1f890ae2f6862ac5be37f27c3b542112b',
      '0x8f73798b3ee029dfbafca96d015fbf6bfe8d1fc7',
      '0xaf1ab69d1675db5aeba18000590fd64858f37fb4',
      '0x554d8519e93474955e69d467dbac50f2fed186c4',
      '0xb0b2fb0e2852ec94d8bee3b2a42e02b16ddd5b62',
      '0xb5f1f0413d9965c484cf7d2df2a329798dc34616',
      '0x0ba81c91fe41301b760b44285cc2fd034619015a',
      // '0x93013eef273a46dc8d573fc3b15f937e9cb347e8',
      '0xd4f1afd0331255e848c119ca39143d41144f7cb3',
      // '0xc9127ea24c7ce7edb98b1f8c4c36c5a6531432f3',
      // '0x9de32f7fedc27afd3b743bb62b0b617449abe92e',
      // '0x2e6a71eabb0c5258ea32af54c8777ad76805b729',
      // '0x8cf725451b4399954b64c00e9eb18218606b9e65',
      // '0xa9a05f046163224e81770c7d29fc98392064eb96',
      // '0x202d2f43e3dcf88dbe80974a8c5b856719fc3e56',
      '0x015ae929e9a74fb739267553b6fd7ea9d2a318af',
      // '0x6a70a077396799cfcef957eb6a19297beaa18da4',
      // '0x70e6950543db45784ed7820143bdd103bac58f3d',
      // '0x2621f7ce52aaee20eeaf8a00c7650b014e3e83f1',
    ],
  },
  [CHAIN.BASE]: {
    start: '2024-12-12',
    contracts: [
      '0xb1000058c87d843fc0154591ff9d72af5e7213d5',
      '0xaa82714222d11919b0fb07b9cf938f3080748b0a',
      '0xc6ad39388bad9f197ad2842e6cdbc4bf7f3d5cc4',
      '0x284808b823e61a399fec52e1ba71d9afb1905150',
      '0x2e8759e33116b0f101390ddd3d8ce9f6b0817db2',
      '0x5ee5635f02a43f21085f69fa68c1325393a6d7fb',
      '0xa9a05f046163224e81770c7d29fc98392064eb96',
      '0x3daa9624e217c854ba10905d639e4d0c5958f4bd',
      '0x3964dfb31fc89e2616f7553ae02649c4058350eb',
      '0x6e0ee964f2afe05eeb72512f06ffb741ce7ebd86',
      '0x95b14c6015084c766b2daa2ba3ead4c528781d29',
      '0x28356428e67263d231293a8326bf362d2e840936',
      '0xdb25696c6db64f1fda5d0528cd9e2ee7fbe2c466',
      '0xdd93c422bcc8b363e2510ef01030050d845b0fd5',
      '0x5e504b55646d9c103bbccc5831230cfbfa6314f4',
      '0x3156cc687073313a7a021fefc90fdb63e3ec1e27',
      '0x20de462708a2f53ed0ca7d3718d4278c38752e12',
      '0x2ae980b825acdbc2faf7b594f8a59a83750e3531',
      '0x1413e2f212eb6cf072dcd71cb7a26b2a63819c53',
      '0x4061a31d8c03a12598127966e301bae3bdccff40',
      // '0x6b3e4cb25a81050f35ff94a7048f2960cce0ac3d',
      // '0x70c956575b722ecdc1b26ede30f958efb9634bbc',
      // '0x4198fdc83f4c47b79d5ce84927a758bc85b9b3ec',
    ],
  },
}


async function fetchSolana(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const { feesWallet, rewardRelayers, internalWallets, directRewardRelayerStart } = chainConfig[CHAIN.SOLANA];
  const rewardRelayersSql = rewardRelayers.map((wallet: string) => `'${wallet}'`).join(', ');
  const internalWalletsSql = internalWallets.map((wallet: string) => `'${wallet}'`).join(', ');

  const query = `
    WITH transfers AS (
      SELECT
        block_time,
        from_owner,
        to_owner,
        amount
      FROM
        tokens_solana.transfers
      WHERE
        TIME_RANGE
        AND action = 'transfer'
        AND token_mint_address IN (
          'So11111111111111111111111111111111111111111',
          'So11111111111111111111111111111111111111112'
        )
        AND (
          to_owner = '${feesWallet}'
          OR from_owner = '${feesWallet}'
          OR from_owner IN (${rewardRelayersSql})
        )
    )
    SELECT
      SUM(CASE
        WHEN
          to_owner = '${feesWallet}'
          AND (
            from_owner IS NULL
            OR (
              from_owner <> '${feesWallet}'
              AND from_owner NOT IN (${rewardRelayersSql})
              AND from_owner NOT IN (${internalWalletsSql})
            )
          )
        THEN amount
        ELSE uint256 '0'
      END) AS fees,
      SUM(CASE
        WHEN
          from_owner IN (${rewardRelayersSql})
          AND to_owner <> '${feesWallet}'
          AND to_owner NOT IN (${rewardRelayersSql})
          AND to_owner NOT IN (${internalWalletsSql})
        THEN amount
        WHEN
          from_owner = '${feesWallet}'
          AND block_time >= TIMESTAMP '${directRewardRelayerStart}'
          AND to_owner <> '${feesWallet}'
          AND to_owner NOT IN (${rewardRelayersSql})
          AND to_owner NOT IN (${internalWalletsSql})
        THEN amount
        ELSE uint256 '0'
      END) AS referral_cashback_rewards
    FROM transfers
  `;

  const fees = await queryDuneSql(options, query);
  const totalFees = Number(fees[0].fees ?? 0);
  const referralCashbackRewards = Number(fees[0].referral_cashback_rewards ?? 0);
  dailyFees.add(ADDRESSES.solana.SOL, totalFees, METRIC.TRADING_FEES);

  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.add(ADDRESSES.solana.SOL, referralCashbackRewards, LABELS.REFERRAL_CASHBACK_PAYOUT);

  // Fees and reward payouts are two independent transfer flows. Payouts lag the fees that fund them
  // (the fee wallet funds relayers, which disburse rewards later, often in batches), so on a given day
  // referralCashbackRewards can exceed totalFees and make daily revenue negative. This is expected
  // timing noise and nets out over time - the adapter sets allowNegativeValue so these days are kept
  // rather than throwing. See adapter `allowNegativeValue: true` below.
  dailyRevenue.add(ADDRESSES.solana.SOL, totalFees - referralCashbackRewards, LABELS.TRADING_FEES_TO_PROTOCOL);

  return { dailyFees, dailyRevenue, dailySupplySideRevenue }
}

// Note: on EVM (BSC/Base) we don't yet track referral/cashback payouts, so all fees are counted as
// protocol revenue here. If/when EVM referral tracking is added, deduct it like fetchSolana does.
async function fetchEVM(options: FetchOptions) {
  const { contracts } = chainConfig[options.chain];
  const logs = await options.getLogs({
    topics: [topic],
    targets: contracts,
    flatten: true
  })
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  logs.forEach((log: any) => {
    const data = log.data.replace('0x', '');
    const fees_amount = Number('0x' + data.slice((2 * 64), (2 * 64) + 64));
    dailyFees.addGasToken(fees_amount, METRIC.TRADING_FEES);
    dailyRevenue.addGasToken(fees_amount, LABELS.TRADING_FEES_TO_PROTOCOL);
  })
  return { dailyFees, dailyRevenue }
}


async function fetch(options: FetchOptions) {
  return options.chain === CHAIN.SOLANA ? fetchSolana(options) : fetchEVM(options);
}

const methodology = {
    Fees: "All trading fees paid by users while using Bloom Trading bot.",
    Revenue: "Trading fees kept by Bloom protocol after referral and cashback rewards.",
    SupplySideRevenue: "Referral and cashback rewards paid to referrers and users.",
}

const breakdownMethodology = {
    Fees: {
        [METRIC.TRADING_FEES]: "Trading fees paid by users while using Bloom Trading bot.",
    },
    Revenue: {
        [LABELS.TRADING_FEES_TO_PROTOCOL]: "Trading fees kept by Bloom protocol after referral and cashback rewards.",
    },
    SupplySideRevenue: {
        [LABELS.REFERRAL_CASHBACK_PAYOUT]: "Trading fees paid out to referrers and users as cashback rewards.",
    },
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  isExpensiveAdapter: true,
  // Solana daily revenue (fees - referral/cashback payouts) can be negative on days where payouts
  // outpace same-day fees due to batching/lag. Allow it so those days are recorded instead of throwing;
  // the values net out correctly over time. See fetchSolana for details.
  allowNegativeValue: true,
  dependencies: [Dependencies.DUNE],
  methodology,
  breakdownMethodology,
}

export default adapter;
