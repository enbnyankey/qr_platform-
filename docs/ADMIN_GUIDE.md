# QR Platform: administrator guide

For Super Admins who run the platform.

## Getting admin access

The first Super Admin is created from `.env`:

```
SEED_ADMIN_EMAIL=admin@yourcompany.com
SEED_ADMIN_PASSWORD=a-strong-password
```

Then run `npm run seed`. Running it again resets that account's password to the value in `.env`, which is how you recover a lost admin password.

Sign in as usual. Open **Admin console** from the profile menu, or **Admin** in the sidebar.

## Admin console

| Tab | What you can do |
|---|---|
| **Businesses** | Search businesses, see owner, code count and 7-day scans. **Suspend** a business: its dashboard is blocked and all its codes show an "unavailable" page. **Restore** undoes it. |
| **Users** | Search users and see verification status. **Suspend** blocks sign-in. |
| **QR codes** | Search every code by name, short code or destination. **Suspend** a code that points somewhere harmful: the owner cannot re-enable it. |
| **Audit log** | The last 100 actions: who did what, when, to which business. Every change stores before/after values in the database. |
| **Platform settings** | See below. |

## Platform settings

- **New sign-ups**: turn off to stop new registrations (existing users can still sign in).
- **QR types**: choose which types businesses can create. Existing codes keep working.
- **Max QR codes / menus per business**: `0` means unlimited.
- **Announcement banner**: a short message at the top of every dashboard, e.g. planned maintenance.
- **Support email**: shown to users who need help.

Changes take effect within about 10 seconds and are recorded in the audit log.

## Providers

| Need | Setting |
|---|---|
| Email codes | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`. For Gmail use `smtp.gmail.com`, port 587 and an App Password. |
| SMS codes | `SMS_PROVIDER=arkesel` with `SMS_API_KEY`, or `SMS_PROVIDER=hubtel` with `SMS_CLIENT_ID` and `SMS_CLIENT_SECRET`. `SMS_SENDER_ID` must be registered with the provider. |
| Instant destination changes | `REDIS_URL`. Without it the redirect service caches each code for up to `RESOLVER_CACHE_TTL_SECONDS` (default 15 s). |
| Scan location | Put the redirect service behind Cloudflare or Vercel. Their country and city headers are recorded automatically. |
| Help assistant | `ANTHROPIC_API_KEY` from console.anthropic.com. The **Help** button in the dashboard then answers questions with Claude (`HELP_BOT_MODEL`, default `claude-haiku-5-5`), using this guide and the user guide. Each person can ask `HELP_BOT_MESSAGES_PER_HOUR` questions an hour (default 40). Without a key it searches the user guide instead. Keep the guides up to date: they are what the assistant knows. |

If email or SMS fails in development, the code is printed in the API terminal so sign-up is never blocked. In production (`NODE_ENV=production`) an email failure returns an error so you notice.

## Plans and payments

Businesses start on a free trial (Pro for 14 days by default), then drop to **Free** unless they pay. Payments are prepaid: each payment covers one month or one year, and paying again early adds time on. Mobile money can't be charged automatically every month, so this works the same for MoMo and cards.

**Admin → Plans** sets each plan's name, monthly and yearly price, limits (QR codes, menus, scans per month, days of stats; 0 means unlimited) and features (logo in codes, SVG downloads, country/city stats, no platform branding). Changes apply immediately to everyone on that plan.

**Admin → Payments** lists every checkout attempt with provider, method and reference. Hover a failed payment to see why it failed (for example an amount mismatch).

**Give plan** (in Businesses) grants Basic or Pro for a number of days without payment, e.g. for partners or as goodwill after an outage. It's recorded in the audit log.

**Platform settings → Billing:**

- **Payment provider**: *Test checkout* (no real money, for development and demos), *Paystack* or *Hubtel*. Paystack and Hubtel need their keys in `.env` (see below). If the chosen provider has no keys, businesses see "payments aren't set up yet" instead of a broken checkout.
- **Free trial**: number of days and which plan (0 turns trials off).
- **When a plan isn't renewed**:
  - *Codes keep working, editing is locked* (default). Printed codes never break. A business over the Free limits can pause or delete codes but can't edit or create until they renew.
  - *Extra codes pause*. Codes beyond the Free allowance (oldest ones stay on) and scans over the monthly limit show a "temporarily unavailable" page until the business renews.

### Going live with Paystack

1. In the Paystack dashboard, copy the **secret key** into `PAYSTACK_SECRET_KEY` (use the `sk_test_…` key first).
2. Set the webhook URL to `https://YOUR-API-DOMAIN/webhooks/paystack` and `API_PUBLIC_URL` to `https://YOUR-API-DOMAIN`.
3. Restart the API and choose **Paystack** in Platform settings.
4. Make a test payment with Paystack's test cards and test MoMo numbers, then switch to the `sk_live_…` key.

### Going live with Hubtel

1. Put your **API ID**, **API key** and **POS sales / merchant account number** into `HUBTEL_API_ID`, `HUBTEL_API_KEY` and `HUBTEL_MERCHANT_ACCOUNT`.
2. Ask Hubtel to allow your server's IP for the transaction status API, and set the callback to `https://YOUR-API-DOMAIN/webhooks/hubtel`.
3. Restart the API and choose **Hubtel** in Platform settings. Hubtel's endpoints are taken from their public docs; confirm them against the docs Hubtel gives you with your merchant account.

**How payments are confirmed:** the platform never trusts a redirect or a callback on its own. Every payment is re-checked with the provider's API, the amount and currency must match exactly, and each payment can only extend a plan once even if the return page and a webhook arrive at the same moment. Raw callbacks are stored in the `payment_webhooks` table for troubleshooting.

Set `PAYMENTS_TEST_MODE=false` in production so the practice checkout can't be used.
