import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { getDuneTrades, decodeMatchOrders, decodeDirectPurchase, decodeDirectAcceptBid, MATCH_ORDERS_ID, DIRECT_PURCHASE_ID } from "../../dexs/rarible/helper";

const GET_ROYALTIES_ABI = "function getRoyalties(address token, uint256 tokenId) returns ((address account, uint96 value)[])";
const PROTOCOL_FEE_ABI = "function protocolFee() view returns (address receiver, uint48 buyerAmount, uint48 sellerAmount)";

const config: Record<string, { exchange: string; royaltiesRegistry: string; feeReceivers: Set<string>; start: string }> = {
  [CHAIN.ETHEREUM]: {
    exchange: "0x9757F2d2b135150BBeb65308D4a91804107cd8D6",
    royaltiesRegistry: "0xEa90CFad1b8e030B8Fd3E63D22074E0AEb8E0DCD",
    // fee receiver, treasury
    feeReceivers: new Set(["0x1cf0df2a5a20cd61d68d4489eebbf85b8d39e18a", "0xb6ec1d227d5486d344705663f700d90d947d7548"]),
    start: "2021-06-12",
  },
  [CHAIN.POLYGON]: {
    exchange: "0x12b3897a36fDB436ddE2788C06Eff0ffD997066e",
    royaltiesRegistry: "0xF2514F32aE798Ca29641F6E2313bacB1650Cc76f",
    // fee receiver
    feeReceivers: new Set(["0x053f171c0d0cc9d76247d4d1cddb280bf1131390"]),
    start: "2022-02-21",
  },
};

const fetch = async (options: FetchOptions) => {
  const { createBalances, chain, api } = options;
  const { exchange, royaltiesRegistry, feeReceivers } = config[chain];
  const dailyFees = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyRevenue = createBalances();

  const rows = await getDuneTrades(options, exchange);
  
  if (!rows.length) {
    return { dailyFees, dailySupplySideRevenue, dailyRevenue };
  };

  const { buyerAmount, sellerAmount } = await api.call({ target: exchange, abi: PROTOCOL_FEE_ABI });
  const protocolFeeBps = Number(buyerAmount) + Number(sellerAmount);

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
  };

  const royaltyData = await options.api.multiCall({
     abi: GET_ROYALTIES_ABI,
     calls: trades.map(t => ({ target: royaltiesRegistry, params: [t.nftContract, t.nftTokenId.toString()] })),
     permitFailure: true,
  });


  for (const [i, { amount, originFees, paymentToken }] of trades.entries()) {
    const royaltyInfo = royaltyData[i] ?? [];
    const royaltyBps = (royaltyInfo as any[]).reduce((sum, r) => sum + BigInt(r.value ?? 0), 0n);
    const protocolFee = amount * BigInt(protocolFeeBps) / 10000n;
    const royaltyFee = amount * royaltyBps / 10000n;
    const protocolOriginFee = originFees
      .filter(({ account }) => feeReceivers.has(account))
      .reduce((sum, { bps }) => sum + amount * bps / 10000n, 0n);
    const supplySideOriginFee = originFees
      .filter(({ account }) => !feeReceivers.has(account))
      .reduce((sum, { bps }) => sum + amount * bps / 10000n, 0n);

    dailyFees.add(paymentToken, protocolFee, "Protocol Fees");
    dailyFees.add(paymentToken, protocolOriginFee + supplySideOriginFee, "Origin Fees");
    dailyFees.add(paymentToken, royaltyFee, "Royalties");
    dailyRevenue.add(paymentToken, protocolFee, "Protocol Fees");
    dailyRevenue.add(paymentToken, protocolOriginFee, "Origin Fees To Protocol");
    dailySupplySideRevenue.add(paymentToken, supplySideOriginFee, "Origin Fees To Users");
    dailySupplySideRevenue.add(paymentToken, royaltyFee, "Royalties");
  };

  return { dailyFees, dailySupplySideRevenue, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
};

const methodology = {
  Fees: "Total fees paid: protocol fee, origin fees and royalties.",
  SupplySideRevenue: "Origin fees earned by order facilitators and royalties earned by NFT creators.",
  Revenue: "Protocol and Origin fees collected by Rarible on every transaction.",
  ProtocolRevenue: "Protocol and Origin fees collected by Rarible on every transaction.",
};

const breakdownMethodology = {
  Fees: {
    "Protocol Fees": "A mandatory fee charged by the Rarible protocol on every transaction, paid by both the buyer and the seller.",
    "Origin Fees": "Optional fees set by users for each transaction. These can be applied to either the buyer's or seller's order, acting as a commission for facilitating the sale.",
    "Royalties": "Payments made to the original creator of a digital asset each time it is sold.",
  },
  SupplySideRevenue: {
    "Origin Fees To Users": "Origin fees paid to users.",
    "Royalties": "Royalties are supply side costs.",
  },
  Revenue: {
    "Origin Fees To Protocol": "Origin fees paid to Rarible.",
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
};

export default adapter;
