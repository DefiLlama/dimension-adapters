import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";

// Launchpad creates every fund (Coin, Fund, Mine, Uniswap v4 pool behind the FullRange hook).
const LAUNCHPAD = "0x6ff3828435e96E343678E58F4677Da1dcEEE0C17";
const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";

// FullRange gives the creator side 70% of realized swap fees and the protocol 30%.
const PROTOCOL_SHARE_BPS = 3000n;

const launchAbi = "function getLaunch(uint256) view returns ((uint256 launchId, uint256 creatorNonce, address originalCreator, address controller, address coin, address fund, address signalCoin, address resonance, address resonanceRouter, address mine, address pool, address baseToken, uint24 swapFee, bytes32 poolId, address[] paymentTokens, address[] auctions, address[] bribes, address[] bribeRouters, uint256 baseSeedAmount, uint256 coinSeedAmount, uint256 creatorCoinAmount, uint256 depositedBaseAmount, uint256 depositedCoinAmount, uint256 burnedCoinDust, uint256 genesisShares, uint160 sqrtPriceX96, bool autoSignalCreator, bool receiveSwapFees, uint256[] creatorSignalAmounts, uint256[] initialAuctionPrices))";
const SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";
const swapEvent = "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Fund addresses never change, so discovery reads current state (public RPCs here do not serve historical state)
  const api = new sdk.ChainApi({ chain: options.chain });
  const count = await api.call({ target: LAUNCHPAD, abi: "uint256:launchCount" });
  const ids = Array.from({ length: Number(count) }, (_, i) => i + 1);
  const launches = await api.multiCall({ target: LAUNCHPAD, abi: launchAbi, calls: ids });

  const mines = launches.map((l: any) => l.mine);
  // Each Mine is paid in its fund's base token (USDG for most funds)
  const paymentTokens = await api.multiCall({ abi: "address:usdg", calls: mines });
  const paymentTokenOf: Record<string, string> = {};
  mines.forEach((mine: string, i: number) => paymentTokenOf[mine.toLowerCase()] = paymentTokens[i]);

  // Mining payments. The 80% paid to the outgoing miner is a transfer between miners and is not a fee.
  const [protocolLogs, creatorLogs, fundLogs] = await Promise.all([
    options.getLogs({ targets: mines, eventAbi: "event ProtocolFeeAccrued(address indexed beneficiary, uint256 indexed epochId, uint256 amount)", onlyArgs: false }),
    options.getLogs({ targets: mines, eventAbi: "event CreatorFeeAccrued(address indexed beneficiary, uint256 indexed epochId, uint256 amount)", onlyArgs: false }),
    options.getLogs({ targets: mines, eventAbi: "event RevenueDeposited(uint256 indexed epochId, address indexed revenueRouter, uint256 amount)", onlyArgs: false }),
  ]);
  const tokenOf = (log: any) => paymentTokenOf[log.address.toLowerCase()];
  protocolLogs.forEach((log: any) => {
    dailyFees.add(tokenOf(log), log.args.amount, "Mining Fees");
    dailyRevenue.add(tokenOf(log), log.args.amount, "Mining Fees To Protocol");
  });
  creatorLogs.forEach((log: any) => {
    dailyFees.add(tokenOf(log), log.args.amount, "Mining Fees");
    dailySupplySideRevenue.add(tokenOf(log), log.args.amount, "Mining Fees To Creators");
  });
  fundLogs.forEach((log: any) => {
    dailyFees.add(tokenOf(log), log.args.amount, "Mining Fees");
    dailySupplySideRevenue.add(tokenOf(log), log.args.amount, "Mining Fees To Funds");
  });

  // Swap fees on fund pools, counted at swap time from the PoolManager Swap event (FullRange only realizes them later,
  // on collect). Only pools created by the Launchpad count. Each fee is valued on the pool's base-token side
  // (mostly USDG), so fees on swaps paid in unpriced fund coins are still counted.
  const poolById: Record<string, any> = {};
  launches.forEach((l: any) => poolById[l.poolId.toLowerCase()] = l);
  // Filter by pool id at the RPC so only Launchpad pools' swaps are fetched, not every swap on the PoolManager
  const swapLogs = await options.getLogs({ target: POOL_MANAGER, eventAbi: swapEvent, topics: [SWAP_TOPIC, Object.keys(poolById)] as any });
  swapLogs.forEach((log: any) => {
    const l = poolById[log.id.toLowerCase()];
    if (!l) return;
    // Uniswap v4 orders a pool's currencies by address
    const baseIsCurrency0 = l.baseToken.toLowerCase() < l.coin.toLowerCase();
    const baseAmount = BigInt(baseIsCurrency0 ? log.amount0 : log.amount1);
    const fee = (baseAmount < 0n ? -baseAmount : baseAmount) * BigInt(log.fee) / 1_000_000n;
    const protocolAmount = fee * PROTOCOL_SHARE_BPS / 10_000n;
    dailyFees.add(l.baseToken, fee, "Swap Fees");
    dailySupplySideRevenue.add(l.baseToken, fee - protocolAmount, "Swap Fees To Creators And Funds");
    dailyRevenue.add(l.baseToken, protocolAmount, "Swap Fees To Protocol");
  });

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Mining payments kept by the protocol, fund creators and funds (everything except the 80% paid to the outgoing miner), plus swap fees charged on Uniswap v4 pools created by the GlazeCorp Launchpad, counted when each swap happens.",
  UserFees: "Mining payments and swap fees paid by users, excluding the 80% of each mining payment that goes to the outgoing miner.",
  Revenue: "The protocol fee on each mining payment (currently 0.5%) and 30% of swap fees on Launchpad pools.",
  ProtocolRevenue: "The protocol fee on each mining payment (currently 0.5%) and 30% of swap fees on Launchpad pools, sent to the GlazeCorp treasury.",
  SupplySideRevenue: "The creator fee on each mining payment, the rest of each mining payment sent to the fund to buy assets for fund coin holders, and 70% of swap fees on Launchpad pools paid to the fund or its creator.",
};

const breakdownMethodology = {
  Fees: {
    "Mining Fees": "The part of each mining payment, in the fund's base token (mostly USDG), that is not paid to the outgoing miner: the protocol fee, the creator fee and the share sent to the fund. When a Mine has no outgoing miner, that share also goes to the fund.",
    "Swap Fees": "Swap fees charged on Uniswap v4 pools created by the GlazeCorp Launchpad, counted when each swap happens and valued on the pool's base-token side. Each pool's fee rate is fixed at launch (0.01% to 10%).",
  },
  UserFees: {
    "Mining Fees": "The part of each mining payment paid by miners that is not passed to the outgoing miner.",
    "Swap Fees": "Swap fees paid by traders on Uniswap v4 pools created by the GlazeCorp Launchpad.",
  },
  Revenue: {
    "Mining Fees To Protocol": "Protocol fee on each mining payment (currently 0.5%), set on the Launchpad.",
    "Swap Fees To Protocol": "30% of swap fees on Launchpad pools.",
  },
  ProtocolRevenue: {
    "Mining Fees To Protocol": "Protocol fee on each mining payment (currently 0.5%), sent to the GlazeCorp treasury.",
    "Swap Fees To Protocol": "30% of swap fees on Launchpad pools, sent to the GlazeCorp treasury.",
  },
  SupplySideRevenue: {
    "Mining Fees To Creators": "Creator fee on each mining payment (0.5% by default; the creator can set it between 0.01% and 2%).",
    "Mining Fees To Funds": "The rest of each mining payment, sent to the fund to buy assets for fund coin holders.",
    "Swap Fees To Creators And Funds": "70% of swap fees on Launchpad pools, paid to the fund or to the fund creator.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-10-29",
  methodology,
  breakdownMethodology,
};

export default adapter;
