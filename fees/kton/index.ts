import { tonLstExport } from "../../helpers/tonLst";

export default {
  ...tonLstExport({
    // KTON liquid staking pool: https://tonviewer.com/EQA9HwEZD_tONfVz6lJS0PVKR5viEiEGyj9AuQewGQVnXPg0
    poolAddress: 'EQA9HwEZD_tONfVz6lJS0PVKR5viEiEGyj9AuQewGQVnXPg0',
  }),
  // The pool was deployed and set up on 2025-03-21 and 2025-03-22; full
  // daily data starts the day after.
  start: '2025-03-23',
};
