import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Clutch Anvil AMM — permissionless NFT AMM. Each market deploys an
// `NFTAMMVault` that swaps an ERC20 token (paired 1:N to a specific NFT
// collection) against NFT inventory. Buys/sells emit:
//
//   event NFTSold(
//     address indexed seller, uint256 indexed tokenId,
//     uint256 grossPayout, uint256 netPayout,
//     uint256 protocolFee, uint256 stakerFee
//   )
//   event NFTBought(
//     address indexed buyer, uint256 indexed tokenId,
//     uint256 totalCost, uint256 baseCost,
//     uint256 protocolFee, uint256 stakerFee, bool isSpecific
//   )
//
// Volume = sum of `totalCost` (buys) + `grossPayout` (sells), denominated
// in each market's own ERC20 token. DefiLlama prices the tokens into USD.
//
// Fees = sum of `protocolFee + stakerFee` from both events. Protocol fee is
// burned (deflationary on the token), staker fee streams to the staking
// vault as rewards. We expose the full fee tranche as protocol revenue.

const chainsConfig: Record<string, { factory: string; fromBlock: number; start: string }> = {
  [CHAIN.ETHEREUM]: {
    factory: "0xEA095646EC6A56EDbFEe84cCcf23eFCec12566A0",
    fromBlock: 24720104,
    start: "2026-03-23",
  },
  [CHAIN.BASE]: {
    factory: "0x5ef900789a0faa1fDE3e9796441B62b66f0ab2Aa",
    fromBlock: 45593260,
    start: "2026-04-01",
  },
  [CHAIN.APECHAIN]: {
    factory: "0x87B62309B6fF4FA184C89919351bEbd3AC11Fc84",
    fromBlock: 34900822,
    start: "2026-02-15",
  },
};

const MARKET_CREATED_ABI =
  "event MarketCreated(uint256 indexed marketId, address indexed collection, address indexed token, address escrow, address ammVault, address loanVault, address stakingVault, address governor, bool governanceEnabled)";

const NFT_BOUGHT_ABI =
  "event NFTBought(address indexed buyer, uint256 indexed tokenId, uint256 totalCost, uint256 baseCost, uint256 protocolFee, uint256 stakerFee, bool isSpecific)";

const NFT_SOLD_ABI =
  "event NFTSold(address indexed seller, uint256 indexed tokenId, uint256 grossPayout, uint256 netPayout, uint256 protocolFee, uint256 stakerFee)";

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const { chain, createBalances, getLogs } = options;
  const { factory, fromBlock } = chainsConfig[chain];

  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailySupplySideRevenue = createBalances();  

  const markets = await getLogs({
    target: factory,
    fromBlock,
    eventAbi: MARKET_CREATED_ABI, 
    cacheInCloud: true,
  });

  const ammByToken = new Map<string, string>();
  markets.forEach((m: any) => {
    if (!m?.ammVault || !m?.token) return;
    ammByToken.set(m.ammVault.toLowerCase(), m.token.toLowerCase());
  });

  const ammVaults = Array.from(ammByToken.keys());
  if (ammVaults.length === 0) {
    return { dailyVolume, dailyFees, dailyRevenue: 0, dailySupplySideRevenue };
  }

  const [buyLogs, sellLogs] = await Promise.all([
    getLogs({
      targets: ammVaults,
      eventAbi: NFT_BOUGHT_ABI,
      flatten: true,
      entireLog: true,
      parseLog: true,
    }),
    getLogs({
      targets: ammVaults,
      eventAbi: NFT_SOLD_ABI,
      flatten: true,
      entireLog: true,
      parseLog: true,
    }),
  ]);

  for (const log of buyLogs) {
    const args = log.args;
    const vault = log.address.toLowerCase();
    const token = ammByToken.get(vault);
    if (!token) continue;
    dailyVolume.add(token, args.totalCost);
    dailyFees.add(token, (args.protocolFee + args.stakerFee), METRIC.TRADING_FEES);
    dailySupplySideRevenue.add(token, args.protocolFee, 'Fees to NFT burn');
    dailySupplySideRevenue.add(token, args.stakerFee, 'Fees to NFT stakers');
  }

  for (const log of sellLogs) {
    const args = log.args;
    const vault = log.address.toLowerCase();
    const token = ammByToken.get(vault);
    if (!token) continue;
    dailyVolume.add(token, args.grossPayout);
    dailyFees.add(token, (args.protocolFee + args.stakerFee), METRIC.TRADING_FEES);
    dailySupplySideRevenue.add(token, args.protocolFee, 'Fees to NFT burn');
    dailySupplySideRevenue.add(token, args.stakerFee, 'Fees to NFT stakers');
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: 0,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Sum of buy totalCost and sell grossPayout from NFTBought + NFTSold events across every AMM vault deployed by the Clutch Anvil factory.",
  Fees: "Sum of protocolFee + stakerFee fields from NFTBought + NFTSold events. Protocol fee is burned; staker fee streams to the NFT staking vault as rewards.",
  Revenue: "No revenue",
  SupplySideRevenue: "Includes NFTs burned from protocol revenue and staker fees distributed to the NFT stakers",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Sum of protocolFee + stakerFee fields from NFTBought + NFTSold events. Protocol fee is burned; staker fee streams to the NFT staking vault as rewards.",
  },
  SupplySideRevenue: {
    'Fees to NFT burn': "Sum of protocolFee fields from NFTBought + NFTSold events. Protocol fee is burned directly rewarding NFT holders (supply side)",
    'Fees to NFT stakers': "Sum of stakerFee fields from NFTBought + NFTSold events. Staker fee streams to the NFT staking vault as rewards.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainsConfig,
  methodology,
  breakdownMethodology,
};

export default adapter;
