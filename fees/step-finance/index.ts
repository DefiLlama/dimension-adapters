import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { queryDuneSql } from "../../helpers/dune"

const STEP = 'StepAscQoEioFxxWGnh2sLBDFp9d8rvKz2Yp39iDpyT';
const STEP_SOL = 'StPsoHokZryePePFV8N7iXvfEmgUoJ87rivABX7gaW6';
const FEE_ADDRESS = '5Cebzty8iwgAUx9jyfZVAT2iMvXBECLwEVgT6T8KYmvS';

const fetch = async (_a: any, _b: any, options: FetchOptions) => {

  const dailyFees = options.createBalances();

  // Ignoring STEP and STEP_SOL , as STEP would be brought back daily and would be doubly counted, also whenever SOL is received its swapped to STEP_SOL and would be doubly counted too
  const query = `
    select 
      token_mint_address as token, 
      sum(amount) as fee_received  
    from tokens_solana.transfers
    where action = 'transfer' 
      and to_owner='${FEE_ADDRESS}' 
      and token_mint_address not in ('${STEP}','${STEP_SOL}') 
      and block_time >= from_unixtime(${options.fromTimestamp}) 
      and block_time< from_unixtime(${options.toTimestamp}) 
    group by token_mint_address
  `;

  const feeData = await queryDuneSql(options, query);

  feeData.forEach((data: any) => {
    dailyFees.add(data.token, data.fee_received);
  })

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue: dailyFees,
    dailyProtocolRevenue: 0
  }
}

const methodology = {
  Fees: "Fees come from different sources under the Step Finance Organization, Solana Allstars, Solana Floor, Step revenue in its dashboard and APIs.",
  Revenue: "All fees are revenue.",
  HoldersRevenue: "All the revenue is used to buy back STEP, part of which goes to STEP token stakers and the rest are burnt.",
  ProtocolRevenue: "No protocol revenue."
}

const adapter: SimpleAdapter = {
  fetch,
  methodology,
  chains: [CHAIN.SOLANA],
  isExpensiveAdapter: true
}

export default adapter
