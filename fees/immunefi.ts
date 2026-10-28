import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

// Immunefi fee collector (Gnosis Safe), receives report submission fees and
// identity verification fees paid by security researchers, then sweeps to multisig.immunefi.eth
const FEE_COLLECTOR = '0xA665813CFbbDE6B0CE77B960933bf8858b808803'

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const usdcInflows = await addTokensReceived({
    options,
    target: FEE_COLLECTOR,
    tokens: [ADDRESSES.ethereum.USDC],
  })
  dailyFees.addBalances(usdcInflows, "Submission & Verification fees")

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
};

const methodology = {
  Fees: "Report submission fees and identity verification fees paid by security researchers to Immunefi's fee collector wallet.",
  Revenue: "All fees collected go to Immunefi.",
  ProtocolRevenue: "All fees collected go to Immunefi.",
}

const breakdownMethodology = {
  Fees: {
    "Submission & Verification fees": "Fees paid by security researchers to submit bug reports to pay-to-submit programs and to complete identity verification, collected by Immunefi.",
  },
  Revenue: {
    "Submission & Verification fees": "Fees paid by security researchers to submit bug reports to pay-to-submit programs and to complete identity verification, collected by Immunefi.",
  },
  ProtocolRevenue: {
    "Submission & Verification fees": "Fees paid by security researchers to submit bug reports to pay-to-submit programs and to complete identity verification, collected by Immunefi.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  start: '2026-04-17',
  chains: [CHAIN.ETHEREUM],
};
export default adapter;
