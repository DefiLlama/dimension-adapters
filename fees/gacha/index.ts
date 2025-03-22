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

const fetch: FetchV2 = async ({
  getLogs,
  createBalances,
  chain,
  getFromBlock,
  getToBlock,
  fromApi,
}: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = createBalances();
  const dailyFees = createBalances();

  const fromBlock = await getFromBlock();
  const toBlock = await getToBlock();

  // ── Tickets Purchased ──
  const ticketLogs = await getLogs({
    target: gachaContract,
    eventAbi: abi.TicketsPurchased,
    fromBlock,
    toBlock,
  });

  // group by poolId and sum ticket amounts
  const poolPurchaseAmounts: Record<string, bigint> = {};
  for (const log of ticketLogs) {
    const poolId = log.poolId.toString();
    const amount = BigInt(log.amount);
    poolPurchaseAmounts[poolId] = (poolPurchaseAmounts[poolId] || 0n) + amount;
  }

  // unique poolIds
  const poolIds = Object.keys(poolPurchaseAmounts);

  // ticketPrice for each pool using multiCall
  let ticketPrices: string[] = [];
  if (poolIds.length > 0) {
    const poolResults = await fromApi.multiCall({
      target: gachaContract,
      abi: abi.getPool,
      calls: poolIds.map((id) => ({ params: [id] })),
    });
    ticketPrices = poolResults.map((res) => res.ticketPrice);
  }

  // purchase volume = sum(amount * ticketPrice) per pool
  let purchaseVolume = 0n;
  for (let i = 0; i < poolIds.length; i++) {
    const amount = poolPurchaseAmounts[poolIds[i]];
    const ticketPrice = BigInt(ticketPrices[i] || "0");
    purchaseVolume += amount * ticketPrice;
  }

  // ── Contract Config ──
  // contract configuration to get paymentToken and feeBPS
  const configResult = await fromApi.call({
    target: gachaContract,
    abi: abi.getConfig,
  });
  const paymentToken: string = configResult.paymentToken;
  const feeBPS = BigInt(configResult.feeBPS); // 1500n
  const BPS = 10000n;

  // add purchase volume to dailyVolume (denominated in paymentToken)
  dailyVolume.add(paymentToken, purchaseVolume);

  // calculate fees from ticket purchases: fees = purchaseVolume * feeBPS / BPS
  const purchaseFees = (purchaseVolume * feeBPS) / BPS;
  dailyFees.add(paymentToken, purchaseFees);


  // ── Claim Settled ──
  const claimLogs = await getLogs({
    target: gachaContract,
    eventAbi: abi.ClaimSettled,
    fromBlock,
    toBlock,
  });

  for (const log of claimLogs) {
    const token = log.token;
    const amount = BigInt(log.amount);
    dailyVolume.add(token, amount);
  }

  // daily revenue equals to daily fees
  return { dailyVolume, dailyFees, dailyRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ABSTRACT]: {
      fetch,
      start: "2025-02-10",
      meta: {
        methodology: {
          dailyVolume:
            "Volume is calculated as the sum of TicketsPurchased volume (amount multiplied by the ticket price from the corresponding pool) plus any payout volume from ClaimSettled events.",
          dailyFees:
            "Fees are computed as a percentage (feeBPS from the contract config) of the Gacha ticket purchase volume.",
          dailyRevenue: "Revenue is equal to the fees collected.",
        },
      },
    },
  },
};

export default adapter;
