import { buildBillsCsv } from "./billingService.js";
import { appLogger } from "./logger.js";

export function downloadBillsCsv(bills, filename = "gym-bills.csv") {
  const csv = buildBillsCsv(bills);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  appLogger.info("bills_csv_exported", { count: bills.length });
}


