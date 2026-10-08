import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

// AlphaLend FeeEarnedEvent, emitted by the mainnet package (first package id in @alphafi/alphalend-sdk prodConstants).
// fee_type 0 = borrow interest: interest_earned is gross interest, market_fee is the protocol cut.
// fee_type 1 = liquidation: only market_fee is set, kept by the protocol.
// Replaces api.alphafi.xyz/public/metrics/fees, which has failed since 2026-09-30.
const FEE_EARNED_EVENT = '0xd631cd66138909636fc3f73ed75820d0c5b76332d1644608ed1c85ea2b8219b4::events::Event<%FeeEarnedEvent%';

const LENDING_FEES = 'Lending Fees';
const PROTOCOL_SHARE = 'Protocol Share';
const SUPPLY_SIDE_INTEREST = 'Supply Side Interest';

const fetch = async (options: FetchOptions) => {
  const rows = await queryAllium(`
    SELECT
      parsed_json:event:coin_type::string AS coin,
      SUM(IFF(parsed_json:event:fee_type::int = 0, parsed_json:event:interest_earned::number, parsed_json:event:market_fee::number)) AS fees,
      SUM(parsed_json:event:market_fee::number) AS revenue,
      SUM(IFF(parsed_json:event:fee_type::int = 0, parsed_json:event:interest_earned::number - parsed_json:event:market_fee::number, 0)) AS supply_side
    FROM sui.raw.events
    WHERE checkpoint_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND checkpoint_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      AND type LIKE '${FEE_EARNED_EVENT}'
    GROUP BY 1
  `);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const r of rows) {
    const coin = '0x' + r.coin;
    dailyFees.add(coin, r.fees, LENDING_FEES);
    dailyRevenue.add(coin, r.revenue, PROTOCOL_SHARE);
    dailySupplySideRevenue.add(coin, r.supply_side, SUPPLY_SIDE_INTEREST);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Interest paid by borrowers and liquidation fees collected on AlphaLend markets.",
  Revenue: "Share of borrow interest and liquidation fees kept by the AlphaFi protocol.",
  ProtocolRevenue: "Share of borrow interest and liquidation fees kept by the AlphaFi protocol.",
  SupplySideRevenue: "Share of borrow interest distributed to lenders.",
};

const breakdownMethodology = {
  Fees: {
    [LENDING_FEES]: "Interest paid by borrowers and liquidation fees collected on AlphaLend markets.",
  },
  Revenue: {
    [PROTOCOL_SHARE]: "Share of borrow interest and liquidation fees kept by the AlphaFi protocol.",
  },
  ProtocolRevenue: {
    [PROTOCOL_SHARE]: "Share of borrow interest and liquidation fees kept by the AlphaFi protocol.",
  },
  SupplySideRevenue: {
    [SUPPLY_SIDE_INTEREST]: "Share of borrow interest distributed to lenders.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SUI],
  start: '2026-03-02',
  methodology,
  breakdownMethodology,
  pullHourly: true,
  dependencies: [Dependencies.ALLIUM],
};

export default adapter;
