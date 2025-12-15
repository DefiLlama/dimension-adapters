import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Aspecta BuildKey fee vault (multisig)
// This vault receives the 2.5% fee from every BuildKey trade
// Ref: https://docs.aspecta.ai/buildkey/fees-and-benefits
const ASPECTA_FEE_COLLECTOR =
  "0x38799Ce388a9b65EC6bA7A47c1efb9cF1A7068e4";

// Emitted by BuildKey trade contracts,
// with the vault address as indexed `sender`
const FEE_COLLECTED_EVENT =
  "event SafeReceived(address indexed sender, uint256 value)";

const fetch = async (options: FetchOptions) => {
  let totalFeesCollected = 0n;

  const dailyFees = options.createBalances();

  /**
   * NOTE:
   * Although the vault does NOT emit this event,
   * DefiLlama's getLogs helper matches indexed parameters
   * when `target` is provided.
   *
   * Since the vault appears as indexed `sender`,
   * this reliably captures all fee transfers.
   */
  const logs: any[] = await options.getLogs({
    target: ASPECTA_FEE_COLLECTOR,
    eventAbi: FEE_COLLECTED_EVENT,
  });

  for (const log of logs) {
    /**
     * Fee value can appear in different shapes depending on SDK decoding:
     * - log.value          (flattened)
     * - log.args.value     (decoded ABI)
     * - log.data           (raw uint256)
     *
     * We safely handle all cases.
     */
    const feeWei =
      log.value ??
      log.args?.value ??
      (log.data ? BigInt(log.data) : 0n);

    totalFeesCollected += BigInt(feeWei);
  }

  // Fees are paid in native BNB
  dailyFees.addGasToken(totalFeesCollected);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: 1689552000, // July 17, 2023
    },
  },
  methodology: {
    Fees: "2.5% BuildKey trading fees paid in BNB by users.",
    Revenue: "All BuildKey trading fees collected by the protocol.",
    ProtocolRevenue: "Protocol-controlled revenue from BuildKey trades.",
  },
};

export default adapter;