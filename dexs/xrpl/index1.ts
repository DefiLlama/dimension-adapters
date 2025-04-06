import { FetchResultFees, Fetch } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpPost } from "../../utils/fetchURL";

const RPC = "https://xrplcluster.com";
const LEDGER_SAMPLE_SIZE = 100;
const LEDGER_STEP = 10;

const fetch: Fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const ledgerResponse = await httpPost(RPC, {
    method: "ledger",
    params: [{ ledger_index: "validated" }],
  });

  const currentLedger = ledgerResponse.result.ledger_index;
  const startLedger = currentLedger - LEDGER_SAMPLE_SIZE;

  let totalVolumeXRP = 0;
  let totalAMMFeesXRP = 0;

  for (let i = startLedger; i <= currentLedger; i += LEDGER_STEP) {
    try {
      const ledger = await httpPost(RPC, {
        method: "ledger",
        params: [{
          ledger_index: i,
          transactions: true,
          expand: true,
        }],
      });

      for (const tx of ledger.result.ledger.transactions ?? []) {
        if (!tx.metaData?.AffectedNodes) continue;

        // ✅ CLOB trades
        if (tx.TransactionType === "OfferCreate") {
          const offerExecutions = tx.metaData.AffectedNodes.filter((node: any) =>
            node.ModifiedNode?.LedgerEntryType === "Offer" &&
            node.ModifiedNode.FinalFields?.TakerGets &&
            node.ModifiedNode.FinalFields?.TakerPays
          );
            // check if offerExecutions is empty, if they are, skip


          for (const node of offerExecutions) {
            const getsRaw = node.ModifiedNode.FinalFields.TakerGets;
            const paysRaw = node.ModifiedNode.FinalFields.TakerPays;

            const gets = typeof getsRaw === "object" ? parseFloat(getsRaw.value) : parseFloat(getsRaw);
            const pays = typeof paysRaw === "object" ? parseFloat(paysRaw.value) : parseFloat(paysRaw);

            totalVolumeXRP += Math.max(gets, pays);
          }
        }

        // ✅ AMM swap via ledger diff


        
        // You can determine if a Payment or OfferCreate transaction interacted with an AMM by checking for a RippleState ledger entry in the transaction metadata. A Flags value of 16777216 indicates AMM liquidity was consumed.
        
        

        const ammNode = tx.metaData.AffectedNodes.find((node: any) =>
            node.ModifiedNode?.LedgerEntryType === "AMM" //&&
           //(node.ModifiedNode.PreviousFields.Amount || node.ModifiedNode.PreviousFields.Amount2)
          );
        console.log(ammNode)
        if (ammNode) {
            console.log(ammNode);
          const mod = ammNode.ModifiedNode;
        console.log(mod.FinalFields.Asset)
        console.log(mod.FinalFields.Asset2)
        console.log(mod.FinalFields.LPTokenBalance)
        console.log(mod.PreviousFields.LPTokenBalance)

          const prevAmount1 = parseFloat(mod.PreviousFields.Amount?.value ?? mod.PreviousFields.Amount ?? 0);
          const prevAmount2 = parseFloat(mod.PreviousFields.Amount2?.value ?? mod.PreviousFields.Amount2 ?? 0);
          const newAmount1 = parseFloat(mod.FinalFields.Amount?.value ?? mod.FinalFields.Amount ?? 0);
          const newAmount2 = parseFloat(mod.FinalFields.Amount2?.value ?? mod.FinalFields.Amount2 ?? 0);

          const delta1 = Math.abs(newAmount1 - prevAmount1);
          const delta2 = Math.abs(newAmount2 - prevAmount2);
          const swapVolume = Math.max(delta1, delta2);
          totalVolumeXRP += swapVolume;

          const tradingFeeBps = mod.FinalFields.TradingFee ?? 30; // Default fallback
          const tradingFee = tradingFeeBps / 100000;
            console.log(tradingFee)
            console.log(swapVolume)
          const feeEstimate = swapVolume * (tradingFee / (1 - tradingFee));
          totalAMMFeesXRP += feeEstimate;
        }
      }
    } catch (err) {
      console.warn(`Skipping ledger ${i}:`, err.message || err);
    }
  }

  const volume = Math.floor(totalVolumeXRP * 1e6).toString(); // XRP → drops
  const fees = Math.floor(totalAMMFeesXRP * 1e6).toString();  // XRP → drops

  console.log("Test run complete:");
  console.log("Total Volume (XRP):", totalVolumeXRP);
  console.log("Total AMM Fees (XRP):", totalAMMFeesXRP);

  return {
  };
};

export default {
  adapter: {
    [CHAIN.RIPPLE]: {
      fetch,
      runAtCurrTime: true,
      start: () => 1700000000,
    },
  },
};
