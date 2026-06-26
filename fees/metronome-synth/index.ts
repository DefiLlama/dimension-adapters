import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

const TREASURY = {
  [CHAIN.ETHEREUM]: "0xd1de3f9cd4ae2f23da941a67ca4c739f8dd9af33",
  [CHAIN.BASE]:     "0xe01df4ac1e1e57266900e62c37f12c986495a618",
  [CHAIN.OPTIMISM]: "0xE01Df4ac1E1e57266900E62C37F12C986495A618",
};

const SYNTHS = {
  [CHAIN.ETHEREUM]: [
    "0x8b4F8aD3801B4015Dea6DA1D36f063Cbf4e231c7",
    "0xab5eB14c09D416F0aC63661E57EDB7AEcDb9BEfA",
    "0x64351fC9810aDAd17A690E4e1717Df5e7e085160",
    "0x7cebe35b46b8078e7ffbf754eec4a48653c47524"
  ],
  [CHAIN.BASE]: [
    "0x7Ba6F01772924a82D9626c126347A28299E98c98",
    "0x526728DBc96689597F85ae4cd716d4f7fCcBAE9d",
  ],
  [CHAIN.OPTIMISM]: [
    "0x1610e3c85dd44Af31eD7f33a63642012Dca0C5A5",
    "0x9dAbAE7274D28A45F0B65Bf8ED201A5731492ca0",
    "0x33bCa143d9b41322479E8d26072a00a352404721",
  ],
};

const SYNTH_INTEREST_LABEL = "Synth Interest";
const SYNTH_SWAP_FEES_LABEL = "Synth Swap Fees";
const AMO_LABEL = "AMO Fees";
const METBASIS_LABEL = "MetBasis Fees";
const VELO_KITE_LABEL = "VELO / KITE Rewards";
const AERO_LABEL = "AERO Rewards";
const CRV_OETH_FXN_REWARDS_LABEL = "CRV / OETH / FXN Rewards";
const UNIV3_LABEL = "UniV3 LP Fees";
const GOV_LABEL = "Governance Rewards";
const MET_DISTRIBUTION_LABEL = "MET Distribution";

type InflowEntry = {
  label: string;
  target: string;
  tokens: string[];
  fromAddressFilter?: string;        // include only transfers from this sender
  excludeFromAddresses?: string[];   // drop transfers whose sender is in this list (post-fetch)
};

// Per-entry labeling matches the protocol's revenue buckets:
//   - "MetBasis Fees" rows are filtered by the MetBasis pool/gauge sender.
//   - "AERO Rewards" / "VELO / KITE Rewards" rows are net of MetBasis (same token, same treasury)
//     to avoid double counting with the MetBasis rows above them.
//   - "Other LP Claims" stays as a catch-all for ad-hoc LP rewards (CRV/OETH/FXN).
const EXTRA_INFLOWS: Record<string, InflowEntry[]> = {
  [CHAIN.OPTIMISM]: [
    {
      label: METBASIS_LABEL,
      target: "0xb3983cDdBa4B127960A4cDD531AB989264509e23",
      tokens: ["0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db"], // VELO from MetBasis gauge
      fromAddressFilter: "0x7DD72EF1f023ac5c2F4Cedcb278f4bfb2Bb60CbE",
    },
    {
      label: VELO_KITE_LABEL,
      target: "0x91ecADB8EF5DACc6156fFC036aCF6295eAb7A545",
      tokens: [
        "0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db", // VELO
        "0xf467C7d5a4A9C4687fFc7986aC6aD5A4c81E1404", // KITE
      ],
      excludeFromAddresses: ["0x7DD72EF1f023ac5c2F4Cedcb278f4bfb2Bb60CbE"], // exclude MetBasis gauge
    },
  ],
  [CHAIN.BASE]: [
    {
      label: METBASIS_LABEL,
      target: "0x3b06D40f1a7AD2D936B5F11A161e84DD637945B6",
      tokens: ["0x940181a94A35A4569E4529A3CDfB74e38FD98631"], // AERO from MetBasis gauge
      fromAddressFilter: "0x019a8a996B6cb2e2e12fe95997FA9ef733c99765",
    },
    {
      label: METBASIS_LABEL,
      target: "0x3b06D40f1a7AD2D936B5F11A161e84DD637945B6",
      tokens: [
        "0x526728DBc96689597F85ae4cd716d4f7fCcBAE9d", // msUSD
        "0x7Ba6F01772924a82D9626c126347A28299E98c98", // msETH
      ],
      fromAddressFilter: "0x8845126640B36df1D24bf3dF9B2903fD4c730FE6",
    },
    {
      label: AERO_LABEL,
      target: "0x3b06D40f1a7AD2D936B5F11A161e84DD637945B6",
      tokens: ["0x940181a94A35A4569E4529A3CDfB74e38FD98631"], // AERO
      excludeFromAddresses: ["0x019a8a996B6cb2e2e12fe95997FA9ef733c99765"], // exclude MetBasis gauge
    },
  ],
  [CHAIN.ETHEREUM]: [
    {
      label: CRV_OETH_FXN_REWARDS_LABEL,
      target: "0xCE3187216B39ED222319D877956aC6b2eF1961E9",
      tokens: [
        "0xD533a949740bb3306d119CC777fa900bA034cd52", // CRV
        "0x856c4Efb76C1D1AE02e20CEB03A2A6a08b0b8dC3", // OETH
        "0x365accfca291e7d3914637abf1f7635db165bb09", // FXN
      ],
    },
  ],
  // Plasma MetBasis fees are sourced from UniV3 Collect events (see UNIV3_POSITIONS),
  // which correctly nets out same-tx DecreaseLiquidity withdrawals. A raw Transfer-from-pool
  // filter would over-count principal withdrawals as fees.
};

// AMO harvest event:
//   Harvest(address indexed syntheticToken, address indexed vPool, uint256 profit)
// `profit` is denominated in the synthetic token (18 decimals); msUSD/msETH/msBTC
// peg 1:1 to their underlying so the synthetic-token price feed is the correct
// USD denominator.
const HARVEST_EVENT_ABI =
  "event Harvest(address indexed syntheticToken, address indexed vPool, uint256 profit)";

// SyntheticTokenSwapped: emitted by Metronome pools when a user swaps between synths.
// `fee` is minted as syntheticTokenOut directly to the treasury, so subtract this
// from total synth → treasury mints when computing Synth Interest.
const SYNTH_SWAPPED_EVENT_ABI =
  "event SyntheticTokenSwapped(address indexed account, address indexed syntheticTokenIn, address indexed syntheticTokenOut, uint256 amountIn, uint256 amountOut, uint256 fee)";

const AMO_CONTROLLERS: Record<string, string[]> = {
  [CHAIN.ETHEREUM]: ["0x82Ed3Fc9D93112124B04B6C7B35394A5AbA8af39"],
  [CHAIN.BASE]:     ["0xDb9bD9eb1CdD9AE62A2e9569075A5154296CD632"],
};

const MET_TOKEN = "0x2Ebd53d035150f328bd754D6DC66B99B0eDB89aa";
const DISTRIBUTOR = "0x33f081a0f0240d0ed7e45c36848c01d7ad8038e9";

const UNIV3_POSITIONS: Record<string, { npm: string; treasuries: string[]; groups: { label: string; positionIds: number[] }[] }> = {
  [CHAIN.ETHEREUM]: {
    npm: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
    treasuries: [
      "0xd1de3f9cd4ae2f23da941a67ca4c739f8dd9af33",
      "0xce3187216b39ed222319d877956ac6b2ef1961e9",
    ],
    groups: [
      { label: UNIV3_LABEL, positionIds: [295354, 298500, 305148, 305138, 305136, 517851, 1092162] },
    ],
  },
  [CHAIN.PLASMA]: {
    npm: "0x743E03cceB4af2efA3CC76838f6E8B50B63F184c",
    treasuries: ["0xCE3187216B39ED222319D877956aC6b2eF1961E9"],
    groups: [
      // msUSD/msETH MetBasis pool
      { label: METBASIS_LABEL, positionIds: [17692, 19059] },
      // msETH/WETH (17691, 17690) and msUSD/USDT0 (18640)
      { label: UNIV3_LABEL, positionIds: [17691, 17690, 18640] },
    ],
  },
};

const UNIV3_ABIS = {
  positions: "function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
  collect: "event Collect(uint256 indexed tokenId, address recipient, uint256 amount0, uint256 amount1)",
  decreaseLiquidity: "event DecreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
};

const GOVERNANCE_INFLOWS: Record<string, Array<{ holder: string; token: string; fromAddressFilter?: string }>> = {
  [CHAIN.ETHEREUM]: [
    {
      holder: "0xf9eeb67238dfb16e6bbf14ab560d18b740f820a9",
      token: "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B", // CVX (vlCVX rewards)
    },
  ],
};

// Treasury-internal transfers wrongly counted as revenue (e.g. minting synths against
// own collateral and moving them to another treasury wallet). Excluded by tx hash.
const BLACKLISTED_TXS: Record<string, Set<string>> = {
  [CHAIN.ETHEREUM]: new Set([
    "0x3765921580dfcbb65202e2d00dcc3b20f9d52214fb2cdd2381ee03e6120bbd70".toLowerCase(),
    // 2025-07-31: c0ffeebabe.eth returned ~900 msETH to the Metronome treasury after
    // it was recovered from the Curve exploit. This is a recovery transfer, not interest revenue.
    "0x7c4ba39dad59ad91f9f0102de833fbc5a8f40122d796e73022ec57c6d29e439f".toLowerCase(),
  ]),
};

// logFilter excluding blacklisted txs. Handles both the indexer (`transaction_hash`)
// and the getLogs fallback (`transactionHash`) field names.
function txBlacklistFilter(chain: string): ((log: any) => boolean) | undefined {
  const blacklist = BLACKLISTED_TXS[chain];
  if (!blacklist?.size) return undefined;
  return (log: any) =>
    !blacklist.has(String(log.transaction_hash ?? log.transactionHash ?? "").toLowerCase());
}

async function fetchUniV3Fees(options: FetchOptions): Promise<Record<string, ReturnType<FetchOptions["createBalances"]>>> {
  const result: Record<string, ReturnType<FetchOptions["createBalances"]>> = {};
  const cfg = UNIV3_POSITIONS[options.chain];
  if (!cfg) return result;

  const treasurySet = new Set(cfg.treasuries.map((a) => a.toLowerCase()));
  const labelByPositionId = new Map<string, string>();
  for (const g of cfg.groups) {
    for (const id of g.positionIds) labelByPositionId.set(String(id), g.label);
  }

  const [collectLogs, decreaseLogs] = await Promise.all([
    options.getLogs({ target: cfg.npm, eventAbi: UNIV3_ABIS.collect, entireLog: true, parseLog: true }),
    options.getLogs({ target: cfg.npm, eventAbi: UNIV3_ABIS.decreaseLiquidity, entireLog: true, parseLog: true }),
  ]);

  const withdrawnMap = new Map<string, { amount0: bigint; amount1: bigint }>();
  for (const log of decreaseLogs as any[]) {
    const key = `${log.transactionHash?.toLowerCase()}-${log.args.tokenId}`;
    const existing = withdrawnMap.get(key) || { amount0: 0n, amount1: 0n };
    withdrawnMap.set(key, {
      amount0: existing.amount0 + BigInt(log.args.amount0 || 0),
      amount1: existing.amount1 + BigInt(log.args.amount1 || 0),
    });
  }

  const feeCollects = (collectLogs as any[])
    .filter(
      (log) =>
        treasurySet.has(String(log.args.recipient).toLowerCase()) &&
        labelByPositionId.has(String(log.args.tokenId))
    )
    .map((log) => {
      const tokenId = String(log.args.tokenId);
      const key = `${log.transactionHash?.toLowerCase()}-${tokenId}`;
      const withdrawn = withdrawnMap.get(key);
      let amount0 = BigInt(log.args.amount0 || 0);
      let amount1 = BigInt(log.args.amount1 || 0);
      if (withdrawn) {
        amount0 = amount0 > withdrawn.amount0 ? amount0 - withdrawn.amount0 : 0n;
        amount1 = amount1 > withdrawn.amount1 ? amount1 - withdrawn.amount1 : 0n;
      }
      return { tokenId, amount0, amount1 };
    })
    .filter((c) => c.amount0 > 0n || c.amount1 > 0n);

  if (feeCollects.length === 0) return result;

  const uniqueTokenIds = [...new Set(feeCollects.map((c) => c.tokenId))];
  const positions = await options.api.multiCall({
    abi: UNIV3_ABIS.positions,
    calls: uniqueTokenIds.map((tokenId) => ({ target: cfg.npm, params: [tokenId] })),
  });

  const positionCache = new Map<string, { token0: string; token1: string }>();
  positions.forEach((p: any, i: number) => {
    if (p) positionCache.set(uniqueTokenIds[i], { token0: p.token0, token1: p.token1 });
  });

  for (const c of feeCollects) {
    const pos = positionCache.get(c.tokenId);
    if (!pos) continue;
    const label = labelByPositionId.get(c.tokenId)!;
    if (!result[label]) result[label] = options.createBalances();
    if (c.amount0 > 0n) result[label].add(pos.token0, c.amount0.toString());
    if (c.amount1 > 0n) result[label].add(pos.token1, c.amount1.toString());
  }
  return result;
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  // 1. AMO harvest profits (minted to treasury as synth tokens).
  const amoBalances = options.createBalances();
  for (const controller of (AMO_CONTROLLERS[options.chain] ?? [])) {
    const harvestLogs = await options.getLogs({
      target: controller,
      eventAbi: HARVEST_EVENT_ABI,
    });
    for (const log of harvestLogs) {
      const profit = BigInt(log.profit.toString());
      if (profit > 0n) amoBalances.add(log.syntheticToken, profit);
    }
  }

  // 2. Synth swap fees: SyntheticTokenSwapped events, fee is minted as
  //    syntheticTokenOut to the treasury. Post-filter by SYNTHS list to ignore
  //    unrelated contracts that may emit a same-signature event.
  const swapFees = options.createBalances();
  if (TREASURY[options.chain]) {
    const synthSet = new Set((SYNTHS[options.chain] ?? []).map((t) => t.toLowerCase()));
    const swapLogs = await options.getLogs({
      noTarget: true,
      eventAbi: SYNTH_SWAPPED_EVENT_ABI,
    });
    for (const log of swapLogs) {
      if (!synthSet.has(String(log.syntheticTokenOut).toLowerCase())) continue;
      const fee = BigInt(log.fee.toString());
      if (fee > 0n) swapFees.add(log.syntheticTokenOut, fee);
    }
  }

  // 3. Synth interest = all synth → treasury mints, minus swap fees and AMO harvest mints
  //    (both of which are already accounted for separately).
  if (TREASURY[options.chain]) {
    const synthInflows = await addTokensReceived({
      options,
      tokens: SYNTHS[options.chain],
      targets: [TREASURY[options.chain]],
      logFilter: txBlacklistFilter(options.chain),
    });
    synthInflows.subtract(amoBalances);
    synthInflows.subtract(swapFees);
    dailyFees.addBalances(synthInflows, SYNTH_INTEREST_LABEL);
  }

  dailyFees.addBalances(swapFees, SYNTH_SWAP_FEES_LABEL);
  dailyFees.addBalances(amoBalances, AMO_LABEL);

  for (const group of (EXTRA_INFLOWS[options.chain] ?? [])) {
    const baseParams: any = { options, tokens: group.tokens, targets: [group.target] };
    if (group.fromAddressFilter) baseParams.fromAddressFilter = group.fromAddressFilter;

    const totals = await addTokensReceived(baseParams);

    if (group.excludeFromAddresses?.length) {
      for (const excluded of group.excludeFromAddresses) {
        const dup = await addTokensReceived({
          options,
          tokens: group.tokens,
          targets: [group.target],
          fromAddressFilter: excluded,
        });
        totals.subtract(dup);
      }
    }

    dailyFees.addBalances(totals, group.label);
  }

  const uniV3ByLabel = await fetchUniV3Fees(options);
  for (const [label, bal] of Object.entries(uniV3ByLabel)) {
    dailyFees.addBalances(bal, label);
  }

  for (const g of (GOVERNANCE_INFLOWS[options.chain] ?? [])) {
    const params: any = { options, tokens: [g.token], targets: [g.holder] };
    if (g.fromAddressFilter) params.fromAddressFilter = g.fromAddressFilter;
    const res = await addTokensReceived(params);
    dailyFees.addBalances(res, GOV_LABEL);
  }

  if (options.chain === CHAIN.ETHEREUM) {
    const metTransfers = await addTokensReceived({
      options,
      tokens: [MET_TOKEN],
      targets: [DISTRIBUTOR],
    });
    dailyHoldersRevenue.addBalances(metTransfers, MET_DISTRIBUTION_LABEL);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  // pullHourly: true,
  fetch,
  methodology: {
    Fees: "Synth interest and swap fees minted to the Metronome treasury, AMO harvest profits, MetBasis LP fees, other LP rewards (AERO/VELO/KITE/CRV/OETH/FXN), UniV3 fees on treasury-owned positions, and governance staking rewards.",
    Revenue: "Same as Fees.",
    HoldersRevenue: "MET distributed to holders.",
  },
  breakdownMethodology: {
    Fees: {
      [SYNTH_INTEREST_LABEL]: "Interest on user debt (msUSD/msBTC 2%, msETH 1%).",
      [SYNTH_SWAP_FEES_LABEL]: "Fees on synth-to-synth swaps.",
      [AMO_LABEL]: "AMO harvest profits.",
      [METBASIS_LABEL]: "MetBasis LP rewards on Base/OP/Plasma (AERO, VELO, msUSD/msETH).",
      [AERO_LABEL]: "AERO rewards to the Base treasury (excl. MetBasis).",
      [VELO_KITE_LABEL]: "VELO/KITE rewards to the Optimism treasury (excl. MetBasis).",
      [CRV_OETH_FXN_REWARDS_LABEL]: "CRV/OETH/FXN rewards to the Ethereum treasury.",
      [UNIV3_LABEL]: "Ethereum UniV3 LP fees, net of same-tx liquidity withdrawals.",
      [GOV_LABEL]: "Convex vlCVX reward claims.",
    },
    HoldersRevenue: {
      [MET_DISTRIBUTION_LABEL]: "MET distributed to holders.",
    },
  },
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2022-12-27' },
    [CHAIN.BASE]: { start: '2023-05-11'},
    [CHAIN.OPTIMISM]: { start: '2023-05-11'},
    [CHAIN.PLASMA]: { start: '2025-09-29'},
  },
};

export default adapter;
