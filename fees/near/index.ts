import { Adapter, Dependencies, FetchOptions, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

// NEAR protocol v87 (nearcore 2.14.0) set burnt_gas_reward from 3/10 to 0, so developer gas
// rewards end at this mainnet block (2026-11-04T11:46:29Z).
// https://github.com/near/nearcore/releases/tag/2.14.0
const V87_ACTIVATION_BLOCK = 223012337;

const fetch = async (options: FetchOptions) => {
  const query = `
    SELECT
        SUM(transaction_fee_raw) AS total_tx_fees,
        SUM(CASE WHEN block_height < ${V87_ACTIVATION_BLOCK} THEN transaction_fee_raw ELSE '0' END) AS pre_v87_tx_fees
    FROM ${options.chain}.raw.transactions
    WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
    AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `;

  const res = await queryAllium(query);
  const totalFees = res[0].total_tx_fees / 1e24;
  const preV87Fees = res[0].pre_v87_tx_fees / 1e24;
  const developerRewards = preV87Fees * 0.3;
  const burnedFees = totalFees - developerRewards;

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Before v87, keep the 70% burn / 30% developer reward estimate. From v87,
  // developer rewards are 0 and all gas fees are burned, split by transaction
  // inclusion block. Validators are paid by inflation, not gas fees.
  dailyFees.addCGToken('near', totalFees, 'Transaction Fees');
  dailyRevenue.addCGToken('near', burnedFees, 'Burned NEAR');
  dailyHoldersRevenue.addCGToken('near', burnedFees, 'Burned NEAR');
  dailySupplySideRevenue.addCGToken('near', developerRewards, 'Smart Contract Developer Rewards');

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.NEAR],
  start: '2020-07-21',
  dependencies: [Dependencies.ALLIUM],
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: "All transaction (gas) fees paid by users on the NEAR blockchain, fetched from Allium.",
    Revenue: "Gas fees permanently burned, reducing NEAR supply. Before 4 November 2026 (protocol upgrade v87) the burn is estimated at 70% of fees, the rest went to contract developers; since then 100% of gas fees are burned.",
    HoldersRevenue: "Burned gas fees accrue to all NEAR holders through reduced supply: an estimated 70% of fees before 4 November 2026 (protocol upgrade v87), 100% since then.",
    SupplySideRevenue: "Gas rewards rebated to the developer of the called contract, estimated at 30% of fees before 4 November 2026. Protocol upgrade v87 removed developer gas rewards, so this is 0 since then.",
  },
  breakdownMethodology: {
    Fees: {
      'Transaction Fees': "All gas fees paid by users on the NEAR blockchain.",
    },
    Revenue: {
      'Burned NEAR': "Gas fees permanently burned: an estimated 70% before 4 November 2026 (protocol upgrade v87), 100% since then.",
    },
    HoldersRevenue: {
      'Burned NEAR': "Burned gas fees, benefiting holders through reduced supply: an estimated 70% before 4 November 2026 (protocol upgrade v87), 100% since then.",
    },
    SupplySideRevenue: {
      'Smart Contract Developer Rewards': "Gas rewards rebated to the called contract's developer: an estimated 30% before 4 November 2026, 0 since protocol upgrade v87.",
    },
  },
};

export default adapter;
