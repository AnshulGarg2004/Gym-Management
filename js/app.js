import { Logger, appLogger } from "./logger.js";
import {
  initFirebase,
  onAuthStateChanged,
  signUpWithEmail,
  signInWithEmail,
  signOut as firebaseSignOut,
  getUsersCollection,
  getMembersCollection,
  getBillsCollection,
  getNotificationsCollection,
  getSupplementsCollection,
  getDietsCollection,
} from "./firebaseService.js";
import { isOverdue } from "./billingService.js";
import { downloadBillsCsv } from "./exportService.js";

Logger.configure({ level: "info" });

let currentUser = null;
let currentRole = "guest";
let memberProfile = null;

let membersCache = [];
let billsCache = [];

const views = {};
const navButtons = [];

const els = {};

function $(id) {
  return document.getElementById(id);
}

function collectElements() {
  els.rolePill = $("role-pill");
  els.currentUserLabel = $("current-user-label");
  els.toast = $("toast");

  els.viewLogin = $("view-login");
  els.viewAdmin = $("view-admin");
  els.viewMember = $("view-member");
  els.viewUser = $("view-user");

  els.formLogin = $("form-login");
  els.loginEmail = $("login-email");
  els.loginPassword = $("login-password");
  els.loginRole = $("login-role");

  els.formSignup = $("form-signup");
  els.signupName = $("signup-name");
  els.signupEmail = $("signup-email");
  els.signupPassword = $("signup-password");
  els.signupPasswordConfirm = $("signup-password-confirm");
  els.signupRole = $("signup-role");
  els.btnShowSignup = $("btn-show-signup");
  els.btnShowLogin = $("btn-show-login");

  els.btnLogout = $("btn-logout");

  els.adminTabsRoot = document.querySelector("[data-tabs='admin-tabs']");

  // Admin: members
  els.formMember = $("form-member");
  els.memberId = $("member-id");
  els.memberName = $("member-name");
  els.memberEmail = $("member-email");
  els.memberPhone = $("member-phone");
  els.memberPackage = $("member-package");
  els.btnMemberReset = $("btn-member-reset");
  els.membersList = $("members-list");
  els.searchMembers = $("search-members");

  // Admin: billing
  els.formBill = $("form-bill");
  els.billMember = $("bill-member");
  els.billAmount = $("bill-amount");
  els.billDue = $("bill-due");
  els.billPaid = $("bill-paid");
  els.billsList = $("bills-list");

  // Admin: notifications
  els.formMonthlyNotifications = $("form-monthly-notifications");
  els.notifMonth = $("notif-month");
  els.notificationsList = $("notifications-list");

  // Admin: reports
  els.reportFrom = $("report-from");
  els.reportTo = $("report-to");
  els.btnExportBills = $("btn-export-bills");

  // Admin: supplements
  els.formSupplement = $("form-supplement");
  els.suppName = $("supp-name");
  els.suppPrice = $("supp-price");
  els.suppDescription = $("supp-description");
  els.suppInStock = $("supp-instock");
  els.supplementsList = $("supplements-list");

  // Admin: diet
  els.formDiet = $("form-diet");
  els.dietMember = $("diet-member");
  els.dietTitle = $("diet-title");
  els.dietDetails = $("diet-details");
  els.dietList = $("diet-list");

  // Member view
  els.memberBillsList = $("member-bills-list");
  els.memberNotificationsList = $("member-notifications-list");

  // User search view
  els.formSearchRecords = $("form-search-records");
  els.searchEmail = $("search-email");
  els.searchResult = $("search-result");
}

function setupNav() {
  const nav = document.querySelectorAll("#nav .nav-item");
  nav.forEach((btn) => {
    navButtons.push(btn);
    const targetId = btn.getAttribute("data-target");
    if (targetId) {
      views[targetId] = $(targetId);
    }
    btn.addEventListener("click", () => {
      const role = btn.getAttribute("data-role");
      if (role && role !== currentRole) {
        showToast("You don't have access to this area.", "error");
        appLogger.warn("nav_access_denied", { targetId, requiredRole: role, currentRole });
        return;
      }
      activateNav(btn);
      showView(targetId);
    });
  });
}

function activateNav(activeBtn) {
  navButtons.forEach((btn) => {
    if (btn === activeBtn) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

function showView(targetId) {
  Object.entries(views).forEach(([id, el]) => {
    if (!el) return;
    el.classList.toggle("active", id === targetId);
  });
  appLogger.info("view_changed", { view: targetId, role: currentRole });
}

let toastTimeout;
function showToast(message, type = "info") {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.classList.remove("error");
  if (type === "error") {
    els.toast.classList.add("error");
  }
  els.toast.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    els.toast.classList.remove("visible");
  }, 3200);
}

function updateRoleUI() {
  if (els.rolePill) {
    const label =
      currentRole === "guest"
        ? "Guest"
        : currentRole.charAt(0).toUpperCase() + currentRole.slice(1);
    els.rolePill.textContent = label;
  }

  navButtons.forEach((btn) => {
    const navRole = btn.getAttribute("data-role");
    if (!navRole) return;
    const show = currentRole === navRole;
    btn.style.display = show ? "" : "none";
  });
}

function setUserContext(user, role = "guest") {
  currentUser = user;
  currentRole = role || "guest";
  if (els.currentUserLabel) {
    if (user) {
      els.currentUserLabel.textContent = `${user.email} · ${currentRole}`;
    } else {
      els.currentUserLabel.textContent = "Not signed in";
    }
  }
  updateRoleUI();
}

function showAuthMode(mode) {
  const showLogin = mode === "login";
  if (els.formLogin) {
    els.formLogin.style.display = showLogin ? "flex" : "none";
  }
  if (els.formSignup) {
    els.formSignup.style.display = showLogin ? "none" : "flex";
  }
}

async function resolveUserRole(user) {
  if (!user) return "guest";
  try {
    const usersRef = getUsersCollection();
    const doc = await usersRef.doc(user.uid).get();
    if (doc.exists) {
      const data = doc.data();
      return data.role || "guest";
    }
    return "guest";
  } catch (err) {
    appLogger.error("resolve_user_role_failed", { error: String(err) });
    return "guest";
  }
}

async function upsertUserProfile(user, role) {
  if (!user) return;
  const usersRef = getUsersCollection();
  await usersRef.doc(user.uid).set(
    {
      email: user.email,
      role,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
  appLogger.info("user_profile_upserted", { uid: user.uid, role });
}

async function handleLoginSubmit(ev) {
  ev.preventDefault();
  const email = els.loginEmail.value.trim();
  const password = els.loginPassword.value;
  const roleFromForm = els.loginRole.value;
  if (!email || !password) return;

  try {
    appLogger.info("login_submit", { email, requestedRole: roleFromForm });
    const user = await signInWithEmail(email, password);
    await upsertUserProfile(user, roleFromForm);
    const resolvedRole = await resolveUserRole(user);
    setUserContext(user, resolvedRole);
    await loadPostLoginData();
    showToast(`Welcome, ${resolvedRole}!`);
    showView(resolvedRole === "admin" ? "view-admin" : resolvedRole === "member" ? "view-member" : "view-user");
    const navTarget = Array.from(navButtons).find(
      (btn) => btn.getAttribute("data-target") === (resolvedRole === "admin"
          ? "view-admin"
          : resolvedRole === "member"
          ? "view-member"
          : "view-user")
    );
    if (navTarget) activateNav(navTarget);
  } catch (err) {
    appLogger.error("login_failed", { email, error: String(err) });
    showToast("Login failed. Check credentials or Firebase rules.", "error");
  }
}

async function handleSignupSubmit(ev) {
  ev.preventDefault();
  const name = (els.signupName?.value || "").trim();
  const email = (els.signupEmail?.value || "").trim();
  const password = els.signupPassword?.value || "";
  const confirm = els.signupPasswordConfirm?.value || "";
  const roleFromForm = els.signupRole?.value || "member";

  if (!email || !password || !confirm) return;
  if (password !== confirm) {
    showToast("Passwords do not match.", "error");
    return;
  }
  if (password.length < 6) {
    showToast("Password must be at least 6 characters.", "error");
    return;
  }

  try {
    appLogger.info("signup_submit", { email, requestedRole: roleFromForm });
    const user = await signUpWithEmail(email, password);
    await upsertUserProfile(user, roleFromForm);

    if (roleFromForm === "member") {
      try {
        const membersRef = getMembersCollection();
        await membersRef.add({
          name: name || email,
          email,
          createdAt: new Date().toISOString(),
        });
        appLogger.info("member_auto_created_from_signup", { email });
      } catch (innerErr) {
        appLogger.error("member_auto_create_failed", {
          email,
          error: String(innerErr),
        });
      }
    }

    const resolvedRole = await resolveUserRole(user);
    setUserContext(user, resolvedRole);
    await loadPostLoginData();
    showToast(`Welcome, ${resolvedRole}! Account created.`);
    showView(
      resolvedRole === "admin"
        ? "view-admin"
        : resolvedRole === "member"
        ? "view-member"
        : "view-user"
    );
    const navTarget = Array.from(navButtons).find(
      (btn) =>
        btn.getAttribute("data-target") ===
        (resolvedRole === "admin"
          ? "view-admin"
          : resolvedRole === "member"
          ? "view-member"
          : "view-user")
    );
    if (navTarget) activateNav(navTarget);
  } catch (err) {
    appLogger.error("signup_failed", { email, error: String(err) });
    showToast("Sign up failed. Check console for details.", "error");
  }
}

async function handleLogout() {
  try {
    await firebaseSignOut();
    memberProfile = null;
    membersCache = [];
    billsCache = [];
    setUserContext(null, "guest");
    showView("view-login");
    activateNav(
      navButtons.find((btn) => btn.getAttribute("data-target") === "view-login")
    );
    showToast("Signed out.");
  } catch (err) {
    appLogger.error("logout_failed", { error: String(err) });
    showToast("Failed to sign out.", "error");
  }
}

async function loadMembers() {
  const ref = getMembersCollection();
  const snap = await ref.orderBy("name").get();
  membersCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  appLogger.info("members_loaded", { count: membersCache.length });
  renderMembersTable(membersCache);
  updateMemberSelects(membersCache);
}

function renderMembersTable(members) {
  if (!els.membersList) return;
  if (!members || members.length === 0) {
    els.membersList.innerHTML =
      '<div class="badge-muted" style="padding:8px;">No members yet.</div>';
    return;
  }
  const rows = members
    .map(
      (m) => `
      <tr data-id="${m.id}">
        <td>${m.name || ""}</td>
        <td>${m.email || ""}</td>
        <td>${m.phone || ""}</td>
        <td>${m.packageName || ""}</td>
        <td>
          <button class="btn-secondary small" data-action="edit">Edit</button>
          <button class="btn-secondary small" data-action="delete">Delete</button>
        </td>
      </tr>`
    )
    .join("");
  els.membersList.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Phone</th>
          <th>Package</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function updateMemberSelects(members) {
  const optionsHtml = members
    .map(
      (m) =>
        `<option value="${m.id}" data-email="${m.email || ""}">${m.name || m.email}</option>`
    )
    .join("");
  if (els.billMember) {
    els.billMember.innerHTML = `<option value="">Select member</option>${optionsHtml}`;
  }
  if (els.dietMember) {
    els.dietMember.innerHTML = `<option value="">General plan</option>${optionsHtml}`;
  }
}

async function handleMemberSubmit(ev) {
  ev.preventDefault();
  const payload = {
    name: els.memberName.value.trim(),
    email: els.memberEmail.value.trim(),
    phone: els.memberPhone.value.trim(),
    packageName: els.memberPackage.value,
    updatedAt: new Date().toISOString(),
  };
  const id = els.memberId.value;
  const ref = getMembersCollection();
  try {
    if (id) {
      await ref.doc(id).update(payload);
      appLogger.info("member_updated", { id });
      showToast("Member updated.");
    } else {
      payload.createdAt = new Date().toISOString();
      const docRef = await ref.add(payload);
      appLogger.info("member_created", { id: docRef.id });
      showToast("Member created.");
    }
    els.formMember.reset();
    els.memberId.value = "";
    await loadMembers();
  } catch (err) {
    appLogger.error("member_save_failed", { error: String(err) });
    showToast("Failed to save member.", "error");
  }
}

function handleMemberTableClick(ev) {
  const actionBtn = ev.target.closest("button[data-action]");
  if (!actionBtn) return;
  const action = actionBtn.getAttribute("data-action");
  const row = actionBtn.closest("tr[data-id]");
  if (!row) return;
  const id = row.getAttribute("data-id");
  const member = membersCache.find((m) => m.id === id);
  if (!member) return;

  if (action === "edit") {
    els.memberId.value = member.id;
    els.memberName.value = member.name || "";
    els.memberEmail.value = member.email || "";
    els.memberPhone.value = member.phone || "";
    els.memberPackage.value = member.packageName || "";
  } else if (action === "delete") {
    const confirmed = window.confirm(
      `Delete member "${member.name || member.email}"?`
    );
    if (!confirmed) return;
    deleteMember(id);
  }
}

async function deleteMember(id) {
  try {
    await getMembersCollection().doc(id).delete();
    appLogger.warn("member_deleted", { id });
    showToast("Member deleted.");
    await loadMembers();
  } catch (err) {
    appLogger.error("member_delete_failed", { error: String(err) });
    showToast("Failed to delete member.", "error");
  }
}

function handleMemberSearch() {
  const term = (els.searchMembers.value || "").toLowerCase();
  if (!term) {
    renderMembersTable(membersCache);
    return;
  }
  const filtered = membersCache.filter((m) => {
    return (
      (m.name || "").toLowerCase().includes(term) ||
      (m.email || "").toLowerCase().includes(term)
    );
  });
  renderMembersTable(filtered);
}

async function handleBillSubmit(ev) {
  ev.preventDefault();
  const memberId = els.billMember.value;
  const amount = parseFloat(els.billAmount.value);
  const dueDate = els.billDue.value;
  const paid = !!els.billPaid.checked;
  if (!memberId || !amount || !dueDate) return;
  const member = membersCache.find((m) => m.id === memberId);
  const payload = {
    memberId,
    memberName: member ? member.name : "",
    amount: amount.toFixed(2),
    dueDate,
    paid,
    createdAt: new Date().toISOString(),
  };
  try {
    const ref = getBillsCollection();
    const docRef = await ref.add(payload);
    appLogger.info("bill_created", { id: docRef.id, memberId });
    await createNotificationForBill(memberId, payload);
    els.formBill.reset();
    await loadBills();
    showToast("Bill created and member notified.");
  } catch (err) {
    appLogger.error("bill_create_failed", { error: String(err) });
    showToast("Failed to create bill.", "error");
  }
}

async function loadBills() {
  const ref = getBillsCollection();
  const snap = await ref.orderBy("createdAt", "desc").limit(100).get();
  billsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  appLogger.info("bills_loaded", { count: billsCache.length });
  renderBillsTable(billsCache);
}

function renderBillsTable(bills) {
  if (!els.billsList) return;
  if (!bills || bills.length === 0) {
    els.billsList.innerHTML =
      '<div class="badge-muted" style="padding:8px;">No bills yet.</div>';
    return;
  }
  const rows = bills
    .map((b) => {
      const overdue = !b.paid && isOverdue(b.dueDate);
      const statusLabel = b.paid
        ? '<span class="chip chip-pill">Paid</span>'
        : overdue
        ? '<span class="chip chip-danger">Overdue</span>'
        : '<span class="chip chip-pill">Pending</span>';
      return `
      <tr>
        <td>${b.memberName || ""}</td>
        <td>${b.amount || ""}</td>
        <td>${b.dueDate || ""}</td>
        <td>${statusLabel}</td>
      </tr>`;
    })
    .join("");
  els.billsList.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Member</th>
          <th>Amount</th>
          <th>Due</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

async function createNotificationForBill(memberId, bill) {
  const ref = getNotificationsCollection();
  const doc = {
    memberId,
    type: "bill_created",
    title: "New bill created",
    message: `A bill of ₹${bill.amount} due on ${bill.dueDate} has been created.`,
    createdAt: new Date().toISOString(),
    read: false,
  };
  await ref.add(doc);
  appLogger.info("notification_bill_created", { memberId });
}

async function handleMonthlyNotifications(ev) {
  ev.preventDefault();
  const month = els.notifMonth.value;
  if (!month) return;
  if (!membersCache.length) {
    await loadMembers();
  }
  const ref = getNotificationsCollection();
  const created = [];
  for (const m of membersCache) {
    const doc = {
      memberId: m.id,
      type: "monthly_fee",
      title: `Monthly fee reminder - ${month}`,
      message: `Your monthly membership fee for ${month} is due soon.`,
      month,
      createdAt: new Date().toISOString(),
      read: false,
    };
    const added = await ref.add(doc);
    created.push(added.id);
  }
  appLogger.info("monthly_notifications_created", {
    month,
    count: created.length,
  });
  showToast(`Created ${created.length} monthly notifications.`);
  await loadNotifications();
}

async function loadNotifications() {
  const ref = getNotificationsCollection();
  const snap = await ref.orderBy("createdAt", "desc").limit(100).get();
  const notifications = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderNotificationsTable(notifications, els.notificationsList);
}

function renderNotificationsTable(notifications, container) {
  if (!container) return;
  if (!notifications || notifications.length === 0) {
    container.innerHTML =
      '<div class="badge-muted" style="padding:8px;">No notifications yet.</div>';
    return;
  }
  const rows = notifications
    .map(
      (n) => `
    <tr>
      <td>${n.title || ""}</td>
      <td>${n.message || ""}</td>
      <td>${n.month || ""}</td>
      <td>${n.createdAt || ""}</td>
    </tr>`
    )
    .join("");
  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Title</th>
          <th>Message</th>
          <th>Month</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

async function handleExportBills() {
  if (!billsCache.length) {
    await loadBills();
  }
  const from = els.reportFrom.value ? new Date(els.reportFrom.value) : null;
  const to = els.reportTo.value ? new Date(els.reportTo.value) : null;
  let bills = billsCache;
  if (from || to) {
    bills = bills.filter((b) => {
      const created = new Date(b.createdAt || b.dueDate);
      if (from && created < from) return false;
      if (to && created > to) return false;
      return true;
    });
  }
  if (!bills.length) {
    showToast("No bills in this date range.", "error");
    return;
  }
  downloadBillsCsv(bills);
}

async function handleSupplementSubmit(ev) {
  ev.preventDefault();
  const name = els.suppName.value.trim();
  const price = parseFloat(els.suppPrice.value);
  const description = els.suppDescription.value.trim();
  const inStock = !!els.suppInStock.checked;
  if (!name || !price) return;
  const doc = {
    name,
    price: price.toFixed(2),
    description,
    inStock,
    createdAt: new Date().toISOString(),
  };
  try {
    const ref = getSupplementsCollection();
    const added = await ref.add(doc);
    appLogger.info("supplement_saved", { id: added.id });
    els.formSupplement.reset();
    await loadSupplements();
    showToast("Supplement saved.");
  } catch (err) {
    appLogger.error("supplement_save_failed", { error: String(err) });
    showToast("Failed to save supplement.", "error");
  }
}

async function loadSupplements() {
  const ref = getSupplementsCollection();
  const snap = await ref.orderBy("createdAt", "desc").get();
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (!els.supplementsList) return;
  if (!items.length) {
    els.supplementsList.innerHTML =
      '<div class="badge-muted" style="padding:8px;">No supplements yet.</div>';
    return;
  }
  const rows = items
    .map(
      (s) => `
    <tr>
      <td>${s.name || ""}</td>
      <td>${s.price || ""}</td>
      <td>${s.inStock ? "In stock" : "Out of stock"}</td>
    </tr>`
    )
    .join("");
  els.supplementsList.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Price</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

async function handleDietSubmit(ev) {
  ev.preventDefault();
  const memberId = els.dietMember.value || null;
  const title = els.dietTitle.value.trim();
  const details = els.dietDetails.value.trim();
  if (!title || !details) return;
  let memberName = null;
  if (memberId) {
    const m = membersCache.find((m) => m.id === memberId);
    memberName = m ? m.name : null;
  }
  const doc = {
    memberId,
    memberName,
    title,
    details,
    createdAt: new Date().toISOString(),
  };
  try {
    const ref = getDietsCollection();
    const added = await ref.add(doc);
    appLogger.info("diet_saved", { id: added.id });
    els.formDiet.reset();
    await loadDiets();
    showToast("Diet plan saved.");
  } catch (err) {
    appLogger.error("diet_save_failed", { error: String(err) });
    showToast("Failed to save diet plan.", "error");
  }
}

async function loadDiets() {
  const ref = getDietsCollection();
  const snap = await ref.orderBy("createdAt", "desc").get();
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (!els.dietList) return;
  if (!items.length) {
    els.dietList.innerHTML =
      '<div class="badge-muted" style="padding:8px;">No diet plans yet.</div>';
    return;
  }
  const rows = items
    .map(
      (d) => `
    <tr>
      <td>${d.title || ""}</td>
      <td>${d.memberName || d.memberId || "General"}</td>
      <td>${d.details || ""}</td>
      <td>${d.createdAt || ""}</td>
    </tr>`
    )
    .join("");
  els.dietList.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Title</th>
          <th>For</th>
          <th>Details</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

async function loadMemberDashboard() {
  if (!currentUser) return;
  if (!memberProfile) {
    const ref = getMembersCollection();
    const snap = await ref.where("email", "==", currentUser.email).limit(1).get();
    memberProfile = snap.empty
      ? null
      : { id: snap.docs[0].id, ...snap.docs[0].data() };
    appLogger.info("member_profile_loaded", {
      email: currentUser.email,
      found: !!memberProfile,
    });
  }
  if (!memberProfile) {
    if (els.memberBillsList) {
      els.memberBillsList.innerHTML =
        '<div class="badge-muted" style="padding:8px;">No member profile found. Contact your gym admin.</div>';
    }
    if (els.memberNotificationsList) {
      els.memberNotificationsList.innerHTML = "";
    }
    return;
  }
  const billsRef = getBillsCollection();
  const billsSnap = await billsRef
    .where("memberId", "==", memberProfile.id)
    .orderBy("createdAt", "desc")
    .get();
  const bills = billsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderBillsTableForMember(bills);

  const notifRef = getNotificationsCollection();
  const notifSnap = await notifRef
    .where("memberId", "==", memberProfile.id)
    .orderBy("createdAt", "desc")
    .get();
  const notifications = notifSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderNotificationsTable(notifications, els.memberNotificationsList);
}

function renderBillsTableForMember(bills) {
  if (!els.memberBillsList) return;
  if (!bills || bills.length === 0) {
    els.memberBillsList.innerHTML =
      '<div class="badge-muted" style="padding:8px;">No bills yet.</div>';
    return;
  }
  const rows = bills
    .map((b) => {
      const overdue = !b.paid && isOverdue(b.dueDate);
      const statusLabel = b.paid
        ? '<span class="chip chip-pill">Paid</span>'
        : overdue
        ? '<span class="chip chip-danger">Overdue</span>'
        : '<span class="chip chip-pill">Pending</span>';
      return `
      <tr>
        <td>${b.amount || ""}</td>
        <td>${b.dueDate || ""}</td>
        <td>${statusLabel}</td>
      </tr>`;
    })
    .join("");
  els.memberBillsList.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Amount</th>
          <th>Due</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

async function handleSearchRecords(ev) {
  ev.preventDefault();
  const email = els.searchEmail.value.trim();
  if (!email) return;
  try {
    const membersRef = getMembersCollection();
    const mSnap = await membersRef.where("email", "==", email).limit(1).get();
    if (mSnap.empty) {
      els.searchResult.innerHTML =
        '<div class="badge-muted" style="padding:8px;">No member found for this email.</div>';
      return;
    }
    const member = { id: mSnap.docs[0].id, ...mSnap.docs[0].data() };
    const billsRef = getBillsCollection();
    const bSnap = await billsRef
      .where("memberId", "==", member.id)
      .orderBy("createdAt", "desc")
      .get();
    const bills = bSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderSearchResult(member, bills);
    appLogger.info("records_searched", { email, bills: bills.length });
  } catch (err) {
    appLogger.error("records_search_failed", { email, error: String(err) });
    showToast("Search failed.", "error");
  }
}

function renderSearchResult(member, bills) {
  if (!els.searchResult) return;
  if (!member) {
    els.searchResult.innerHTML =
      '<div class="badge-muted" style="padding:8px;">No results.</div>';
    return;
  }
  const rows = bills
    .map(
      (b) => `
    <tr>
      <td>${b.amount || ""}</td>
      <td>${b.dueDate || ""}</td>
      <td>${b.paid ? "Paid" : "Pending"}</td>
    </tr>`
    )
    .join("");
  const billsTable = bills.length
    ? `<table>
        <thead>
          <tr><th>Amount</th><th>Due</th><th>Status</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`
    : '<div class="badge-muted" style="padding:8px;">No bills for this member.</div>';
  els.searchResult.innerHTML = `
    <div style="padding:8px;">
      <div class="badge-muted">Member: ${member.name || member.email}</div>
    </div>
    ${billsTable}
  `;
}

function setupAdminTabs() {
  if (!els.adminTabsRoot) return;
  const tabs = els.adminTabsRoot.querySelectorAll(".tab");
  const panels = document.querySelectorAll(".tab-panel");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-tab");
      tabs.forEach((t) => t.classList.toggle("active", t === tab));
      panels.forEach((panel) => {
        panel.classList.toggle(
          "active",
          panel.getAttribute("data-panel") === target
        );
      });
      appLogger.info("admin_tab_changed", { tab: target });
    });
  });
}

async function loadPostLoginData() {
  if (currentRole === "admin") {
    await Promise.all([
      loadMembers(),
      loadBills(),
      loadNotifications(),
      loadSupplements(),
      loadDiets(),
    ]);
  } else if (currentRole === "member") {
    await loadMemberDashboard();
  }
}

function attachEventListeners() {
  if (els.formLogin) {
    els.formLogin.addEventListener("submit", handleLoginSubmit);
  }
  if (els.formSignup) {
    els.formSignup.addEventListener("submit", handleSignupSubmit);
  }
  if (els.btnLogout) {
    els.btnLogout.addEventListener("click", handleLogout);
  }
  if (els.btnShowSignup) {
    els.btnShowSignup.addEventListener("click", () => showAuthMode("signup"));
  }
  if (els.btnShowLogin) {
    els.btnShowLogin.addEventListener("click", () => showAuthMode("login"));
  }
  if (els.formMember) {
    els.formMember.addEventListener("submit", handleMemberSubmit);
  }
  if (els.btnMemberReset) {
    els.btnMemberReset.addEventListener("click", () => {
      els.formMember.reset();
      els.memberId.value = "";
    });
  }
  if (els.membersList) {
    els.membersList.addEventListener("click", handleMemberTableClick);
  }
  if (els.searchMembers) {
    els.searchMembers.addEventListener("input", handleMemberSearch);
  }
  if (els.formBill) {
    els.formBill.addEventListener("submit", handleBillSubmit);
  }
  if (els.formMonthlyNotifications) {
    els.formMonthlyNotifications.addEventListener(
      "submit",
      handleMonthlyNotifications
    );
  }
  if (els.btnExportBills) {
    els.btnExportBills.addEventListener("click", handleExportBills);
  }
  if (els.formSupplement) {
    els.formSupplement.addEventListener("submit", handleSupplementSubmit);
  }
  if (els.formDiet) {
    els.formDiet.addEventListener("submit", handleDietSubmit);
  }
  if (els.formSearchRecords) {
    els.formSearchRecords.addEventListener("submit", handleSearchRecords);
  }
}

async function bootstrap() {
  collectElements();
  setupNav();
  setupAdminTabs();
  attachEventListeners();
  showAuthMode("login");
  setUserContext(null, "guest");

  try {
    initFirebase();
    onAuthStateChanged(async (user) => {
      if (!user) {
        setUserContext(null, "guest");
        showView("view-login");
        const loginBtn = navButtons.find(
          (btn) => btn.getAttribute("data-target") === "view-login"
        );
        if (loginBtn) activateNav(loginBtn);
        return;
      }
      const role = await resolveUserRole(user);
      setUserContext(user, role);
      await loadPostLoginData();
      if (role === "admin") {
        showView("view-admin");
      } else if (role === "member") {
        showView("view-member");
      } else {
        showView("view-user");
      }
    });
  } catch (err) {
    appLogger.error("bootstrap_failed", { error: String(err) });
    showToast(
      "Failed to initialize Firebase. Check your firebaseConfig.js.",
      "error"
    );
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}


