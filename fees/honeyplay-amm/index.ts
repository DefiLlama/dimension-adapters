import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryEvents } from "../../helpers/sui";
import { METRIC } from "../../helpers/metrics";

// AMM package
const AMM_PACKAGE = "0xb8874ad9153a01efc9f048bd94f79b13b1cac473a086165d0739b2352d2e475e";

// Safe wrapper: queryEvents crashes on empty results (data[data.length-1] is undefined)
async function safeQueryEvents(params: any): Promise<any[]> {
  try {
    return await queryEvents(params);
  } catch {
    return [];
  }
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // ── Swap fees ──
  //
  // SwapFeeChargedEvent fields:
  //   fee_token_type    – token type string (no 0x prefix, e.g. "0000...0002::sui::SUI")
  //   creator_fee_amt   – creator fee (charged on input, SEPARATE from amm_fee)
  //   amm_fee_amt       – TOTAL AMM fee = LP portion + protocol portion (NOT just LP!)
  //   protocol_fee_amt  – protocol fee = SUBSET of amm_fee_amt (amm_fee * protocol_fee_pct / 100)
  //
  // Fee math (from compute_fees_decrease_amt):
  //   creator_fee = input * dynamic_fee_bps / 10000
  //   amm_fee     = input * total_fee_bps / 10000     (TOTAL, includes both LP + protocol)
  //   protocol    = amm_fee * protocol_fee_pct / 100   (SUBSET of amm_fee)
  //   lp_fee      = amm_fee - protocol                 (remainder stays in pool)
  //
  // Total user fees  = creator_fee + amm_fee  (NOT + protocol, it's already in amm_fee!)
  // Distribution:
  //   creator_fee  → token creator (via CollectedFees DOF on pool)
  //   protocol_fee → pool.collected_fee_x/y → FeeCollector → 50/50 treasury/buyback
  //   lp_fee       → pool.coin_x/y_reserve (earned by LPs)

  const swapFeeEvents = await safeQueryEvents({
    eventType: `${AMM_PACKAGE}::amm::SwapFeeChargedEvent`,
    options,
  });

  for (const e of swapFeeEvents) {
    const tokenType = "0x" + e.fee_token_type;
    const creatorFee = Number(e.creator_fee_amt);
    const ammFee = Number(e.amm_fee_amt);       // TOTAL AMM fee (LP + protocol)
    const protocolFee = Number(e.protocol_fee_amt); // SUBSET of ammFee
    const lpFee = ammFee - protocolFee;          // remainder to LPs

    // Total fees paid by user = creator fee + total AMM fee
    dailyFees.add(tokenType, creatorFee + ammFee, METRIC.SWAP_FEES);
    // Supply side = LP portion only
    dailySupplySideRevenue.add(tokenType, lpFee, METRIC.LP_FEES);
    // Protocol revenue = protocol portion of AMM fee
    dailyRevenue.add(tokenType, protocolFee, METRIC.PROTOCOL_FEES);
  }

  // ── Liquidity add/remove fees ──
  //
  // LiquidityAdded/RemovedToPoolEvent fields:
  //   type_x, type_y  – TypeName structs with .name field (no 0x prefix)
  //   total_x_fee     – TOTAL fee in token X (LP + protocol)
  //   x_protocol_fee  – protocol portion (SUBSET of total_x_fee)
  //   LP portion       = total_x_fee - x_protocol_fee

  const addLiqEvents = await safeQueryEvents({
    eventType: `${AMM_PACKAGE}::amm::LiquidityAddedToPoolEvent`,
    options,
  });

  for (const e of addLiqEvents) {
    addLiquidityFees(e, dailyFees, dailyRevenue, dailySupplySideRevenue);
  }

  const removeLiqEvents = await safeQueryEvents({
    eventType: `${AMM_PACKAGE}::amm::LiquidityRemovedFromPoolEvent`,
    options,
  });

  for (const e of removeLiqEvents) {
    addLiquidityFees(e, dailyFees, dailyRevenue, dailySupplySideRevenue);
  }

  // ── Flash loan fees ──
  //
  // Same structure as liquidity events: total_x_fee includes protocol, x_protocol_fee is subset

  const flashLoanEvents = await safeQueryEvents({
    eventType: `${AMM_PACKAGE}::amm::FlashLoanExecutedEvent`,
    options,
  });

  for (const e of flashLoanEvents) {
    const typeX = "0x" + e.type_x?.name;
    const typeY = "0x" + e.type_y?.name;
    const totalFeeX = Number(e.total_x_fee);
    const totalFeeY = Number(e.total_y_fee);
    const protocolFeeX = Number(e.x_protocol_fee);
    const protocolFeeY = Number(e.y_protocol_fee);

    if (totalFeeX > 0) {
      dailyFees.add(typeX, totalFeeX, METRIC.FLASHLOAN_FEES);
      dailySupplySideRevenue.add(typeX, totalFeeX - protocolFeeX, METRIC.LP_FEES);
      dailyRevenue.add(typeX, protocolFeeX, METRIC.PROTOCOL_FEES);
    }
    if (totalFeeY > 0) {
      dailyFees.add(typeY, totalFeeY, METRIC.FLASHLOAN_FEES);
      dailySupplySideRevenue.add(typeY, totalFeeY - protocolFeeY, METRIC.LP_FEES);
      dailyRevenue.add(typeY, protocolFeeY, METRIC.PROTOCOL_FEES);
    }
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

/** Shared helper for liquidity add/remove events (same field structure) */
function addLiquidityFees(e: any, dailyFees: any, dailyRevenue: any, dailySupplySideRevenue: any) {
  const typeX = "0x" + e.type_x?.name;
  const typeY = "0x" + e.type_y?.name;
  const totalFeeX = Number(e.total_x_fee);
  const totalFeeY = Number(e.total_y_fee);
  const protocolFeeX = Number(e.x_protocol_fee);
  const protocolFeeY = Number(e.y_protocol_fee);

  if (totalFeeX > 0) {
    dailyFees.add(typeX, totalFeeX, METRIC.SWAP_FEES);
    dailySupplySideRevenue.add(typeX, totalFeeX - protocolFeeX, METRIC.LP_FEES);
    dailyRevenue.add(typeX, protocolFeeX, METRIC.PROTOCOL_FEES);
  }
  if (totalFeeY > 0) {
    dailyFees.add(typeY, totalFeeY, METRIC.SWAP_FEES);
    dailySupplySideRevenue.add(typeY, totalFeeY - protocolFeeY, METRIC.LP_FEES);
    dailyRevenue.add(typeY, protocolFeeY, METRIC.PROTOCOL_FEES);
  }
}

const methodology = {
  Fees: "Total fees from AMM swaps (creator fee + total AMM fee), liquidity adds/removes, and flash loans. Note: amm_fee_amt in events includes both LP and protocol portions.",
  Revenue: "Protocol fee portion of AMM fees (protocol_fee_pct % of total AMM fee, default 50%). Flows to FeeCollector then split 50/50 between SUI treasury (team) and HONEY buybacks.",
  ProtocolRevenue: "Protocol fees from trading, liquidity operations, and flash loans.",
  SupplySideRevenue: "LP fee portion (total AMM fee minus protocol fee) that stays in pool reserves for liquidity providers.",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: "2025-01-01",
    },
  },
  methodology,
};

export default adapter;
