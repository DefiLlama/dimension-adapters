import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

// EL-Casino Launchpad (https://elcas.app/#/launch) — ElcasLaunchpad 0xAeB56aEdA96d56d43Eee63658397BAC3f950B6be on
// Robinhood Chain, live 2026-10-24 (source verified on Sourcify). A launch mints 1B tokens: 90 % go into the token's own
// TOKEN/WETH 1 % Uniswap V3 pool as a position the launchpad owns forever (locked), 10 % to its game reserve, which opens
// a casino room for the token in every EL-Casino game and, once the pool holds 4.2 WETH, its perps and predict markets.
//
// Fees:
//   · the 1 % Uniswap V3 fee of every trade in a launch token's pool: the launchpad's position earns it, and collect(token)
//     pulls it and splits it in three in the same transaction (FeesCollected: tokens / weth = the whole collect,
//     creatorTokens / creatorWeth = one third): a third to the token's creator, a third to the ElcasBurner (sells it for
//     ETH, buys $ELCAS and burns it), the rest to the game reserve, which donates it to the token's casino rooms and
//     markets (their stakers). Counted when collected.
//   · the launch fee: a fixed amount of ETH (launchFee(), immutable) sent straight to the ElcasBurner by every launch.
// No TVL: the pools' liquidity is Uniswap V3 liquidity. Until 2026-10-26 these pool fees were counted under the
// el-casino fees adapter, which now leaves them to this listing.

const LAUNCHPAD = "0xAeB56aEdA96d56d43Eee63658397BAC3f950B6be";
const WETH = ADDRESSES.robinhood.WETH;
const FEES_COLLECTED = "event FeesCollected(address indexed token, uint256 tokens, uint256 weth, uint256 creatorTokens, uint256 creatorWeth)";
const LAUNCHED = "event Launched(address indexed token, address indexed creator, address pool, uint256 positionId, uint256 initialBuy, string name, string symbol)";

const L = {
  poolFees: "Launch Token Pool Fees",
  launchFees: "Token Launch Fees",
  poolToCreators: "Pool Fees To Token Creators",
  poolToGames: "Pool Fees To The Token's Game Stakers",
  poolToBurn: "Pool Fees To ELCAS Buyback And Burn",
  launchToBurn: "Launch Fees To ELCAS Buyback And Burn",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // pool fees, in the launch token (sells pay the fee in it) and in WETH (buys): a third each to the creator, the
  // games and the burn — the contract takes the creator's and the burner's third as total / 3, the games get the rest
  const collects = await options.getLogs({ target: LAUNCHPAD, eventAbi: FEES_COLLECTED });
  const split = (token: string, total: bigint, third: bigint) => {
    dailyFees.add(token, total, L.poolFees);
    dailySupplySideRevenue.add(token, third, L.poolToCreators);
    dailySupplySideRevenue.add(token, total - 2n * third, L.poolToGames);
    dailyRevenue.add(token, third, L.poolToBurn);
  };
  collects.forEach((c: any) => {
    split(c.token, BigInt(c.tokens), BigInt(c.creatorTokens));
    split(WETH, BigInt(c.weth), BigInt(c.creatorWeth));
  });

  // the launch fee of every launch in the window
  const launches = await options.getLogs({ target: LAUNCHPAD, eventAbi: LAUNCHED });
  if (launches.length) {
    const fee = BigInt(await options.toApi.call({ target: LAUNCHPAD, abi: "uint256:launchFee" }));
    dailyFees.add(WETH, fee * BigInt(launches.length), L.launchFees);
    dailyRevenue.add(WETH, fee * BigInt(launches.length), L.launchToBurn);
  }

  return { dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue, dailyHoldersRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
};

const methodology = {
  Fees: "The 1% Uniswap V3 fee of every trade in a launchpad token's pool (collected by the launchpad, which owns the pool's liquidity), plus the fixed ETH fee paid for every token launch.",
  UserFees: "Traders pay the pool fee; token creators pay the launch fee.",
  Revenue: "The platform's third of the pool fees and the whole launch fee, both sent to the ElcasBurner.",
  HoldersRevenue: "The ElcasBurner sells what it receives for ETH, buys $ELCAS and burns it.",
  SupplySideRevenue: "A third of the pool fees paid to the token's creator, and a third donated to the token's casino rooms and perps / predict markets, earned by their stakers.",
};

const breakdownMethodology = {
  Fees: {
    [L.poolFees]: "1% fee of every trade in a launchpad token's Uniswap V3 pool, collected by the launchpad.",
    [L.launchFees]: "Fixed ETH fee (launchFee) paid with every token launch.",
  },
  UserFees: {
    [L.poolFees]: "1% fee of every trade in a launchpad token's Uniswap V3 pool, paid by traders.",
    [L.launchFees]: "Fixed ETH fee paid by the token's creator at launch.",
  },
  Revenue: {
    [L.poolToBurn]: "A third of the pool fees, sent to the ElcasBurner, which buys and burns $ELCAS.",
    [L.launchToBurn]: "The launch fee, sent to the ElcasBurner, which buys and burns $ELCAS.",
  },
  HoldersRevenue: {
    [L.poolToBurn]: "A third of the pool fees, sent to the ElcasBurner, which buys and burns $ELCAS.",
    [L.launchToBurn]: "The launch fee, sent to the ElcasBurner, which buys and burns $ELCAS.",
  },
  SupplySideRevenue: {
    [L.poolToCreators]: "A third of the pool fees, paid to the token's creator.",
    [L.poolToGames]: "A third of the pool fees, donated to the token's casino rooms and perps / predict markets — earned by their stakers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-10-24",
  methodology,
  breakdownMethodology,
};

export default adapter;
