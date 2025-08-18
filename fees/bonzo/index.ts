import BigNumber from "bignumber.js";
import { httpGet } from "../../utils/fetchURL";

const fetch = async () => {
    const res = await httpGet("https://data.bonzo.finance/stats");
    const timestamp = parseFloat(res.timestamp_end);
    // Portion of intrest payments sent to the protocol over the 24hr period.
    const total_protocol_fees = new BigNumber(res.total_protocol_fees.usd_wad);
    // Total of earned intrest for liquidity providers over the 24hr period.
    const total_intrest_earned = new BigNumber(res.total_intrest_earned.usd_wad);
    // Total of just the premium paid back when flash loan borrowing, does not included ammount borrowed
    const total_flash_loan_fees = new BigNumber(res.total_flash_loan_fees.usd_wad);
    // Total of just the bonus portion given to liquidators
    const total_liquidation_bonuses = new BigNumber(res.total_liquidation_bonuses.usd_wad);
    /*
        Other Metrics reported that are not presently exposed

        total_liquidation_payoffs (total of the value of loans that were paid off/liquidated)
        total_liquidation_rewards (total of all collateral returned to liquidators -- including premium bonus)
        total_gas_consumed (number)
        total_gas_charged (number)
        total_network_fees (total value of hedera network fees, excluding gas)
        total_gas_fees (total value of gas fees paid to the hedera netwrok)
    */
    const dailyFees = total_protocol_fees.plus(total_intrest_earned).plus(total_flash_loan_fees).plus(total_liquidation_bonuses).shiftedBy(-18);
    const dailyUserFees = dailyFees;
    const dailyProtocolRevenue = total_protocol_fees.plus(total_flash_loan_fees).shiftedBy(-18);
    const dailySupplySideRevenue = total_intrest_earned.shiftedBy(-18);

    return {
        timestamp: Math.floor(timestamp),
        dailyFees,
        dailyUserFees,
        dailyProtocolRevenue,
        dailyRevenue: dailyProtocolRevenue,
        dailySupplySideRevenue,
    };
}

const adapter = {
    adapter: {
        hedera: {
            fetch,
            start: 1722534378,
            runAtCurrTime: true,
        }
    },
    methodology: {
        Fees: 'Interest and Flash Loan fees plus liquidation bonuses in USD',
        UserFees: 'Interest and Flash Loan fees plus liquidation bonuses in USD',
        ProtocolRevenue: 'Portion of interest rate fees and flash loan fees to Protocol Treasury in USD',
        SupplySideRevenue: 'Portion of interest rate fees to liquidity providers in USD'
    }
};

export default adapter;
