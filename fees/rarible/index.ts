import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getProvider } from "@defillama/sdk";
import { ethers } from "ethers";
import { PromisePool } from "@supercharge/promise-pool";
import { getDuneTrades, decodeMatchOrders, decodeDirectPurchase, decodeDirectAcceptBid, MATCH_ORDERS_ID, DIRECT_PURCHASE_ID } from "../../helpers/rarible";

const GET_ROYALTIES_ABI = "function getRoyalties(address token, uint256 tokenId) returns ((address account, uint96 value)[])";
const PROTOCOL_FEE_ABI = "function protocolFee() view returns (address receiver, uint48 buyerAmount, uint48 sellerAmount)";

async function getProtocolFeeBps(chain: string, exchange: string): Promise<number> {
  const provider = getProvider(chain);
  const contract = new ethers.Contract(exchange, [PROTOCOL_FEE_ABI], provider as any);
  const [, buyerAmount, sellerAmount] = await contract.protocolFee();
  return Number(buyerAmount) + Number(sellerAmount);
}

const config: Record<string, { exchange: string; royaltiesRegistry: string; start: string }> = {
  [CHAIN.ETHEREUM]: {
    exchange: "0x9757F2d2b135150BBeb65308D4a91804107cd8D6",
    royaltiesRegistry: "0xEa90CFad1b8e030B8Fd3E63D22074E0AEb8E0DCD",
    start: "2021-06-12",
  },
  [CHAIN.POLYGON]: {
    exchange: "0x12b3897a36fDB436ddE2788C06Eff0ffD997066e",
    royaltiesRegistry: "0xF2514F32aE798Ca29641F6E2313bacB1650Cc76f",
    start: "2022-02-21",
  },
};

const fetch = async (options: FetchOptions) => {
  const { createBalances, chain } = options;
  const { exchange, royaltiesRegistry } = config[chain];
  const dailyFees = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyRevenue = createBalances();

  const rows = await getDuneTrades(options, exchange);
  
  if (!rows.length) {
    return { dailyFees, dailySupplySideRevenue, dailyRevenue };
  };

  const protocolFeeBps = await getProtocolFeeBps(chain, exchange);

  const trades: { paymentToken: string; amount: bigint; nftContract: string; nftTokenId: bigint; originFeeBps: number }[] = [];
  
  for (const row of rows) {
    const input: string = row.input;
    const selector = input.slice(0, 10);
    try {
      let decoded;
      if (selector === MATCH_ORDERS_ID) {
        decoded = decodeMatchOrders(input);
      } else if (selector === DIRECT_PURCHASE_ID) {
        decoded = decodeDirectPurchase(input);
      } else {
        // directAcceptBid
        decoded = decodeDirectAcceptBid(input);
      };
      trades.push(decoded);
    } catch (e: any) { 
      console.error("[fees/rarible] decode error:", e?.message, "selector:", selector); 
    };
  };

  const registry = new ethers.Contract(royaltiesRegistry, [GET_ROYALTIES_ABI], getProvider(chain) as any);

  const { errors: tradeErrors } = await PromisePool
    .withConcurrency(10)
    .for(trades)
    .process(async ({ paymentToken, amount, nftContract, nftTokenId, originFeeBps }) => {
      let royaltyBps = 0;
      try {
        const parts = await registry.getRoyalties.staticCall(nftContract, nftTokenId);
        royaltyBps = (parts as any[]).reduce((sum, r) => sum + Number(r.value), 0);
      } catch (e: any) {
        console.error("[fees/rarible] getRoyalties error:", e?.message, nftContract);
      };
      const protocolFee = amount * BigInt(protocolFeeBps) / 10000n;
      const originFee = amount * BigInt(originFeeBps) / 10000n;
      const royaltyFee = amount * BigInt(royaltyBps) / 10000n;
      if (paymentToken === ethers.ZeroAddress) {
        dailyFees.addGasToken(protocolFee, "Protocol Fees");
        dailyFees.addGasToken(originFee, "Origin Fees");
        dailyFees.addGasToken(royaltyFee, "Royalties");
        dailySupplySideRevenue.addGasToken(originFee, "Origin Fees");
        dailySupplySideRevenue.addGasToken(royaltyFee, "Royalties");
        dailyRevenue.addGasToken(protocolFee, "Protocol Fees");
      } else {
        dailyFees.add(paymentToken, protocolFee, "Protocol Fees");
        dailyFees.add(paymentToken, originFee, "Origin Fees");
        dailyFees.add(paymentToken, royaltyFee, "Royalties");
        dailySupplySideRevenue.add(paymentToken, originFee, "Origin Fees");
        dailySupplySideRevenue.add(paymentToken, royaltyFee, "Royalties");
        dailyRevenue.add(paymentToken, protocolFee, "Protocol Fees");
      };
    });

  if (tradeErrors.length) {
    tradeErrors.forEach(e => console.error("[fees/rarible] trade error:", e.message));
  };

  return { dailyFees, dailySupplySideRevenue, dailyRevenue };
};

const methodology = {
  Fees: "Total fees paid: protocol fee, origin fees and royalties.",
  SupplySideRevenue: "Origin fees earned by order facilitators and royalties earned by NFT creators.",
  Revenue: "Protocol fee collected by Rarible on every transaction.",
};

const breakdownMethodology = {
  Fees: {
    "Protocol Fees": "A mandatory fee charged by the Rarible Protocol on every transaction, paid by both the buyer and the seller.",
    "Origin Fees": "Optional fees set by users for each transaction. These can be applied to either the buyer's or seller's order, acting as a commission for facilitating the sale.",
    "Royalties": "Payments made to the original creator of a digital asset each time it is sold.",
  },
  SupplySideRevenue: {
    "Origin Fees": "Origin Fees are supply side costs.",
    "Royalties": "Royalties are supply side costs.",
  },
  Revenue: {
    "Protocol Fees": "Fees retained by Rarible."
  },
};

const adapter: Adapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  adapter: Object.fromEntries(
    Object.entries(config).map(([chain, { start }]) => [chain, { fetch, start }])
  ),
  isExpensiveAdapter: true
};

export default adapter;
