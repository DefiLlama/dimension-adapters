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
// out inside the window.
const FACTORIES_V5 = [
  "0x5B9dF3831d50af1b02AE0bdF3061C744C45087b0", "0xbf976d1b6efF1B047f8aE2A5d6259D689b4A536B", "0x4E83A441F280fE9a07DeB88a4a3F4D14Bf5400Eb",
  "0x9b5037eF17598Ff5B6C16d6a9e027c72897828eB", "0x08A9DF94F9C5DE378A283cC4a44Da09909CE3Ab6", "0xCa6F1bE59C06EA6E14412A387eD5f3bCb71B2248",
  "0x5231c0282025799aB38b317F89470C6b7C153A77", "0x7E8bA129e445771dc7a514D5F9E1179a23c1beb4", "0x31929aCE4FBa4C9c98A29559b1aA8D5cf18414a7",
  "0x15DdCF1C6F7CB8A7dfBb9aca792F6CbAcABAa27f", "0xd2Bf1fe7D418C011c8A2b2bD64298Dd3ed9cEF80", "0xae7994D4e25f2965367B55950A1a95a930Aa554A",
  "0x10e02DD0F131Cbb55a97fef5b724541B8A6b378C", "0x6751dD9ADBCE7913Fea529FDe5E561422D017725", "0x553220711d5683205a2644a77755Ba6f7E34b31b",
  "0x25Ac8B77B8e32B1eA9C431127679e4Ff11eC4FA4", "0x7C7ad1370a26E1a7e67A778E9C9820637f76BC1d", "0x796d695569520BE3963CB620A3a3c53b92B606a4",
  "0x64D84eAcEdEe214995d1b30febD8720131DAEE9f", "0x2935fDb03C2F4f4fb32D29032F46357706519268", "0x6dFF48299Ac1Ff559DcEdDDf28AF3B1e5140c6A4",
];
const GET_GAMES = "function getGames(uint256 offset, uint256 limit) view returns (tuple(address gameAddress, address owner, address creator, address token, string tokenLogoUrl, string betName, uint256 createdAt)[])";
const PLATFORM = "event PlatformFeeCollected(uint256 amount)";
const CREATOR = "event CreatorFeeCollected(uint256 amount)";

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
  const totals: number[] = await options.api.multiCall({ abi: "uint256:getTotalGames", calls: FACTORIES_V5 });
  const calls: any[] = [];
  FACTORIES_V5.forEach((f, i) => { for (let o = 0; o < Number(totals[i]); o += 200) calls.push({ target: f, params: [o, 200] }); });
  const rooms: any[] = (await options.api.multiCall({ abi: GET_GAMES, calls })).flat();
  const targets = rooms.map((r) => r.gameAddress);
  const lpB = await options.fromApi.multiCall({ abi: "uint128:totalFeesCollected", calls: targets });
  const lpA = await options.toApi.multiCall({ abi: "uint128:totalFeesCollected", calls: targets });
  const plB = await options.fromApi.multiCall({ abi: "uint128:pendingPlatformFees", calls: targets });
  const plA = await options.toApi.multiCall({ abi: "uint128:pendingPlatformFees", calls: targets });
  const crB = await options.fromApi.multiCall({ abi: "uint128:pendingCreatorFees", calls: targets });
  const crA = await options.toApi.multiCall({ abi: "uint128:pendingCreatorFees", calls: targets });
  const plPaid = await options.getLogs({ targets, eventAbi: PLATFORM, flatten: false });
  const crPaid = await options.getLogs({ targets, eventAbi: CREATOR, flatten: false });
  const sum = (logs: any[]) => (logs ?? []).reduce((s: bigint, l: any) => s + BigInt(l.amount), 0n);
  rooms.forEach((r, i) => {
    const t = r.token;
    const lp = BigInt(lpA[i]) - BigInt(lpB[i]);
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
    Fees: "Fees charged on bets in every V5 room: the room stakers' fee, the platform fee and the room creator's fee.",
    UserFees: "Fees charged on bets.",
    Revenue: "The platform fee, sent to the ElcasTreasury.",
    HoldersRevenue: "The ElcasTreasury swaps the platform fee to $ELCAS and burns it.",
    SupplySideRevenue: "The fee kept by each room's pool for its stakers and the fee paid to each room's creator.",
  },
  breakdownMethodology: {
    Fees: {
      [L.fees]: "Fees charged on each bet: the room stakers' fee, the platform fee and the room creator's fee.",
    },
    Revenue: {
      [L.platformToBurn]: "Platform fee sent to the ElcasTreasury, which buys and burns $ELCAS.",
    },
    HoldersRevenue: {
      [L.platformToBurn]: "Platform fee sent to the ElcasTreasury, which buys and burns $ELCAS.",
    },
    SupplySideRevenue: {
      [L.lpToStakers]: "Fee kept by the room's pool, owned by its stakers.",
      [L.creatorToCreators]: "Fee paid to the room's creator.",
    },
  },
};

export default adapter;
