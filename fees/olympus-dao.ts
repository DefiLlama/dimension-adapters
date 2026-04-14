/*
Olympus DAO Comprehensive Fees Adapter

Revenue Sources (Additive Approach):

ETHEREUM:
1. sUSDS Yield - Treasury holdings in Sky's savings USDS
2. sUSDe Yield - Treasury holdings in Ethena's staked USDe
3. CD (Clearinghouse Deposit) Facility - Yield from CD positions
4. CD Lending Interest - Interest from loans against pending redemptions
5. POL Fees (OHM/wETH, OHM/sUSDS) - Uniswap V3 LP fees

BASE:
1. POL Fees (OHM/USDC) - Uniswap V3 LP fees

ARBITRUM:
1. POL Fees (WETH/OHM) - Camelot V2 LP fees

BERACHAIN:
1. iBGT DEX Sales - Proceeds from selling iBGT (Infrared BGT) earned via POL emissions
2. iBERA Vesting Yield - Yield earned on iBERA staking (via Infrared Finance exchange rate appreciation)
3. oBERO Exercise Revenue - Revenue from exercising oBERO options (net of exercise cost, tracked as oBERO burns)
4. BERA/iBERA Sales - Realized proceeds from selling BERA/iBERA from treasury holdings

Key Contracts & Addresses documented in CHAIN_CONFIG below.

---
NOTE ON CD FACILITY / sUSDS YIELD OVERLAP (Ethereum):
The CD Facility holds sUSDS internally and earns yield. When yield is claimed via
ClaimedYield events, it's transferred to treasury as USDS. To avoid double counting
(once via exchange rate method, once via ClaimedYield), we subtract CD-claimed USDS
from the sUSDS yield calculation before summing revenue sources.
---

---
NOTE ON PENDING REVENUE (as of Jan 2026):
CD Lending has ~$437k in outstanding principal with ~$6k in fixed interest.
Interest is calculated upfront at loan creation. This interest will be
realized when loans are repaid (due dates: April-May 2026). The adapter
will automatically capture this revenue via LoanRepaid events when it occurs.
---

---
NOTE ON BERACHAIN REVENUE METHODOLOGY:
Berachain revenue is tracked event-based (realized cash flows), not accrual:

1. iBGT DEX Sales: Transfer events of iBGT outgoing from the Berachain Ops wallet
   to non-treasury addresses (excludes iBGT bribed to OHM-HONEY RewardVault, which
   are an operating cost). Revenue = iBGT token amount (priced at query time).

2. iBERA Vesting Yield: Infrared Finance iBERA is an ERC-4626-like LST. Yield is
   captured via the exchange rate delta (convertToAssets) × treasury iBERA balance.
   Wallets tracked: BitGo Custody 1, BitGo Custody 2, Berachain Ops.

3. oBERO Exercise Revenue: oBERO options are exercised by burning oBERO and paying
   HONEY to receive BERO tokens. Revenue is tracked via oBERO Transfer to zero address
   (burns) from treasury wallets, and recorded in BERO (the underlying token received
   on exercise, 1:1 with oBERO burned). DefiLlama prices BERO at query time.

4. BERA/iBERA Sales: Outgoing WBERA/iBERA Transfer events from treasury wallets to
   non-treasury addresses. Revenue = WBERA/iBERA token amounts (priced at query time).

IR Airdrop (EXCLUDED): Per DefiLlama convention, airdrops are asset receipts, not
earned revenue. IR tokens received from Infrared Finance airdrop are excluded until sold.

oBERO Unclaimed (EXCLUDED): Unexercised oBERO with sub-economic margin is excluded
until exercised/sold.
---
*/

import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

const CHAIN_CONFIG = {
  [CHAIN.ETHEREUM]: {
    treasuryV1: "0xa8687A15D4BE32CC8F0a8a7B9704a4C3993D9613",
    treasuryV2: "0x9A315BdF513367C0377FB36545857d12e85813Ef",
    treasuryMultisig: "0x245cc372C84B3645Bf0Ffe6538620B04a217988B",
    monoCooler: "0xdb591Ea2e5Db886dA872654D58f6cc584b68e7cC",
    sUSDS: "0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD",
    sUSDe: "0x9D39A5DE30e57443BfF2A8307A4256c8797A3497",
    cdFacility: "0xEBDe552D851DD6Dfd3D360C596D3F4aF6e5F9678",
    cdLending: "0x20a3d8510f2e1176e8db4cea9883a8287a9029db", // DepositRedemptionVault
    uniV3PositionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
    positionIds: [562564, 954195], // OHM/WETH, OHM/sUSDS
    ohm: "0x64aa3364F17a4D01c6f1751Fd97C2BD3D7e7f1D5",
    usds: "0xdC035D45d973E3EC169d2276DDab16f1e407384F",
    usde: ADDRESSES.ethereum.USDe,
    dai: ADDRESSES.ethereum.DAI,
  },
  [CHAIN.BASE]: {
    treasury: "0x18a390bd45bcc92652b9a91ad51aed7f1c1358f5",
    uniV3PositionManager: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
    positionIds: [1872809],
  },
  [CHAIN.ARBITRUM]: {
    treasury: "0x012bbf0481b97170577745d2167ee14f63e2ad4c",
    camelotV2Pool: "0x8acd42e4b5a5750b44a28c5fb50906ebff145359", // V2 LP WETH/OHM
    weth: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    ohm: "0xf0cb2dc0db5e6c66B9a70Ac27B06b878da017028",
  },
  [CHAIN.BERACHAIN]: {
    // Treasury wallets (on-chain verified via Berascan Feb 2026)
    custody1: "0x082689241b09c600b3eaf3812b1d09791e7ded5a",  // BitGo Custody 1
    custody2: "0xb65e74f6b2c0633e30ba1be75db818bb9522a81a",  // BitGo Custody 2
    opsWallet: "0xe22b2d431838528bcad52d11c4744efcdc907a1c", // Berachain Ops Wallet
    treasury:  "0x91494d1bc2286343d51c55e46ae80c9356d099b5", // Berachain Treasury

    // Token contracts (all verified on Berascan)
    // iBGT: InfraredBGT (Infrared Finance wrapped BGT emissions)
    iBGT: "0xac03caba51e17c86c921e1f6cbfbdc91f8bb2e6b",
    // iBERA: ERC1967Proxy → impl 0xc0654903c7d76f7fe63f9ad2f01618c3b55d9dcf (ERC-4626-like LST)
    iBERA: "0x9b6761bf2397bb5a6624a856cc84a3a14dcd3fe5",
    // oBERO: OTOKEN (options token, burned when exercised)
    oBERO: "0x40a8d9efe6a2c6c9d193cc0a4476767748e68133",
    // BERO: TOKEN (underlying for oBERO, received on exercise)
    BERO: "0x7838cec5b11298ff6a9513fa385621b765c74174",
    // WBERA: canonical wrapped BERA
    WBERA: ADDRESSES.berachain.WBERA,
    // HONEY: Berachain native stablecoin
    HONEY: ADDRESSES.berachain.HONEY,

    // OHM-HONEY BGT Reward Vault (bribe destination — NOT revenue)
    rewardVault: "0x815596fa7c4d983d1ca5304e5b48978424c1b448",
    // oriBGT vault manager (Origami Finance) — iBGT deposited here is parked/autocompounding,
    // not a realized sale. Exclude to avoid false positive revenue.
    origamiBGTManager: "0x8e008401d7D4788C05a4a746e531B65CF2f5602b",
  },
};

const ABIS = {
  balanceOf: "function balanceOf(address account) view returns (uint256)",
  convertToAssets: "function convertToAssets(uint256 shares) view returns (uint256 assets)",
  positions: "function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
};

const EVENTS = {
  uniV3Collect: "event Collect(uint256 indexed tokenId, address recipient, uint256 amount0, uint256 amount1)",
  uniV3DecreaseLiquidity: "event DecreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  uniV3IncreaseLiquidity: "event IncreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  camelotV2Swap: "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
  cdClaimedYield: "event ClaimedYield(address indexed asset, uint256 actualYield)",
  cdLendingRepaid: "event LoanRepaid(address indexed user, uint16 indexed redemptionId, uint256 principal, uint256 interest)",
  erc20Transfer: "event Transfer(address indexed from, address indexed to, uint256 value)",
};

const ONE_SHARE = BigInt(10) ** BigInt(18);
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
// ERC-20 Transfer event topic (keccak256("Transfer(address,address,uint256)"))
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
// Zero address padded to 32 bytes for use as RPC topic filter
const ZERO_ADDRESS_TOPIC = "0x" + "0".repeat(64);

function getTreasuryAddresses(chain: string): string[] {
  const config: Record<string, string[]> = {
    [CHAIN.ETHEREUM]: [
      CHAIN_CONFIG[CHAIN.ETHEREUM].treasuryV1,
      CHAIN_CONFIG[CHAIN.ETHEREUM].treasuryV2,
      CHAIN_CONFIG[CHAIN.ETHEREUM].treasuryMultisig,
    ],
    [CHAIN.BASE]: [CHAIN_CONFIG[CHAIN.BASE].treasury],
    [CHAIN.ARBITRUM]: [CHAIN_CONFIG[CHAIN.ARBITRUM].treasury],
    [CHAIN.BERACHAIN]: [
      CHAIN_CONFIG[CHAIN.BERACHAIN].custody1,
      CHAIN_CONFIG[CHAIN.BERACHAIN].custody2,
      CHAIN_CONFIG[CHAIN.BERACHAIN].opsWallet,
      CHAIN_CONFIG[CHAIN.BERACHAIN].treasury,
    ],
  };
  return (config[chain] || []).map(a => a.toLowerCase());
}

/**
 * Fetch ERC-4626 yield for treasury holdings (sUSDS, sUSDe, iBERA)
 * Uses fromApi for balance to avoid overcounting when yield is claimed and re-wrapped mid-period
 */
async function fetchERC4626Yield(
  options: FetchOptions,
  vaultAddress: string,
  underlyingToken: string,
  treasuryAddresses: string[]
) {
  const { fromApi, toApi, createBalances } = options;
  const fees = createBalances();

  const balances = await fromApi.multiCall({
    abi: ABIS.balanceOf,
    calls: treasuryAddresses.map(t => ({ target: vaultAddress, params: [t] })),
  });

  const totalBalance = balances.reduce((sum, bal) => sum + BigInt(bal), BigInt(0));
  if (totalBalance === BigInt(0)) return fees;

  const [oldRate, newRate] = await Promise.all([
    fromApi.call({ abi: ABIS.convertToAssets, target: vaultAddress, params: [ONE_SHARE.toString()] }),
    toApi.call({ abi: ABIS.convertToAssets, target: vaultAddress, params: [ONE_SHARE.toString()] }),
  ]);

  const rateDelta = BigInt(newRate) - BigInt(oldRate);
  // ERC-4626 vaults used here (sUSDS, sUSDe, iBERA) are yield-only — their exchange
  // rate is monotonically increasing by design. A non-positive delta means no new yield
  // accrued in this period (e.g. rate unchanged at epoch boundary), not a loss event.
  // If slashing or rate decreases become possible for these vaults, this assumption
  // must be revisited.
  if (rateDelta <= BigInt(0)) return fees;
  const yieldAmount = (rateDelta * totalBalance) / ONE_SHARE;
  fees.add(underlyingToken, yieldAmount);

  return fees;
}

/**
 * Fetch CD Facility revenue - tracks sUSDS yield harvested to treasury
 */
async function fetchCDFacilityRevenue(options: FetchOptions) {
  const fees = options.createBalances();

  try {
    const logs = await options.getLogs({
      target: CHAIN_CONFIG[CHAIN.ETHEREUM].cdFacility,
      eventAbi: EVENTS.cdClaimedYield,
    });

    for (const log of logs) {
      fees.add(log.asset, log.actualYield);
    }
  } catch (e) {
    // CD Facility may not have events in all periods
  }

  return fees;
}

/**
 * Fetch CD Lending interest from loan repayments
 */
async function fetchCDLendingRevenue(options: FetchOptions) {
  const fees = options.createBalances();

  const logs = await options.getLogs({
    target: CHAIN_CONFIG[CHAIN.ETHEREUM].cdLending,
    eventAbi: EVENTS.cdLendingRepaid,
  });

  for (const log of logs) {
    fees.add(CHAIN_CONFIG[CHAIN.ETHEREUM].usds, BigInt(log.interest));
  }

  return fees;
}

/**
 * Fetch Uniswap V3 POL fees (Ethereum and Base)
 */
async function fetchUniV3POLFees(
  options: FetchOptions,
  positionManager: string,
  treasuryAddresses: string[],
  positionIds?: number[]
) {
  const fees = options.createBalances();

  const [collectLogs, decreaseLogs] = await Promise.all([
    options.getLogs({
      target: positionManager,
      eventAbi: EVENTS.uniV3Collect,
      entireLog: true,
      parseLog: true,
    }),
    options.getLogs({
      target: positionManager,
      eventAbi: EVENTS.uniV3DecreaseLiquidity,
      entireLog: true,
      parseLog: true,
    }),
  ]);

  const withdrawnMap = new Map<string, { amount0: bigint; amount1: bigint }>();

  for (const log of decreaseLogs) {
    const { transactionHash, args } = log as any;
    const key = `${transactionHash?.toLowerCase()}-${args.tokenId}`;
    const existing = withdrawnMap.get(key) || { amount0: 0n, amount1: 0n };

    withdrawnMap.set(key, {
      amount0: existing.amount0 + BigInt(args.amount0 || 0),
      amount1: existing.amount1 + BigInt(args.amount1 || 0),
    });
  }

  const positionIdSet = positionIds ? new Set(positionIds.map(String)) : null;
  const treasuryCollects = collectLogs
    .filter((log: any) =>
      treasuryAddresses.includes(log.args.recipient.toLowerCase()) &&
      (!positionIdSet || positionIdSet.has(String(log.args.tokenId)))
    )
    .map((log: any) => {
      const { transactionHash, args } = log;
      const key = `${transactionHash?.toLowerCase()}-${args.tokenId}`;
      const withdrawn = withdrawnMap.get(key);

      let amount0 = BigInt(args.amount0 || 0);
      let amount1 = BigInt(args.amount1 || 0);

      if (withdrawn) {
        amount0 = amount0 > withdrawn.amount0 ? amount0 - withdrawn.amount0 : 0n;
        amount1 = amount1 > withdrawn.amount1 ? amount1 - withdrawn.amount1 : 0n;
      }

      return {
        transactionHash,
        tokenId: args.tokenId,
        recipient: args.recipient,
        amount0,
        amount1,
      };
    })
    .filter((log: any) => log.amount0 > 0n || log.amount1 > 0n);

  const positionCache = new Map<string, { token0: string; token1: string }>();
  const uniqueTokenIds = [...new Set(treasuryCollects.map((log: any) => String(log.tokenId)))];

  if (uniqueTokenIds.length > 0) {
    const positions = await options.api.multiCall({
      abi: ABIS.positions,
      calls: uniqueTokenIds.map(tokenId => ({ target: positionManager, params: [tokenId] })),
    });
    positions.forEach((position: any, i: number) => {
      if (position) {
        positionCache.set(uniqueTokenIds[i], { token0: position.token0, token1: position.token1 });
      }
    });
  }

  for (const log of treasuryCollects) {
    const positionData = positionCache.get(String(log.tokenId));
    if (positionData) {
      if (log.amount0 > 0n) fees.add(positionData.token0, log.amount0.toString());
      if (log.amount1 > 0n) fees.add(positionData.token1, log.amount1.toString());
    }
  }
  return fees;
}


/**
 * Fetch Camelot V2 POL fees on Arbitrum
 * 
 * ASSUMPTION: Olympus owns ~100% of LP in this pool (validated Jan 2026).
 * If third-party LPs join, this calculation would overstate Olympus's share.
 */
async function fetchCamelotV2Fees(options: FetchOptions) {
  const fees = options.createBalances();

  const swapLogs = await options.getLogs({
    target: CHAIN_CONFIG[CHAIN.ARBITRUM].camelotV2Pool,
    eventAbi: EVENTS.camelotV2Swap,
  });

  const FEE_RATE = BigInt(25); // 0.25% LP share (25 bps)
  const BPS = BigInt(10000);

  for (const log of swapLogs) {
    const amount0In = BigInt(log.amount0In);
    const amount1In = BigInt(log.amount1In);

    if (amount0In > 0) {
      fees.add(CHAIN_CONFIG[CHAIN.ARBITRUM].weth, (amount0In * FEE_RATE) / BPS);
    }
    if (amount1In > 0) {
      fees.add(CHAIN_CONFIG[CHAIN.ARBITRUM].ohm, (amount1In * FEE_RATE) / BPS);
    }
  }

  return fees;
}

// ─── BERACHAIN REVENUE FUNCTIONS ─────────────────────────────────────────────

/**
 * Fetch iBGT DEX sale proceeds from the Berachain Ops wallet.
 *
 * Tracks outgoing iBGT Transfer events from the ops wallet to non-treasury
 * addresses. Excludes transfers to the OHM-HONEY RewardVault (those are bribe
 * costs, not revenue) and intra-treasury transfers. The sale proceeds are
 * denominated in iBGT and priced at query time by DefiLlama's pricing engine.
 *
 * Revenue stream: 184K+ iBGT sold in 36 DEX transactions (Apr–Jun 2025)
 * avg ~$5.61/iBGT → $1.03M total realized
 */
async function fetchIBGTSales(options: FetchOptions) {
  const fees = options.createBalances();
  const treasurySet = new Set(getTreasuryAddresses(CHAIN.BERACHAIN));
  const rewardVault = CHAIN_CONFIG[CHAIN.BERACHAIN].rewardVault.toLowerCase();
  const origamiManager = CHAIN_CONFIG[CHAIN.BERACHAIN].origamiBGTManager.toLowerCase();

  try {
    // Filter by Transfer event + `from` (opsWallet) at the RPC level.
    // topics[0] = Transfer event signature (required — SDK does not auto-insert it).
    // topics[1] = indexed `from` address, padded to 32 bytes.
    const opsWalletTopic = "0x" + CHAIN_CONFIG[CHAIN.BERACHAIN].opsWallet.slice(2).toLowerCase().padStart(64, "0");
    const transferLogs = await options.getLogs({
      target: CHAIN_CONFIG[CHAIN.BERACHAIN].iBGT,
      eventAbi: EVENTS.erc20Transfer,
      topics: [TRANSFER_TOPIC, opsWalletTopic],
    });

    for (const log of transferLogs) {
      const to = (log as any).to?.toLowerCase() ?? "";
      const amount = (log as any).value ?? BigInt(0);

      // Exclude intra-treasury transfers
      if (treasurySet.has(to)) continue;
      // Exclude bribe transfers to the OHM-HONEY RewardVault
      if (to === rewardVault) continue;
      // Exclude deposits to Origami oriBGT vault (parked/autocompounding, not realized)
      if (to === origamiManager) continue;
      // Exclude zero-address mints/burns
      if (to === ZERO_ADDRESS) continue;

      fees.add(CHAIN_CONFIG[CHAIN.BERACHAIN].iBGT, amount);
    }
  } catch (e) {}

  return fees;
}

/**
 * Fetch iBERA vesting yield via exchange rate appreciation.
 *
 * iBERA is an ERC-4626-like LST from Infrared Finance. Yield is earned as
 * the iBERA/BERA exchange rate increases over time. We track the rate delta
 * (convertToAssets delta) × treasury iBERA balance across all custody wallets.
 *
 * Revenue stream: ~143,645 iBERA yield earned (~3.65% APY)
 */
async function fetchIBeraYield(options: FetchOptions) {
  const treasuryAddresses = [
    CHAIN_CONFIG[CHAIN.BERACHAIN].custody1,
    CHAIN_CONFIG[CHAIN.BERACHAIN].custody2,
    CHAIN_CONFIG[CHAIN.BERACHAIN].opsWallet,
    // treasury wallet also checked but held minimal iBERA
    CHAIN_CONFIG[CHAIN.BERACHAIN].treasury,
  ];

  // iBERA yield denominated in WBERA (underlying asset)
  return fetchERC4626Yield(
    options,
    CHAIN_CONFIG[CHAIN.BERACHAIN].iBERA,
    CHAIN_CONFIG[CHAIN.BERACHAIN].WBERA,
    treasuryAddresses
  );
}

/**
 * Fetch oBERO exercise revenue.
 *
 * oBERO options are exercised by burning oBERO (Transfer to zero address)
 * and paying HONEY as exercise cost. Revenue is tracked via oBERO burns
 * (Transfer to 0x0) from treasury wallets, and recorded in BERO tokens
 * (the underlying received on exercise, 1:1 with oBERO burned).
 * DefiLlama prices BERO at query time.
 *
 * Revenue stream: ~95,156 oBERO exercised → ~$85K realized
 */
async function fetchOBeroExercises(options: FetchOptions) {
  const fees = options.createBalances();
  const treasurySet = new Set(getTreasuryAddresses(CHAIN.BERACHAIN));

  try {
    // Filter by Transfer event + `to` (zero address) at RPC level — burns only.
    // topics[0] = Transfer event signature (required — SDK does not auto-insert it).
    // topics[1] = null (any `from`), topics[2] = indexed `to` = zero address.
    const burnLogs = await options.getLogs({
      target: CHAIN_CONFIG[CHAIN.BERACHAIN].oBERO,
      eventAbi: EVENTS.erc20Transfer,
      topics: [TRANSFER_TOPIC, '', ZERO_ADDRESS_TOPIC],
    });

    for (const log of burnLogs) {
      const from = (log as any).from?.toLowerCase() ?? "";
      const amount = (log as any).value ?? BigInt(0);

      // Only burns from our treasury wallets
      if (!treasurySet.has(from)) continue;

      // Revenue denominated in BERO (1:1 with oBERO burned)
      fees.add(CHAIN_CONFIG[CHAIN.BERACHAIN].BERO, amount);
    }
  } catch (e) {}

  return fees;
}

/**
 * Fetch BERA/iBERA sales from treasury wallets.
 *
 * Tracks outgoing WBERA and iBERA Transfer events from all Berachain treasury
 * wallets to non-treasury addresses. These represent realized sales of treasury
 * BERA holdings. Excludes:
 * - Intra-treasury transfers (between custody/ops/treasury wallets)
 * - iBERA burns to zero address (those are Infrared unstaking queue entries,
 *   not sales — they represent a 30hr timelock withdrawal, not realized revenue)
 *
 * Revenue stream: $321,743 realized from BERA/iBERA sales (64.3% principal recovered)
 */
async function fetchBeraIBeraSales(options: FetchOptions) {
  const fees = options.createBalances();
  const treasurySet = new Set(getTreasuryAddresses(CHAIN.BERACHAIN));
  const tokensToTrack = [
    { address: CHAIN_CONFIG[CHAIN.BERACHAIN].WBERA, symbol: "WBERA" },
    { address: CHAIN_CONFIG[CHAIN.BERACHAIN].iBERA, symbol: "iBERA" },
  ];

  // Fetch both token logs in parallel
  const logResults = await Promise.all(
    tokensToTrack.map(token =>
      options.getLogs({
        target: token.address,
        eventAbi: EVENTS.erc20Transfer,
      }).catch(() => [] as any[])
    )
  );

  for (let i = 0; i < tokensToTrack.length; i++) {
    for (const log of logResults[i]) {
      const from = (log as any).from?.toLowerCase() ?? "";
      const to = (log as any).to?.toLowerCase() ?? "";
      const amount = (log as any).value ?? BigInt(0);

      // Only outgoing from our treasury wallets
      if (!treasurySet.has(from)) continue;
      // Exclude intra-treasury transfers
      if (treasurySet.has(to)) continue;
      // Exclude burns to zero address (iBERA unstaking queue entries)
      if (to === ZERO_ADDRESS) continue;

      fees.add(tokensToTrack[i].address, amount);
    }
  }

  return fees;
}

/**
 * CEX-brokered BERA sales (static historical entries).
 *
 * Olympus sold BERA treasury holdings via an OTC intermediary (Binance).
 * The flow: Treasury sent native BERA to broker EOA on Berachain → broker
 * sold on Binance → broker sent USDS proceeds to Olympus Treasury MS on Ethereum.
 *
 * Native BERA transfers are not ERC-20 events and cannot be detected via log
 * scanning. These sales are recorded as static entries, referenced by the
 * Ethereum-side settlement tx hashes for auditability.
 *
 * Settlement receipts (Ethereum mainnet, USDS to Treasury MS 0x245cc372...):
 *   OTC 1 (2026-02-07): 0x7382e6e899651d672d5cbbd5a4334b4b15a45a7d87da7bcb878de453f10d9d5f — $303,935 USDS
 *   OTC 2 (2026-02-24): 0x48ca88614ba667ec3e7f48c696b6df6cd7130cd6f65762a50c5ac90131984f76 — $156,729 USDS
 *
 * Future BERA sales: wrap to WBERA before transferring to broker so sales are
 * automatically captured as ERC-20 Transfer events by fetchBeraIBeraSales.
 */
const BERA_CEX_SETTLEMENTS: Array<{ dateUtc: string; timestamp: number; usdAmount: number }> = [
  { dateUtc: "2026-02-07", timestamp: 1770422400, usdAmount: 303935.00 }, // 589,626 BERA — settlement: 0x7382e6e8...
  { dateUtc: "2026-02-24", timestamp: 1771891200, usdAmount: 156729.20 }, // 257,570 BERA — settlement: 0x48ca8861...
];

function fetchBerachainCexSettlements(options: FetchOptions) {
  const fees = options.createBalances();

  for (const s of BERA_CEX_SETTLEMENTS) {
    if (s.timestamp >= options.fromTimestamp && s.timestamp < options.toTimestamp)
      fees.addUSDValue(s.usdAmount);
  }
  return fees;
}

/**
 * Aggregate all Berachain revenue streams
 */
async function fetchBerachain(options: FetchOptions) {
  const [ibgtSales, iberaYield, oberoExercises, beraSales] = await Promise.all([
    fetchIBGTSales(options),
    fetchIBeraYield(options),
    fetchOBeroExercises(options),
    fetchBeraIBeraSales(options),
  ]);

  const cexSettlements = fetchBerachainCexSettlements(options);

  const dailyFees = options.createBalances();
  dailyFees.addBalances(ibgtSales);
  dailyFees.addBalances(iberaYield);
  dailyFees.addBalances(oberoExercises);
  dailyFees.addBalances(beraSales);
  dailyFees.addBalances(cexSettlements);

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
}

async function fetchEthereum(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const treasuryAddresses = getTreasuryAddresses(CHAIN.ETHEREUM);

  const [susdsYield, susdeYield, cdFacilityRevenue, cdLendingRevenue, polFees] = await Promise.all([
    fetchERC4626Yield(
      options,
      CHAIN_CONFIG[CHAIN.ETHEREUM].sUSDS,
      CHAIN_CONFIG[CHAIN.ETHEREUM].usds,
      [CHAIN_CONFIG[CHAIN.ETHEREUM].treasuryV1, CHAIN_CONFIG[CHAIN.ETHEREUM].treasuryV2, CHAIN_CONFIG[CHAIN.ETHEREUM].treasuryMultisig, CHAIN_CONFIG[CHAIN.ETHEREUM].cdFacility]
    ),
    fetchERC4626Yield(
      options,
      CHAIN_CONFIG[CHAIN.ETHEREUM].sUSDe,
      CHAIN_CONFIG[CHAIN.ETHEREUM].usde,
      [CHAIN_CONFIG[CHAIN.ETHEREUM].treasuryV1, CHAIN_CONFIG[CHAIN.ETHEREUM].treasuryV2, CHAIN_CONFIG[CHAIN.ETHEREUM].treasuryMultisig]
    ),
    fetchCDFacilityRevenue(options),
    fetchCDLendingRevenue(options),
    fetchUniV3POLFees(options, CHAIN_CONFIG[CHAIN.ETHEREUM].uniV3PositionManager, treasuryAddresses, CHAIN_CONFIG[CHAIN.ETHEREUM].positionIds),
  ]);

  dailyFees.addBalances(susdeYield);
  dailyFees.addBalances(cdLendingRevenue);
  dailyFees.addBalances(polFees);

  // Handle sUSDS yield and CD Facility revenue to avoid double counting.
  // CD Facility holds sUSDS internally; when yield is claimed via ClaimedYield events,
  // it transfers to treasury as USDS. Subtract CD-claimed USDS from sUSDS yield calculation.
  const usdsAddressKey = `ethereum:${CHAIN_CONFIG[CHAIN.ETHEREUM].usds.toLowerCase()}`;
  const cdBalances = cdFacilityRevenue.getBalances();
  const cdClaimedUsds = BigInt(cdBalances[usdsAddressKey] || 0);

  if (cdClaimedUsds > BigInt(0)) {
    const susdsBalances = susdsYield.getBalances();
    const susdsUsdsYield = BigInt(susdsBalances[usdsAddressKey] || 0);
    const netSusdsYield = susdsUsdsYield - cdClaimedUsds;
    dailyFees.add(CHAIN_CONFIG[CHAIN.ETHEREUM].usds, netSusdsYield);
    dailyFees.addBalances(cdFacilityRevenue);
  } else {
    dailyFees.addBalances(susdsYield);
    dailyFees.addBalances(cdFacilityRevenue);
  }

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
}

async function fetchBase(options: FetchOptions) {
  const treasuryAddresses = getTreasuryAddresses(CHAIN.BASE);
  const dailyFees = await fetchUniV3POLFees(
    options,
    CHAIN_CONFIG[CHAIN.BASE].uniV3PositionManager,
    treasuryAddresses,
    CHAIN_CONFIG[CHAIN.BASE].positionIds
  );

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
}

async function fetchArbitrum(options: FetchOptions) {
  const dailyFees = await fetchCamelotV2Fees(options);
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
}

const methodology = {
  Fees: "Total revenue from all protocol sources across chains: sUSDS/sUSDe treasury yield, CD Facility yield, CD Lending interest, POL fees, and Berachain POL operations (iBGT DEX sales, iBERA staking yield, oBERO exercise proceeds, BERA/iBERA sales). Cooler Loan interest is tracked separately in the cooler-loans adapter.",
  Revenue: "Sum of all protocol revenue streams - as a reserve currency protocol, all revenue strengthens the treasury backing OHM",
  ProtocolRevenue: "100% of revenue flows to protocol treasury, funding YRF buybacks that increase backing per OHM. Cooler Loan interest tracked separately via the cooler-loans child protocol adapter, which rolls up to olympus-dao via parentProtocol.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  allowNegativeValue: true,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch: fetchEthereum, start: "2023-01-01" },
    [CHAIN.BASE]: { fetch: fetchBase, start: "2024-01-01" },
    [CHAIN.ARBITRUM]: { fetch: fetchArbitrum, start: "2024-01-01" },
    [CHAIN.BERACHAIN]: { fetch: fetchBerachain, start: "2025-04-01" },
  },
  methodology,
};

export default adapter;
