# Gaurav Autocare — WhatsApp Fuel Truck Ordering System

Automated WhatsApp ordering system for Gaurav Autocare petrol pump operations, integrated with native Meta WhatsApp Flows and Supabase.

---

## Features
- **Instant Welcome & Customer Identification**: Detects greetings (`Hi`, `Hello`, etc.) and extracts customer name & phone dynamically.
- **Native Meta WhatsApp Flow**: In-app form for ordering fuel trucks (`flows/fuel-order-flow.json`):
  - Vehicle / Truck Number
  - Fuel Type (Petrol MS / Diesel HSD)
  - Quantity in Litres
  - Total Estimated Amount (₹)
- **Instant Confirmation Ticket**: Generates a formatted digital ticket with unique Ticket ID, timestamps, customer details, and order specifications.
- **Supabase Cloud Database**: Stores customer profiles, daily fuel rates, live WhatsApp bot sessions, and fuel orders in real-time.

---

## WhatsApp Flow Form
The native WhatsApp form definition is in [`flows/fuel-order-flow.json`](./flows/fuel-order-flow.json).
Upload and publish it in **Meta WhatsApp Manager > Flows**.

---

## Database Architecture
The schema is defined in [`supabase/schema.sql`](./supabase/schema.sql):
- `public.fuel_truck_orders`: Stores all fuel orders and tickets.
- `public.customers`: Fleet owners, transport firms, and customer profiles.
- `public.fuel_rates`: Daily live Petrol & Diesel rates.
- `public.bot_sessions`: Live WhatsApp conversational state tracking.

---

## Setup & Running Locally

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   Create a `.env` file based on `.env.example`:
   ```bash
   PORT=3000
   WHATSAPP_VERIFY_TOKEN=your_verify_token
   WHATSAPP_APP_SECRET=your_app_secret
   WHATSAPP_ACCESS_TOKEN=your_access_token
   WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
   WHATSAPP_FLOW_ID=your_flow_id
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your_publishable_key
   SUPABASE_SERVICE_ROLE_KEY=your_secret_key
   ```

3. **Run database verification test**:
   ```bash
   node src/test-supabase.js
   ```

4. **Run WhatsApp flow simulator**:
   ```bash
   node src/test-flow.js
   ```

5. **Start server**:
   ```bash
   npm run dev
   ```
