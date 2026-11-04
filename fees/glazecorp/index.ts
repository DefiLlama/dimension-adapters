import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";

// Launchpad creates every fund (Coin, Fund, Mine, Uniswap v4 pool); FullRange is the Uniswap v4 hook that credits swap fees.
const LAUNCHPAD = "0x6ff3828435e96E343678E58F4677Da1dcEEE0C17";
const FULLRANGE = "0x07B80789253aE7a4c5BC3d56B84Ac9e639F92800";

const launchComponentsAbi = "function getLaunchComponents(uint256) view returns ((address coin, address fund, address pool, address mine, address resonance, address resonanceRouter))";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Fund addresses never change, so discovery reads current state (public RPCs here do not serve historical state)
  const api = new sdk.ChainApi({ chain: options.chain });
  const count = await api.call({ target: LAUNCHPAD, abi: "uint256:launchCount" });
  const ids = Array.from({ length: Number(count) }, (_, i) => i + 1);
  const launches = await api.multiCall({ target: LAUNCHPAD, abi: launchComponentsAbi, calls: ids });

  const mines = launches.map((l: any) => l.mine);
  const pools = new Set(launches.map((l: any) => l.pool.toLowerCase()));
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

  // Swap fees on fund pools. FullRange registration is permissionless, so only pools created by the Launchpad count.
  const swapFeeLogs = await options.getLogs({
    target: FULLRANGE,
    eventAbi: "event FeesCredited(bytes32 indexed poolId, address indexed pool, address indexed token, uint256 creatorAmount, uint256 protocolAmount)",
  });
  swapFeeLogs.forEach((log: any) => {
    if (!pools.has(log.pool.toLowerCase())) return;
    dailyFees.add(log.token, log.creatorAmount, "Swap Fees");
    dailyFees.add(log.token, log.protocolAmount, "Swap Fees");
    dailySupplySideRevenue.add(log.token, log.creatorAmount, "Swap Fees To Creators And Funds");
    dailyRevenue.add(log.token, log.protocolAmount, "Swap Fees To Protocol");
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
  Fees: "Mining payments kept by the protocol, fund creators and funds (everything except the 80% paid to the outgoing miner), plus swap fees charged on Uniswap v4 pools created by the GlazeCorp Launchpad. Fees paid in fund coins are not valued because those coins have no price.",
  UserFees: "Mining payments and swap fees paid by users, excluding the 80% of each mining payment that goes to the outgoing miner. Fees paid in fund coins are not valued.",
  Revenue: "The protocol fee on each mining payment (currently 0.5%) and 30% of swap fees on Launchpad pools.",
  ProtocolRevenue: "The protocol fee on each mining payment (currently 0.5%) and 30% of swap fees on Launchpad pools, sent to the GlazeCorp treasury.",
  SupplySideRevenue: "The creator fee on each mining payment, the rest of each mining payment sent to the fund to buy assets for fund coin holders, and 70% of swap fees on Launchpad pools paid to the fund or its creator.",
};

const breakdownMethodology = {
  Fees: {
    "Mining Fees": "The part of each mining payment, in the fund's base token (mostly USDG), that is not paid to the outgoing miner: the protocol fee, the creator fee and the share sent to the fund. When a Mine has no outgoing miner, that share also goes to the fund.",
    "Swap Fees": "Swap fees credited by the FullRange hook on Uniswap v4 pools created by the GlazeCorp Launchpad. Each pool's fee rate is fixed at launch (0.01% to 10%). Fees paid in fund coins are not valued.",
  },
  Revenue: {
    "Mining Fees To Protocol": "Protocol fee on each mining payment (currently 0.5%), set on the Launchpad.",
    "Swap Fees To Protocol": "30% of swap fees on Launchpad pools.",
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
