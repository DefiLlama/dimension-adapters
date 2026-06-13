import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const ROUTER = "0x4B48F3D1Ddc9e5793D4817517255e6beF6d72A7C";
const DEPLOY_BLOCK = 41117113;

const PoolCreatedEvent = "event PoolCreated(address indexed pool, address indexed creator, address indexed referrer, uint256 curveId)";
const SwapEvent = "event Swap(address indexed buyer, uint256 tokenAmount, uint256 price, uint256 fees, bool isBuy)";
const GetTradeFeeParametersFunction = "function getTradeFeeParameters(address) view returns (address, uint96, address, uint96, address, uint96, address, uint96)";

const fetch = async ({ createBalances, getLogs, api }: FetchOptions) => {
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const poolLogs = await getLogs({
    target: ROUTER,
    eventAbi: PoolCreatedEvent,
    fromBlock: DEPLOY_BLOCK,
    cacheInCloud: true,
  });
  const pools = poolLogs.map((log: any) => log.pool);
  if (!pools.length) return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
  // Fee params are currently uniform across all pools; fetching from pools[0] is sufficient
  const swapLogs = await getLogs({ targets: pools, eventAbi: SwapEvent });
  const feeParams = await api.call({ target: ROUTER, abi: GetTradeFeeParametersFunction, params: pools[0] });

  const creatorShareBPS = Number(feeParams[1]);
  const referrerShareBPS = Number(feeParams[3]);
  const protocolFeeBPS = Number(feeParams[5]);
  const rewardsPoolBPS = Number(feeParams[7]);
  const totalBPS = protocolFeeBPS + creatorShareBPS + referrerShareBPS + rewardsPoolBPS;

  for (const log of swapLogs) {
    const fees = log.fees;
    const volume = log.isBuy ? log.price - fees : log.price + fees;

    const rewardsAmount = fees * BigInt(rewardsPoolBPS) / BigInt(totalBPS);
    const creatorAmount = fees * BigInt(creatorShareBPS) / BigInt(totalBPS);
    const referrerAmount = fees * BigInt(referrerShareBPS) / BigInt(totalBPS);
    const protocolAmount = fees - rewardsAmount - creatorAmount - referrerAmount;

    dailyVolume.addGasToken(volume);
    dailyFees.addGasToken(protocolAmount, METRIC.TRADING_FEES);
    dailyFees.addGasToken(rewardsAmount, 'Rewards Pool Fees');
    dailyFees.addGasToken(creatorAmount, METRIC.CREATOR_FEES);
    dailyFees.addGasToken(referrerAmount, 'Referral Fees');

    dailyRevenue.addGasToken(protocolAmount, METRIC.TRADING_FEES);

    dailySupplySideRevenue.addGasToken(creatorAmount, METRIC.CREATOR_FEES);
    dailySupplySideRevenue.addGasToken(rewardsAmount, 'Rewards Pool Fees');
    dailySupplySideRevenue.addGasToken(referrerAmount, 'Referral Fees');
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const methodology = {
    Fees: "All fees from key buy/sell trades (protocol + creator + referrer + rewards pool)",
    Revenue: "Protocol treasury's share of trading fees",
    ProtocolRevenue: "Protocol treasury's share of trading fees",
    SupplySideRevenue: "Fees distributed to creators, referrers, and the rewards pool",
}

const breakdownMethodology = {
    Fees: {
        [METRIC.TRADING_FEES]: "Protocol treasury's share of trading fees",
        'Rewards Pool Fees': "Fees allocated to the rewards pool",
        [METRIC.CREATOR_FEES]: "Fees paid to the key creator",
        'Referral Fees': "Fees paid to referrers",
    },
    Revenue: {
        [METRIC.TRADING_FEES]: "Protocol treasury's share of trading fees",
    },
    ProtocolRevenue: {
        [METRIC.TRADING_FEES]: "Protocol treasury's share of trading fees",
    },
    SupplySideRevenue: {
        [METRIC.CREATOR_FEES]: "Fees paid to the key creator",
        'Rewards Pool Fees': "Fees allocated to the rewards pool",
        'Referral Fees': "Fees paid to referrers",
    },
}

const adapter: Adapter = {
  version: 2,
  fetch,
  pullHourly: true,
  chains: [CHAIN.ABSTRACT],
  start: "2026-02-18",
  methodology,
  breakdownMethodology,
};

export default adapter;
