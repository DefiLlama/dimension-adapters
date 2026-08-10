import { Adapter, Dependencies, FetchOptions, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

const fetch = async (options: FetchOptions) => {
  const query = `
    SELECT
        SUM(transaction_fee_raw) AS total_tx_fees
    FROM ${options.chain}.raw.transactions
    WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
    AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `;

  const res = await queryAllium(query);
  const totalFees = res[0].total_tx_fees / 1e24;

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // NEAR burns 70% of every gas fee and rebates the remaining 30% to the
  // smart contract being called (developer reward). Validators are paid by
  // protocol inflation, not by gas fees.
  dailyFees.addCGToken('near', totalFees, 'Transaction Fees');
  dailyRevenue.addCGToken('near', totalFees * 0.7, 'Burned NEAR');
  dailyHoldersRevenue.addCGToken('near', totalFees * 0.7, 'Burned NEAR');
  dailySupplySideRevenue.addCGToken('near', totalFees * 0.3, 'Smart Contract Developer Rewards');

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
    Revenue: "70% of every gas fee is permanently burned, reducing NEAR supply. The other 30% is paid to contract developers, so only 70% is protocol revenue.",
    HoldersRevenue: "Burned gas fees (70%) accrue to all NEAR holders through reduced circulating supply.",
    SupplySideRevenue: "The remaining 30% of each gas fee is rebated to the developer of the smart contract being called.",
  },
  breakdownMethodology: {
    Fees: {
      'Transaction Fees': "All gas fees paid by users on the NEAR blockchain.",
    },
    Revenue: {
      'Burned NEAR': "70% of gas fees, permanently burned.",
    },
    HoldersRevenue: {
      'Burned NEAR': "70% of gas fees burned, benefiting holders through reduced supply (deflation).",
    },
    SupplySideRevenue: {
      'Smart Contract Developer Rewards': "30% of gas fees rebated to the called contract's developer.",
    },
  },
};

export default adapter;
