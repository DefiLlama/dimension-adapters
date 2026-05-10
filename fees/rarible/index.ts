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
};

const config: Record<string, { exchange: string; royaltiesRegistry: string; feeReceivers: Set<string>; start: string }> = {
  [CHAIN.ETHEREUM]: {
    exchange: "0x9757F2d2b135150BBeb65308D4a91804107cd8D6",
    royaltiesRegistry: "0xEa90CFad1b8e030B8Fd3E63D22074E0AEb8E0DCD",
    // fee receiver, treasury
    feeReceivers: new Set(["0x1cf0df2a5a20cd61d68d4489eebbf85b8d39e18a", "0xb6EC1d227D5486D344705663F700d90d947d7548"]),
    start: "2021-06-12",
  },
  [CHAIN.POLYGON]: {
    exchange: "0x12b3897a36fDB436ddE2788C06Eff0ffD997066e",
    royaltiesRegistry: "0xF2514F32aE798Ca29641F6E2313bacB1650Cc76f",
    // fee receiver
    feeReceivers: new Set(["0x053F171c0D0Cc9d76247D4d1CdDb280bf1131390"]),
    start: "2022-02-21",
  },
};

const fetch = async (options: FetchOptions) => {
  const { createBalances, chain } = options;
  const { exchange, royaltiesRegistry, feeReceivers } = config[chain];
  const dailyFees = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyRevenue = createBalances();

  const rows = await getDuneTrades(options, exchange);
  
  if (!rows.length) {
    return { dailyFees, dailySupplySideRevenue, dailyRevenue };
  };

  const protocolFeeBps = await getProtocolFeeBps(chain, exchange);

  const trades: { 
    paymentToken: string; 
    amount: bigint; 
    nftContract: string; 
    nftTokenId: bigint; 
    originFees: { account: string; bps: bigint }[];
  }[] = [];
  
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
    .process(async ({ paymentToken, amount, nftContract, nftTokenId, originFees }) => {
      let royaltyBps = 0n;
      try {
        const parts = await registry.getRoyalties.staticCall(nftContract, nftTokenId);
        royaltyBps = (parts as any[]).reduce((sum, r) => sum + BigInt(r.value), 0n);
      } catch (e: any) {
        console.error("[fees/rarible] getRoyalties error:", e?.message, nftContract);
      };
      const protocolFee = amount * BigInt(protocolFeeBps) / 10000n;
      const royaltyFee = amount * royaltyBps / 10000n;
      const protocolOriginFee = originFees
        .filter(({ account }) => feeReceivers.has(account))
        .reduce((sum, { bps }) => sum + amount * bps / 10000n, 0n);
      const supplySideOriginFee = originFees
        .filter(({ account }) => !feeReceivers.has(account))
        .reduce((sum, { bps }) => sum + amount * bps / 10000n, 0n);
      if (paymentToken === ethers.ZeroAddress) {
        dailyFees.addGasToken(protocolFee, "Protocol Fees");
        dailyFees.addGasToken(protocolOriginFee + supplySideOriginFee, "Origin Fees");
        dailyFees.addGasToken(royaltyFee, "Royalties");
        dailyRevenue.addGasToken(protocolFee, "Protocol Fees");
        dailyRevenue.addGasToken(protocolOriginFee, "Origin Fees");
        dailySupplySideRevenue.addGasToken(supplySideOriginFee, "Origin Fees");
        dailySupplySideRevenue.addGasToken(royaltyFee, "Royalties");
      } else {
        dailyFees.add(paymentToken, protocolFee, "Protocol Fees");
        dailyFees.add(paymentToken, protocolOriginFee + supplySideOriginFee, "Origin Fees");
        dailyFees.add(paymentToken, royaltyFee, "Royalties");
        dailyRevenue.add(paymentToken, protocolFee, "Protocol Fees");
        dailyRevenue.add(paymentToken, protocolOriginFee, "Origin Fees");
        dailySupplySideRevenue.add(paymentToken, supplySideOriginFee, "Origin Fees");
        dailySupplySideRevenue.add(paymentToken, royaltyFee, "Royalties");
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
  Revenue: "Protocol and Origin fees collected by Rarible on every transaction.",
};

const breakdownMethodology = {
  Fees: {
    "Protocol Fees": "A mandatory fee charged by the Rarible Protocol on every transaction, paid by both the buyer and the seller.",
    "Origin Fees": "Optional fees set by users for each transaction. These can be applied to either the buyer's or seller's order, acting as a commission for facilitating the sale.",
    "Royalties": "Payments made to the original creator of a digital asset each time it is sold.",
  },
  SupplySideRevenue: {
    "Origin Fees": "Origin Fees paid to users.",
    "Royalties": "Royalties are supply side costs.",
  },
  Revenue: {
    "Origin Fees": "Origin Fees paid to Rarible.",
    "Protocol Fees": "Fees retained by Rarible.",
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
