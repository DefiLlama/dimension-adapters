import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// EL-Casino — on-chain casino rooms on Robinhood Chain (roulette, crash, blackjack, slots, keno, …). Every V5 room is
// its own contract (deployed by the V5 game factories below, CasinoHubV5 0xF844142E6F0474a115712d650e58F238f760555d)
// with its own token pool and lifetime counters (CasinoGameBaseV5). Per bet the room charges:
//   · an LP fee kept by the room's pool for its stakers  → totalFeesCollected
//   · a platform fee for the ElcasTreasury, which swaps it to $ELCAS and burns it → pendingPlatformFees, paid out by
//     flushPlatformFees() (PlatformFeeCollected)
//   · a creator fee for the room's creator → pendingCreatorFees, paid out by claimCreatorFees() (CreatorFeeCollected)
// The period's fees are the change of those counters between the window's first and last block, plus what was paid
// out inside the window. V6 rooms (CasinoGameBaseV6, CasinoHubV6 0x66DF90B6B074f7c49906c2bB0A8E5bf3773879d0) keep the same
// counters; their platform fee goes to the ElcasBurner, which also swaps it to $ELCAS and burns it.
//
// A V6 room's donate() also raises its totalFeesCollected, so donations (Donated) are taken out of the rooms' counters
// below. The EL-Casino Launchpad's game reserve donates its third of the launch tokens' pool fees this way; those fees
// are counted by the separate el-casino-launchpad adapter (until 2026-10-26 they were counted here).
const FACTORIES_V5 = [
  "0x5B9dF3831d50af1b02AE0bdF3061C744C45087b0", "0xbf976d1b6efF1B047f8aE2A5d6259D689b4A536B", "0x4E83A441F280fE9a07DeB88a4a3F4D14Bf5400Eb",
  "0x9b5037eF17598Ff5B6C16d6a9e027c72897828eB", "0x08A9DF94F9C5DE378A283cC4a44Da09909CE3Ab6", "0xCa6F1bE59C06EA6E14412A387eD5f3bCb71B2248",
  "0x5231c0282025799aB38b317F89470C6b7C153A77", "0x7E8bA129e445771dc7a514D5F9E1179a23c1beb4", "0x31929aCE4FBa4C9c98A29559b1aA8D5cf18414a7",
  "0x15DdCF1C6F7CB8A7dfBb9aca792F6CbAcABAa27f", "0xd2Bf1fe7D418C011c8A2b2bD64298Dd3ed9cEF80", "0xae7994D4e25f2965367B55950A1a95a930Aa554A",
  "0x10e02DD0F131Cbb55a97fef5b724541B8A6b378C", "0x6751dD9ADBCE7913Fea529FDe5E561422D017725", "0x553220711d5683205a2644a77755Ba6f7E34b31b",
  "0x25Ac8B77B8e32B1eA9C431127679e4Ff11eC4FA4", "0x7C7ad1370a26E1a7e67A778E9C9820637f76BC1d", "0x796d695569520BE3963CB620A3a3c53b92B606a4",
  "0x64D84eAcEdEe214995d1b30febD8720131DAEE9f", "0x2935fDb03C2F4f4fb32D29032F46357706519268", "0x6dFF48299Ac1Ff559DcEdDDf28AF3B1e5140c6A4",
];
// V6 game factories (CasinoHubV6 0x66DF90B6B074f7c49906c2bB0A8E5bf3773879d0 — the launchpad's rooms and every new room)
const FACTORIES_V6 = [
  "0x55190a1B037dD5dA29031A18D18ECf1Ea77f13E3", "0x3f9367C890e814c90d500b0e8723E8aE5dd6B99F", "0xBb175854C08cB7D18217C2F67Aaf235F421D94d3",
  "0xa7Ce2300509c68F0Eca46CbdAa7ea83fA01932D3", "0xF330BFcceE1b36338dD7e9556679979Bf75FEAd7", "0xB6BBA1643290632E88eDDE60BF4b9bD6670FcEF9",
  "0x08a24d597A748b9BEE85EEcD215c903af7BB231b", "0x3c397832A08Bb0AaDD9DE604B2dB1642BbfE1a7D", "0x83Ba15145eB74bF54c0bEdd1C8D3Be9509a2B600",
  "0xa9e48A8774A0e2F577b8C49DF2b12aF7Bdb8B0BF", "0xEA203b5813A145f542feD223533bD97c210A67dC", "0x58fCEe7fedB9a324a3C1570d2644EC4C87Be44E3",
  "0x67a98f0A0A73d697c9EcE3F310E28ffc89c491b8", "0xff6f1a93B662e6E6EB73632B3b9ce8fBFA15083e", "0x5c5Df8cc39CAb5790981a6AB4E1C016397973111",
  "0x69EeAB0020EbD064AFAA8e35D0E64f6b8a2842b4", "0xa17bF3952C23c19e9B0c3F017eBACa3006216fFd", "0x542bb8E1f9Ed0E0a523910B18843f5da22711D2F",
  "0x5bffd94d0AE1d2fC9C78f5909f43dF700552029c", "0xf7EdFECB155E4065C7F8684820B21503098b05B8",
];
// V7 game factories (CasinoHubV7 0x3F033CeAE85B9Db2eBD3f5BaBcEb90518DEf496c, 2026-10-28): the same counters (no LP fee — rooms keep only the
// house edge); the platform fee goes to the ElcasBurnerV3. Every bet also carries an ETH reveal fee, paid to whoever
// reveals the round (the keeper) — a gas refund, not counted as a fee.
const FACTORIES_V7 = [
  "0x91284A7de6b9431eDE067ee25685593d27ea9c59", "0x42097766d7e434B37b16F5304a58658eF5EA4605", "0x7bFc80D91477497226e2526dF83eBd725779F37D",
  "0xA1cB1A627326976bF42176127050530616efc50a", "0x65A3e41138a49878a5E78969878A61793987129C", "0x911A405AFDA70702156f9D6C15D101CeceDD5EC4",
  "0x07EF0b8F45058DC3804511BBB1111080Cb299DAA", "0x541B988aC567bBEa96901B79e50b3B9d2168E81E", "0x0e92c1744C89913920f3974833fBB3DDa637c7EA",
  "0xb21928bec8725670C662f05f0DdD37f7d6033110", "0x3f62789A03965d571D354283fe4Fbe878E3f9d5e", "0xD71Cd3C0Ffc9B1eA83A5fF5e1c0F2d4d5435f04f",
  "0x5007345F3b1D5485D04Daf1f95Efc0025352F37D", "0xF1ac23255Ee8d7728dF0A1b548E26f8e13dDC429", "0x150638483b7935CAC6800e47BBD7281678150408",
  "0x279484859326FBC6696cAA8304f5BDCAc310eC44", "0xfcC8bCc00fc811F7e8a06a40571FEF5D3341Bd3C", "0xEeebcb164D09B93Eea0C3138D14A0F39b0B01b05",
  "0x6d640E0CA7b84550c5881CB8D2c847d18125342D", "0xd87D01FDd92e90E27d101D419896F84d975569CD",
];
const FACTORIES = [...FACTORIES_V5, ...FACTORIES_V6, ...FACTORIES_V7];
const V5_LIVE_BLOCK = 75800030;
const V6_LIVE_BLOCK = 96781938;
const V7_LIVE_BLOCK = 100256000;
const GET_GAMES = "function getGames(uint256 offset, uint256 limit) view returns (tuple(address gameAddress, address owner, address creator, address token, string tokenLogoUrl, string betName, uint256 createdAt)[])";
const PLATFORM = "event PlatformFeeCollected(uint256 amount)";
const CREATOR = "event CreatorFeeCollected(uint256 amount)";
const DONATED = "event Donated(address indexed from, uint256 amount)";

const L = {
  fees: "Bet Fees",
  lpToStakers: "Bet Fees To Room Stakers",
  platformToBurn: "Platform Fees To ELCAS Buyback And Burn",
  creatorToCreators: "Creator Fees To Room Creators",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const toBlock = await options.getToBlock();
  const totals: number[] = await options.api.multiCall({ abi: "uint256:getTotalGames", calls: FACTORIES, permitFailure: true });
  FACTORIES.forEach((f, i) => {
    if (totals[i] == null && toBlock >= (i < FACTORIES_V5.length ? V5_LIVE_BLOCK : i < FACTORIES_V5.length + FACTORIES_V6.length ? V6_LIVE_BLOCK : V7_LIVE_BLOCK)) throw new Error(`getTotalGames failed on factory ${f} at block ${toBlock}`);
  });
  const calls: any[] = [];
  FACTORIES.forEach((f, i) => { for (let o = 0; o < Number(totals[i] ?? 0); o += 200) calls.push({ target: f, params: [o, 200] }); });
  const rooms: any[] = (await options.api.multiCall({ abi: GET_GAMES, calls })).flat();
  const targets = rooms.map((r) => r.gameAddress);
  const existed = rooms.map((r) => Number(r.createdAt) < options.fromTimestamp);
  const existing = targets.filter((_, i) => existed[i]);
  const atFrom = async (abi: string) => {
    const values = await options.fromApi.multiCall({ abi, calls: existing });
    let k = 0;
    return existed.map((e) => (e ? values[k++] : 0));
  };
  const lpB = await atFrom("uint128:totalFeesCollected");
  const lpA = await options.toApi.multiCall({ abi: "uint128:totalFeesCollected", calls: targets });
  const plB = await atFrom("uint128:pendingPlatformFees");
  const plA = await options.toApi.multiCall({ abi: "uint128:pendingPlatformFees", calls: targets });
  const crB = await atFrom("uint128:pendingCreatorFees");
  const crA = await options.toApi.multiCall({ abi: "uint128:pendingCreatorFees", calls: targets });
  const plPaid = await options.getLogs({ targets, eventAbi: PLATFORM, flatten: false });
  const crPaid = await options.getLogs({ targets, eventAbi: CREATOR, flatten: false });
  const donated = await options.getLogs({ targets, eventAbi: DONATED, flatten: false });
  const sum = (logs: any[]) => (logs ?? []).reduce((s: bigint, l: any) => s + BigInt(l.amount), 0n);
  rooms.forEach((r, i) => {
    const t = r.token;
    const lp = BigInt(lpA[i]) - BigInt(lpB[i]) - sum(donated[i]);
    // pending fees grow with bets and drop when paid out: accrued in the window = change of pending + paid in the window
    const platform = BigInt(plA[i]) - BigInt(plB[i]) + sum(plPaid[i]);
    const creator = BigInt(crA[i]) - BigInt(crB[i]) + sum(crPaid[i]);
    dailyFees.add(t, lp + platform + creator, L.fees);
    dailySupplySideRevenue.add(t, lp, L.lpToStakers);
    dailyRevenue.add(t, platform, L.platformToBurn);
    dailySupplySideRevenue.add(t, creator, L.creatorToCreators);
  });
  return { dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue, dailyHoldersRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-09-27",
  methodology: {
    Fees: "Fees charged on bets in every V5, V6 and V7 room: the room stakers' fee (V5 / V6), the platform fee and the room creator's fee.",
    UserFees: "Fees charged on bets, paid by players.",
    Revenue: "The platform fee on bets, sent to the ElcasTreasury (V5) or the ElcasBurner (V6, V7).",
    HoldersRevenue: "The ElcasTreasury / ElcasBurner swaps the platform fee to $ELCAS and burns it.",
    SupplySideRevenue: "The fee kept by each room's pool for its stakers and the fee paid to each room's creator.",
  },
  breakdownMethodology: {
    Fees: {
      [L.fees]: "Fees charged on each bet: the room stakers' fee, the platform fee and the room creator's fee.",
    },
    Revenue: {
      [L.platformToBurn]: "Platform fee sent to the ElcasTreasury (V5) or the ElcasBurner (V6, V7), which buys and burns $ELCAS.",
    },
    HoldersRevenue: {
      [L.platformToBurn]: "Platform fee sent to the ElcasTreasury (V5) or the ElcasBurner (V6, V7), which buys and burns $ELCAS.",
    },
    SupplySideRevenue: {
      [L.lpToStakers]: "Fee kept by the room's pool, owned by its stakers (donations to the room are not counted here).",
      [L.creatorToCreators]: "Fee paid to the room's creator.",
    },
  },
};

export default adapter;
