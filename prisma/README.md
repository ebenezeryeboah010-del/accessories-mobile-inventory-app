# Mobile Accessories Inventory Web App

This project was generated from `mobile_inventory_prompt_pack.docx`. It is a real working web app with a Node.js API server, browser dashboard, authentication, role-based access, inventory CRUD, analytics, notifications, settings, audit logs, CSV export, and tenant-scoped data.

## Demo Accounts

- CEO: `ceo@mobilehub.test` / `password123`
- Manager: `manager@mobilehub.test` / `password123`

The public login screen does not display these demo accounts. Before sharing the app with real users, change the demo passwords, remove the demo users, or register a fresh business account.

## Step-by-Step Procedure

1. Install Node.js 18 or newer from the official Node.js website.
2. Open a terminal in this project folder:

   ```powershell
   cd "C:\Users\HP\Documents\Codex\2026-05-23\files-mentioned-by-the-user-mobile"
   ```

3. Start the app:

   ```powershell
   npm start
   ```

   You can also run `node server.js` directly.

4. Open the web app in your browser:

   ```text
   http://localhost:4173
   ```

5. Sign in with one of the demo accounts, or register a new business account.
6. Use the Dashboard page to see total stock, SKU count, stock value, low-stock alerts, category charts, and activity logs.
7. Use the Inventory page to add, edit, search, filter, delete, and export mobile phones and accessories.
8. Sign in as the Manager account and add or update stock. Then sign in as the CEO account to see manager stock notifications.
9. Use Settings to change the low-stock threshold, currency, night mode, and notification preferences.
10. The app stores its data in `data/db.json`. Back up that file before moving the app to another computer.

## Project Structure

```text
server.js          Node.js HTTP API and static file server
public/index.html App shell
public/styles.css Responsive dashboard styling
public/app.js     Browser-side app logic
data/db.json      Auto-created local database after first run
```

## Current Features

- Multi-tenant account registration
- CEO, Admin, Manager, and Staff role permissions
- CEO/Admin user creation for Managers, Staff, Admins, and other CEOs
- Password hashing with Node crypto PBKDF2
- Forgot password and reset password flow
- Accounting summary export for CSV, QuickBooks, Xero, Wave, or Zoho Books workflows
- Email/SMS notification preferences with delivery queue records
- Offline app shell and offline inventory-change queue
- Session token authentication
- Tenant-isolated inventory, users, notifications, settings, and audit logs
- Inventory CRUD with search and category filtering
- CEO notification when managers add or update stock
- Analytics cards, category stock bars, low-stock alerts, and activity logs
- Dark mode / night vision mode
- CSV export
- Mobile responsive layout

## Production Upgrade Path

The project includes a PostgreSQL production version in `server.postgres.js`.

### Use Your Installed PostgreSQL

1. Create a PostgreSQL database named `mobile_inventory`.
2. Copy `.env.example` to `.env`.
3. Edit `.env` and put your real PostgreSQL password:

   ```text
   DATABASE_URL="postgresql://postgres:your_password@localhost:5432/mobile_inventory?schema=public"
   JWT_SECRET="replace-with-a-long-random-secret"
   PORT=4173
   CORS_ORIGIN="http://localhost:4173"
   ```

4. Install production dependencies:

   ```powershell
   npm install
   ```

   On this Windows machine, `npm.cmd install` may work better than `npm install`.

5. Generate the Prisma client:

   ```powershell
   npx.cmd prisma generate
   ```

   If Windows reports a file lock inside `node_modules\.prisma`, close any running app server or terminal that is using the project, then run the command again.

6. Create the PostgreSQL tables:

   ```powershell
   npm run db:push
   ```

   If PowerShell blocks `npm`, use:

   ```powershell
   npm.cmd run db:push
   ```

7. Import your current local JSON data:

   ```powershell
   npm run db:seed
   ```

   Or:

   ```powershell
   npm.cmd run db:seed
   ```

   Imported demo users use `password123` after migration.

8. Start the PostgreSQL version:

   ```powershell
   npm run start:postgres
   ```

   Or:

   ```powershell
   npm.cmd run start:postgres
   ```

9. Open:

   ```text
   http://localhost:4173
   ```

10. Run the smoke test in another terminal:

   ```powershell
   npm test
   ```

### Docker Option

If Docker Desktop is installed, run:

```powershell
docker compose up --build
```

This starts PostgreSQL and the app together.

### What Was Upgraded

- Prisma schema for businesses, users, categories, inventory, notifications, settings, and audit logs
- PostgreSQL-backed API server
- JWT authentication
- bcrypt password hashing
- Express server
- Helmet security headers
- CORS
- Rate limiting
- Zod input validation
- Socket.io notification channel
- Forgot password reset table and API endpoints
- API smoke test
- Dockerfile and Docker Compose setup

### Password Reset Notes

The app now has:

- `Forgot password?` on the login screen
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- 30-minute reset codes
- Used reset codes are invalidated
- PostgreSQL reset tokens are stored as hashes

In this local development version, the reset code is returned to the browser so the feature can work without an email provider. For production, connect the forgot-password endpoint to an email provider such as Resend, SendGrid, Mailgun, or AWS SES, and email the reset link to the user instead of returning the code in the API response.

### Create A Manager Account

1. Sign in as the CEO for your business.
2. Open `Users`.
3. Fill the `Add user` form.
4. Choose `Manager` as the role.
5. Enter the manager's email and password.
6. Click `Create user`.
7. Log out.
8. Sign in with the manager email and password.
9. Add or update stock from the `Inventory` page.
10. Log back in as CEO and open `Notifications`.

The CEO alert is created only when the stock change is made by a user whose role is `Manager` in the same business account.

### Accounting, Email/SMS, And Offline Workflow

1. Sign in as CEO or Admin.
2. Open `Settings`.
3. Choose the accounting provider you use, such as `CSV`, `QuickBooks`, `Xero`, `Wave`, or `Zoho Books`.
4. Turn `Email notifications` or `SMS notifications` on or off.
5. Add the destination email and SMS phone number.
6. Save settings.
7. Open `Accounting`.
8. Click `Export accounting CSV`.

The export is designed for accounting import workflows. Direct API connections to QuickBooks, Xero, Wave, or Zoho Books require account-specific API keys and OAuth setup from each provider.

Offline mode works in the browser:

1. Open the app once while online.
2. The browser caches the app shell.
3. If the connection drops, the app can still load.
4. Inventory add/update actions are saved in the browser's offline queue.
5. When internet returns, click `Sync now` or let the app sync automatically.

### Backup PostgreSQL Data

Use `pg_dump` from the computer where PostgreSQL is installed:

```powershell
pg_dump -U postgres -d mobile_inventory -f mobile_inventory_backup.sql
```

Restore on another computer:

```powershell
createdb -U postgres mobile_inventory
psql -U postgres -d mobile_inventory -f mobile_inventory_backup.sql
```

If you are still using the local JSON version, back up:

```powershell
Copy-Item ".\data\db.json" ".\backup-db.json"
```
