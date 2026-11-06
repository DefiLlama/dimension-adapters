import ADDRESSES from '../helpers/coreAssets.json'
// source: https://dune.com/queries/4966713/8220253

import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { assertDuneSolanaIndexed } from "../helpers/duneSolanaDex";
import { METRIC } from '../helpers/metrics';

const topic: string = '0x2d720abb2e4bf42730e89955397ce0f5b08db0caff9be7e08ca184a8b1b2db2f';

// The fee (word 3 of the event) can be in a stablecoin, and on BSC, where stablecoins have 18 decimals, it would read as BNB.
// Word 6 is the trade type: 5 and 6 are always stablecoin-quoted. 15 is on older routers (1.67 USDC:
// 0xfda5649d62d418bc758654716b11c21c247f68a04fc614508aa514db828020b9) and native on the current one, where it is 0.015 BNB
// in seven weeks, so it is skipped as well.
const STABLE_QUOTED_TYPES = [5, 6, 15];
// This BSC router also has 13 stablecoin-quoted logs of types 30 and 40 (2.8625 USDC:
// 0x07f92f1f8c28daef1ca23986c9ffcb6adc59c6d6d5638eef16aa85f6ef780bff). All have a fee word above 0.5; its largest native
// fee is 0.36. It stopped emitting on 2026-09-15.
const BSC_ROUTER_2026_08 = '0x0b6df1888ed6aced6fc50ab39f354a7c8d08c9b1';
const BSC_ROUTER_2026_08_MAX_NATIVE_FEE = 0.5e18;

// Bloom rotates EVM routers every few weeks (see dexs/bloom.ts, #9101). Every router added below emits the fee event above
// and was deployed by Bloom's deployers 0x224bede13247a4dc56f834c3040a9510fe9fb140 or 0x51fd71313b273fe24be8a83b054367c2ee53fc20
// (#9101), or by 0x2083491e54e243930fa6715751342551097d1d07, which 0x51fd7131 funded seconds before each deploy.
// 0xb1000000096b.. is the same address on every chain.
const ROUTER_2026_09 = '0xb1000000096bd2f8ca9b6883182eccaf31e7c3fd';

// 0x51fd7131, which takes the EVM fees, sends part of them to this wallet, which pays dozens of other wallets, traders
// among them. That fits referral or cashback rewards. It is inferred from flows, like the Solana reward relayers below;
// Bloom has not confirmed it.
const EVM_REWARD_RELAYER = '0xb5e7cfd3c8fc55c126030e633b0f2520e1c3ebf6';

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
      '3YtdHj6fyWtxax9mEcyXsah5Gff2E8C9cBPLa6DSDLcy', // took over the two-hourly sweep from 9Pbhcx above on 2026-10-02
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
      BSC_ROUTER_2026_08,                           // deployer 0x51fd7131, 2026-08-03 (#9101)
      ROUTER_2026_09,                               // 2026-09-08
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
      '0xe25e101544644aa57fe9fc99c5849172d4ff0d06', // deployer 0x224bede1, 2025-03-16
      '0x07438f04d1045a2a11f5fce0f7f134caff5cf7c5', // deployer 0x224bede1, 2025-08-01
      '0xa845de997649c047586300f906bcf01793836ef6', // deployer 0x224bede1, 2026-02-20
      '0x1ce3712395ee4798ac9548b3e0220ea6a2b61e79', // deployer 0x224bede1, 2026-02-25 (#9101)
      '0xa538ad204049850fd4ba8f5b33479c7e7defd00b', // deployer 0x51fd7131, 2026-08-14 (#9101)
      '0x2bcd342b43fa9610b537c0c52a4793fd5bd290af', // deployer 0x51fd7131, 2026-08-14 (#9101)
      '0x7aef6bb1604c8bad36f663979a78430298e2581e', // deployer 0x51fd7131, 2026-08-18 (#9101)
      ROUTER_2026_09,                               // 2026-09-08
    ],
  },
  [CHAIN.ETHEREUM]: {
    start: '2025-04-05',
    contracts: [
      '0xb1000058c87d843fc0154591ff9d72af5e7213d5', // deployer 0x224bede1, 2025-04-05
      '0xf3314c1c9328010aad2215602c5d92b97ffafc27', // deployer 0x224bede1, 2026-04-20
      '0xe1fcfbca7544c19e8252f74c357f951561988149', // deployer 0x224bede1, 2026-04-22
      '0xc6eca4badd69d11b66e2a07fce558def61ac09a0', // deployer 0x224bede1, 2026-04-23
      '0xcece550b4db17dffad10036a75c479a2a77ff539', // deployer 0x224bede1, 2026-04-26
      '0xb2634d96381b65afbbfc2973fa088c40c894fffb', // deployer 0x224bede1, 2026-04-30
      ROUTER_2026_09,                               // 2026-09-25
    ],
  },
  [CHAIN.ROBINHOOD]: {
    start: '2026-07-04',
    // all deployed by 0x51fd7131 between 2026-07-04 and 2026-08-11, then ROUTER_2026_09 from 2026-08-26
    contracts: [
      '0x4fe3d3b9553af616514bc78fc34602ffe532eaa2',
      '0x23d3232938c716f8cac8b7735a42f3477609a68a',
      '0xc3b66d2c097db6b55612f4e905b63d93cd4fd3ab',
      '0x4e5ffb3bd801d9db9a98daee7d4293afd46da677',
      '0x4e69084f83a635d6270e8f959864f94207031889',
      '0x685ff26adeda953ca7dbaa1aeb3041c639ffa309',
      '0x2d6d62baa589991334d68246afdb19adc0fb3526',
      '0xc86ab5dcfb71544cfacbb7ccd53d2926bc152535',
      '0x9f0be81f2d46e685177f17d4f7583e04ab492b04',
      '0x3a445a2ecc4e3ce6486f4f94402f9363394b1724',
      '0x49eada45eeca00f5bad7a854899197614e7cab6e',
      '0xcaf8ac91e884027b47083ac7af6471129b6830e8',
      ROUTER_2026_09,
    ],
  },
  [CHAIN.ARC]: {
    start: '2026-07-29',
    contracts: [
      '0x86732f0b5a88eba3633c03ab90bdf6a0f3408632', // deployer 0x51fd7131, 2026-07-29
      ROUTER_2026_09,                               // 2026-09-12
    ],
  },
}


async function fetchSolana(options: FetchOptions) {
  // tokens_solana.transfers finishes a day hours late, and a run before that stores part of the day: 14 of the 30 days in
  // 2026-10-03..11-01, read through about 18:00 UTC.
  assertDuneSolanaIndexed(options);

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
          '${ADDRESSES.solana.SOL}'
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

async function fetchEVM(options: FetchOptions) {
  const { contracts } = chainConfig[options.chain];
  const logs = await options.getLogs({
    topics: [topic],
    targets: contracts,
    flatten: true
  })
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  logs.forEach((log: any) => {
    const data = log.data.replace('0x', '');
    const tradeType = data.length >= 6 * 64 ? Number('0x' + data.slice(5 * 64, 6 * 64)) : 0;
    if (STABLE_QUOTED_TYPES.includes(tradeType)) return;
    const fees_amount = Number('0x' + data.slice((2 * 64), (2 * 64) + 64));
    if (log.address.toLowerCase() === BSC_ROUTER_2026_08 && fees_amount > BSC_ROUTER_2026_08_MAX_NATIVE_FEE) return;
    dailyFees.addGasToken(fees_amount, METRIC.TRADING_FEES);
    dailyRevenue.addGasToken(fees_amount, LABELS.TRADING_FEES_TO_PROTOCOL);
  })

  const [{ payouts }] = await queryDuneSql(options, `
    SELECT SUM(value) AS payouts
    FROM CHAIN.transactions
    WHERE "from" = ${EVM_REWARD_RELAYER}
      AND success
      AND value > uint256 '0'
      AND TIME_RANGE
  `);
  // Payouts lag the fees that fund them, so a day's revenue can be negative, as on Solana (allowNegativeValue below).
  const referralCashbackRewards = Number(payouts ?? 0);
  dailySupplySideRevenue.addGasToken(referralCashbackRewards, LABELS.REFERRAL_CASHBACK_PAYOUT);
  dailyRevenue.addGasToken(-referralCashbackRewards, LABELS.TRADING_FEES_TO_PROTOCOL);

  return { dailyFees, dailyRevenue, dailySupplySideRevenue }
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
