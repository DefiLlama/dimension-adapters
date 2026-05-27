import ADDRESSES from '../../helpers/coreAssets.json'
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

const SYNTH_LABEL = "Synth Interest + Swap Fees";
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
  [CHAIN.PLASMA]: [
    {
      label: METBASIS_LABEL,
      target: "0xCE3187216B39ED222319D877956aC6b2eF1961E9",
      tokens: [
        "0x29AD7fE4516909b9e498B5a65339e54791293234", // msUSD
        "0x7230a9D42D622E18FDf7207041EcA18465F9F1bE", // msETH
      ],
      fromAddressFilter: "0xf94EA39c02DfF32494FBaFcF72E546c640143D7D",
    },
  ],
};

// AMO harvest claims: underlying transferred from Morpho-vault depositor to AMO controller
const AMO_HARVESTS: Record<string, Array<{ controller: string; depositor: string; underlying: string }>> = {
  [CHAIN.ETHEREUM]: [
    {
      controller: "0x82Ed3Fc9D93112124B04B6C7B35394A5AbA8af39",
      depositor:  "0xEb7Cc55424250F1108fcD623b0A551d682D1CF28", // msETH Morpho vault depositor
      underlying: ADDRESSES.GAS_TOKEN_2,                        // WETH
    },
    {
      controller: "0x82Ed3Fc9D93112124B04B6C7B35394A5AbA8af39",
      depositor:  "0x351567b6F2Ee293c0F724A657F7d59f61361e8b0", // msUSD Morpho vault depositor
      underlying: ADDRESSES.ethereum.USDC,
    },
  ],
  [CHAIN.BASE]: [
    {
      controller: "0xDb9bD9eb1CdD9AE62A2e9569075A5154296CD632",
      depositor:  "0xEa3C40D0aA13CD935ac5A4a5C5FE8687678f510f", // msETH Morpho vault depositor
      underlying: ADDRESSES.GAS_TOKEN_2,                        // WETH
    },
  ],
};

const MET_TOKEN = "0x2Ebd53d035150f328bd754D6DC66B99B0eDB89aa";
const DISTRIBUTOR = "0x33f081a0f0240d0ed7e45c36848c01d7ad8038e9";

// Plasma UniV3 positions are covered by the 4C MetBasis Transfer tracker
// (pool 0xf94EA39c… → treasury), so they are intentionally NOT listed here to
// avoid double-counting Collect events vs Transfer events.
const UNIV3_POSITIONS: Record<string, { npm: string; treasuries: string[]; positionIds: number[] }> = {
  [CHAIN.ETHEREUM]: {
    npm: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
    treasuries: [
      "0xd1de3f9cd4ae2f23da941a67ca4c739f8dd9af33",
      "0xce3187216b39ed222319d877956ac6b2ef1961e9",
    ],
    positionIds: [295354, 298500, 305148, 305138, 305136, 517851, 1092162],
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

async function fetchUniV3Fees(options: FetchOptions, balances: any) {
  const cfg = UNIV3_POSITIONS[options.chain];
  if (!cfg) return;

  const treasurySet = new Set(cfg.treasuries.map((a) => a.toLowerCase()));
  const positionIdSet = new Set(cfg.positionIds.map(String));

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
        positionIdSet.has(String(log.args.tokenId))
    )
    .map((log) => {
      const key = `${log.transactionHash?.toLowerCase()}-${log.args.tokenId}`;
      const withdrawn = withdrawnMap.get(key);
      let amount0 = BigInt(log.args.amount0 || 0);
      let amount1 = BigInt(log.args.amount1 || 0);
      if (withdrawn) {
        amount0 = amount0 > withdrawn.amount0 ? amount0 - withdrawn.amount0 : 0n;
        amount1 = amount1 > withdrawn.amount1 ? amount1 - withdrawn.amount1 : 0n;
      }
      return { tokenId: String(log.args.tokenId), amount0, amount1 };
    })
    .filter((c) => c.amount0 > 0n || c.amount1 > 0n);

  if (feeCollects.length === 0) return;

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
    if (c.amount0 > 0n) balances.add(pos.token0, c.amount0.toString(), UNIV3_LABEL);
    if (c.amount1 > 0n) balances.add(pos.token1, c.amount1.toString(), UNIV3_LABEL);
  }
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  if (TREASURY[options.chain]) {
    const synthFees = await addTokensReceived({
      options,
      tokens: SYNTHS[options.chain],
      targets: [TREASURY[options.chain]],
    });
    dailyFees.addBalances(synthFees, SYNTH_LABEL);
  }

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

  for (const h of (AMO_HARVESTS[options.chain] ?? [])) {
    const res = await addTokensReceived({
      options,
      tokens: [h.underlying],
      target: h.controller,
      fromAddressFilter: h.depositor,
    });
    dailyFees.addBalances(res, AMO_LABEL);
  }

  await fetchUniV3Fees(options, dailyFees);

  for (const g of (GOVERNANCE_INFLOWS[options.chain] ?? [])) {
    const params: any = {
      options,
      tokens: [g.token],
      targets: [g.holder],
    };
    if (g.fromAddressFilter) params.fromAddressFilter = g.fromAddressFilter;
    const res = await addTokensReceived(params);
    dailyFees.addBalances(res, GOV_LABEL);
  }

  const dailyHoldersRevenue = options.createBalances();
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
    Fees: "Synth treasury inflows, MetBasis LP fees from msETH/msUSD pools, other LP rewards claimed to Metronome treasuries, AMO harvest profits claimed from Morpho vaults, UniV3 LP fees collected by treasury-held positions, and governance reward claims.",
    Revenue: "Same as Fees.",
    HoldersRevenue: "MET distributed to holders.",
  },
  breakdownMethodology: {
    Fees: {
      [SYNTH_LABEL]: "Synth interest (msUSD 2%, msETH 1%, msBTC 2%) accruing on user debt and SyntheticTokenSwapped swap fees, both minted to the Metronome treasury.",
      [AMO_LABEL]: "Profit claimed by the AMO controllers from Morpho vaults (underlying WETH/USDC transferred from the vault depositor to the AMO controller on harvest).",
      [METBASIS_LABEL]: "LP fees from the msETH/msUSD MetBasis pools — AERO from the Base gauge, VELO from the Optimism gauge, msUSD/msETH from the Base and Plasma pools.",
      [AERO_LABEL]: "AERO LP rewards received by the Base treasury, net of MetBasis AERO (which is bucketed under MetBasis Fees).",
      [VELO_KITE_LABEL]: "VELO and KITE LP rewards received by the Optimism treasury 0x91ecAD…, net of MetBasis VELO (which is bucketed under MetBasis Fees).",
      [CRV_OETH_FXN_REWARDS_LABEL]: "CRV, OETH and FXN LP rewards received by the Ethereum treasury 0xCE318721….",
      [UNIV3_LABEL]: "Trading fees collected from Uniswap V3 NFT positions held by Metronome treasuries on Ethereum, net of liquidity withdrawals collected in the same transaction. Plasma UniV3 fees are captured under MetBasis Fees instead.",
      [GOV_LABEL]: "Rewards claimed from governance staking positions (Convex vlCVX → CVX).",
    },
    Revenue: {
      [SYNTH_LABEL]: "Synth interest (msUSD 2%, msETH 1%, msBTC 2%) accruing on user debt and SyntheticTokenSwapped swap fees, both minted to the Metronome treasury.",
      [AMO_LABEL]: "Profit claimed by the AMO controllers from Morpho vaults (underlying WETH/USDC transferred from the vault depositor to the AMO controller on harvest).",
      [METBASIS_LABEL]: "LP fees from the msETH/msUSD MetBasis pools — AERO from the Base gauge, VELO from the Optimism gauge, msUSD/msETH from the Base and Plasma pools.",
      [AERO_LABEL]: "AERO LP rewards received by the Base treasury, net of MetBasis AERO (which is bucketed under MetBasis Fees).",
      [VELO_KITE_LABEL]: "VELO and KITE LP rewards received by the Optimism treasury 0x91ecAD…, net of MetBasis VELO (which is bucketed under MetBasis Fees).",
      [CRV_OETH_FXN_REWARDS_LABEL]: "CRV, OETH and FXN LP rewards received by the Ethereum treasury 0xCE318721….",
      [UNIV3_LABEL]: "Trading fees collected from Uniswap V3 NFT positions held by Metronome treasuries on Ethereum, net of liquidity withdrawals collected in the same transaction. Plasma UniV3 fees are captured under MetBasis Fees instead.",
      [GOV_LABEL]: "Rewards claimed from governance staking positions (Convex vlCVX → CVX).",
    },
    HoldersRevenue: {
      [MET_DISTRIBUTION_LABEL]: "MET tokens transferred to the holder distributor contract.",
    },
  },
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2023-05-11' },
    [CHAIN.BASE]: { start: '2023-05-11'},
    [CHAIN.OPTIMISM]: { start: '2023-05-11'},
    [CHAIN.PLASMA]: { start: '2025-09-29'},
  },
};

export default adapter;
