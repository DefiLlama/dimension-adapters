// DefiLlama dimension adapter for Based Alpha — volume, fees, revenue.
//
// Destination: dimension-adapters/fees/based-alpha/index.ts
// (optionally re-exported from dexs/based-alpha/index.ts so curve volume also
// shows on the DEX/volume dashboards — see docs/defillama/README.md).
// CHAIN.ROBINHOOD already exists in helpers/chains.ts.
//
// Every curve trade emits Trade(...) with the exact fee split, so all
// dimensions come from a single getLogs pass; migration fees come from
// Migrated(...). Verified against mainnet logs from deploy block 10227218.

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const LAUNCHPAD = "0x5640c62fe43a64f9ae0811114874e95a819db744";

const TRADE_EVENT =
  "event Trade(address indexed token, address indexed trader, bool isBuy, uint256 ethAmount, uint256 tokenAmount, uint256 protocolFee, uint256 creatorFee, uint256 virtualEth, uint256 virtualToken, uint256 tokensSold)";
const MIGRATED_EVENT =
  "event Migrated(address indexed token, address indexed pool, uint256 ethAdded, uint256 tokensAdded, uint256 migrationFee)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const trades = await options.getLogs({ target: LAUNCHPAD, eventAbi: TRADE_EVENT });
  for (const t of trades) {
    // ethAmount is the gross ETH side of the trade (fees included on buys,
    // pre-fee proceeds on sells) — the launchpad's notional curve volume.
    dailyVolume.addGasToken(t.ethAmount);
    dailyFees.addGasToken(t.protocolFee + t.creatorFee);
    dailyRevenue.addGasToken(t.protocolFee);
    // Creator fees accrue to the token creator (pump.fun-style) — supply side.
    dailySupplySideRevenue.addGasToken(t.creatorFee);
  }

  const migrations = await options.getLogs({ target: LAUNCHPAD, eventAbi: MIGRATED_EVENT });
  for (const m of migrations) {
    dailyFees.addGasToken(m.migrationFee);
    dailyRevenue.addGasToken(m.migrationFee);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Gross ETH notional of every bonding-curve buy and sell on the launchpad.",
  Fees: "1.25% trade fee (0.95% protocol + 0.30% creator) on every curve trade, plus the flat migration fee skimmed when a token graduates to Based DEX.",
  Revenue: "Protocol share of trade fees plus migration fees.",
  ProtocolRevenue: "Same as Revenue — all protocol fees accrue to the fee recipient.",
  SupplySideRevenue: "Creator share of trade fees (0.30%), claimable by each token's creator.",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ROBINHOOD]: {
      fetch,
      start: "2026-07-15",
      meta: { methodology },
    },
  },
};

export default adapter;
