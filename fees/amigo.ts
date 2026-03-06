import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const ROUTER = "0x4B48F3D1Ddc9e5793D4817517255e6beF6d72A7C";
const DEPLOY_BLOCK = 41117113;

const PoolCreatedEvent = "event PoolCreated(address indexed pool, address indexed creator, address indexed referrer, uint256 curveId)";
const SwapEvent = "event Swap(address indexed buyer, uint256 tokenAmount, uint256 price, uint256 fees, bool isBuy)";

const fetch = async ({ createBalances, getLogs, api }: FetchOptions) => {
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const poolLogs = await getLogs({
    target: ROUTER,
    eventAbi: PoolCreatedEvent,
    fromBlock: DEPLOY_BLOCK,
  });
  const pools = poolLogs.map((log: any) => log.pool);
  if (!pools.length) return { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue };

  const [swapLogs, feeParams] = await Promise.all([
    getLogs({ targets: pools, eventAbi: SwapEvent }),
    api.call({ target: ROUTER, abi: "function getTradeFeeParameters(address) view returns (address, uint96, address, uint96, address, uint96, address, uint96)", params: pools[0] }),
  ]);

  const creatorShareBPS = Number(feeParams[1]);
  const referrerShareBPS = Number(feeParams[3]);
  const protocolFeeBPS = Number(feeParams[5]);
  const rewardsPoolBPS = Number(feeParams[7]);
  const totalBPS = protocolFeeBPS + creatorShareBPS + referrerShareBPS + rewardsPoolBPS;

  for (const log of swapLogs) {
    const fees = log.fees;
    const volume = log.isBuy ? log.price - fees : log.price + fees;

    dailyVolume.addGasToken(volume);
    dailyFees.addGasToken(fees * BigInt(protocolFeeBPS) / BigInt(totalBPS), METRIC.TRADING_FEES);
    dailyFees.addGasToken(fees * BigInt(rewardsPoolBPS) / BigInt(totalBPS), 'Rewards Pool Fees');
    dailyFees.addGasToken(fees * BigInt(creatorShareBPS) / BigInt(totalBPS), METRIC.CREATOR_FEES);
    dailyFees.addGasToken(fees * BigInt(referrerShareBPS) / BigInt(totalBPS), 'Referral Fees');
    dailyRevenue.addGasToken(fees * BigInt(protocolFeeBPS) / BigInt(totalBPS));
    dailySupplySideRevenue.addGasToken(fees * BigInt(creatorShareBPS + referrerShareBPS + rewardsPoolBPS) / BigInt(totalBPS));
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ABSTRACT]: {
      fetch,
      start: "2026-02-18",
    },
  },
  methodology: {
    Fees: "All fees from key buy/sell trades (protocol + creator + referrer + rewards pool)",
    Revenue: "Protocol treasury's share of trading fees",
    ProtocolRevenue: "Protocol treasury's share of trading fees",
    SupplySideRevenue: "Fees distributed to creators, referrers, and the rewards pool",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "Protocol treasury's share of trading fees",
      'Rewards Pool Fees': "Fees allocated to the rewards pool",
      [METRIC.CREATOR_FEES]: "Fees paid to the key creator",
      'Referral Fees': "Fees paid to referrers",
    },
    Revenue: {
      [METRIC.TRADING_FEES]: "Protocol treasury's share of trading fees",
    },
    SupplySideRevenue: {
      [METRIC.CREATOR_FEES]: "Fees distributed to key creators",
      'Referral Fees': "Fees distributed to referrers",
      'Rewards Pool Fees': "Fees distributed to the rewards pool",
    },
  },
};

export default adapter;
