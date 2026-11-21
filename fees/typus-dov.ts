import * as sdk from "@defillama/sdk";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { getCheckpointBeforeWindow, graphqlCall, queryEventsInWindow } from "../helpers/sui";

// Typus DOV on Sui, read from the vault events (the Sentio insights API this used to query rejects its key since 2026-04).
// Package and registry ids: https://github.com/Typus-Lab/typus-config/blob/main/config-mainnet.json (PACKAGE_ORIGIN.DOV_SINGLE, REGISTRY.DOV.DOV_SINGLE)
// Event types keep the package id they were introduced in.
const DOV = "0x321848bf1ae327a9e022ccb3701940191e02fa193ab160d9c0e49cd3c003de3a::typus_dov_single";
// RaiseFundEvent / ReduceFundEvent replaced HarvestEvent / CompoundEvent / RedeemEvent in the 2024-06-13 upgrade
// (last old event 10:10 UTC, first new one 10:16 UTC)
const DOV_FUNDS = "0x011840332be097b422abb8336970b0be1d7333df22134cd5c3be9d9a1cb956d0::typus_dov_single";
// Registry 0x3d70b09359e3ca8301ae0abeda4f2fdf72ce313ba58c919ce568e5f535fd2ea8 `portfolio_vault_registry`: PortfolioVault objects keyed by vault index
const PORTFOLIO_VAULT_REGISTRY = "0xa1a186d050e3172ef4701c16048c99b11f785969874fa2642b9cbcf59cde7fc0";

// MFUD (6 decimals) is 1M FUD (5 decimals), so 1 raw MFUD = 1e5 raw FUD, as in options/typus
const MFUD = "d8f04cd2a16c19c17428c3b4c22b01dd06740423b93fb7ee88fbe2676a82849d::mfud::MFUD";
const FUD = "0x76cb819b01abed502bee8a702b4c2d547532c12f25001c9dea795a5e631c26f1::fud::FUD";

const OPTION_PREMIUMS = "Option Premiums";
const BID_FEES = "Bid Fees";

// Vault fees (vault::charge_fee) move fee_bp of the harvested / compounded / redeemed amount into the registry fee_pool and
// log it as (fee - shared part, shared part), so the fee is the sum of both log entries.
const REDUCE_FUND_LOG_LENGTH = 13; // [index, round, price, decimals, withdraw, unsubscribe, harvest, harvest fee, harvest fee share, claim, redeem, redeem fee, redeem fee share]
const RAISE_FUND_LOG_LENGTH = 9; // [index, round, price, decimals, deposit, compound, compound fee, compound fee share, (unused)]

// PortfolioVault.info.bid_token, fixed at vault creation. Retired vaults are removed from the registry, so it is read as of
// the checkpoint before the window, then from the current registry for vaults created inside the window.
const bidTokens: Record<string, Promise<string>> = {};

async function readBidToken(index: string, startTimestamp: number): Promise<string> {
  const name = Buffer.alloc(8);
  name.writeBigUInt64LE(BigInt(index));
  const vaultField = `address(address: "${PORTFOLIO_VAULT_REGISTRY}") {
    dynamicObjectField(name: $name) { value { ... on MoveObject { contents { json } } } }
  }`;
  const variables = { name: { type: "u64", bcs: name.toString("base64") } };
  const { sequenceNumber } = await getCheckpointBeforeWindow(startTimestamp);
  const past = await graphqlCall(`query ($name: DynamicFieldName!) { checkpoint(sequenceNumber: ${sequenceNumber}) { query { ${vaultField} } } }`, variables);
  let vault = past.checkpoint?.query?.address?.dynamicObjectField?.value?.contents?.json;
  if (!vault) vault = (await graphqlCall(`query ($name: DynamicFieldName!) { ${vaultField} }`, variables)).address?.dynamicObjectField?.value?.contents?.json;
  if (!vault?.info?.bid_token) throw new Error(`typus-dov: no bid token found for vault ${index}`);
  return vault.info.bid_token;
}

const getBidToken = (index: string, startTimestamp: number) =>
  bidTokens[index] ??= readBidToken(index, startTimestamp).catch((e) => {
    delete bidTokens[index]; // retry on the next window instead of caching a failed read
    throw e;
  });

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // event token types come without the 0x prefix
  const add = (balances: sdk.Balances, token: string, amount: bigint | string, label: string) => {
    if (token === MFUD) balances.add(FUD, BigInt(amount) * 100000n, label);
    else balances.add("0x" + token, amount, label);
  };
  // incentive_bid_value / incentive_fee (Typus-funded bid subsidies) and depositor_incentive_value are protocol incentives, not fees
  const addOptionSale = (token: string, e: any) => {
    add(dailyFees, token, e.bidder_bid_value, OPTION_PREMIUMS);
    add(dailySupplySideRevenue, token, e.bidder_bid_value, "Option Premiums To Depositors");
    add(dailyFees, token, e.bidder_fee, BID_FEES);
    add(dailyRevenue, token, e.bidder_fee, "Bid Fees To Protocol");
  };
  const addPerformanceFee = (token: string, amount: bigint | string) => {
    add(dailyFees, token, amount, METRIC.PERFORMANCE_FEES);
    add(dailyRevenue, token, amount, "Performance Fees To Protocol");
  };

  // auction settlements
  for (const e of await queryEventsInWindow(`${DOV}::DeliveryEvent`, options)) addOptionSale(e.b_token, e);

  // OTC sales (mostly Typus SAFU vaults buying options) carry no token type, take it from the vault
  for (const e of await queryEventsInWindow(`${DOV}::OtcEvent`, options)) {
    addOptionSale(await getBidToken(e.index, options.startTimestamp), e);
  }

  // before 2024-06-13
  for (const e of await queryEventsInWindow(`${DOV}::HarvestEvent`, options)) addPerformanceFee(e.token, e.fee_amount);
  // u64_padding[0] is the fee (10% of the gross amount in every event)
  for (const e of await queryEventsInWindow(`${DOV}::CompoundEvent`, options)) addPerformanceFee(e.token, e.u64_padding[0]);
  for (const e of await queryEventsInWindow(`${DOV}::RedeemEvent`, options)) addPerformanceFee(e.token, e.u64_padding[0]);

  // since 2024-06-13
  for (const e of await queryEventsInWindow(`${DOV_FUNDS}::RaiseFundEvent`, options)) {
    if (e.log.length !== RAISE_FUND_LOG_LENGTH) throw new Error(`typus-dov: unexpected RaiseFundEvent log ${e.log}`);
    addPerformanceFee(e.token, BigInt(e.log[6]) + BigInt(e.log[7]));
  }
  for (const e of await queryEventsInWindow(`${DOV_FUNDS}::ReduceFundEvent`, options)) {
    if (e.log.length !== REDUCE_FUND_LOG_LENGTH) throw new Error(`typus-dov: unexpected ReduceFundEvent log ${e.log}`);
    addPerformanceFee(e.b_token, BigInt(e.log[7]) + BigInt(e.log[8]));
    addPerformanceFee(e.i_token, BigInt(e.log[11]) + BigInt(e.log[12]));
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Option premiums paid by buyers to Typus DOV vault depositors, plus the bid fee on every option sale and the performance fee Typus takes when depositors harvest, compound or redeem their vault earnings. Excludes the cut Typus takes from lending interest on idle vault deposits.",
  Revenue: "Bid fees on option sales plus performance fees on depositors' harvested, compounded and redeemed earnings, all kept by Typus.",
  ProtocolRevenue: "Bid fees on option sales plus performance fees on depositors' harvested, compounded and redeemed earnings, paid into the Typus fee pool.",
  SupplySideRevenue: "Option premiums paid by buyers to vault depositors.",
};

const breakdownMethodology = {
  Fees: {
    [OPTION_PREMIUMS]: "Premiums option buyers pay for vault options, in auctions and OTC sales.",
    [BID_FEES]: "Fee charged to option buyers on top of their premium.",
    [METRIC.PERFORMANCE_FEES]: "Share of depositors' earnings (premiums and incentives) Typus takes when they harvest, compound or redeem them.",
  },
  Revenue: {
    "Bid Fees To Protocol": "Bid fees paid into the Typus fee pool.",
    "Performance Fees To Protocol": "Performance fees paid into the Typus fee pool.",
  },
  ProtocolRevenue: {
    "Bid Fees To Protocol": "Bid fees paid into the Typus fee pool.",
    "Performance Fees To Protocol": "Performance fees paid into the Typus fee pool.",
  },
  SupplySideRevenue: {
    "Option Premiums To Depositors": "Option premiums paid to vault depositors.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SUI],
  start: "2024-01-14",
  methodology,
  breakdownMethodology,
};

export default adapter;
