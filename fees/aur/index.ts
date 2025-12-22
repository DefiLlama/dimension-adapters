import { Balances } from "@defillama/sdk";
import {
  Dependencies,
  FetchOptions,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

export async function aurHelperTotalSuiDeployed(
  options: FetchOptions,
  target: string
): Promise<Balances> {
  // Query for AUR protocol revenue
  const duneQueryString = `
      SELECT 
        SUM(CAST (json_extract_scalar(event_json, '$.total_deployed') AS BIGINT) / 1e9 * 0.12) AS total_sui_deployed    
        FROM sui.events e
        WHERE e.event_type = '${target}'
          AND e.date >= from_unixtime(${options.startTimestamp})
          AND e.date < from_unixtime(${options.endTimestamp})
  `;

  const results = await queryDuneSql(options, duneQueryString);

  const dailyFees = options.createBalances();
  if (results.length > 0) {
    const revenue = results[0].total_sui_deployed || 0;
    dailyFees.addCGToken("sui", revenue);
  }

  return dailyFees;
}

const aurEvent =
  "0xcc3ac0c9cc23c0bcc31ec566ef4baf6f64adcee83175924030829a3f82270f37::gameplay::EndRoundEvent";

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = await aurHelperTotalSuiDeployed(options, aurEvent);

  const dailyProtocolRevenue = dailyFees.clone(0.083);
  const dailyHoldersRevenue = dailyFees.clone(0.5);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyProtocolRevenue,
    dailyHoldersRevenue: dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SUI],
  start: "2025-12-12",
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fee: "Count SUI tokens collected from 12% of total SUI deployed on AUR boards",
    Revenue: "All fees are revenue",
    HoldersRevenue:
      "11% of deployed SUI are used to buyback and add liquidity for AUR on DEXs.",
    ProtocolRevenue:
      "1% of total deployed SUI to the protocol treasury to fund development, marketing, and strategic partnerships.",
  },
};

export default adapter;
