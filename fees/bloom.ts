import ADDRESSES from '../helpers/coreAssets.json'
// source: https://dune.com/queries/4966713/8220253

import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { duneBlockchain, queryDuneSql } from "../helpers/dune";
import { assertDuneSolanaIndexed } from "../helpers/duneSolanaDex";
import { METRIC } from '../helpers/metrics';
import { getTxReceiptsWithRetry } from '../helpers/getTxReceipts';

// Every Bloom EVM router emits this once per trade (topic0 0x2d720abb2e4bf42730e89955397ce0f5b08db0caff9be7e08ca184a8b1b2db2f).
// platformFeeTotal is the fee. It is in the native token or in an ERC-20, depending on which side of the trade the router
// took it from, and the event does not say which ERC-20 (`token` is the traded token, not the fee token).
const BLOOM_EVENT = 'event BloomEvent(uint256 amountIn, uint256 amountOut, uint256 platformFeeTotal, address token, uint256 bundleTip, uint8 dex, uint256 extra)';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// `dex` tells where the fee came from. On the current routers:
// - 5, 6 (ERC-20 in / out), 61 (HyperEVM alt.fun sell, USDC) and 71, 73, 81, 83 (split routes, ERC-20 in / out) take the
//   fee in an ERC-20.
// - 15 (four.meme), 30 (Flap), 38/39 (Arc), 40/41 (OpenFour), 50 (Likwid) and 60 (alt.fun) take it in whatever the trade
//   was funded with: an ERC-20, or the native token.
// - Every other code (1, 2, 10, 31, ...) takes it in the native token. The router keeps a native fee until Bloom withdraws
//   it (HyperEVM forwards it to the fee wallet at once), so there is no transfer to look for. Older routers also emit
//   0, 3, 4, 11 and 20-22, all native.
// An ERC-20 fee is paid in the swap itself: TransferHelper.safeTransfer(feeToken, FEE_RECIPIENT, fee). So when a log can
// carry one, the fee token is the ERC-20 that the router transferred out in the same transaction, for exactly the fee
// amount.
const ERC20_FEE_DEX = new Set([5, 6, 15, 30, 38, 39, 40, 41, 50, 60, 61, 71, 73, 81, 83]);
// Of those, the codes that never take a native fee. Without a matching transfer they are left out, so that an ERC-20
// amount is never read as native (on the oldest BSC router a 5 can be native).
const TOKEN_FEE_DEX = new Set([5, 6, 61, 71, 73, 81, 83]);

// Solana trades quoted in a stablecoin pay the fee in that stablecoin, to the fee wallet's token account.
const SOLANA_STABLE_FEE_MINTS = [
  ADDRESSES.solana.USDC,
  ADDRESSES.solana.USDT,
  'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB', // USD1
];

const BSC_ROUTER_2026_08 = '0x0b6df1888ed6aced6fc50ab39f354a7c8d08c9b1';

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
      '0xdd93c422bcc8b363e2510ef01030050d845b0fd5', // 2025-03-24
      '0x28356428e67263d231293a8326bf362d2e840936', // 2025-03-24
      '0xdb25696c6db64f1fda5d0528cd9e2ee7fbe2c466',
      '0xd177d843caf06197dd297e9324ae55a1a3b6ddb5', // 2025-03-29
      '0x2ecf3b74a917e51cb472988b8ad898620a6fbac9', // 2026-01-15
      '0xa696568862618e3a6f8b6f61c8d4afccf3226c3d', // 2026-06-10
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
      '0x036cc50367c3ee5f1749e2f5bb7f47e7add25e63', // 2025-07-29
      '0xfbeb201ae6d1333bdca51d98a7444fb696269fdd', // 2025-07-29
      '0x54e31cfae4125615e6c9ada607108e7e61da2020', // 2025-07-29
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
      '0x8f2d511be49919722358d3217a0775e54b1368fb', // 2025-04-05
      '0xca1258573252a36d57faebd269f3bc825df22241', // 2025-04-07
      '0x554d8519e93474955e69d467dbac50f2fed186c4', // 2025-04-07
      '0xd4f1afd0331255e848c119ca39143d41144f7cb3', // 2025-04-07
      '0x8cf725451b4399954b64c00e9eb18218606b9e65', // 2025-06-08
      '0x3215afde444e6411bb4fdae93fe1d7a6509a66e7', // 2025-06-09
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
  [CHAIN.MONAD]: {
    start: '2025-11-23',
    contracts: [
      '0x3daa9624e217c854ba10905d639e4d0c5958f4bd', // 2025-11-23
      '0x6b3e4cb25a81050f35ff94a7048f2960cce0ac3d', // 2025-11-24
      '0x20de462708a2f53ed0ca7d3718d4278c38752e12', // 2025-11-24
      '0x7d1e3d2858829fd28bd1f6ebc6f2b0945390c12b', // 2025-11-24
      '0x525b09829f8039b33db3dd5784849a47400ed698', // 2025-12-01
      '0xf81ac24ee37637a2e0ee41c4166042a3810b0ce8', // 2025-12-02
    ],
  },
  [CHAIN.HYPERLIQUID]: {
    start: '2025-05-27',
    contracts: [
      '0xaf1ab69d1675db5aeba18000590fd64858f37fb4', // 2025-05-27
      '0xca1258573252a36d57faebd269f3bc825df22241', // 2025-05-31
      '0xb5f1f0413d9965c484cf7d2df2a329798dc34616', // 2025-06-09
      ROUTER_2026_09,                               // 2026-08-25
    ],
  },
  [CHAIN.INK]: {
    start: '2026-09-18',
    contracts: [
      ROUTER_2026_09,                               // 2026-09-18
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
  // native SOL transfers carry the ...111 mint in tokens_solana.transfers, wSOL ones the ...112 mint
  const solMints = ['So11111111111111111111111111111111111111111', ADDRESSES.solana.SOL];
  const solMintsSql = solMints.map((mint) => `'${mint}'`).join(', ');
  const stableMintsSql = SOLANA_STABLE_FEE_MINTS.map((mint) => `'${mint}'`).join(', ');

  // Stablecoin fees are counted like SOL fees, per mint. Payouts are SOL only: the fee wallet moves its stablecoins to
  // the internal sweep wallet 3YtdHj6f.., not to traders.
  const query = `
    WITH transfers AS (
      SELECT
        block_time,
        from_owner,
        to_owner,
        token_mint_address,
        amount
      FROM
        tokens_solana.transfers
      WHERE
        TIME_RANGE
        AND action = 'transfer'
        AND token_mint_address IN (${solMintsSql}, ${stableMintsSql})
        AND (
          to_owner = '${feesWallet}'
          OR from_owner = '${feesWallet}'
          OR from_owner IN (${rewardRelayersSql})
        )
    )
    SELECT
      token_mint_address,
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
        WHEN token_mint_address NOT IN (${solMintsSql}) THEN uint256 '0'
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
    GROUP BY token_mint_address
  `;

  const rows = await queryDuneSql(options, query);
  let totalFees = 0;
  let referralCashbackRewards = 0;
  rows.forEach((row: any) => {
    const fees = Number(row.fees ?? 0);
    if (solMints.includes(row.token_mint_address)) {
      totalFees += fees;
      referralCashbackRewards += Number(row.referral_cashback_rewards ?? 0);
      return;
    }
    dailyFees.add(row.token_mint_address, fees, METRIC.TRADING_FEES);
    dailyRevenue.add(row.token_mint_address, fees, LABELS.TRADING_FEES_TO_PROTOCOL);
  });
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
    targets: contracts,
    eventAbi: BLOOM_EVENT,
    entireLog: true,
    flatten: true,
  })
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const trades = logs
    .map((log: any) => ({
      router: log.address.toLowerCase(),
      txHash: log.transactionHash.toLowerCase(),
      fee: BigInt(log.args.platformFeeTotal),
      dex: Number(log.args.dex),
    }))
    .filter((trade: any) => trade.fee > 0n);

  const lookupHashes = [...new Set<string>(trades.filter((trade: any) => ERC20_FEE_DEX.has(trade.dex)).map((trade: any) => trade.txHash))];
  const receipts = await getTxReceiptsWithRetry(options.chain, lookupHashes);
  const receiptByHash: Record<string, any> = {};
  receipts.forEach((receipt: any, i: number) => { if (receipt) receiptByHash[lookupHashes[i]] = receipt; });

  let unresolved = 0;
  trades.forEach((trade: any) => {
    if (!ERC20_FEE_DEX.has(trade.dex)) {
      dailyFees.addGasToken(trade.fee, METRIC.TRADING_FEES);
      dailyRevenue.addGasToken(trade.fee, LABELS.TRADING_FEES_TO_PROTOCOL);
      return;
    }
    const receipt = receiptByHash[trade.txHash];
    // Without the receipt the fee could be a stablecoin with 18 decimals (BSC) read as native, so it is left out.
    if (!receipt) { unresolved++; return; }
    const routerTopic = '0x' + trade.router.slice(2).padStart(64, '0');
    const feeTransfer = receipt.logs.find((log: any) =>
      log.topics.length === 3
      && log.topics[0].toLowerCase() === TRANSFER_TOPIC
      && log.topics[1].toLowerCase() === routerTopic
      && BigInt(log.data) === trade.fee
    );
    if (feeTransfer) {
      dailyFees.add(feeTransfer.address.toLowerCase(), trade.fee, METRIC.TRADING_FEES);
      dailyRevenue.add(feeTransfer.address.toLowerCase(), trade.fee, LABELS.TRADING_FEES_TO_PROTOCOL);
    } else if (TOKEN_FEE_DEX.has(trade.dex)) {
      unresolved++;
    } else {
      // funded with the native token, so the router kept a native fee
      dailyFees.addGasToken(trade.fee, METRIC.TRADING_FEES);
      dailyRevenue.addGasToken(trade.fee, LABELS.TRADING_FEES_TO_PROTOCOL);
    }
  });
  if (unresolved) console.log(`bloom ${options.chain}: ${unresolved} of ${trades.length} fees left out, fee token not found`);

  // Payouts lag the fees that fund them, so a day's revenue can be negative, as on Solana (allowNegativeValue below).
  // A chain where the relayer sent nothing in the window has no row in the prefetch.
  const payoutRow = options.preFetchedResults.find((row: any) => row.blockchain === duneBlockchain(options.chain));
  const referralCashbackRewards = Number(payoutRow?.payouts ?? 0);
  dailySupplySideRevenue.addGasToken(referralCashbackRewards, LABELS.REFERRAL_CASHBACK_PAYOUT);
  dailyRevenue.addGasToken(-referralCashbackRewards, LABELS.TRADING_FEES_TO_PROTOCOL);

  return { dailyFees, dailyRevenue, dailySupplySideRevenue }
}


const EVM_CHAINS = Object.keys(chainConfig).filter((chain) => chain !== CHAIN.SOLANA);

async function prefetch(options: FetchOptions) {
  return queryDuneSql(options, `
    SELECT blockchain, SUM(value) AS payouts
    FROM evms.transactions
    WHERE blockchain IN (${EVM_CHAINS.map((chain) => `'${duneBlockchain(chain)}'`).join(', ')})
      AND "from" = ${EVM_REWARD_RELAYER}
      AND success
      AND value > uint256 '0'
      AND TIME_RANGE
    GROUP BY blockchain
  `);
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
  prefetch,
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
