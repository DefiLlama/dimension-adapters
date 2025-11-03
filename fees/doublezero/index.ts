// Source: https://dune.com/queries/5920586/9559880
// https://docs.malbeclabs.com/paying-fees/

import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const query = `
    with initialize_deposit_account as (
        select
            account_arguments[1] as deposit_account
        from solana.instruction_calls
            left join dune.the_flyingfish_glide.result_validators_app_details
                on account_arguments[2] = validator_account
        where executing_account = 'dzrevZC94tBLwuHw1dyynZxaXTWyp7yocsinyEVPtt4'
            and bytearray_substring(data, 1, 8) = 0x09af49b1ebce3065
            and block_date >= date '2025-10-02'
            and tx_success
    )
    select
        sum(bytearray_to_bigint(bytearray_reverse(bytearray_substring(data,1+8,8))) / 1e9) as fee
    from solana.instruction_calls
        left join initialize_deposit_account
            on deposit_account = account_arguments[3]
    where executing_account = 'dzrevZC94tBLwuHw1dyynZxaXTWyp7yocsinyEVPtt4'
        and bytearray_substring(data, 1, 8) = 0xf1858bc4f612713b
        and tx_success
        and TIME_RANGE
  `;

  const fees = await queryDuneSql(options, query);

  dailyFees.add(ADDRESSES.solana.SOL, fees[0].fee * 1e9);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-10-03',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "A flat 5% fee is charged on block signature rewards and priority fees. Fees started at epoch 859 (October 4th, 2025) and are denominated in SOL and settled per epoch.",
    Revenue: "5% block reward fees and priority fees are collected by the protocol from validators.",
    ProtocolRevenue: "5% block reward fees and priority fees are collected by the protocol from validators."
  }
};

export default adapter;
