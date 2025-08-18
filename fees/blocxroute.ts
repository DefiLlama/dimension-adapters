import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { getETHReceived } from "../helpers/token";

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const query = `
  WITH sol_payments_total AS (
      SELECT
        COALESCE(SUM(amount / 1e9), 0) AS total_paid_out_sol
      FROM tokens_solana.transfers
      WHERE
        (
          from_owner = 'HWEoBxYs7ssKuudEjzjmpfJVX7Dvi7wescFsVx2L5yoY' OR from_owner = '6hdYtb9J7tsjxmLrYRFt2dBQBZdPwuhwuqN6PJvW6jr8' OR
          from_owner = '3HvzU9NjPHGPJRiKjhWtzJj2tpUEYvnd5Gd9BQJ2CY14' OR from_owner = 'H5XW7pfEfBY4J89WSJywcU3ioqyyAaLBXSdyGa6yHjn1' OR
          from_owner = '6eVdneurMzjX6NQkRvDJeBMmREy5vBFe6UD1DzApywr6' OR from_owner = 'BCqV8d56F9QiYWyFCY3Q2nGaRHb5kRsTEzD5juAbZCZ1' OR
          from_owner = 'HKXPPT7hoqqP84aMJZbkBRDUudDzqaD4RDBtjSeteECz' OR from_owner = 'C2mqAimGSCmH3GswkBhrZLjiFJiVaM2umMuDCpibqoKG' OR
          from_owner = '5V5e274Ryp2sU9HgCwbTjoCz1fYycJLnsQet4ZXBMPGK' OR from_owner = 'ASYG4VzWea823JE7TUp8WxFgh8pmjQqVmuc25mDaAxA9' OR
          from_owner = 'GhXabK217qeLooycvKyd4okcBDSTyzXefS8o7xBPfK6w' OR from_owner = 'D8b8W3anZbmgKi38oHYKD3AganRFyznS4zXqFSzCw5iy' OR
          from_owner = 'EhoHfiEooZYkEYJfWfVkPtWiBxnLLuZhfDrPZdHentda' OR from_owner = 'DGgAJynzGt9NzwJJEMHVZXnEUGHtjUdTem1X923qW8U4' OR
          from_owner = 'A7acuGYiyGoHCRjp54qmE3WL1FPjZkEWgiSXqwyBRmET' OR from_owner = 'CDMohwhWrwX8HU1PM4zmUGZ7scBqZT3CzUjp8HPAovLZ' OR
          from_owner = '7oPG3Tdgvp76J4DtA92TDipRE9sSuXdvDYgBsoucuT3c' OR from_owner = 'DWefypurz5psZ4b1pBcW23pBKtiEpXjddZ5oeLU2pF1e' OR
          from_owner = '4Y1rM889ZicH94m8vYMAgRxH6izYfy2N7QYpwiRYTsGg' OR from_owner = '9a6qjHKGAEcFf8L43tZszqXuCDG3F2gYmhSyPFNUpbkh' OR
          from_owner = 'E39tezXPmZwaunHXK2UCvsUNkChNvTPFF5kWoAVBrNGn' OR from_owner = 'nWKzRJxu8tWU54x5eMnnUoFqvMFR5ZMdaBwm5svKwR6' OR
          from_owner = '9vTpfGYN2jtjZgXQ7gihyHmN3FseLP7uW1CWMdsgcny' OR from_owner = '2h2JLfaWg9QNVCqP2N7ynTz5vMBpytXBiDjKvewCqV9H' OR
          from_owner = 'Ai3gvnvUYNKrhNgzPohTBpJrff3BJZ8EfDYRA8oEtrHD' OR from_owner = 'GS9GRPgQjTBrJamgT2R1Q8YX2uYCikPQM6n8PnbPw91n' OR
          from_owner = '7h7C6BmUMzPDzf8CsW26PmDsB5hRmBsSADp9AvYvqaZL' OR from_owner = '8F4EjyYvxoYViug5CwDs94C6Tw2hhjFWTRwzpJ6BmZQQ' OR
          from_owner = '3Tjrxwr16AnE3fZ4EYeeHRNQSk2rvFyCG3zBDsFp1dBv' OR from_owner = '3wMPWfuxoXw2kahQubEDDfdySghF2p6bVpmSpqugbu2g' OR
          from_owner = 'GJu2DrGiLgyLMJu8evJuAec6Q5QG6Bqy9RmaNd3pV7vF' OR from_owner = '9C7PEmDoN2Y8Berwp2rCV7fNkkGHUGFMVFMNpQ5uFSA4' OR
          from_owner = '6ndTFQA2G4Ff1Kpf6HLUbjMB9iDad8EgCvqMZFvK1kbo' OR from_owner = '5afiZP4mK8pkedULx1znPu4WxJ1EgimERYqhsvxWnwZZ' OR
          from_owner = '27wfkTE5i7LsJyZAJpA9zfzarVnKxaRt4KTujkahZxJz' OR from_owner = 'Btw8oKwNh6wc9XYKBhwBMNrxaJU8GaLGLK3vkzssmkSA' OR
          from_owner = 'BpH7zAZspzUdWFBJf4pu4Vx2rory2GAjgEJfurwkJGGe' OR from_owner = 'JBdB3uFvA3886SmTcPaqGXUg6S1AAbDPEqoy2JG8muib' OR
          from_owner = 'Ln5Cc1EwFMe8UnyWsCQZmh9C27zAu4MYBW1kpJ4vrUX' OR from_owner = 'p8UB2eiJHVwhENxVNPTJjxBevusErHtXb2GSgiG7pYw'
        )
        AND
        (
          to_owner = '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5' OR
          to_owner = 'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe' OR
          to_owner = 'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY' OR
          to_owner = 'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49' OR
          to_owner = 'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh' OR
          to_owner = 'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt' OR
          to_owner = 'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL' OR
          to_owner = '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT'
        )
        AND token_mint_address = '${ADDRESSES.solana.SOL}'
        AND TIME_RANGE
    ),
    sol_collections_total AS (
      SELECT
        COALESCE(SUM(CASE WHEN tx_success = TRUE THEN balance_change / 1e9 ELSE 0 END), 0) AS total_collected_sol
      FROM solana.account_activity
      WHERE
        (
          address = 'HWEoBxYs7ssKuudEjzjmpfJVX7Dvi7wescFsVx2L5yoY' OR address = '7ks326H4LbMVaUC8nW5FpC5EoAf5eK5pf4Dsx4HDQLpq' OR
          address = '95cfoy472fcQHaw4tPGBTKpn6ZQnfEPfBgDQx6gcRmRg' OR address = '6GZVKMaoWry4UFiydjeQU9nmAxj3hEARAStQ7Hc2z6TB' OR
          address = 'HZTmLyC683y74TW3HtGbNX5orxjm2sPuZBEYwwSgAM8v' OR address = 'FogxVNs6Mm2w9rnGL1vkARSwJxvLE8mujTv3LK8RnUhF' OR
          address = '3UQUKjhMKaY2S6bjcQD6yHB7utcZt5bfarRCmctpRtUd'
        )
        AND balance_change >= 0
        AND token_mint_address IS NULL
        AND TIME_RANGE
    )
    SELECT
      (COALESCE(c.total_collected_sol, 0) - COALESCE(p.total_paid_out_sol, 0)) AS revenue
    FROM sol_payments_total p, sol_collections_total c
  `;
  const data = await queryDuneSql(options, query);
  const dailyFees = options.createBalances();
  dailyFees.addCGToken('solana', data[0].revenue);
  return { dailyFees: dailyFees }
}

// https://docs.bloxroute.com/bsc-and-eth/apis/transaction-bundles/bundle-submission/bsc-bundle-submission
const fetchBSC: any = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = await getETHReceived({
    options,
    target: '0x74c5F8C6ffe41AD4789602BDB9a48E6Cad623520',
  })
  return { dailyFees }
}

const adapter: SimpleAdapter = {
  version: 1,
  methodology: {
    Fees: "mev fees to blocXroute, substracted routed jito mev fees to prevent double counting",
  },
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
    },
    [CHAIN.BSC]: {
      fetch: fetchBSC,
      start: '2024-04-15',
    }
  },
  isExpensiveAdapter: true
};

export default adapter;
