// Core billing-related logic kept pure and testable.

/**
 * Compute whether a bill is overdue.
 * @param {string|Date} dueDateISO - due date in ISO format or Date
 * @param {string|Date} [now] - current time for testability
 * @returns {boolean}
 */
export function isOverdue(dueDateISO, now = new Date()) {
  const due =
    dueDateISO instanceof Date ? dueDateISO : new Date(String(dueDateISO));
  const current = now instanceof Date ? now : new Date(String(now));
  if (Number.isNaN(due.getTime()) || Number.isNaN(current.getTime())) {
    return false;
  }
  return current > due;
}

/**
 * Build CSV content for a list of bill objects.
 * @param {Array<object>} bills
 * @returns {string} CSV string
 */
export function buildBillsCsv(bills) {
  const headers = [
    "id",
    "memberId",
    "memberName",
    "amount",
    "dueDate",
    "paid",
    "createdAt",
  ];
  const lines = [headers.join(",")];
  for (const bill of bills || []) {
    const row = headers
      .map((key) => {
        const raw = bill[key] != null ? String(bill[key]) : "";
        const escaped = raw.replace(/"/g, '""');
        return `"${escaped}"`;
      })
      .join(",");
    lines.push(row);
  }
  return lines.join("\n");
}


