import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from '../../helpers/token';
import coreAssets from "../../helpers/coreAssets.json"
import { METRIC } from "../../helpers/metrics";

const feeAggregator = "0xd6e39d42AceE7Abcc460E6Ea78a0844A0980E78f"
const paymentLayer = "0x5680681ED3767B96914CE741a308155C7fB9171d"
const reserve = "0x9A709B7B69EA42D5eeb1ceBC48674C69E1569eC6"
const withdrawnEvent = 'event Withdrawn(address indexed serviceProvider, uint256 amount)'

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const feeBalance = await addTokensReceived({ options: options, target: feeAggregator })
  dailyFees.addBalances(feeBalance, METRIC.SERVICE_FEES);

  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const reserveRevenue = await addTokensReceived({ options: options, targets: [reserve], fromAddressFilter: paymentLayer, token: coreAssets.ethereum.LINK })
  const withdrawnEvents = await options.getLogs({ target: paymentLayer, eventAbi: withdrawnEvent })

  dailyRevenue.addBalances(reserveRevenue, METRIC.PROTOCOL_FEES);
  // The reserve contract is itself an allowlisted service provider, so the weekly PaymentLayer -> reserve
  // batch (already counted above as PROTOCOL_FEES) also shows up as its own Withdrawn event. Excluding it
  // here avoids double-counting that same LINK under both metrics.
  withdrawnEvents
    .filter((event) => event.serviceProvider.toLowerCase() !== reserve.toLowerCase())
    .forEach((event) => {
      dailySupplySideRevenue.add(coreAssets.ethereum.LINK, event.amount, METRIC.STAKING_REWARDS);
    })

  const dailyHoldersRevenue = reserveRevenue.clone(1, METRIC.TOKEN_BUY_BACK);

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  }
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SERVICE_FEES]: 'Fees paid by users for Chainlink oracle data feed services, collected through the fee aggregator contract'
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: 'LINK tokens transferred from the Payment Abstraction Layer to the protocol reserve contract'
  },
  SupplySideRevenue: {
    [METRIC.STAKING_REWARDS]: 'LINK paid out through Withdrawn events emitted by the Reserves/paymentLayer contract directly to allowlisted Chainlink service providers (node operators)'
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: 'LINK token buybacks funded via revenue from various offchain and onchain sources'
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2025-02-21",
  methodology: {
    Fees: "All the tokens received by the fee aggregator contract",
    Revenue: "LINK transferred from the PaymentAbstractionLayer to the Reserve contract",
    SupplySideRevenue: "LINK paid out through Withdrawn events emitted by the Reserves/paymentLayer contract directly to allowlisted Chainlink service providers (node operators)",
    HoldersRevenue: "LINK token buybacks funded via revenue from various offchain and onchain sources"
  },
  breakdownMethodology
}

export default adapter
