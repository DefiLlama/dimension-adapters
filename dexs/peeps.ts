import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// https://peeps.wtf/launchpad
// https://peeps-2.gitbook.io/peeps-docs
// Fee structure:
//   Bonding curve: 1.25% total — 0.40% creator / 0.85% protocol
// Post-graduation swaps execute on Uniswap V3 (already tracked by the
// uniswap-v3 adapter) and are not counted here to avoid double-counting.

const FACTORY = "0x138C1C551bAd0F1c43084ddbC79F5E78225Eb9dD";
const FACTORY_DEPLOY_BLOCK = 10814012;

const TOKEN_CREATED =
  "event TokenCreated(address indexed token, address indexed curve, address indexed creator, string name, string symbol, bytes32 metadataHash, string metadataUri, address pool, uint8 graduationCap, uint16 postGradCreatorShareBps)";
const TRADE =
  "event Trade(address indexed trader, bool indexed isBuy, uint256 ethAmount, uint256 tokenAmount, uint256 fee, uint256 virtualEthReserves, uint256 virtualTokenReserves, uint256 realEthReserves)";

// Bonding curve: 1.25% = 40 creator + 85 protocol out of 125
const CURVE_CREATOR_SHARE = 40n;
const CURVE_PROTOCOL_SHARE = 85n;
const CURVE_TOTAL_FEE = 125n;

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const tokenCreatedLogs = await options.getLogs({
    target: FACTORY,
    eventAbi: TOKEN_CREATED,
    fromBlock: FACTORY_DEPLOY_BLOCK,
    toBlock: await options.getToBlock(),
    cacheInCloud: true,
  });

  const curves: string[] = [];
  for (const log of tokenCreatedLogs) {
    curves.push(log.curve as string);
  }

  if (curves.length > 0) {
    const tradeLogs = await options.getLogs({ targets: curves, eventAbi: TRADE });
    for (const log of tradeLogs) {
      const fee = BigInt(log.fee);
      dailyVolume.addGasToken(log.ethAmount);
      dailyFees.addGasToken(fee, "Bonding Curve Fees");
      dailyRevenue.addGasToken((fee * CURVE_PROTOCOL_SHARE) / CURVE_TOTAL_FEE, "Bonding Curve Protocol Fees");
      dailySupplySideRevenue.addGasToken((fee * CURVE_CREATOR_SHARE) / CURVE_TOTAL_FEE, "Bonding Curve Creator Fees");
    }
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
  Volume: "ETH traded on PEEPS bonding curves.",
  Fees: "1.25% fee on every bonding-curve trade, 0.40% paid to the token creator and 0.85% allocated to the PEEPS.WTF platform and ecosystem.",
  Revenue: "0.85% platform fee from every bonding-curve trade, allocated to the PEEPS.WTF platform and ecosystem.",
  ProtocolRevenue: "0.85% platform fee from every bonding-curve trade, allocated to the PEEPS.WTF platform and ecosystem.",
  SupplySideRevenue: "0.40% creator fee from every bonding-curve trade, paid to the creator of the launched token.",
};

const breakdownMethodology = {
  Fees: {
    "Bonding Curve Fees": "1.25% fee on the ETH side of every bonding-curve buy and sell.",
  },
  Revenue: {
    "Bonding Curve Protocol Fees": "0.85% of bonding-curve trade fees allocated to the PEEPS protocol.",
  },
  ProtocolRevenue: {
    "Bonding Curve Protocol Fees": "0.85% of bonding-curve trade fees allocated to the PEEPS protocol.",
  },
  SupplySideRevenue: {
    "Bonding Curve Creator Fees": "0.40% of bonding-curve trade fees claimable by each token's creator.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ROBINHOOD]: {
      fetch,
      start: "2026-07-16",
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
