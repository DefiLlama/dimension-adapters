import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

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

const FACTORY_BY_CHAIN: Record<string, { factory: string; fromBlock: number }> = {
  [CHAIN.ETHEREUM]: {
    factory: "0xEA095646EC6A56EDbFEe84cCcf23eFCec12566A0",
    fromBlock: 24720104,
  },
  [CHAIN.BASE]: {
    factory: "0x5ef900789a0faa1fDE3e9796441B62b66f0ab2Aa",
    fromBlock: 45593260,
  },
  [CHAIN.APECHAIN]: {
    factory: "0x87B62309B6fF4FA184C89919351bEbd3AC11Fc84",
    fromBlock: 34900822,
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
  const { factory, fromBlock } = FACTORY_BY_CHAIN[chain];

  const dailyVolume = createBalances();
  const dailyFees = createBalances();

  const markets = await getLogs({
    target: factory,
    fromBlock,
    eventAbi: MARKET_CREATED_ABI,
    onlyArgs: true,
    cacheInCloud: true,
  });

  const ammByToken = new Map<string, string>();
  markets.forEach((m: any) => {
    if (!m?.ammVault || !m?.token) return;
    ammByToken.set(m.ammVault.toLowerCase(), m.token.toLowerCase());
  });

  const ammVaults = Array.from(ammByToken.keys());
  if (ammVaults.length === 0) {
    return { dailyVolume, dailyFees, dailyRevenue: dailyFees };
  }

  const [buyLogs, sellLogs] = await Promise.all([
    getLogs({
      targets: ammVaults,
      eventAbi: NFT_BOUGHT_ABI,
      flatten: true,
      entireLog: true,
    }),
    getLogs({
      targets: ammVaults,
      eventAbi: NFT_SOLD_ABI,
      flatten: true,
      entireLog: true,
    }),
  ]);

  for (const log of buyLogs) {
    const vault = (log.address || log.source || "").toLowerCase();
    const token = ammByToken.get(vault);
    if (!token) continue;
    const totalCost = BigInt(log.args?.totalCost ?? log.totalCost ?? 0);
    const protocolFee = BigInt(log.args?.protocolFee ?? log.protocolFee ?? 0);
    const stakerFee = BigInt(log.args?.stakerFee ?? log.stakerFee ?? 0);
    dailyVolume.add(token, totalCost.toString());
    dailyFees.add(token, (protocolFee + stakerFee).toString());
  }

  for (const log of sellLogs) {
    const vault = (log.address || log.source || "").toLowerCase();
    const token = ammByToken.get(vault);
    if (!token) continue;
    const grossPayout = BigInt(log.args?.grossPayout ?? log.grossPayout ?? 0);
    const protocolFee = BigInt(log.args?.protocolFee ?? log.protocolFee ?? 0);
    const stakerFee = BigInt(log.args?.stakerFee ?? log.stakerFee ?? 0);
    dailyVolume.add(token, grossPayout.toString());
    dailyFees.add(token, (protocolFee + stakerFee).toString());
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2026-03-23",
      meta: {
        methodology: {
          Volume:
            "Sum of buy totalCost and sell grossPayout from NFTBought + NFTSold events across every AMM vault deployed by the Clutch Anvil factory.",
          Fees:
            "Sum of protocolFee + stakerFee fields from NFTBought + NFTSold events. Protocol fee is burned; staker fee streams to the NFT staking vault as rewards.",
          Revenue:
            "Equal to Fees — the entire fee tranche is returned to the protocol (burn) or to NFT stakers.",
        },
      },
    },
    [CHAIN.BASE]: {
      fetch,
      start: "2026-04-01",
    },
    [CHAIN.APECHAIN]: {
      fetch,
      start: "2026-02-15",
    },
  },
};

export default adapter;
