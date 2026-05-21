import { Adapter, Dependencies, FetchOptions } from "../../adapters/types";
import { queryAllium } from "../../helpers/allium";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const ZEST_V2_DEPLOYER = "SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7";

interface VaultData {
    suffix: string;
    cgId: string;
    decimals: number;
    reserveFactorBps: number;
}

// Source: Zest v2 mainnet contracts and vault get-fee-reserve read-only calls.
const vaultList: VaultData[] = [
    { suffix: "v0-vault-stx", cgId: "blockstack", decimals: 6, reserveFactorBps: 1_000 },
    { suffix: "v0-vault-sbtc", cgId: "bitcoin", decimals: 8, reserveFactorBps: 1_000 },
    { suffix: "v0-vault-ststx", cgId: "stacking-dao", decimals: 6, reserveFactorBps: 1_000 },
    { suffix: "v0-vault-ststxbtc", cgId: "bitcoin", decimals: 6, reserveFactorBps: 1_000 },
    { suffix: "v0-vault-usdc", cgId: "usd-coin", decimals: 6, reserveFactorBps: 5_000 },
    { suffix: "v0-vault-usdh", cgId: "hermetica-usdh", decimals: 6, reserveFactorBps: 5_000 },
];
const VAULTS: Record<string, VaultData> = Object.fromEntries(
    vaultList.map((vault) => [`${ZEST_V2_DEPLOYER}.${vault.suffix}`, vault])
);

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const vaults = Object.keys(VAULTS).map((v) => `'${v}'`).join(",");

    const rows: {
        contract_id: string;
        borrow_interest: number;
        flashloan_fees: number;
    }[] = await queryAllium(`
    WITH logs AS (
      SELECT
        e.event_contents:contract_log:contract_id::string AS contract_id,
        e.event_contents:contract_log:value:repr::string AS repr
      FROM stacks.raw.events e
      JOIN stacks.raw.transactions t ON e.tx_id = t.tx_id
      WHERE e.burn_block_time >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND e.burn_block_time < TO_TIMESTAMP_NTZ(${options.endTimestamp})
        AND t.tx_status = 'success'
        AND t.canonical
        AND t.microblock_canonical
        AND e.event_type = 'smart_contract_log'
        AND e.event_contents:contract_log:contract_id::string IN (${vaults})
    )
    SELECT
      contract_id,
      SUM(COALESCE(TRY_TO_NUMBER(REGEXP_SUBSTR(repr, 'interest-paid u([0-9]+)', 1, 1, 'e', 1)), 0)) AS borrow_interest,
      SUM(COALESCE(TRY_TO_NUMBER(REGEXP_SUBSTR(repr, '\\(action "flashloan"\\).*fee u([0-9]+)', 1, 1, 'e', 1)), 0)) AS flashloan_fees
    FROM logs
    WHERE repr LIKE '%(action "system-repay")%'
      OR repr LIKE '%(action "flashloan")%'
    GROUP BY contract_id
  `);

    for (const row of rows) {
        const vault = VAULTS[row.contract_id];
        if (!vault) throw new Error(`Unexpected Zest vault in Allium response: ${row.contract_id}`);
        const { cgId, decimals, reserveFactorBps } = vault;

        const scale = 10 ** decimals;
        const borrowInterest = Number(row.borrow_interest ?? 0) / scale;
        const flashloanFees = Number(row.flashloan_fees ?? 0) / scale;
        const protocolInterest = borrowInterest * reserveFactorBps / 10_000;

        dailyFees.addCGToken(cgId, borrowInterest, METRIC.BORROW_INTEREST);
        dailyFees.addCGToken(cgId, flashloanFees, METRIC.FLASHLOAN_FEES);
        dailyRevenue.addCGToken(cgId, protocolInterest, METRIC.PROTOCOL_FEES);
        dailyRevenue.addCGToken(cgId, flashloanFees, METRIC.FLASHLOAN_FEES);
        dailySupplySideRevenue.addCGToken(cgId, borrowInterest - protocolInterest, METRIC.BORROW_INTEREST);
    }

    return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const methodology = {
    Fees: "Interest paid by borrowers, plus any flashloan fees paid to Zest v2 vaults.",
    Revenue: "The share of borrower interest kept by the protocol, plus all flashloan fees.",
    ProtocolRevenue: "The share of borrower interest kept by the protocol treasury, plus all flashloan fees.",
    SupplySideRevenue: "The remaining borrower interest paid to vault depositors.",
};

const breakdownMethodology = {
    Fees: {
        [METRIC.BORROW_INTEREST]: "Interest paid when borrowers repay Zest v2 vault loans.",
        [METRIC.FLASHLOAN_FEES]: "Fees paid by users who take Zest v2 flashloans.",
    },
    Revenue: {
        [METRIC.PROTOCOL_FEES]: "Protocol share of borrower interest sent to the treasury.",
        [METRIC.FLASHLOAN_FEES]: "Flashloan fees sent to the treasury.",
    },
    ProtocolRevenue: {
        [METRIC.PROTOCOL_FEES]: "Protocol share of borrower interest sent to the treasury.",
        [METRIC.FLASHLOAN_FEES]: "Flashloan fees sent to the treasury.",
    },
    SupplySideRevenue: {
        [METRIC.BORROW_INTEREST]: "Borrower interest paid to vault depositors after the protocol share.",
    },
};

const adapter: Adapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.STACKS],
    start: "2026-01-27",
    isExpensiveAdapter: true,
    dependencies: [Dependencies.ALLIUM],
    methodology,
    breakdownMethodology,
};

export default adapter;
