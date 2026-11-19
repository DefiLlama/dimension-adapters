import { CHAIN } from "../helpers/chains";
import { Adapter, ProtocolType, FetchOptions, Dependencies } from "../adapters/types";
import { queryDuneSql } from "../helpers/dune";
import { METRIC } from "../helpers/metrics";
import ADDRESSES from "../helpers/coreAssets.json";

// Polygon PoS is an L1, not a rollup: revenue is the burned EIP-1559 base fee, as for ethereum, monad and imx.
// The base fee goes to Bor's burntContract (genesis-mainnet-v1.json): 0x70bca57f4579f58670ab2d18ef16e02c17553c38
// until block 50,523,000 (2023), then 0x7a8ed27f4c30512326878652d20fc85727401854 (PIP-24), and since block 83,756,500
// (2026-03-04) the PIP-82 Safe 0x3ef57def668054dd750bd260526105c4eeef104f. The Safe sweeps it to 0x7a8ed27f
// (NewBurn1559), which burns it in tranches of up to 100M POL every 90 days. Sweep example: tx
// 0x12ca568cd2e6aa686bad9b1b85c796b0cfa332a779d469881c733cd65c06e1f6 (2026-10-30); about 0.8% of it was recycled
// under PIP-82 instead of burned. Priority fees go to the PIP-65 Safe 0x7ee41d8a25641000661b1ef5e6ae8a00400466b0 and
// are paid 26% to the block producer, 37% to validators and 37% to stakers (PIP-85).
// Blocks before London (23,850,000) have no base fee.
const PRIORITY_FEES_TO_VALIDATORS_AND_STAKERS = 'Transaction Priority Fees To Validators And Stakers';

const fetch = async (options: FetchOptions) => {
    const query = `
        WITH fees_cte AS (
            SELECT
                SUM(tx_fee_raw) AS daily_fees
            FROM gas.fees
            WHERE blockchain = 'polygon'
                AND block_time >= from_unixtime(${options.startTimestamp})
                AND block_time < from_unixtime(${options.endTimestamp})
        ),
        burn_cte AS (
            SELECT
                SUM(COALESCE(CAST(base_fee_per_gas AS double), 0) * CAST(gas_used AS double)) AS daily_burn
            FROM polygon.blocks
            WHERE time >= from_unixtime(${options.startTimestamp})
                AND time < from_unixtime(${options.endTimestamp})
        )
        SELECT
            f.daily_fees,
            b.daily_burn
        FROM fees_cte AS f
        CROSS JOIN burn_cte AS b
    `
    const res = await queryDuneSql(options, query);
    if (!res?.[0] || res[0].daily_fees == null || res[0].daily_burn == null)
        throw new Error(`polygon: no fee or block row for ${options.dateString}`);

    const totalFees = Number(res[0].daily_fees);
    const baseFees = Number(res[0].daily_burn);
    const priorityFees = totalFees - baseFees;
    if (priorityFees < 0)
        throw new Error(`polygon: fees below base fee for ${options.dateString}, Dune data incomplete`);

    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    // not addGasToken: coins.llama.fi prices polygon:0x000... only from 2023-10-25 (the POL series), WPOL keeps the MATIC history back to 2021-02
    const WPOL = ADDRESSES.polygon.WMATIC_2;
    dailyFees.add(WPOL, baseFees, METRIC.TRANSACTION_BASE_FEES);
    dailyFees.add(WPOL, priorityFees, METRIC.TRANSACTION_PRIORITY_FEES);
    dailyRevenue.add(WPOL, baseFees, METRIC.TRANSACTION_BASE_FEES);
    dailySupplySideRevenue.add(WPOL, priorityFees, PRIORITY_FEES_TO_VALIDATORS_AND_STAKERS);

    return {
        dailyFees,
        dailyRevenue,
        dailyHoldersRevenue: dailyRevenue,
        dailySupplySideRevenue,
    }
}

const adapter: Adapter = {
    version: 1,
    fetch,
    chains: [CHAIN.POLYGON],
    start: '2020-05-30',
    dependencies: [Dependencies.DUNE],
    protocolType: ProtocolType.CHAIN,
    isExpensiveAdapter: true,
    methodology: {
        Fees: 'Total transaction fees paid by users',
        Revenue: 'EIP-1559 base fees, which are burned in tranches through the EIP-1559 burn contract. Under PIP-82 (capped at $1M, until 2026-12-31) a small part, 0.7% of the base fee swept from March to October 2026, is recycled to x402 facilitators instead of burned. It is only paid out when the account is swept, every few months, so it is counted here.',
        HoldersRevenue: 'EIP-1559 base fees, which are burned (see Revenue).',
        SupplySideRevenue: 'Priority fees, which go to validators. Since PIP-65 and PIP-85 they are paid out through the PIP-65 fee account: 26% to the block producer, 37% to validators and 37% to stakers.',
    },
    breakdownMethodology: {
        Fees: {
            [METRIC.TRANSACTION_BASE_FEES]: 'EIP-1559 base fees paid by users, summed per block as base fee times gas used.',
            [METRIC.TRANSACTION_PRIORITY_FEES]: 'Priority fees (tips) paid by users on top of the base fee.',
        },
        Revenue: {
            [METRIC.TRANSACTION_BASE_FEES]: 'EIP-1559 base fees, burned in tranches (about 0.7% recycled under PIP-82, see Revenue).',
        },
        HoldersRevenue: {
            [METRIC.TRANSACTION_BASE_FEES]: 'EIP-1559 base fees, burned in tranches (about 0.7% recycled under PIP-82, see Revenue).',
        },
        SupplySideRevenue: {
            [PRIORITY_FEES_TO_VALIDATORS_AND_STAKERS]: 'Priority fees paid 26% to the block producer, 37% to validators and 37% to stakers (PIP-65, PIP-85).',
        },
    }
}

export default adapter;
