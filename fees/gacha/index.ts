import type { SimpleAdapter } from "../../adapters/types";
import type { FetchOptions, FetchResultV2, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const gachaContract = "0x3272596F776470D2D7C3f7dfF3dc50888b7D8967";

const abi = {
  TicketsPurchased: "event TicketsPurchased(uint256 poolId, uint256 amount, address receiver, address referral)",
  ClaimSettled: "event ClaimSettled(uint64 seqNo, address token, uint256 amount, uint256 tier)",
  getPool: "function getPool(uint256) view returns (tuple(uint256 totalSold, uint256 totalRedeemed, uint256 ticketPrice, address token, uint256 tokenBalance, uint16 memeRatioBPS, uint16[] oddsBPS))",
  getConfig: "function getConfig() view returns (tuple(uint256 currentSupply, uint256 currentPoolId, address owner, address uniswapRouter, address paymentToken, address entropy, address feeWallet, uint16 feeBPS, uint16 referralBPS, uint256 referralClaimThreshold))",
};

const fetch: FetchV2 = async ({ api, getLogs, createBalances, fromApi, toApi, }: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = createBalances();


  // ── Contract Config ──
  // contract configuration to get paymentToken and feeBPS
  const { paymentToken, feeBPS } = await api.call({ target: gachaContract, abi: abi.getConfig, });
  const BPS = 10000;
  const feesRatio = Number(feeBPS) / BPS;


  // ── Tickets Purchased ──
  const ticketLogs = await getLogs({
    target: gachaContract,
    eventAbi: abi.TicketsPurchased,
  });

  const poolIDSet = new Set<string>();
  ticketLogs.forEach((log) => poolIDSet.add(log.poolId.toString().toLowerCase()));
  const poolIds = Array.from(poolIDSet);
  const poolResults = await api.multiCall({ target: gachaContract, abi: abi.getPool, calls: poolIds, });
  const poolPriceMap: any = {}
  poolResults.forEach((pool, i) => {
    poolPriceMap[poolIds[i]] = Number(pool.ticketPrice)
  })

  // purchase volume = sum(amount * ticketPrice) per pool
  for (const log of ticketLogs) {
    const poolId = log.poolId.toString().toLowerCase();
    const price = poolPriceMap[poolId]
    const amount = Number(log.amount)
    dailyVolume.add(paymentToken, amount * price)
  }


  // calculate fees from ticket purchases: fees = purchaseVolume * feeBPS / BPS
  const dailyFees = dailyVolume.clone(feesRatio);


  // ── Claim Settled ──
  const claimLogs = await getLogs({ target: gachaContract, eventAbi: abi.ClaimSettled, });

  for (const log of claimLogs) {
    const token = log.token;
    const amount = Number(log.amount);
    dailyVolume.add(token, amount);
  }

  // daily revenue equals to daily fees
  return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Volumes:
      "Volume is calculated as the sum of TicketsPurchased volume (amount multiplied by the ticket price from the corresponding pool) plus any payout volume from ClaimSettled events.",
    Fees:
      "Fees are computed as a percentage (feeBPS from the contract config) of the Gacha ticket purchase volume.",
    Revenue: "Revenue is equal to the fees collected.",
    ProtocolRevenue: "Revenue is equal to the fees collected.",
  },
  fetch,
  adapter: {
    [CHAIN.ABSTRACT]: {
      start: "2025-02-10",
    },
  },
};

export default adapter;
