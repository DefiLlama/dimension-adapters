import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { getETHReceived } from "../helpers/token";

const fetch: any = async (_a:any, _b:any, options: FetchOptions) => {
  const query = `
    WITH sol_payments_details AS (
      SELECT
        CASE
          WHEN tx_success = TRUE
          THEN balance_change / 1e9
          ELSE 0
        END AS payment_amount
      FROM solana.account_activity
      WHERE
        (
          address = 'HWEoBxYs7ssKuudEjzjmpfJVX7Dvi7wescFsVx2L5yoY' OR
          address = '6hdYtb9J7tsjxmLrYRFt2dBQBZdPwuhwuqN6PJvW6jr8' OR
          address = '3HvzU9NjPHGPJRiKjhWtzJj2tpUEYvnd5Gd9BQJ2CY14' OR
          address = 'H5XW7pfEfBY4J89WSJywcU3ioqyyAaLBXSdyGa6yHjn1' OR
          address = '6eVdneurMzjX6NQkRvDJeBMmREy5vBFe6UD1DzApywr6' OR
          address = 'BCqV8d56F9QiYWyFCY3Q2nGaRHb5kRsTEzD5juAbZCZ1' OR
          address = 'HKXPPT7hoqqP84aMJZbkBRDUudDzqaD4RDBtjSeteECz' OR
          address = 'C2mqAimGSCmH3GswkBhrZLjiFJiVaM2umMuDCpibqoKG' OR
          address = '5V5e274Ryp2sU9HgCwbTjoCz1fYycJLnsQet4ZXBMPGK' OR
          address = 'ASYG4VzWea823JE7TUp8WxFgh8pmjQqVmuc25mDaAxA9' OR
          address = 'GhXabK217qeLooycvKyd4okcBDSTyzXefS8o7xBPfK6w' OR
          address = 'D8b8W3anZbmgKi38oHYKD3AganRFyznS4zXqFSzCw5iy' OR
          address = 'EhoHfiEooZYkEYJfWfVkPtWiBxnLLuZhfDrPZdHentda' OR
          address = 'DGgAJynzGt9NzwJJEMHVZXnEUGHtjUdTem1X923qW8U4' OR
          address = 'A7acuGYiyGoHCRjp54qmE3WL1FPjZkEWgiSXqwyBRmET' OR
          address = 'CDMohwhWrwX8HU1PM4zmUGZ7scBqZT3CzUjp8HPAovLZ' OR
          address = '7oPG3Tdgvp76J4DtA92TDipRE9sSuXdvDYgBsoucuT3c' OR
          address = 'DWefypurz5psZ4b1pBcW23pBKtiEpXjddZ5oeLU2pF1e' OR
          address = '4Y1rM889ZicH94m8vYMAgRxH6izYfy2N7QYpwiRYTsGg' OR
          address = '9a6qjHKGAEcFf8L43tZszqXuCDG3F2gYmhSyPFNUpbkh' OR
          address = 'E39tezXPmZwaunHXK2UCvsUNkChNvTPFF5kWoAVBrNGn' OR
          address = 'nWKzRJxu8tWU54x5eMnnUoFqvMFR5ZMdaBwm5svKwR6' OR
          address = '9vTpfGYN2jtjZgXQ7gihyHmN3FseLP7uW1CWMdsgcny' OR
          address = '2h2JLfaWg9QNVCqP2N7ynTz5vMBpytXBiDjKvewCqV9H' OR
          address = 'Ai3gvnvUYNKrhNgzPohTBpJrff3BJZ8EfDYRA8oEtrHD' OR
          address = 'GS9GRPgQjTBrJamgT2R1Q8YX2uYCikPQM6n8PnbPw91n' OR
          address = '7h7C6BmUMzPDzf8CsW26PmDsB5hRmBsSADp9AvYvqaZL' OR
          address = '8F4EjyYvxoYViug5CwDs94C6Tw2hhjFWTRwzpJ6BmZQQ' OR
          address = '3Tjrxwr16AnE3fZ4EYeeHRNQSk2rvFyCG3zBDsFp1dBv' OR
          address = '3wMPWfuxoXw2kahQubEDDfdySghF2p6bVpmSpqugbu2g' OR
          address = 'GJu2DrGiLgyLMJu8evJuAec6Q5QG6Bqy9RmaNd3pV7vF' OR
          address = '9C7PEmDoN2Y8Berwp2rCV7fNkkGHUGFMVFMNpQ5uFSA4' OR
          address = '6ndTFQA2G4Ff1Kpf6HLUbjMB9iDad8EgCvqMZFvK1kbo' OR
          address = '5afiZP4mK8pkedULx1znPu4WxJ1EgimERYqhsvxWnwZZ' OR
          address = '27wfkTE5i7LsJyZAJpA9zfzarVnKxaRt4KTujkahZxJz' OR
          address = 'Btw8oKwNh6wc9XYKBhwBMNrxaJU8GaLGLK3vkzssmkSA' OR
          address = 'BpH7zAZspzUdWFBJf4pu4Vx2rory2GAjgEJfurwkJGGe' OR
          address = 'JBdB3uFvA3886SmTcPaqGXUg6S1AAbDPEqoy2JG8muib' OR
          address = 'Ln5Cc1EwFMe8UnyWsCQZmh9C27zAu4MYBW1kpJ4vrUX' OR
          address = 'p8UB2eiJHVwhENxVNPTJjxBevusErHtXb2GSgiG7pYw'
        )
        AND balance_change < 0
        AND token_mint_address IS NULL
        AND TIME_RANGE
    ),
    sol_collections_details AS (
      SELECT
        tx_success,
        CASE
          WHEN tx_success = TRUE
          THEN balance_change / 1e9
          ELSE 0
        END AS collection_amount
      FROM solana.account_activity
      WHERE
        (address = 'HWEoBxYs7ssKuudEjzjmpfJVX7Dvi7wescFsVx2L5yoY' OR
        address = '7ks326H4LbMVaUC8nW5FpC5EoAf5eK5pf4Dsx4HDQLpq' OR
        address = '95cfoy472fcQHaw4tPGBTKpn6ZQnfEPfBgDQx6gcRmRg' OR
        address = '6GZVKMaoWry4UFiydjeQU9nmAxj3hEARAStQ7Hc2z6TB' OR
        address = 'HZTmLyC683y74TW3HtGbNX5orxjm2sPuZBEYwwSgAM8v'
    )
        AND balance_change >= 0
        AND token_mint_address IS NULL
        AND TIME_RANGE
    ),
    aggregated_payments AS (
      SELECT
        SUM(payment_amount) AS total_paid_out_value
      FROM sol_payments_details
    ),
    aggregated_collections AS (
        SELECT
          SUM(collection_amount) AS total_collected_value
        FROM sol_collections_details
    )
    SELECT
        B.total_collected_value AS send_tips,
        -A.total_paid_out_value AS received_tips,
        (-A.total_paid_out_value - B.total_collected_value) AS revenue
    FROM aggregated_payments A, aggregated_collections B
  `
  const data = await queryDuneSql(options, query);
  const dailyFees = options.createBalances();
  dailyFees.addCGToken('solana', data[0].revenue);
  return { dailyFees: dailyFees }

}

// https://docs.bloxroute.com/bsc-and-eth/apis/transaction-bundles/bundle-submission/bsc-bundle-submission
const fetchBSC: any = async (_a:any, _b:any, options: FetchOptions) => {
  const dailyFees = await getETHReceived({
    options,
    target: '0x74c5F8C6ffe41AD4789602BDB9a48E6Cad623520',
  })
  return { dailyFees }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      meta: {
        methodology: {
          fees: "mev fees to blocXroute, substracted routed jito mev fees to prevent double counting",
        }
      }
    },
    [CHAIN.BSC]: {
      fetch: fetchBSC,
      start: '2024-04-15',
      meta:{
        methodology: {
          fees: "mev fees to blocXroute, substracted routed jito mev fees to prevent double counting",
        }
      }
    }
  },
  isExpensiveAdapter: true
};

export default adapter;
