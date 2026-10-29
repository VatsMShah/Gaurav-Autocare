# ⛽ Gaurav Autocare — WhatsApp Native Flow (Idea 4)
## Product & Technical Specification Document

---

## 1. Executive Summary

**Idea 4** delivers an in-app **WhatsApp Native Flow Form** for Gaurav Autocare's Fuel Truck ordering bot. Instead of exchanging multiple back-and-forth text messages, the customer taps a single button inside WhatsApp, which slides up a sleek, native bottom-sheet form right on their phone screen.

### Key Value Highlights:
- **Zero App Installation:** Runs 100% inside WhatsApp on Android, iOS, and WhatsApp Web.
- **Single-Screen Completion:** Vehicle number, fuel type, quantity, or budget amount are completed in one screen.
- **Smart Bidirectional Calculation:** Customers can order by **Quantity (Litres)** OR by **Budget (₹)**. The system dynamically computes the corresponding value using real-time pump rates.
- **Instant Digital Ticket:** Submission immediately records the order in Supabase and returns an official digital confirmation ticket with a unique Ticket ID `#GA-XXXXXX`.

---

## 2. Customer Journey & Step-by-Step UX

```
┌────────────────────────────────┐
│ 1. User sends "Hi"             │
└──────────────┬─────────────────┘
               │
               ▼
┌────────────────────────────────┐
│ 2. Bot sends Interactive Flow  │
│    Message with CTA Button     │
│    "📋 Order Fuel Truck"       │
└──────────────┬─────────────────┘
               │
               ▼
┌────────────────────────────────┐
│ 3. Native WhatsApp Popup Opens │
│    - Vehicle Number Input      │
│    - Fuel Type (Diesel/Petrol) │
│    - Either Litres OR Amount   │
│    - "Submit Order" Button     │
└──────────────┬─────────────────┘
               │
               ▼
┌────────────────────────────────┐
│ 4. Flow Closes & Submits       │
│    - Auto-calculates values    │
│    - Saves to Supabase DB      │
│    - Issues #GA- Ticket        │
└────────────────────────────────┘
```

---

## 3. Screen & Form Architecture

### Screen 1: `FUEL_ORDER_FORM`
| UI Component | Type | Behavior / Rules |
| :--- | :--- | :--- |
| **Header** | `TextHeading` | `⛽ Gaurav Autocare` |
| **Subheading** | `TextSubheading` | `Fuel Truck Order Form` |
| **Intro Note** | `TextBody` | `Fill your vehicle and fuel requirements to schedule delivery:` |
| **Vehicle Number** | `TextInput` | **Required.** Accepts registration number (e.g., `MH04XZ1212`, `MH05678`, `GJ01AB1234`). Auto-capitalized on submission. |
| **Fuel Type** | `RadioButtonsGroup` | **Required.** Two selectable options:<br>• **Diesel (HSD)** — `₹92.80 / Litre`<br>• **Petrol (MS)** — `₹104.50 / Litre` |
| **Guidance Note** | `TextCaption` | `💡 Enter either Quantity (Litres) OR Order Amount (₹). The other will be calculated automatically based on daily rates.` |
| **Quantity (Litres)** | `TextInput (number)` | **Optional** if Amount is filled. Helper text: `e.g. 500, 1000, 2000 Litres`. |
| **Order Amount (₹)** | `TextInput (number)` | **Optional** if Litres is filled. Helper text: `e.g. 50000, 100000 INR`. |
| **Submit Action** | `Footer` | `Confirm & Submit Order` ➔ dispatches `complete` action payload to backend webhook. |

---

## 4. Smart Bidirectional Auto-Calculation Logic

Customers have different buying habits:
- **Commercial Logistics / Fleet Managers** typically order by **Volume** (e.g., *1,000 Litres of Diesel*).
- **Owner-Operators / Drivers** typically order by **Budget / Cash** (e.g., *Fill ₹50,000 of Diesel*).

The backend automatically resolves the order using the daily fuel rate:

$$\text{Daily Fuel Rates (Mumbai / Thane Base)}: \quad \text{Diesel} = ₹92.80/\text{L}, \quad \text{Petrol} = ₹104.50/\text{L}$$

### Mathematical Rules:
1. **Case A: Customer enters Quantity ($L$) only:**
   $$\text{Estimated Amount} = \text{round}(L \times \text{Rate})$$
   *Example:* 1,000 Litres Diesel $\rightarrow$ $\text{Amount} = 1,000 \times 92.80 = \mathbf{₹92,800}$

2. **Case B: Customer enters Amount ($A$) only:**
   $$\text{Quantity (Litres)} = \text{round}\left(\frac{A}{\text{Rate}}\right)$$
   *Example:* ₹50,000 Diesel $\rightarrow$ $\text{Litres} = \text{round}\left(\frac{50,000}{92.80}\right) = \mathbf{539\text{ Litres}}$

3. **Case C: Customer enters both:**
   Both values are stored as entered and confirmed on the ticket.

---

## 5. Output: Official Digital Confirmation Ticket

Upon form submission, the bot immediately outputs the formatted digital ticket in WhatsApp:

```text
=================================
   🎫 GAURAV AUTOCARE ⛽
   FUEL TRUCK ORDER CONFIRMATION
=================================

📌 Ticket ID: #GA-389747
📅 Date & Time: 29 Oct 2026, 03:36 pm

👤 CUSTOMER DETAILS:
• Name: Preet
• Mobile: +919323265076

🚛 FUEL TRUCK ORDER DETAILS:
• Vehicle Number: MH04XZ1212
• Fuel Type: Diesel (₹92.80/L)
• Quantity: 539 Litres
• Estimated Amount: ₹50,000

📊 Status: ✅ CONFIRMED & SCHEDULED
---------------------------------
Your fuel truck order has been logged successfully! Our dispatch team is processing your request.

Need another order or assistance? Just reply Hi anytime.
Thank you for choosing Gaurav Autocare! ⛽🚛
```

---

## 6. Database Storage (Supabase)

Every Flow submission is automatically recorded in the user's dedicated Supabase project (`roxenwhbyqtgvrkvwwti`):

### Table: `fuel_truck_orders`
| Field | Type | Description | Example |
| :--- | :--- | :--- | :--- |
| `ticket_id` | `VARCHAR(50)` | Unique order ID | `GA-389747` |
| `customer_name` | `VARCHAR(150)` | Customer / Fleet Contact | `Preet` |
| `phone` | `VARCHAR(30)` | WhatsApp Phone Number | `+919323265076` |
| `vehicle_number` | `VARCHAR(50)` | Vehicle Plate Number | `MH04XZ1212` |
| `fuel_type` | `VARCHAR(30)` | Selected Fuel | `Diesel` |
| `litres` | `NUMERIC(10,2)` | Order Litres | `539.00` |
| `estimated_amount` | `NUMERIC(12,2)` | Computed INR Amount | `50000.00` |
| `order_status` | `VARCHAR(50)` | Fulfillment Status | `confirmed` |
| `payment_status` | `VARCHAR(50)` | Billing Status | `pending` |
| `source` | `VARCHAR(50)` | Origin Channel | `whatsapp_flow` |

---

## 7. Meta Requirements & Go-Live Checklist

To transition Idea 4 from development to 100% live public customer access:

| Step | Requirement | Status | Action Needed |
| :---: | :--- | :---: | :--- |
| **1** | **Flow JSON Schema v6.0** | ✅ **Ready** | Validated with Meta Graph API (0 errors). |
| **2** | **Flow ID Created** | ✅ **Ready** | Flow ID: `1426545812365203` registered on WABA `1833342184535529`. |
| **3** | **Webhook Processing** | ✅ **Ready** | Node.js backend handles `nfm_reply` and saves to Supabase. |
| **4** | **Meta Business Verification** | ⏳ **Pending** | Complete basic Business Portfolio verification in [Meta Business Settings](https://business.facebook.com/settings/info). |
| **5** | **Real Business Phone Number** | ⏳ **Pending** | Add your official Gaurav Autocare 10-digit business phone number to replace Meta's test sandbox number (`+1 555-191-1525`). |

---

## 8. File Structure in Codebase

- **Flow Schema Definition:** [`flows/fuel-order-flow.json`](file:///Users/anilkumar/Desktop/Gaurav-Autocare-main/flows/fuel-order-flow.json)
- **Conversation State Engine:** [`src/automation/processConversation.js`](file:///Users/anilkumar/Desktop/Gaurav-Autocare-main/src/automation/processConversation.js)
- **WhatsApp API Service:** [`src/services/whatsapp.js`](file:///Users/anilkumar/Desktop/Gaurav-Autocare-main/src/services/whatsapp.js)
- **Webhook Controller:** [`src/webhook/handler.js`](file:///Users/anilkumar/Desktop/Gaurav-Autocare-main/src/webhook/handler.js)
- **Database Service:** [`src/services/supabase.js`](file:///Users/anilkumar/Desktop/Gaurav-Autocare-main/src/services/supabase.js)

---
*Document Version: 1.0 — Gaurav Autocare Fuel Automation System*
