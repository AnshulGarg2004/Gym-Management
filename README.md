## Gym Cloud Receipts – Paperless Billing & Notifications for Gyms

Gym Cloud Receipts is a **pure HTML / CSS / JavaScript web app** that helps gyms move away from fragile paper receipts to a **digital, searchable, exportable** system.

It supports **three roles**:

- **Admin**: manage members, create bills, assign fee packages, configure notifications, export reports, manage supplements, and define diet plans.
- **Member**: log in to view their **bill receipts** and **fee notifications**.
- **User**: read-only access to search gym records by member email.

All core actions are **logged** using a JavaScript logging library, and the code is organized into small, testable modules for maintainability.

---

### Features vs. Requirements

- **Admin**
  - **Login** via Firebase Authentication (email/password).
  - **Add Member**: create a member with name, email, phone, and fee package.
  - **Update/Delete Members**: inline edit/delete actions in the members table.
  - **Create Bills**: create receipts (amount + due date + paid flag) linked to members.
  - **Assign Fee Package**: choose a package per member when editing/creating them.
  - **Assign Notification for monthly**: generate monthly fee reminders in bulk for all members.
  - **Report export**: export bills as CSV (with optional date range filter).
  - **Supplement store**: maintain simple supplement inventory (name, price, stock state).
  - **Diet Details**: store general or member-specific diet plans.

- **Members**
  - **Login** via Firebase Authentication.
  - **View Bill Receipts**: see all their bills and status (Paid / Pending / Overdue).
  - **View bill notification**: see fee and billing notifications for themselves.

- **User**
  - **Login** via Firebase Authentication.
  - **View details / Search records**: search for a member by email and view their associated bills (read-only).

---

### Tech Stack

- **Frontend**: HTML5, modern CSS, vanilla ES modules (no framework).
- **Backend-as-a-Service**: **Firebase**
  - Authentication (Email/Password)
  - Cloud Firestore (for members, bills, notifications, supplements, diets)
- **Logging**: [`loglevel`](https://github.com/pimterry/loglevel) JavaScript logging library (used via CDN).

This keeps the app **portable**: it runs the same on any OS (Windows/macOS/Linux) as long as you have a modern browser and can serve static files.

---

### Project Structure

```text
.
├── index.html                # Main application UI
├── styles.css                # Modern, responsive UI styling
├── js/
│   ├── app.js                # UI wiring + role-based flows + Firebase integration
│   ├── firebaseConfig.example.js  # Template for your Firebase config
│   ├── firebaseConfig.js     # (You create this) – actual Firebase config, not committed
│   ├── firebaseService.js    # Firebase initialization + thin data-access wrappers
│   ├── logger.js             # Logging wrapper around loglevel
│   ├── billingService.js     # Pure, testable billing helpers (e.g. isOverdue, CSV builder)
│   └── exportService.js      # CSV download helper
├── tests.html                # Browser-based test runner for core billing logic
└── README.md                 # This file
```

If you plan to publish this to GitHub, add a `.gitignore` entry for `js/firebaseConfig.js` to avoid committing secrets.

---

### Firebase Setup (One-Time)

1. **Create a Firebase project**
   - Go to Firebase console.
   - Click **Add project** → follow the wizard.
   - Enable **Google Analytics** only if you want; not required.

2. **Create a Web App**
   - In your project, go to **Project settings → Your apps → Web app**.
   - Register a new web app and *do not* enable Firebase Hosting (optional).
   - Copy the Firebase config object (apiKey, authDomain, etc).

3. **Enable Authentication**
   - Go to **Authentication → Sign-in method**.
   - Enable **Email/Password** sign-in.
   - Create at least one **Admin user** manually in the Auth Users tab (email/password).

4. **Enable Firestore**
   - Go to **Firestore Database**.
   - Create a database in **Production mode** (or test mode for local experiments).
   - Region: choose a nearby region.

5. **Create `firebaseConfig.js`**
   - In `js/`, duplicate `firebaseConfig.example.js` and rename the copy to `firebaseConfig.js`.
   - Paste your real Firebase config values:

```js
// js/firebaseConfig.js
export const firebaseConfig = {
  apiKey: "YOUR_REAL_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};
```

- **Important**: Do **not** commit your real keys to a public repo. Keep `firebaseConfig.js` ignored by Git.

---

### Firestore Data Model (Collections)

The app expects the following top-level collections in Firestore:

- **`users`**
  - Document ID: Firebase Auth `uid`
  - Fields: `email`, `role` (`"admin" | "member" | "user"`), `updatedAt`

- **`members`**
  - Fields: `name`, `email`, `phone`, `packageName`, `createdAt`, `updatedAt`

- **`bills`**
  - Fields: `memberId`, `memberName`, `amount`, `dueDate`, `paid`, `createdAt`

- **`notifications`**
  - Fields: `memberId`, `type` (`bill_created` or `monthly_fee`), `title`, `message`, `month?`, `createdAt`, `read`

- **`supplements`**
  - Fields: `name`, `price`, `description`, `inStock`, `createdAt`

- **`diets`**
  - Fields: `memberId?`, `memberName?`, `title`, `details`, `createdAt`

Documents are created automatically by the app when you perform actions (e.g., create a bill, save a diet plan).

---

### Running the App Locally

Because this project uses **ES modules**, you should serve it via a local HTTP server (instead of double-clicking `index.html` from the file system).

You can use any static server you prefer. Two simple options:

- **VS Code Live Server (extension)**:
  - Open this folder in VS Code.
  - Right-click `index.html` → **Open with Live Server**.

- **Node-based quick server** (if Node.js is installed):
  - In this folder, run:

```bash
npx serve .
```

Then visit `http://localhost:3000` (or the URL shown) in your browser.

---

### Using the App – Workflow

**1. Admin**

- Sign in with an account whose `users` document has `role: "admin"`.
- **Members tab**:
  - Add new members with name, email, phone, and fee package.
  - Update or delete existing members from the table.
  - Use search to quickly filter by name or email.
- **Billing tab**:
  - Choose a member, set amount, due date, and payment status.
  - When you create a bill, a **notification** is also generated for that member.
- **Notifications tab**:
  - Select a month and generate bulk **monthly fee notifications** for all members.
- **Reports tab**:
  - Optionally select a date range.
  - Export a **CSV file** containing all matching bills.
- **Supplements tab**:
  - Add items to the supplement store with name, price, stock status.
- **Diet Details tab**:
  - Create general diet plans or member-specific ones.
  - All diet plans are listed for quick review.

**2. Member**

- Sign in with a Firebase Auth user that:
  - Has an associated `members` document with the **same email**.
  - Has `role: "member"` in its `users/{uid}` doc.
- On the **Member Dashboard**:
  - View all your bills, with **Paid / Pending / Overdue** status.
  - View notifications (new bills, monthly reminders, etc.).

**3. User (Read-Only)**

- Sign in with a user whose `role` is `"user"`.
- Use the **Records Explorer**:
  - Search by member email.
  - View the member and their associated bills in read-only mode.

---

### Logging

- Logging is handled centrally by `js/logger.js` using the `loglevel` library (loaded from CDN in `index.html`).
- The app logs:
  - Auth events (login, logout, auth state changes).
  - Navigation events (view and tab changes).
  - CRUD operations (members, bills, notifications, supplements, diets).
  - Exports and search operations.

You can adjust the global log level in `js/app.js`:

```js
Logger.configure({ level: "info" }); // options: trace, debug, info, warn, error
```

Logs are currently written to the browser console (and can easily be extended to Firestore if needed).

---

### Testing

The project includes a small, **browser-based** test harness for the core billing logic:

- **File**: `tests.html`
- Tested module: `js/billingService.js`
  - `isOverdue(dueDate, now?)`
  - `buildBillsCsv(bills)`

**How to run tests:**

1. Serve the project (same as running the app).
2. Open `http://localhost:PORT/tests.html` in your browser.
3. Check:
   - The page summary (`<pre id="results">`) for ✓ / ✗ lines.
   - The browser console for more details.

This keeps the core billing helpers **testable**, separate from the DOM and Firebase.

---

### Code Quality & Maintainability

- **Modular code**:
  - `firebaseService.js` isolates all Firebase concerns.
  - `billingService.js` and `exportService.js` hold testable, side-effect-free logic.
  - `app.js` focuses on UI + orchestration.
- **Safe & portable**:
  - No direct destructive operations beyond Firestore CRUD on your own project.
  - Runs entirely in the browser on any OS with a modern browser.
- **UI/UX**:
  - Clean, dark themed dashboard layout with clear roles and separation of concerns.
  - Responsive without breaking the desktop design.

---

### Publishing to GitHub

1. Initialize a Git repository:

```bash
git init
git add .
git commit -m "Initial commit: Gym Cloud Receipts"
```

2. **Important**: Add `.gitignore` (if you don’t have it yet):

```text
js/firebaseConfig.js
```

3. Create a public repository on GitHub and follow the instructions to add the remote:

```bash
git remote add origin https://github.com/<your-username>/gym-cloud-receipts.git
git push -u origin main
```

Anyone can then inspect your **public repo**, see the **modular code**, and follow this README to run the project end to end.


