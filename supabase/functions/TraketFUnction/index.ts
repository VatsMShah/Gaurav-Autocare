import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =====================================================================
// ENVIRONMENT SECRETS
// =====================================================================
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
const WHATSAPP_ACCESS_TOKEN = (Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "").trim();
const WHATSAPP_PHONE_NUMBER_ID = (Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "").trim();
const WHATSAPP_APP_SECRET = (Deno.env.get("WHATSAPP_APP_SECRET") || "").trim();
const WHATSAPP_VERIFY_TOKEN = (Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "").trim();
const GRAPH_API_VERSION = Deno.env.get("WHATSAPP_GRAPH_API_VERSION") || "v20.0";
const WHATSAPP_FLOW_ID = (Deno.env.get("WHATSAPP_FLOW_ID") || "").trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// =====================================================================
// INDIA POSTAL PINCODE VALIDATOR API
// =====================================================================
async function lookupPostalPinCode(pincode: string): Promise<{ valid: boolean; location?: string; district?: string; state?: string; error?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`https://api.postalpincode.in/pincode/${pincode.trim()}`, { signal: controller.signal });
    clearTimeout(timeout);

    const data = await res.json();
    if (Array.isArray(data) && data[0]?.Status === "Success" && Array.isArray(data[0]?.PostOffice) && data[0].PostOffice.length > 0) {
      const po = data[0].PostOffice[0];
      const name = String(po.Name || "").trim();
      const district = String(po.District || "").trim();
      const state = String(po.State || "").trim();
      const label = (name && district && name.toLowerCase() !== district.toLowerCase())
        ? `${name}, ${district} (${state})`
        : `${district || name} (${state})`;

      return {
        valid: true,
        location: label,
        district: district || name,
        state: state,
      };
    }
    return { valid: false, error: "Pincode not found" };
  } catch (err) {
    console.warn(`Postal code API fallback for ${pincode}:`, err);
    // Safe network fallback so valid requests are never blocked if 3rd-party is temporarily down
    return { valid: true, location: `PIN ${pincode}`, district: "India", state: "India" };
  }
}

// =====================================================================
// WHATSAPP API HELPERS
// =====================================================================
async function sendWhatsAppTypingIndicator(to: string, messageId?: string) {
  if (!messageId) return;
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
        typing_indicator: {
          type: "text",
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    console.log("Typing indicator status:", { status: res.status, data });
  } catch (err) {
    console.warn("Typing indicator fetch failed (non-blocking):", err);
  }
}

async function sendWhatsAppText(to: string, text: string) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  console.log(`Sending WhatsApp reply to ${to} via Phone Number ID: ${WHATSAPP_PHONE_NUMBER_ID}`);
  
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("❌ WhatsApp Graph API error:", { status: res.status, data });
  } else {
    console.log("✅ WhatsApp reply delivered successfully:", data);
  }
  return data;
}

async function sendWhatsAppCtaButtons(to: string) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: "👉 What would you like to do next?" },
        action: {
          buttons: [
            { type: "reply", reply: { id: "cta_new", title: "Main Menu" } },
            { type: "reply", reply: { id: "cta_ai", title: "Know About Traket" } },
            { type: "reply", reply: { id: "cta_support", title: "Support" } },
          ],
        },
      },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("❌ WhatsApp CTA API error:", { status: res.status, data });
  } else {
    console.log("✅ WhatsApp CTA buttons sent:", data);
  }
  return data;
}

async function sendWhatsAppCtaUrlButton(to: string) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "cta_url",
        header: {
          type: "text",
          text: "🌐 Traket Transport Solutions",
        },
        body: {
          text: "Visit our official website to explore our services, fleet details, and coverage across India! 🇮🇳",
        },
        action: {
          name: "cta_url",
          parameters: {
            display_text: "Visit Website 🌐",
            url: "https://traket.in/",
          },
        },
      },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("❌ WhatsApp CTA URL API error:", { status: res.status, data });
  } else {
    console.log("✅ WhatsApp CTA URL button sent:", data);
  }
  return data;
}

async function sendWhatsAppFlowDatePicker(to: string, flowId: string, minDate?: string) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const today = minDate || new Date().toISOString().split("T")[0];
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: {
        type: "flow",
        header: {
          type: "text",
          text: "📅 Loading Date",
        },
        body: {
          text: "Tap the button below to open the calendar and choose your vehicle loading date:",
        },
        footer: {
          text: "Traket Transport",
        },
        action: {
          name: "flow",
          parameters: {
            flow_message_version: "3",
            flow_token: `flow_${to}_${Date.now()}`,
            flow_id: flowId,
            flow_cta: "📅 Select Date",
            flow_action: "navigate",
            flow_action_payload: {
              screen: "DATE_SELECTION",
              data: {
                min_date: today,
              },
            },
          },
        },
      },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("❌ WhatsApp Flow API error:", { status: res.status, data });
    throw new Error(`Flow API error: ${JSON.stringify(data)}`);
  } else {
    console.log("✅ WhatsApp Flow DatePicker sent:", data);
  }
  return data;
}


async function sendWhatsAppTimeSlotButtons(to: string, bodyText?: string, backHint?: string) {
  const text = (bodyText || "⏰ Select your preferred loading time slot:").trim();
  const footerText = backHint || "Reply Back to edit previous step";
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text },
        footer: { text: footerText },
        action: {
          buttons: [
            { type: "reply", reply: { id: "1", title: "🌅 Slot 1 (7AM-2PM)" } },
            { type: "reply", reply: { id: "2", title: "🌙 Slot 2 (2PM-8PM)" } },
            { type: "reply", reply: { id: "3", title: "⏰ Anytime (All Day)" } },
          ],
        },
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("❌ WhatsApp Time Slot Buttons error:", { status: res.status, data });
  } else {
    console.log("✅ WhatsApp Time Slot buttons sent:", data);
  }
  return data;
}


async function sendWhatsAppMainMenuButtons(to: string) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: "🙏 *Welcome to Traket Transport* 🚛\n\nWe provide reliable logistics solutions across India 🇮🇳\n\n👉 Please select your requirement:" },
        action: {
          buttons: [
            { type: "reply", reply: { id: "1", title: "🚚 Book a Vehicle" } },
            // { type: "reply", reply: { id: "2", title: "🚛 Provide Vehicle" } },
            { type: "reply", reply: { id: "3", title: "🆘 Support" } },
          ],
        },
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("❌ WhatsApp Main Menu Buttons error:", { status: res.status, data });
  } else {
    console.log("✅ WhatsApp Main Menu buttons sent:", data);
  }
  return data;
}

async function sendWhatsAppFclTypeButtons(to: string) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: "🚛 Enter required vehicle transport type detail:" },
        footer: { text: "Reply Back to edit Cargo Type" },
        action: {
          buttons: [
            { type: "reply", reply: { id: "1", title: "🔹 FCL 20" } },
            { type: "reply", reply: { id: "2", title: "🔹 FCL 40" } },
            { type: "reply", reply: { id: "back", title: "⬅️ Back" } },
          ],
        },
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.error("❌ WhatsApp FCL Type Buttons error:", { status: res.status, data });
  return data;
}

async function sendWhatsAppFcl20ContainerButtons(to: string) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: "📦 Select *FCL 20* Container Type:" },
        footer: { text: "Reply Back to edit FCL Size" },
        action: {
          buttons: [
            { type: "reply", reply: { id: "1", title: "1️⃣ 20 GP" } },
            { type: "reply", reply: { id: "2", title: "2️⃣ 20 FLEXI" } },
            { type: "reply", reply: { id: "3", title: "3️⃣ 20 TANK" } },
          ],
        },
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.error("❌ WhatsApp FCL 20 Container Buttons error:", { status: res.status, data });
  return data;
}

async function sendWhatsAppFcl40ContainerButtons(to: string) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: "📦 Select *FCL 40* Container Type:" },
        footer: { text: "Reply Back to edit FCL Size" },
        action: {
          buttons: [
            { type: "reply", reply: { id: "1", title: "1️⃣ 40 HC" } },
            { type: "reply", reply: { id: "2", title: "2️⃣ 40 Open Top" } },
            { type: "reply", reply: { id: "3", title: "3️⃣ 40 FR" } },
          ],
        },
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.error("❌ WhatsApp FCL 40 Container Buttons error:", { status: res.status, data });
  return data;
}

async function sendWhatsAppFcl40VehicleButtons(to: string, containerName: string) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: `🚛 Select Vehicle / Trailer for *${containerName}*:\n\n1️⃣ 3518 (24 MT + Container)\n2️⃣ 4018 (29 MT + Container)\n3️⃣ AMW (30 MT + Container)` },
        footer: { text: "Reply Back to edit Container" },
        action: {
          buttons: [
            { type: "reply", reply: { id: "1", title: "3518 (24 MT+Cont)" } },
            { type: "reply", reply: { id: "2", title: "4018 (29 MT+Cont)" } },
            { type: "reply", reply: { id: "3", title: "AMW (30 MT+Cont)" } },
          ],
        },
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.error("❌ WhatsApp FCL 40 Vehicle Buttons error:", { status: res.status, data });
  return data;
}

async function sendWhatsAppCargoTypeButtons(to: string, bodyText: string) {
  const cleanBody = (bodyText || "📦 Select *Cargo Type*:").trim();
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: cleanBody },
        action: {
          buttons: [
            { type: "reply", reply: { id: "1", title: "1️⃣ Domestic" } },
            { type: "reply", reply: { id: "2", title: "2️⃣ Import" } },
            { type: "reply", reply: { id: "3", title: "3️⃣ Export" } },
          ],
        },
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.error("❌ WhatsApp Cargo Type Buttons error:", { status: res.status, data });
  return data;
}

async function sendWhatsAppVehicleTypeList(to: string, bodyText?: string) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: bodyText || "🚛 Select *Vehicle Type*:" },
        action: {
          button: "Choose Vehicle",
          sections: [
            {
              title: "Vehicle Categories",
              rows: [
                { id: "1", title: "1️⃣ Tempo", description: "For small loads (1 - 10 MT)" },
                { id: "2", title: "2️⃣ Truck", description: "Open / Closed (12 - 40 MT)" },
                { id: "3", title: "3️⃣ Container", description: "32 Ft SXL / MXL Close Body" },
                { id: "4", title: "4️⃣ Trailer / ODC", description: "Trailer & Over Dimension" },
                { id: "back", title: "⬅️ Back", description: "Return to Cargo Type" },
              ],
            },
          ],
        },
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.error("❌ WhatsApp Vehicle Type List error:", { status: res.status, data });
  return data;
}

async function sendWhatsAppTempoSizeList(to: string, bodyText?: string) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: bodyText || "🚚 Select *Tempo Capacity & Size*:" },
        action: {
          button: "Choose Tempo Size",
          sections: [
            {
              title: "Available Sizes",
              rows: [
                { id: "1", title: "1️⃣ 1 MT", description: "Size: 8 × 5 × 5 ft" },
                { id: "2", title: "2️⃣ 3 MT", description: "Size: 14 × 6 × 6 ft" },
                { id: "3", title: "3️⃣ 6 MT", description: "Size: 19 × 7 × 7 ft" },
                { id: "4", title: "4️⃣ 10 MT", description: "Size: 20 × 7 × 7 ft" },
                { id: "back", title: "⬅️ Back", description: "Return to Vehicle Type" },
              ],
            },
          ],
        },
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.error("❌ WhatsApp Tempo Size List error:", { status: res.status, data });
  return data;
}

async function sendWhatsAppTempoBodyList(to: string, bodyText?: string) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: bodyText || "🚚 Select *Tempo Body Type*:" },
        action: {
          button: "Choose Body Type",
          sections: [
            {
              title: "Body Types",
              rows: [
                { id: "1", title: "1️⃣ Open", description: "Open body tempo" },
                { id: "2", title: "2️⃣ Cover / Closed", description: "Covered / Closed body" },
                { id: "3", title: "3️⃣ Container", description: "Container body tempo" },
                { id: "back", title: "⬅️ Back", description: "Return to Tempo Size" },
              ],
            },
          ],
        },
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.error("❌ WhatsApp Tempo Body List error:", { status: res.status, data });
  return data;
}

async function sendWhatsAppTruckBodyButtons(to: string) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: "🚛 Select *Truck Body Type*:\n\n1️⃣ FULL Body (7 ft)\n2️⃣ Half / Pona Dala Body (3/4 ft)" },
        action: {
          buttons: [
            { type: "reply", reply: { id: "1", title: "FULL Body (7 ft)" } },
            { type: "reply", reply: { id: "2", title: "Half / Pona Dala" } },
            { type: "reply", reply: { id: "back", title: "⬅️ Back" } },
          ],
        },
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.error("❌ WhatsApp Truck Body Buttons error:", { status: res.status, data });
  return data;
}

async function sendWhatsAppTruckOpenCloseButtons(to: string) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: "🚛 Select *Truck Enclosure*:\n\n1️⃣ Close Body\n2️⃣ Open Body" },
        action: {
          buttons: [
            { type: "reply", reply: { id: "1", title: "Close Body" } },
            { type: "reply", reply: { id: "2", title: "Open Body" } },
            { type: "reply", reply: { id: "back", title: "⬅️ Back" } },
          ],
        },
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.error("❌ WhatsApp Truck Open Close Buttons error:", { status: res.status, data });
  return data;
}

async function sendWhatsAppTruckRemarksButtons(to: string) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: "📝 Enter any *Specific Remarks / Requirements*:\n(e.g., Tarpaulin required, side loading, fast delivery, or click *None / Skip*)" },
        action: {
          buttons: [
            { type: "reply", reply: { id: "skip", title: "⏩ None / Skip" } },
            { type: "reply", reply: { id: "back", title: "⬅️ Back" } },
          ],
        },
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.error("❌ WhatsApp Truck Remarks Buttons error:", { status: res.status, data });
  return data;
}

async function sendWhatsAppContainerList(to: string, bodyText?: string) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: bodyText || "📦 Select *32 Ft Container Type* (Size: 32 × 8 × 9 ft):" },
        action: {
          button: "Choose Container",
          sections: [
            {
              title: "32 Ft Container Types",
              rows: [
                { id: "1", title: "1️⃣ SXL 07 - 10 MT", description: "6 Tyre (Size 32 × 8 × 9 ft)" },
                { id: "2", title: "2️⃣ MXL 15 - 18 MT", description: "10 Tyre (Size 32 × 8 × 9 ft)" },
                { id: "3", title: "3️⃣ MXL 21 - 25 MT", description: "12 Tyre (Size 32 × 8 × 9 ft)" },
                { id: "4", title: "4️⃣ MXL 28 - 30 MT", description: "14 Tyre (Size 32 × 8 × 9 ft)" },
                { id: "back", title: "⬅️ Back", description: "Return to Vehicle Type" },
              ],
            },
          ],
        },
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.error("❌ WhatsApp Container List error:", { status: res.status, data });
  return data;
}

async function sendWhatsAppTrailerDimList(to: string, bodyText?: string) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: bodyText || "🚛 Select *Trailer Cargo Dimension*:\n(Standard trailer size: 40 × 8 × 7 ft)" },
        action: {
          button: "Choose Dimension",
          sections: [
            {
              title: "Trailer Dimension",
              rows: [
                { id: "1", title: "1️⃣ Normal", description: "Standard Trailer (40 × 8 × 7 ft)" },
                { id: "2", title: "2️⃣ Over Dimension", description: "ODC / Custom oversize load" },
                { id: "back", title: "⬅️ Back", description: "Return to Vehicle Type" },
              ],
            },
          ],
        },
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.error("❌ WhatsApp Trailer Dim List error:", { status: res.status, data });
  return data;
}

async function sendWhatsAppTrailerBedList(to: string, bodyText?: string) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: bodyText || "🛏️ Select *Trailer Bed Type*:" },
        action: {
          button: "Choose Bed Type",
          sections: [
            {
              title: "Available Bed Types",
              rows: [
                { id: "1", title: "1️⃣ Highbed", description: "Flat high bed trailer" },
                { id: "2", title: "2️⃣ Semi Bed", description: "Semi low bed trailer" },
                { id: "3", title: "3️⃣ Low Bed", description: "Low bed for heavy cargo" },
                { id: "back", title: "⬅️ Back", description: "Return to Trailer Dimension" },
              ],
            },
          ],
        },
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.error("❌ WhatsApp Trailer Bed List error:", { status: res.status, data });
  return data;
}

async function sendWhatsAppTrailerModelList(to: string, bodyText?: string) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: bodyText || "🚛 Select *Trailer Model & Capacity*:" },
        action: {
          button: "Choose Model",
          sections: [
            {
              title: "Trailer Models",
              rows: [
                { id: "1", title: "1️⃣ 3518 (27 MT)", description: "Gross Capacity: 27 MT" },
                { id: "2", title: "2️⃣ 4018 (33 MT)", description: "Gross Capacity: 33 MT" },
                { id: "3", title: "3️⃣ AMW (40 MT)", description: "Heavy Haulage: 40 MT" },
                { id: "back", title: "⬅️ Back", description: "Return to Bed Type" },
              ],
            },
          ],
        },
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.error("❌ WhatsApp Trailer Model List error:", { status: res.status, data });
  return data;
}

async function sendWhatsAppTruckSizeList(to: string, bodyText?: string) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: bodyText || "🚛 Select *Truck Capacity & Size*:" },
        action: {
          button: "Choose Truck Size",
          sections: [
            {
              title: "Truck Capacities",
              rows: [
                { id: "1", title: "1️⃣ 12 MT", description: "Size: 22 × 7 × 7 ft" },
                { id: "2", title: "2️⃣ 18 MT", description: "Size: 22 × 7 × 7 ft" },
                { id: "3", title: "3️⃣ 25 MT", description: "Size: 24 × 7 × 7 ft" },
                { id: "4", title: "4️⃣ 30 MT", description: "Size: 28 × 7 × 7 ft" },
                { id: "5", title: "5️⃣ 35 MT", description: "Size: 30 × 7 × 7 ft" },
                { id: "6", title: "6️⃣ 40 MT", description: "Size: 32 × 7 × 7 ft" },
                { id: "back", title: "⬅️ Back", description: "Return to Vehicle Type" },
              ],
            },
          ],
        },
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.error("❌ WhatsApp Truck Size List error:", { status: res.status, data });
  return data;
}

async function sendWhatsAppWithBackButton(to: string, text: string) {
  // Strip _(Reply *Back* to ...)_ hint — we show a real button instead
  const cleanText = text.replace(/\n*_?\(Reply \*Back\* to [^)]+\)_?/g, "").trim();
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: cleanText || text },
        action: {
          buttons: [
            { type: "reply", reply: { id: "back", title: "⬅️ Back" } },
          ],
        },
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("❌ WhatsApp With Back Button error:", { status: res.status, data });
    await sendWhatsAppText(to, text);
  } else {
    console.log("✅ WhatsApp message with back button sent");
  }
  return data;
}

// =====================================================================
// HMAC SIGNATURE VERIFICATION
// =====================================================================
async function isValidSignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  if (!signatureHeader || !WHATSAPP_APP_SECRET) return true;
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(WHATSAPP_APP_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
    const hex = Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `sha256=${hex}` === signatureHeader;
  } catch (err) {
    console.error("Signature verification error:", err);
    return false;
  }
}

function formatDisplayPhone(rawPhone: string): string {
  if (!rawPhone || rawPhone === "unknown_user") return "";
  const trimmed = rawPhone.trim();
  const cleaned = trimmed.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `+91 ${cleaned}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith("0")) {
    return `+91 ${cleaned.slice(1)}`;
  }
  if (cleaned.length === 12 && cleaned.startsWith("91")) {
    return `+91 ${cleaned.slice(2)}`;
  }
  if (trimmed.startsWith("+")) return trimmed;
  return `+${trimmed}`;
}

// =====================================================================
// CONVERSATION STATE MACHINE
// =====================================================================
async function processConversation(chat: any, masterRows: any[]) {
  let rawMessage = "";
  const msg = chat.messages?.[0];

  if (msg?.type === "text") {
    rawMessage = msg.text?.body || "";
  } else if (msg?.type === "interactive") {
    if (msg.interactive?.button_reply) {
      rawMessage = msg.interactive.button_reply.id || "";
    } else if (msg.interactive?.list_reply) {
      rawMessage = msg.interactive.list_reply.id || "";
    } else if (msg.interactive?.nfm_reply) {
      try {
        const flowResponse = JSON.parse(msg.interactive.nfm_reply.response_json || "{}");
        rawMessage = flowResponse.selected_date || flowResponse.loading_date || flowResponse.date || "";
      } catch {
        rawMessage = msg.interactive.nfm_reply.response_json || "";
      }
    }
  }

  if (typeof rawMessage === "object") {
    rawMessage = rawMessage?.text || rawMessage?.value || "";
  }

  const message = String(rawMessage).trim();
  const lowerMessage = message.toLowerCase();
  const phone = chat.messages?.[0]?.from || "unknown_user";

  const items = (masterRows || []).map((r) => ({ json: r }));
  let row: any = {};
  const normalizedPhone = phone.slice(-10);

  const filteredItems = items.filter((item) => {
    const sheetPhone = String(item.json?.phone || "").slice(-10);
    return sheetPhone === normalizedPhone;
  });

  if (filteredItems.length > 0) {
    filteredItems.sort((a, b) => new Date(b.json.updated_at).getTime() - new Date(a.json.updated_at).getTime());
    row = filteredItems[0].json;
  }

  // FORCE RESET ON HI
  if (["hi", "hello", "start", "restart"].includes(lowerMessage)) {
    const newSessionId = `${phone}_${Date.now()}`;
    return {
      user_id: newSessionId,
      phone: phone,
      state: "main_menu",
      updated_at: new Date().toISOString(),
      response: "",
      flowType: "",
      data: "{}",
    };
  }

  const vehicleTypeMap: Record<string, string> = { 1: "Tempo", 2: "Truck", 3: "Container", 4: "Trailer / ODC" };
  const cargoTypeMap: Record<string, string> = { 1: "Domestic", 2: "Import", 3: "Export" };
  const tempoSizeMap: Record<string, string> = { "1": "7 Ft", "2": "8 Ft", "3": "9 Ft", "4": "14 Ft", "5": "17 Ft" };
  const truckTypeMap: Record<string, string> = { "1": "19 Ft Open", "2": "22 Ft Open", "3": "24 Ft Open", "4": "32 Ft Open" };
  const containerTypeMap: Record<string, string> = { "1": "20 Ft Close Body", "2": "24 Ft Close Body", "3": "32 Ft SXL Close Body", "4": "32 Ft MXL Close Body" };
  const trailerTypeMap: Record<string, string> = { "1": "40 Ft High Bed", "2": "40 Ft Low Bed", "3": "Semi Low Bed", "4": "Hydraulic Axle" };

  function validateLoadingDate(dateStr: string): { valid: boolean; reason?: "format" | "past"; formatted?: string } {
    let day = 0, month = 0, year = 0;
    const clean = dateStr.trim();

    // Check ISO YYYY-MM-DD from WhatsApp Flow DatePicker
    const isoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      year = parseInt(isoMatch[1], 10);
      month = parseInt(isoMatch[2], 10);
      day = parseInt(isoMatch[3], 10);
    } else {
      // Check DD/MM/YYYY or DD-MM-YYYY format
      const match = clean.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
      if (!match) return { valid: false, reason: "format" };
      day = parseInt(match[1], 10);
      month = parseInt(match[2], 10);
      year = parseInt(match[3], 10);
    }

    if (month < 1 || month > 12) return { valid: false, reason: "format" };
    if (day < 1 || day > 31) return { valid: false, reason: "format" };
    const daysInMonth = new Date(year, month, 0).getDate();
    if (day > daysInMonth) return { valid: false, reason: "format" };

    const inputDate = new Date(year, month - 1, day);
    inputDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (inputDate < today) {
      return { valid: false, reason: "past" };
    }

    const formatted = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
    return { valid: true, formatted };
  }

  let state = row.state || "start";
  let data: any = {};
  try {
    data = typeof row.data === "string" ? JSON.parse(row.data || "{}") : row.data || {};
  } catch {
    data = {};
  }

  let response = "";
  let flowType = row.flowType || row.flow_type || "";

  // =====================================================================
  // UNIVERSAL BACK / UNDO HANDLER
  // =====================================================================
  const isBackCommand = ["back", "b", "undo", "prev", "previous", "0", "cta_back"].includes(lowerMessage);

  if (isBackCommand) {
    if (state === "cargo_type" || state === "provider_vehicle_type") {
      state = "main_menu";
      flowType = "";
      response = "";
    }
    // Customer Booking Flow - Step Back
    else if (state === "loading_pin") {
      delete data.loadingDate;
      state = "loading_date";
      response = "📅 Enter *Loading Date* (DD/MM/YYYY):\n(e.g., 25/09/2026)\n\n_(Reply *Back* to edit Material Description)_";
    } else if (state === "unloading_pin") {
      delete data.loadingPin;
      delete data.loadingLocation;
      delete data.loadingDistrict;
      delete data.loadingState;
      state = "loading_pin";
      response = "📍 Enter *Loading Pincode* (6 digits):\n(e.g., 400001)\n\n_(Reply *Back* to edit Loading Date)_";
    } else if (state === "fcl_type") {
      delete data.cargoType;
      state = "cargo_type";
      response = "📦 Select *Cargo Type*:\n\n_(Reply *Back* to return to Main Menu)_";
    } else if (state === "fcl_20_container" || state === "fcl_40_container") {
      delete data.fclType;
      delete data.vehicleType;
      state = "fcl_type";
      response = "";
    } else if (state === "fcl_20_vehicle") {
      delete data.vehicleSubType;
      state = "fcl_20_container";
      response = "";
    } else if (state === "fcl_40_vehicle") {
      delete data.vehicleSubType;
      state = "fcl_40_container";
      response = "";
    } else if (state === "cargo_weight") {
      delete data.weight;
      if (data.fclType === "FCL 20") {
        if (data.containerType === "20 GP") {
          state = "fcl_20_vehicle";
          response =
            "🚛 Select Vehicle / Trailer for *20 GP*:\n\n" +
            "1️⃣ 6 Tyre Tuskar (07 MT + Container)\n" +
            "2️⃣ 10 Tyre Taurus (16 MT + Container)\n" +
            "3️⃣ 12 Tyre Taurus (22 MT + Container)\n" +
            "4️⃣ 14 Tyre Taurus (28 MT + Container)\n" +
            "5️⃣ 4018 Trailer (30 MT + Container)\n\n" +
            "Reply with *1 - 5*\n\n" +
            "_(Reply *Back* to edit Container Type)_";
        } else {
          state = "fcl_20_container";
          response = "";
        }
      } else {
        state = "fcl_40_vehicle";
        response = "";
      }
    } else if (state === "cargo_dimension") {
      delete data.dimensions;
      state = "material";
      response = "📝 Enter *Material / Goods Description*:\n(e.g., Industrial machinery, Textiles, FMCG)\n\n_(Reply *Back* to edit Cargo Weight)_";
    } else if (state === "import_loading_yard") {
      delete data.loadingYard;
      if (data.containerType === "40 Open top" || data.containerType === "40 FR") {
        state = "cargo_dimension";
        response =
          "📐 Enter Cargo Dimensions / *Size (L x W x H)*:\n" +
          "(e.g., 38 x 8 x 9.5 Ft  or  11.5 x 2.4 x 2.8 Meters)\n\n" +
          "💡 _Tip: Specify Length x Width x Height. Type *Standard* if within normal height._\n\n" +
          "_(Reply *Back* to edit Material Description)_";
      } else {
        state = "material";
        response = "📝 Enter *Material / Goods Description*:\n(e.g., Industrial machinery, Textiles, FMCG)\n\n_(Reply *Back* to edit Cargo Weight)_";
      }
    } else if (state === "import_line_name") {
      delete data.shippingLine;
      state = "import_loading_yard";
      response = "👉 Enter *Loading (JNPT) Yard / CFS*:\n(e.g., Speedy CFS, JWR CFS, Gateway Distriparks)\n\n_(Reply *Back* to edit previous step)_";
    } else if (state === "import_unloading_address") {
      delete data.unloadingAddress;
      state = "import_line_name";
      response = "👉 Enter *Line Name* (Shipping Line):\n(e.g., Maersk, MSC, CMA CGM, Hapag-Lloyd, ONE)\n\n_(Reply *Back* to edit Loading Yard)_";
    } else if (state === "import_empty_yard") {
      delete data.emptyYard;
      state = "import_unloading_address";
      response = "👉 Enter *Unloading Delivery Address*:\n(e.g., Plot 45, Sector 8, MIDC Rabale, Navi Mumbai)\n\n_(Reply *Back* to edit Line Name)_";
    } else if (state === "export_empty_yard") {
      delete data.emptyYard;
      if (data.containerType === "40 Open top" || data.containerType === "40 FR") {
        state = "cargo_dimension";
        response =
          "📐 Enter Cargo Dimensions / *Size (L x W x H)*:\n" +
          "(e.g., 38 x 8 x 9.5 Ft  or  11.5 x 2.4 x 2.8 Meters)\n\n" +
          "💡 _Tip: Specify Length x Width x Height. Type *Standard* if within normal height._\n\n" +
          "_(Reply *Back* to edit Material Description)_";
      } else {
        state = "material";
        response = "📝 Enter *Material / Goods Description*:\n(e.g., Industrial machinery, Textiles, FMCG)\n\n_(Reply *Back* to edit Cargo Weight)_";
      }
    } else if (state === "export_line_name") {
      delete data.shippingLine;
      state = "export_empty_yard";
      response = "👉 Enter *Empty Pick Up Yard (JNPT)*:\n(e.g., Ameya CFS, Dronagiri Yard, Speedy CFS)\n\n_(Reply *Back* to edit previous step)_";
    } else if (state === "export_stuffing_address") {
      delete data.stuffingAddress;
      state = "export_line_name";
      response = "👉 Enter *Lines* (Shipping Line Name):\n(e.g., Maersk, MSC, CMA CGM, Hapag-Lloyd, ONE)\n\n_(Reply *Back* to edit Empty Pick Up Yard)_";
    } else if (state === "export_unloading_port") {
      delete data.portCfs;
      state = "export_stuffing_address";
      response = "👉 Enter *Stuffing Address* (Factory / Warehouse):\n(e.g., Survey 102, GIDC Sachin, Surat, Gujarat)\n\n_(Reply *Back* to edit Lines)_";
    } else if (state === "vehicle_type") {
      delete data.cargoType;
      state = "cargo_type";
      response = "📦 Select *Cargo Type*:\n\n_(Reply *Back* to return to Main Menu)_";
    } else if (state === "tempo_type") {
      delete data.vehicleType;
      state = "vehicle_type";
      response = "🚛 Select *Vehicle Type*:";
    } else if (state === "tempo_body_type") {
      delete data.vehicleSubType;
      state = "tempo_type";
      response = "🚚 Select *Tempo Capacity & Size*:";
    } else if (state === "truck_type") {
      delete data.vehicleType;
      state = "vehicle_type";
      response = "🚛 Select *Vehicle Type*:";
    } else if (state === "truck_body_type") {
      delete data.vehicleSubType;
      state = "truck_type";
      response = "🚛 Select *Truck Capacity & Size*:";
    } else if (state === "truck_open_close") {
      delete data.bodyType;
      state = "truck_body_type";
      response = "";
    } else if (state === "truck_remarks") {
      delete data.openClose;
      state = "truck_open_close";
      response = "";
    } else if (state === "container_type") {
      delete data.vehicleType;
      state = "vehicle_type";
      response = "🚛 Select *Vehicle Type*:";
    } else if (state === "trailer_dim_type") {
      delete data.vehicleType;
      state = "vehicle_type";
      response = "🚛 Select *Vehicle Type*:";
    } else if (state === "trailer_bed_type") {
      delete data.trailerDimType;
      state = "trailer_dim_type";
      response = "";
    } else if (state === "trailer_model") {
      delete data.trailerBedType;
      state = "trailer_bed_type";
      response = "";
    } else if (state === "trailer_dimensions") {
      delete data.vehicleSubType;
      state = "trailer_model";
      response = "";
    } else if (state === "material") {
      delete data.material;
      if (data.cargoType === "Import" || data.cargoType === "Export") {
        state = "cargo_weight";
        response =
          "⚖️ Enter Cargo *Weight*:\n" +
          "(e.g., 18 MT, 24 MT, or 20000 kg)\n\n" +
          "ℹ️ _(Note: 1000 kg = 1 MT)_\n\n" +
          "_(Reply *Back* to edit Vehicle Selection)_";
      } else if (data.vehicleType === "Tempo") {
        delete data.bodyType;
        state = "tempo_body_type";
        response = "🚚 Select *Tempo Body Type*:";
      } else if (data.vehicleType === "Truck") {
        delete data.remarks;
        state = "truck_remarks";
        response = "";
      } else if (data.vehicleType === "Container" || data.vehicleType === "32 Ft Container") {
        delete data.vehicleSubType;
        state = "container_type";
        response = "📦 Select *32 Ft Container Type* (Size: 32 × 8 × 9 ft):";
      } else if (data.vehicleType === "Trailer / ODC") {
        delete data.dimensions;
        state = "trailer_dimensions";
        response =
          "📐 Enter Trailer Cargo *Size (L × W × H)*:\n" +
          "(e.g., 40 x 8 x 7 Ft  or  45 x 9 x 8 Ft)\n\n" +
          "💡 _Standard trailer size is 40 × 8 × 7 ft. You can type *Standard* or enter custom dimensions._\n\n" +
          "_(Reply *Back* to edit Trailer Model)_";
      } else {
        state = "vehicle_type";
        response = "🚛 Select *Vehicle Type*:";
      }
    } else if (state === "loading_date") {
      delete data.loadingDate;
      if (data.cargoType === "Import") {
        state = "import_empty_yard";
        response = "👉 Enter *Empty (JNPT) Yard* _(Optional)_:\n(e.g., Ocean Gate CFS, Apollo Yard, or type *Skip* if not yet allocated)\n\n_(Reply *Back* to edit Unloading Address)_";
      } else if (data.cargoType === "Export") {
        state = "export_unloading_port";
        response = "👉 Enter *Unloading in JNPT (Port / CFS)*:\n(e.g., BMCT Port, GTI Port, NSICT, or Central CFS)\n\n_(Reply *Back* to edit Stuffing Address)_";
      } else {
        delete data.material;
        state = "material";
        response = "📝 Enter *Material / Goods Description*:\n(e.g., Industrial machinery, Textiles, FMCG)\n\n_(Reply *Back* to edit Vehicle Size)_";
      }
    } else if (state === "loading_time") {
      delete data.loadingTime;
      if (data.cargoType === "Domestic") {
        delete data.unloadingPin;
        delete data.unloadingLocation;
        delete data.unloadingDistrict;
        delete data.unloadingState;
        state = "unloading_pin";
        response = "📍 Enter *Unloading Pincode* (6 digits):\n(e.g., 560001)\n\n_(Reply *Back* to edit Loading Pincode)_";
      } else {
        delete data.loadingDate;
        state = "loading_date";
        const backHint = data.cargoType === "Import" ? "Empty Yard" : "Unloading Port/CFS";
        response = `📅 Enter *Loading Date* (DD/MM/YYYY):\n(e.g., 25/09/2026)\n\n_(Reply *Back* to edit ${backHint})_`;
      }
    } else if (state === "company") {
      delete data.loadingTime;
      state = "loading_time";
      response = "";
    } else if (state === "contact_name") {
      delete data.company;
      state = "company";
      response = "🏢 Enter your *Company Name*:\n(or type *NA* if individual)\n\n_(Reply *Back* to edit Loading Time)_";
    } else if (state === "email") {
      delete data.contactName;
      state = "contact_name";
      response = "👤 Enter *Contact Person Name*:\n\n_(Reply *Back* to edit Company Name)_";
    } else if (state === "alternate_phone") {
      delete data.email;
      state = "email";
      response = "📧 Enter your *Email Address*:\n(or type *Skip*)\n\n_(Reply *Back* to edit Contact Name)_";
    }
    // Transporter Provider Flow - Step Back
    else if (["provider_tempo_size", "provider_truck_size", "provider_container_size", "provider_trailer_size"].includes(state)) {
      delete data.provider_vehicleType;
      state = "provider_vehicle_type";
      response =
        "🚛 *Transporter Vehicle Registration*\n\n" +
        "Select Vehicle Category:\n" +
        "1️⃣ Tempo\n" +
        "2️⃣ Open Truck\n" +
        "3️⃣ Container\n" +
        "4️⃣ Trailer / ODC\n\n" +
        "Reply with *1, 2, 3 or 4*\n\n_(Reply *Back* to return to Main Menu)_";
    } else if (state === "provider_custom_size") {
      delete data.provider_vehicleSize;
      if (data.provider_vehicleType === "Tempo") {
        state = "provider_tempo_size";
        response = "🚚 Select *Tempo Size*:\n1️⃣ 7 Ft\n2️⃣ 8 Ft\n3️⃣ 9 Ft\n4️⃣ 14 Ft\n5️⃣ 17 Ft\n6️⃣ Other\n\nReply with *1 - 6*";
      } else if (data.provider_vehicleType === "Open Truck") {
        state = "provider_truck_size";
        response = "🚛 Select *Truck Size*:\n1️⃣ 19 Ft Open\n2️⃣ 22 Ft Open\n3️⃣ 24 Ft Open\n4️⃣ 32 Ft Open\n5️⃣ Other\n\nReply with *1 - 5*";
      } else if (data.provider_vehicleType === "Container") {
        state = "provider_container_size";
        response = "📦 Select *Container Size*:\n1️⃣ 20 Ft Close Body\n2️⃣ 24 Ft Close Body\n3️⃣ 32 Ft SXL Close Body\n4️⃣ 32 Ft MXL Close Body\n5️⃣ Other\n\nReply with *1 - 5*";
      } else if (data.provider_vehicleType === "Trailer / ODC") {
        state = "provider_trailer_size";
        response = "🏗️ Select *Trailer / ODC Type*:\n1️⃣ 40 Ft High Bed\n2️⃣ 40 Ft Low Bed\n3️⃣ Semi Low Bed\n4️⃣ Hydraulic Axle\n5️⃣ Other\n\nReply with *1 - 5*";
      } else {
        state = "provider_vehicle_type";
        response = "Select Vehicle Category:\n1️⃣ Tempo\n2️⃣ Open Truck\n3️⃣ Container\n4️⃣ Trailer / ODC";
      }
    } else if (state === "provider_vehicle_number") {
      delete data.provider_vehicleSize;
      if (data.provider_vehicleType === "Tempo") {
        state = "provider_tempo_size";
        response = "🚚 Select *Tempo Size*:\n1️⃣ 7 Ft\n2️⃣ 8 Ft\n3️⃣ 9 Ft\n4️⃣ 14 Ft\n5️⃣ 17 Ft\n6️⃣ Other\n\nReply with *1 - 6*\n\n_(Reply *Back* to edit Category)_";
      } else if (data.provider_vehicleType === "Open Truck") {
        state = "provider_truck_size";
        response = "🚛 Select *Truck Size*:\n1️⃣ 19 Ft Open\n2️⃣ 22 Ft Open\n3️⃣ 24 Ft Open\n4️⃣ 32 Ft Open\n5️⃣ Other\n\nReply with *1 - 5*\n\n_(Reply *Back* to edit Category)_";
      } else if (data.provider_vehicleType === "Container") {
        state = "provider_container_size";
        response = "📦 Select *Container Size*:\n1️⃣ 20 Ft Close Body\n2️⃣ 24 Ft Close Body\n3️⃣ 32 Ft SXL Close Body\n4️⃣ 32 Ft MXL Close Body\n5️⃣ Other\n\nReply with *1 - 5*\n\n_(Reply *Back* to edit Category)_";
      } else if (data.provider_vehicleType === "Trailer / ODC") {
        state = "provider_trailer_size";
        response = "🏗️ Select *Trailer / ODC Type*:\n1️⃣ 40 Ft High Bed\n2️⃣ 40 Ft Low Bed\n3️⃣ Semi Low Bed\n4️⃣ Hydraulic Axle\n5️⃣ Other\n\nReply with *1 - 5*\n\n_(Reply *Back* to edit Category)_";
      } else {
        state = "provider_vehicle_type";
        response = "Select Vehicle Category:\n1️⃣ Tempo\n2️⃣ Open Truck\n3️⃣ Container\n4️⃣ Trailer / ODC";
      }
    } else if (state === "provider_driver_name") {
      delete data.provider_vehicleNumber;
      state = "provider_vehicle_number";
      response = "🔢 Enter *Vehicle Registration Number*:\n(e.g., MH 04 AB 1234)\n\n_(Reply *Back* to edit Vehicle Size)_";
    } else if (state === "provider_capacity") {
      delete data.provider_driverName;
      state = "provider_driver_name";
      response = "👤 Enter *Driver / Owner Name*:\n\n_(Reply *Back* to edit Vehicle Number)_";
    } else if (state === "provider_routes") {
      delete data.provider_capacity;
      state = "provider_capacity";
      response = "⚖️ Enter *Payload Capacity* (in Tons / Kgs):\n(e.g., 9 Tons or 2500 Kgs)\n\n_(Reply *Back* to edit Driver Name)_";
    } else {
      state = "main_menu";
      response = "";
    }

    return {
      user_id: row.user_id || `${phone}_${Date.now()}`,
      phone: phone,
      state: state,
      updated_at: new Date().toISOString(),
      response: response,
      flowType: flowType,
      data: JSON.stringify(data),
    };
  }

  // =====================================================================
  // 1. MAIN MENU
  // =====================================================================
  if (state === "main_menu") {
    const isBookChoice =
      lowerMessage === "1" ||
      lowerMessage === "1️⃣" ||
      ["book", "customer", "booking", "book vehicle", "book a vehicle"].includes(lowerMessage) ||
      /\b(book|customer)\b/i.test(lowerMessage);

    const isProvideChoice =
      lowerMessage === "2" ||
      lowerMessage === "2️⃣" ||
      ["provide", "transporter", "provider", "provide vehicle", "provide a vehicle"].includes(lowerMessage) ||
      /\b(provide|transporter)\b/i.test(lowerMessage);

    const isSupportChoice =
      lowerMessage === "3" ||
      lowerMessage === "3️⃣" ||
      ["support", "help"].includes(lowerMessage) ||
      /\b(support|help)\b/i.test(lowerMessage);

    if (isBookChoice) {
      state = "cargo_type";
      flowType = "book";
      response = "📦 Select *Cargo Type*:\n\n_(Reply *Back* to return to Main Menu)_";
    } else if (isProvideChoice) {
      state = "provider_vehicle_type";
      flowType = "provider";
      response =
        "🚛 *Transporter Vehicle Registration*\n\n" +
        "Select Vehicle Category:\n" +
        "1️⃣ Tempo\n" +
        "2️⃣ Open Truck\n" +
        "3️⃣ Container\n" +
        "4️⃣ Trailer / ODC\n\n" +
        "Reply with *1, 2, 3 or 4*\n\n_(Reply *Back* to return to Main Menu)_";
    } else if (isSupportChoice) {
      state = "support";
      flowType = "support";
      response =
        "📞 *Traket Support Desk*\n\n" +
        "📧 Email: support@traket.in\n" +
        "🌐 Web: https://traket.in\n\n" +
        "Our support team will contact you shortly.\n\n" +
        "Type *Hi* anytime to start over.";
    } else {
      response = "❌ Invalid option.\n\nReply with:\n1️⃣ Book Vehicle\n2️⃣ Provide Vehicle\n3️⃣ Support";
    }
  }

  // =====================================================================
  // 2. BOOK VEHICLE FLOW (WITH POSTAL CODE VALIDATION)
  // =====================================================================
  else if (state === "cargo_type") {
    if (message === "1" || /domestic/i.test(message)) {
      data.cargoType = "Domestic";
      state = "vehicle_type";
      response = "🚛 Select *Vehicle Type*:";
    } else if (message === "2" || /import/i.test(message)) {
      data.cargoType = "Import";
      state = "fcl_type";
      response = "";
    } else if (message === "3" || /export/i.test(message)) {
      data.cargoType = "Export";
      state = "fcl_type";
      response = "";
    } else {
      response = "❌ Please select Cargo Type using buttons below:\n\n📦 Select *Cargo Type*:\n\n_(Reply *Back* to return to Main Menu)_";
    }
  } else if (state === "loading_pin") {
    if (/^\d{6}$/.test(message)) {
      const pinResult = await lookupPostalPinCode(message);
      if (pinResult.valid) {
        data.loadingPin = message;
        data.loadingLocation = pinResult.location;
        data.loadingDistrict = pinResult.district;
        data.loadingState = pinResult.state;
        state = "unloading_pin";
        response =
          `✅ *Loading Location:* ${pinResult.location}\n\n` +
          `📍 Enter *Unloading Pincode* (6 digits):\n(e.g., 560001)\n\n` +
          `_(Reply *Back* to edit Loading Pincode)_`;
      } else {
        response =
          `❌ *Pincode Not Found:* No postal records found for *${message}* in India.\n\n` +
          `Please enter a valid *6-digit Loading Pincode*:\n(e.g., 400001)\n\n` +
          `_(Reply *Back* to edit Loading Date)_`;
      }
    } else {
      response = "❌ Invalid pincode format. Please enter a valid *6-digit* Loading Pincode:\n(e.g., 400001)\n\n_(Reply *Back* to edit Loading Date)_";
    }
  } else if (state === "unloading_pin") {
    if (/^\d{6}$/.test(message)) {
      const pinResult = await lookupPostalPinCode(message);
      if (pinResult.valid) {
        data.unloadingPin = message;
        data.unloadingLocation = pinResult.location;
        data.unloadingDistrict = pinResult.district;
        data.unloadingState = pinResult.state;
        state = "loading_time";
        response =
          `✅ *Unloading Location:* ${pinResult.location}\n` +
          `🛣️ *Route:* ${data.loadingDistrict || data.loadingPin} ➔ ${pinResult.district || message}\n\n` +
          `⏰ Select *Loading Time Slot*:`;
      } else {
        response =
          `❌ *Pincode Not Found:* No postal records found for *${message}* in India.\n\n` +
          `Please enter a valid *6-digit Unloading Pincode*:\n(e.g., 560001)\n\n` +
          `_(Reply *Back* to edit Loading Pincode)_`;
      }
    } else {
      response = "❌ Invalid pincode format. Please enter a valid *6-digit* Unloading Pincode:\n(e.g., 560001)\n\n_(Reply *Back* to edit Loading Pincode)_";
    }
  } else if (state === "fcl_type") {
    if (message === "1" || /20|fcl\s*20/i.test(message)) {
      data.fclType = "FCL 20";
      data.vehicleType = "FCL 20";
      state = "fcl_20_container";
      response = "";
    } else if (message === "2" || /40|fcl\s*40/i.test(message)) {
      data.fclType = "FCL 40";
      data.vehicleType = "FCL 40";
      state = "fcl_40_container";
      response = "";
    } else {
      response = "❌ Invalid choice. Please select *FCL 20* or *FCL 40* using the buttons below:\n\n_(Reply *Back* to edit Cargo Type)_";
    }
  } else if (state === "fcl_20_container") {
    if (message === "1" || /gp|20\s*gp/i.test(message)) {
      data.containerType = "20 GP";
      data.vehicleType = "FCL 20 (20 GP)";
      state = "fcl_20_vehicle";
      response =
        "🚛 Select Vehicle / Trailer for *20 GP*:\n\n" +
        "1️⃣ 6 Tyre Tuskar (07 MT + Container)\n" +
        "2️⃣ 10 Tyre Taurus (16 MT + Container)\n" +
        "3️⃣ 12 Tyre Taurus (22 MT + Container)\n" +
        "4️⃣ 14 Tyre Taurus (28 MT + Container)\n" +
        "5️⃣ 4018 Trailer (30 MT + Container)\n\n" +
        "Reply with *1 - 5*\n\n" +
        "_(Reply *Back* to edit Container Type)_";
    } else if (message === "2" || /flexi|20\s*flexi/i.test(message)) {
      data.containerType = "20 FLEXI";
      data.vehicleType = "FCL 20 (20 FLEXI)";
      data.vehicleSubType = "20 FLEXI Container";
      state = "cargo_weight";
      response =
        "⚖️ Enter Cargo *Weight*:\n" +
        "(e.g., 18 MT, 24 MT, or 20000 kg)\n\n" +
        "ℹ️ _(Note: 1000 kg = 1 MT)_\n\n" +
        "_(Reply *Back* to edit Container Type)_";
    } else if (message === "3" || /tank|20\s*tank/i.test(message)) {
      data.containerType = "20 TANK";
      data.vehicleType = "FCL 20 (20 TANK)";
      data.vehicleSubType = "20 TANK Container";
      state = "cargo_weight";
      response =
        "⚖️ Enter Cargo *Weight*:\n" +
        "(e.g., 18 MT, 24 MT, or 20000 kg)\n\n" +
        "ℹ️ _(Note: 1000 kg = 1 MT)_\n\n" +
        "_(Reply *Back* to edit Container Type)_";
    } else {
      response = "❌ Invalid choice. Please select *20 GP*, *20 FLEXI*, or *20 TANK* using the buttons below:\n\n_(Reply *Back* to edit FCL Size)_";
    }
  } else if (state === "fcl_20_vehicle") {
    const fcl20VehicleMap: Record<string, string> = {
      "1": "6 Tyre Tuskar (07 MT + Container)",
      "2": "10 Tyre Taurus (16 MT + Container)",
      "3": "12 Tyre Taurus (22 MT + Container)",
      "4": "14 Tyre Taurus (28 MT + Container)",
      "5": "4018 Trailer (30 MT + Container)",
    };
    let sub = fcl20VehicleMap[message];
    if (!sub) {
      if (/6\s*tyre|tuskar/i.test(message)) sub = fcl20VehicleMap["1"];
      else if (/10\s*tyre/i.test(message)) sub = fcl20VehicleMap["2"];
      else if (/12\s*tyre/i.test(message)) sub = fcl20VehicleMap["3"];
      else if (/14\s*tyre/i.test(message)) sub = fcl20VehicleMap["4"];
      else if (/4018|trailer/i.test(message)) sub = fcl20VehicleMap["5"];
    }

    if (sub) {
      data.vehicleSubType = sub;
      state = "cargo_weight";
      response =
        "⚖️ Enter Cargo *Weight*:\n" +
        "(e.g., 18 MT, 24 MT, or 20000 kg)\n\n" +
        "ℹ️ _(Note: 1000 kg = 1 MT)_\n\n" +
        "_(Reply *Back* to edit Vehicle Selection)_";
    } else {
      response =
        "❌ Invalid choice. Reply with *1 - 5*:\n\n" +
        "1️⃣ 6 Tyre Tuskar (07 MT + Container)\n" +
        "2️⃣ 10 Tyre Taurus (16 MT + Container)\n" +
        "3️⃣ 12 Tyre Taurus (22 MT + Container)\n" +
        "4️⃣ 14 Tyre Taurus (28 MT + Container)\n" +
        "5️⃣ 4018 Trailer (30 MT + Container)\n\n" +
        "_(Reply *Back* to edit Container Type)_";
    }
  } else if (state === "fcl_40_container") {
    if (message === "1" || /hc|40\s*hc/i.test(message)) {
      data.containerType = "40 HC";
      data.vehicleType = "FCL 40 (40 HC)";
      state = "fcl_40_vehicle";
      response = "";
    } else if (message === "2" || /open|open\s*top|40\s*open/i.test(message)) {
      data.containerType = "40 Open top";
      data.vehicleType = "FCL 40 (40 Open top)";
      state = "fcl_40_vehicle";
      response = "";
    } else if (message === "3" || /fr|flat\s*rack|40\s*fr/i.test(message)) {
      data.containerType = "40 FR";
      data.vehicleType = "FCL 40 (40 FR)";
      state = "fcl_40_vehicle";
      response = "";
    } else {
      response = "❌ Invalid choice. Please select *40 HC*, *40 Open Top*, or *40 FR* using the buttons below:\n\n_(Reply *Back* to edit FCL Size)_";
    }
  } else if (state === "fcl_40_vehicle") {
    const fcl40VehicleMap: Record<string, string> = {
      "1": "3518 (24 MT + Container)",
      "2": "4018 (29 MT + Container)",
      "3": "AMW (30 MT + Container)",
    };
    let sub = fcl40VehicleMap[message];
    if (!sub) {
      if (/3518/i.test(message)) sub = fcl40VehicleMap["1"];
      else if (/4018/i.test(message)) sub = fcl40VehicleMap["2"];
      else if (/amw/i.test(message)) sub = fcl40VehicleMap["3"];
    }

    if (sub) {
      data.vehicleSubType = sub;
      state = "cargo_weight";
      response =
        "⚖️ Enter Cargo *Weight*:\n" +
        "(e.g., 18 MT, 24 MT, or 25000 kg)\n\n" +
        "ℹ️ _(Note: 1000 kg = 1 MT)_\n\n" +
        "_(Reply *Back* to edit Vehicle Selection)_";
    } else {
      response =
        "❌ Invalid choice. Please select vehicle/trailer using the buttons below:\n\n" +
        "1️⃣ 3518 (24 MT + Container)\n" +
        "2️⃣ 4018 (29 MT + Container)\n" +
        "3️⃣ AMW (30 MT + Container)\n\n" +
        "_(Reply *Back* to edit Container Type)_";
    }
  } else if (state === "cargo_weight") {
    if (message.trim().length >= 1 && /[0-9]/.test(message)) {
      data.weight = message.trim();
      state = "material";
      response = "📝 Enter *Material / Goods Description*:\n(e.g., Industrial machinery, Textiles, Chemicals, FMCG)\n\n_(Reply *Back* to edit Cargo Weight)_";
    } else {
      response = "❌ Please enter a valid *Cargo Weight*:\n(e.g., 18 MT, 24 MT, or 25000 kg)\n\nℹ️ _(Note: 1000 kg = 1 MT)_\n\n_(Reply *Back* to edit Vehicle Selection)_";
    }
  } else if (state === "vehicle_type") {
    if (message === "1" || /tempo/i.test(message)) {
      data.vehicleType = "Tempo";
      delete data.vehicleSubType;
      delete data.bodyType;
      state = "tempo_type";
      response = "🚚 Select *Tempo Capacity & Size*:";
    } else if (message === "2" || /truck/i.test(message)) {
      data.vehicleType = "Truck";
      delete data.vehicleSubType;
      delete data.bodyType;
      delete data.openClose;
      delete data.remarks;
      state = "truck_type";
      response = "🚛 Select *Truck Capacity & Size*:";
    } else if (message === "3" || /container/i.test(message)) {
      data.vehicleType = "32 Ft Container";
      delete data.vehicleSubType;
      state = "container_type";
      response = "📦 Select *32 Ft Container Type* (Size: 32 × 8 × 9 ft):";
    } else if (message === "4" || /trailer|odc/i.test(message)) {
      data.vehicleType = "Trailer / ODC";
      delete data.trailerDimType;
      delete data.trailerBedType;
      delete data.vehicleSubType;
      delete data.dimensions;
      state = "trailer_dim_type";
      response = "🚛 Select *Trailer Cargo Dimension*:\n(Standard trailer size: 40 × 8 × 7 ft)";
    } else {
      response = "❌ Please select Vehicle Type from the menu below:";
    }
  } else if (state === "tempo_type") {
    if (message === "1" || /1\s*mt|8\*5\*5/i.test(message)) {
      data.vehicleSubType = "1 MT (8x5x5 ft)";
      data.weight = "1 MT";
      state = "tempo_body_type";
      response = "🚚 Select *Tempo Body Type*:";
    } else if (message === "2" || /3\s*mt|14\*6\*6/i.test(message)) {
      data.vehicleSubType = "3 MT (14x6x6 ft)";
      data.weight = "3 MT";
      state = "tempo_body_type";
      response = "🚚 Select *Tempo Body Type*:";
    } else if (message === "3" || /6\s*mt|19\*7\*7/i.test(message)) {
      data.vehicleSubType = "6 MT (19x7x7 ft)";
      data.weight = "6 MT";
      state = "tempo_body_type";
      response = "🚚 Select *Tempo Body Type*:";
    } else if (message === "4" || /10\s*mt|20\*7\*7/i.test(message)) {
      data.vehicleSubType = "10 MT (20x7x7 ft)";
      data.weight = "10 MT";
      state = "tempo_body_type";
      response = "🚚 Select *Tempo Body Type*:";
    } else {
      response = "❌ Please select Tempo Size from the menu below:";
    }
  } else if (state === "tempo_body_type") {
    if (message === "1" || /open/i.test(message)) {
      data.bodyType = "Open";
      state = "material";
      response = "📝 Enter *Material / Goods Description*:\n(e.g., Industrial machinery, Textiles, FMCG)\n\n_(Reply *Back* to edit Tempo Body Type)_";
    } else if (message === "2" || /cover|close/i.test(message)) {
      data.bodyType = "Cover / Closed";
      state = "material";
      response = "📝 Enter *Material / Goods Description*:\n(e.g., Industrial machinery, Textiles, FMCG)\n\n_(Reply *Back* to edit Tempo Body Type)_";
    } else if (message === "3" || /container/i.test(message)) {
      data.bodyType = "Container";
      state = "material";
      response = "📝 Enter *Material / Goods Description*:\n(e.g., Industrial machinery, Textiles, FMCG)\n\n_(Reply *Back* to edit Tempo Body Type)_";
    } else {
      response = "❌ Please select Tempo Body Type from the menu below:";
    }
  } else if (state === "truck_type") {
    if (message === "1" || /12\s*mt/i.test(message)) {
      data.vehicleSubType = "12 MT (Size 22x7x7 ft)";
      data.weight = "12 MT";
      state = "truck_body_type";
      response = "";
    } else if (message === "2" || /18\s*mt/i.test(message)) {
      data.vehicleSubType = "18 MT (Size 22x7x7 ft)";
      data.weight = "18 MT";
      state = "truck_body_type";
      response = "";
    } else if (message === "3" || /25\s*mt/i.test(message)) {
      data.vehicleSubType = "25 MT (Size 24x7x7 ft)";
      data.weight = "25 MT";
      state = "truck_body_type";
      response = "";
    } else if (message === "4" || /30\s*mt/i.test(message)) {
      data.vehicleSubType = "30 MT (Size 28x7x7 ft)";
      data.weight = "30 MT";
      state = "truck_body_type";
      response = "";
    } else if (message === "5" || /35\s*mt/i.test(message)) {
      data.vehicleSubType = "35 MT (Size 30x7x7 ft)";
      data.weight = "35 MT";
      state = "truck_body_type";
      response = "";
    } else if (message === "6" || /40\s*mt/i.test(message)) {
      data.vehicleSubType = "40 MT (Size 32x7x7 ft)";
      data.weight = "40 MT";
      state = "truck_body_type";
      response = "";
    } else {
      response = "❌ Please select Truck Size from the menu below:";
    }
  } else if (state === "truck_body_type") {
    if (message === "1" || /full/i.test(message)) {
      data.bodyType = "FULL Body (7 ft)";
      state = "truck_open_close";
      response = "";
    } else if (message === "2" || /half|pona/i.test(message)) {
      data.bodyType = "Half / Pona Dala Body (3/4 ft)";
      state = "truck_open_close";
      response = "";
    } else {
      response =
        "❌ Please select Truck Body Type using buttons below:\n\n" +
        "1️⃣ FULL Body (7 ft)\n" +
        "2️⃣ Half / Pona Dala Body (3/4 ft)\n\n" +
        "_(Reply *Back* to edit Truck Size)_";
    }
  } else if (state === "truck_open_close") {
    if (message === "1" || /close/i.test(message)) {
      data.openClose = "Close";
      state = "truck_remarks";
      response = "";
    } else if (message === "2" || /open/i.test(message)) {
      data.openClose = "Open";
      state = "truck_remarks";
      response = "";
    } else {
      response =
        "❌ Please select Enclosure using buttons below:\n\n" +
        "1️⃣ Close Body\n" +
        "2️⃣ Open Body\n\n" +
        "_(Reply *Back* to edit Body Type)_";
    }
  } else if (state === "truck_remarks") {
    if (message === "skip" || /skip|none|na|n\/a|no/i.test(message)) {
      data.remarks = "None";
    } else {
      data.remarks = message.trim();
    }
    state = "material";
    response = "📝 Enter *Material / Goods Description*:\n(e.g., Industrial machinery, Textiles, FMCG)\n\n_(Reply *Back* to edit Remarks)_";
  } else if (state === "container_type") {
    if (message === "1" || /sxl|07|7\s*mt|6\s*tyre/i.test(message)) {
      data.vehicleSubType = "32 Ft SXL 07-10 MT (6 Tyre)";
      data.weight = "7-10 MT";
      data.dimensions = "32 × 8 × 9 ft";
      state = "material";
      response = "📝 Enter *Material / Goods Description*:\n(e.g., Industrial machinery, Textiles, FMCG)\n\n_(Reply *Back* to edit Container Type)_";
    } else if (message === "2" || /15|18\s*mt|10\s*tyre/i.test(message)) {
      data.vehicleSubType = "32 Ft MXL 15-18 MT (10 Tyre)";
      data.weight = "15-18 MT";
      data.dimensions = "32 × 8 × 9 ft";
      state = "material";
      response = "📝 Enter *Material / Goods Description*:\n(e.g., Industrial machinery, Textiles, FMCG)\n\n_(Reply *Back* to edit Container Type)_";
    } else if (message === "3" || /21|25\s*mt|12\s*tyre/i.test(message)) {
      data.vehicleSubType = "32 Ft MXL 21-25 MT (12 Tyre)";
      data.weight = "21-25 MT";
      data.dimensions = "32 × 8 × 9 ft";
      state = "material";
      response = "📝 Enter *Material / Goods Description*:\n(e.g., Industrial machinery, Textiles, FMCG)\n\n_(Reply *Back* to edit Container Type)_";
    } else if (message === "4" || /28|30\s*mt|14\s*tyre/i.test(message)) {
      data.vehicleSubType = "32 Ft MXL 28-30 MT (14 Tyre)";
      data.weight = "28-30 MT";
      data.dimensions = "32 × 8 × 9 ft";
      state = "material";
      response = "📝 Enter *Material / Goods Description*:\n(e.g., Industrial machinery, Textiles, FMCG)\n\n_(Reply *Back* to edit Container Type)_";
    } else {
      response = "❌ Please select Container Type from the menu below:";
    }
  } else if (state === "trailer_dim_type") {
    if (message === "1" || /normal/i.test(message)) {
      data.trailerDimType = "Normal";
      state = "trailer_bed_type";
      response = "🛏️ Select *Trailer Bed Type*:";
    } else if (message === "2" || /over|odc/i.test(message)) {
      data.trailerDimType = "Over Dimension (ODC)";
      state = "trailer_bed_type";
      response = "🛏️ Select *Trailer Bed Type*:";
    } else {
      response = "❌ Please select Trailer Cargo Dimension from the menu below:";
    }
  } else if (state === "trailer_bed_type") {
    if (message === "1" || /high/i.test(message)) {
      data.trailerBedType = "Highbed";
      state = "trailer_model";
      response = "🚛 Select *Trailer Model & Capacity*:";
    } else if (message === "2" || /semi/i.test(message)) {
      data.trailerBedType = "Semi Bed";
      state = "trailer_model";
      response = "🚛 Select *Trailer Model & Capacity*:";
    } else if (message === "3" || /low/i.test(message)) {
      data.trailerBedType = "Low Bed";
      state = "trailer_model";
      response = "🚛 Select *Trailer Model & Capacity*:";
    } else {
      response = "❌ Please select Trailer Bed Type from the menu below:";
    }
  } else if (state === "trailer_model") {
    if (message === "1" || /3518|27\s*mt/i.test(message)) {
      data.vehicleSubType = "3518 (27 MT)";
      data.weight = "27 MT";
      state = "trailer_dimensions";
      response =
        "📐 Enter Trailer Cargo *Size (L × W × H)*:\n" +
        "(e.g., 40 x 8 x 7 Ft  or  45 x 9 x 8 Ft)\n\n" +
        "💡 _Standard trailer size is 40 × 8 × 7 ft. You can type *Standard* or enter custom dimensions._\n\n" +
        "_(Reply *Back* to edit Trailer Model)_";
    } else if (message === "2" || /4018|33\s*mt/i.test(message)) {
      data.vehicleSubType = "4018 (33 MT)";
      data.weight = "33 MT";
      state = "trailer_dimensions";
      response =
        "📐 Enter Trailer Cargo *Size (L × W × H)*:\n" +
        "(e.g., 40 x 8 x 7 Ft  or  45 x 9 x 8 Ft)\n\n" +
        "💡 _Standard trailer size is 40 × 8 × 7 ft. You can type *Standard* or enter custom dimensions._\n\n" +
        "_(Reply *Back* to edit Trailer Model)_";
    } else if (message === "3" || /amw|40\s*mt/i.test(message)) {
      data.vehicleSubType = "AMW (40 MT)";
      data.weight = "40 MT";
      state = "trailer_dimensions";
      response =
        "📐 Enter Trailer Cargo *Size (L × W × H)*:\n" +
        "(e.g., 40 x 8 x 7 Ft  or  45 x 9 x 8 Ft)\n\n" +
        "💡 _Standard trailer size is 40 × 8 × 7 ft. You can type *Standard* or enter custom dimensions._\n\n" +
        "_(Reply *Back* to edit Trailer Model)_";
    } else {
      response = "❌ Please select Trailer Model from the menu below:";
    }
  } else if (state === "trailer_dimensions") {
    if (/standard/i.test(message)) {
      data.dimensions = "Standard (40 × 8 × 7 ft)";
    } else if (message.trim().length >= 2) {
      data.dimensions = message.trim();
    } else {
      data.dimensions = "40 × 8 × 7 ft";
    }
    state = "material";
    response = "📝 Enter *Material / Goods Description*:\n(e.g., Industrial machinery, Textiles, FMCG)\n\n_(Reply *Back* to edit Trailer Size)_";
  } else if (state === "material") {
    const hasLetters = /[a-zA-Z]/.test(message);
    const isValidLength = message.trim().length >= 2;
    if (hasLetters && isValidLength) {
      data.material = message.trim();
      if (data.cargoType === "Import" || data.cargoType === "Export") {
        if (data.containerType === "40 Open top" || data.containerType === "40 FR") {
          state = "cargo_dimension";
          response =
            "📐 Enter Cargo Dimensions / *Size (L x W x H)*:\n" +
            "(e.g., 38 x 8 x 9.5 Ft  or  11.5 x 2.4 x 2.8 Meters)\n\n" +
            "💡 _Tip: Specify Length x Width x Height. Type *Standard* if within normal container height._\n\n" +
            "_(Reply *Back* to edit Material Description)_";
        } else if (data.cargoType === "Import") {
          state = "import_loading_yard";
          response = "👉 Enter *Loading (JNPT) Yard / CFS*:\n(e.g., Speedy CFS, JWR CFS, Gateway Distriparks, Punjab Conware)\n\n_(Reply *Back* to edit Material Description)_";
        } else {
          state = "export_empty_yard";
          response = "👉 Enter *Empty Pick Up Yard (JNPT)*:\n(e.g., Ameya CFS, Dronagiri Yard, Speedy CFS, Seabird CFS)\n\n_(Reply *Back* to edit Material Description)_";
        }
      } else {
        state = "loading_date";
        response = "📅 Enter *Loading Date* (DD/MM/YYYY):\n(e.g., 25/09/2026)\n\n_(Reply *Back* to edit Material Description)_";
      }
    } else {
      const prevStep = (data.cargoType === "Import" || data.cargoType === "Export") ? "Cargo Weight" : "Vehicle Size";
      response = `❌ Invalid description. Please enter a valid *Material / Goods Description*:\n(e.g., Industrial machinery, Textiles, FMCG)\n\n_(Reply *Back* to edit ${prevStep})_`;
    }
  } else if (state === "cargo_dimension") {
    if (message.trim().length >= 2) {
      data.dimensions = message.trim();
      if (data.cargoType === "Import") {
        state = "import_loading_yard";
        response = "👉 Enter *Loading (JNPT) Yard / CFS*:\n(e.g., Speedy CFS, JWR CFS, Gateway Distriparks, Punjab Conware)\n\n_(Reply *Back* to edit Cargo Dimensions)_";
      } else {
        state = "export_empty_yard";
        response = "👉 Enter *Empty Pick Up Yard (JNPT)*:\n(e.g., Ameya CFS, Dronagiri Yard, Speedy CFS, Seabird CFS)\n\n_(Reply *Back* to edit Cargo Dimensions)_";
      }
    } else {
      response = "❌ Please enter valid *Dimensions (L x W x H)*:\n(e.g., 38 x 8 x 9.5 Ft  or  type *Standard*)\n\n_(Reply *Back* to edit Material Description)_";
    }
  } else if (state === "import_loading_yard") {
    if (message.trim().length >= 2) {
      data.loadingYard = message.trim();
      state = "import_line_name";
      response = "👉 Enter *Line Name* (Shipping Line):\n(e.g., Maersk, MSC, CMA CGM, Hapag-Lloyd, ONE, Cosco)\n\n_(Reply *Back* to edit Loading Yard)_";
    } else {
      response = "❌ Please enter a valid *Loading (JNPT) Yard / CFS*:\n(e.g., Speedy CFS, JWR CFS, Gateway Distriparks)\n\n_(Reply *Back* to previous step)_";
    }
  } else if (state === "import_line_name") {
    if (message.trim().length >= 2) {
      data.shippingLine = message.trim();
      state = "import_unloading_address";
      response = "👉 Enter *Unloading Delivery Address*:\n(e.g., Plot 45, Sector 8, MIDC Rabale, Navi Mumbai)\n\n_(Reply *Back* to edit Line Name)_";
    } else {
      response = "❌ Please enter a valid *Line Name*:\n(e.g., Maersk, MSC, CMA CGM, Hapag-Lloyd)\n\n_(Reply *Back* to edit Loading Yard)_";
    }
  } else if (state === "import_unloading_address") {
    if (message.trim().length >= 3) {
      data.unloadingAddress = message.trim();
      state = "import_empty_yard";
      response = "👉 Enter *Empty (JNPT) Yard* _(Optional)_:\n(e.g., Ocean Gate CFS, Apollo Yard, or type *Skip* if not yet allocated)\n\n_(Reply *Back* to edit Unloading Address)_";
    } else {
      response = "❌ Please enter a valid *Unloading Delivery Address*:\n(e.g., Plot 45, Sector 8, MIDC Rabale, Navi Mumbai)\n\n_(Reply *Back* to edit Line Name)_";
    }
  } else if (state === "import_empty_yard") {
    const isSkip = ["skip", "na", "n/a", "none", "no"].includes(lowerMessage);
    data.emptyYard = isSkip ? "Not specified / Pending" : message.trim();
    state = "loading_date";
    response = "📅 Enter *Loading Date* (DD/MM/YYYY):\n(e.g., 25/09/2026)\n\n_(Reply *Back* to edit Empty Yard)_";
  } else if (state === "export_empty_yard") {
    if (message.trim().length >= 2) {
      data.emptyYard = message.trim();
      state = "export_line_name";
      response = "👉 Enter *Lines* (Shipping Line Name):\n(e.g., Maersk, MSC, CMA CGM, Hapag-Lloyd, ONE, Cosco)\n\n_(Reply *Back* to edit Empty Pick Up Yard)_";
    } else {
      response = "❌ Please enter a valid *Empty Pick Up Yard (JNPT)*:\n(e.g., Ameya CFS, Dronagiri Yard, Speedy CFS)\n\n_(Reply *Back* to previous step)_";
    }
  } else if (state === "export_line_name") {
    if (message.trim().length >= 2) {
      data.shippingLine = message.trim();
      state = "export_stuffing_address";
      response = "👉 Enter *Stuffing Address* (Factory / Warehouse):\n(e.g., Survey 102, GIDC Sachin, Surat, Gujarat)\n\n_(Reply *Back* to edit Lines)_";
    } else {
      response = "❌ Please enter a valid *Shipping Line Name*:\n(e.g., Maersk, MSC, CMA CGM, Hapag-Lloyd)\n\n_(Reply *Back* to edit Empty Pick Up Yard)_";
    }
  } else if (state === "export_stuffing_address") {
    if (message.trim().length >= 3) {
      data.stuffingAddress = message.trim();
      state = "export_unloading_port";
      response = "👉 Enter *Unloading in JNPT (Port / CFS)*:\n(e.g., BMCT Port, GTI Port, NSICT, or JWR CFS)\n\n_(Reply *Back* to edit Stuffing Address)_";
    } else {
      response = "❌ Please enter a valid *Stuffing Address*:\n(e.g., Survey 102, GIDC Sachin, Surat, Gujarat)\n\n_(Reply *Back* to edit Lines)_";
    }
  } else if (state === "export_unloading_port") {
    if (message.trim().length >= 2) {
      data.portCfs = message.trim();
      state = "loading_date";
      response = "📅 Enter *Loading Date* (DD/MM/YYYY):\n(e.g., 25/09/2026)\n\n_(Reply *Back* to edit Unloading Port/CFS)_";
    } else {
      response = "❌ Please enter valid *Unloading in JNPT (Port / CFS)*:\n(e.g., BMCT Port, GTI Port, NSICT)\n\n_(Reply *Back* to edit Stuffing Address)_";
    }
  } else if (state === "loading_date") {
    const dateCheck = validateLoadingDate(message);
    const dateBackHint = data.cargoType === "Import" ? "Empty Yard" : (data.cargoType === "Export" ? "Unloading Port/CFS" : "Material Description");
    if (dateCheck.valid) {
      data.loadingDate = dateCheck.formatted || message.trim();
      if (data.cargoType === "Domestic") {
        state = "loading_pin";
        response = "📍 Enter *Loading Pincode* (6 digits):\n(e.g., 400001)\n\n_(Reply *Back* to edit Loading Date)_";
      } else {
        state = "loading_time";
        response = "";
      }
    } else if (dateCheck.reason === "past") {
      response = `❌ Loading date cannot be in the past.\n\nPlease enter today's date or a future date in DD/MM/YYYY format:\n(e.g., 25/09/2026)\n\n_(Reply *Back* to edit ${dateBackHint})_`;
    } else {
      response = `❌ Invalid date format.\n\nPlease enter a valid date in DD/MM/YYYY format:\n(e.g., 25/09/2026)\n\n_(Reply *Back* to edit ${dateBackHint})_`;
    }
  } else if (state === "loading_time") {
    const timeMap: Record<string, string> = {
      "1": "Slot 1 (07:00 AM - 02:00 PM)",
      "2": "Slot 2 (02:00 PM - 08:00 PM)",
      "3": "Anytime (Whole Day)",
    };
    let selectedTime = timeMap[message];
    if (!selectedTime) {
      if (/^(slot\s*1|slot\s*one|morning|7\s*am)/i.test(message)) {
        selectedTime = "Slot 1 (07:00 AM - 02:00 PM)";
      } else if (/^(slot\s*2|slot\s*two|afternoon|evening|night|2\s*pm)/i.test(message)) {
        selectedTime = "Slot 2 (02:00 PM - 08:00 PM)";
      } else if (/^(slot\s*3|any\s*time|anytime|whole\s*day|all\s*day|full\s*day|flexible)/i.test(message)) {
        selectedTime = "Anytime (Whole Day)";
      }
    }
    const backHint = data.cargoType === "Domestic" ? "Unloading Pincode" : "Loading Date";
    if (selectedTime) {
      data.loadingTime = selectedTime;
      state = "company";
      response = "🏢 Enter your *Company Name*:\n(or type *NA* if individual)\n\n_(Reply *Back* to edit Loading Time)_";
    } else if (message.trim().length >= 2) {
      data.loadingTime = message.trim();
      state = "company";
      response = "🏢 Enter your *Company Name*:\n(or type *NA* if individual)\n\n_(Reply *Back* to edit Loading Time)_";
    } else {
      response = `❌ Invalid time.\n\nPlease select a slot below, or reply with *1, 2, or 3*, or type a specific time (e.g., 10:30 AM):\n\n_(Reply *Back* to edit ${backHint})_`;
    }
  } else if (state === "company") {
    data.company = message;
    state = "contact_name";
    response = "👤 Enter *Contact Person Name*:\n\n_(Reply *Back* to edit Company Name)_";
  } else if (state === "contact_name") {
    data.contactName = message;
    state = "email";
    response = "📧 Enter your *Email Address*:\n(or type *Skip*)\n\n_(Reply *Back* to edit Contact Name)_";
  } else if (state === "email") {
    const isSkip = ["skip", "na", "n/a"].includes(lowerMessage);
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (isSkip || emailRegex.test(message.trim())) {
      data.email = isSkip ? "" : message.trim();
      state = "alternate_phone";
      response =
        "📱 Enter your *Alternate Number*:\n" +
        "(or type *Skip*)\n\n" +
        "_(Reply *Back* to edit Email Address)_";
    } else {
      response =
        "❌ Invalid email format.\n\n" +
        "Please enter a valid email address (e.g., rahul@gmail.com, info@company.co.in)\n" +
        "or type *Skip*:\n\n" +
        "_(Reply *Back* to edit Contact Name)_";
    }
  } else if (state === "alternate_phone") {
    const isSkip = ["skip", "na", "n/a", "no", "none", "nil"].includes(lowerMessage);
    const cleanDigits = message.replace(/\D/g, "");
    const isValidPhone = !/[a-zA-Z]/.test(message) && cleanDigits.length >= 10 && cleanDigits.length <= 15;

    if (isSkip || isValidPhone) {
      data.alternatePhone = isSkip ? "" : formatDisplayPhone(message.trim());
      data.phone = phone;
      state = "cta_menu";

      let logisticsDetails = "";
      if (data.cargoType === "Import") {
        logisticsDetails =
          `⚓ *Import Details:*\n` +
          `• Loading (JNPT) Yard: ${data.loadingYard || "N/A"}\n` +
          `• Line Name: ${data.shippingLine || "N/A"}\n` +
          `• Unloading Address: ${data.unloadingAddress || "N/A"}\n` +
          `• Empty (JNPT) Yard: ${data.emptyYard || "Pending"}\n\n`;
      } else if (data.cargoType === "Export") {
        logisticsDetails =
          `⚓ *Export Details:*\n` +
          `• Empty Pickup Yard (JNPT): ${data.emptyYard || "N/A"}\n` +
          `• Lines: ${data.shippingLine || "N/A"}\n` +
          `• Stuffing Address: ${data.stuffingAddress || "N/A"}\n` +
          `• Unloading in JNPT: ${data.portCfs || "N/A"}\n\n`;
      }

      let routeLine = "";
      if (data.cargoType === "Domestic") {
        routeLine = `📍 *Route:* ${data.loadingPin} (${data.loadingLocation || "Origin"}) ➔ ${data.unloadingPin} (${data.unloadingLocation || "Destination"})\n`;
      } else if (data.cargoType === "Import") {
        routeLine = `📍 *Route:* ${data.loadingYard || "JNPT Yard"} ➔ ${data.unloadingAddress || "Destination"}\n`;
      } else if (data.cargoType === "Export") {
        routeLine = `📍 *Route:* ${data.stuffingAddress || "Origin"} ➔ ${data.portCfs || "JNPT (Port / CFS)"}\n`;
      } else if (data.loadingPin && data.unloadingPin) {
        routeLine = `📍 *Route:* ${data.loadingPin} (${data.loadingLocation || "Origin"}) ➔ ${data.unloadingPin} (${data.unloadingLocation || "Destination"})\n`;
      }

      const displayPhone = formatDisplayPhone(data.phone || phone);
      const displayAltPhone = data.alternatePhone ? formatDisplayPhone(data.alternatePhone) : "";

      response =
        "✅ *Booking Request Submitted Successfully!*\n\n" +
        routeLine +
        `📦 *Cargo:* ${data.cargoType}${data.fclType ? ` (${data.fclType} - ${data.containerType || ""})` : ""}\n` +
        `🚛 *Vehicle / Trailer:* ${data.vehicleSubType || data.vehicleType || "Standard"}\n` +
        (data.bodyType ? `🚚 *Body Type:* ${data.bodyType}\n` : "") +
        (data.openClose ? `🔒 *Enclosure:* ${data.openClose}\n` : "") +
        (data.trailerDimType ? `📐 *Trailer Type:* ${data.trailerDimType}\n` : "") +
        (data.trailerBedType ? `🛏️ *Bed Type:* ${data.trailerBedType}\n` : "") +
        (data.remarks && data.remarks !== "None" ? `💬 *Remarks:* ${data.remarks}\n` : "") +
        (data.weight ? `⚖️ *Weight / Capacity:* ${data.weight}\n` : "") +
        `📝 *Material:* ${data.material}\n` +
        (data.dimensions ? `📐 *Dimensions:* ${data.dimensions}\n` : "") +
        (logisticsDetails ? `\n${logisticsDetails}` : "") +
        `📅 *Loading Date & Time:* ${data.loadingDate}${data.loadingTime ? ` (${data.loadingTime})` : ""}\n` +
        `👤 *Contact:* ${data.contactName} (${data.company})\n` +
        (displayPhone ? `📱 *Number:* ${displayPhone}\n` : "") +
        (displayAltPhone ? `📞 *Alternate Number:* ${displayAltPhone}\n` : "") +
        (data.email ? `📧 *Email:* ${data.email}\n` : "") +
        "\nOur team is finding the best quote and will contact you shortly! 🚛💨";
    } else {
      response =
        "❌ Invalid phone number.\n\n" +
        "Please enter a valid 10-digit mobile number (e.g., 9820500159)\n" +
        "or type *Skip*:\n\n" +
        "_(Reply *Back* to edit Email Address)_";
    }
  }

  // =====================================================================
  // 3. PROVIDE VEHICLE FLOW
  // =====================================================================
  else if (state === "provider_vehicle_type") {
    if (message === "1") {
      data.provider_vehicleType = "Tempo";
      state = "provider_tempo_size";
      response = "🚚 Select *Tempo Size*:\n1️⃣ 7 Ft\n2️⃣ 8 Ft\n3️⃣ 9 Ft\n4️⃣ 14 Ft\n5️⃣ 17 Ft\n6️⃣ Other (Any other dimension)\n\nReply with *1 - 6*\n\n_(Reply *Back* to edit Category)_";
    } else if (message === "2") {
      data.provider_vehicleType = "Open Truck";
      state = "provider_truck_size";
      response = "🚛 Select *Truck Size*:\n1️⃣ 19 Ft Open\n2️⃣ 22 Ft Open\n3️⃣ 24 Ft Open\n4️⃣ 32 Ft Open\n5️⃣ Other (Any other dimension)\n\nReply with *1 - 5*\n\n_(Reply *Back* to edit Category)_";
    } else if (message === "3") {
      data.provider_vehicleType = "Container";
      state = "provider_container_size";
      response = "📦 Select *Container Size*:\n1️⃣ 20 Ft Close Body\n2️⃣ 24 Ft Close Body\n3️⃣ 32 Ft SXL Close Body\n4️⃣ 32 Ft MXL Close Body\n5️⃣ Other (Any other dimension)\n\nReply with *1 - 5*\n\n_(Reply *Back* to edit Category)_";
    } else if (message === "4") {
      data.provider_vehicleType = "Trailer / ODC";
      state = "provider_trailer_size";
      response = "🏗️ Select *Trailer / ODC Type*:\n1️⃣ 40 Ft High Bed\n2️⃣ 40 Ft Low Bed\n3️⃣ Semi Low Bed\n4️⃣ Hydraulic Axle\n5️⃣ Other (Any other dimension)\n\nReply with *1 - 5*\n\n_(Reply *Back* to edit Category)_";
    } else {
      response =
        "❌ Invalid option.\n\nSelect Vehicle Category:\n" +
        "1️⃣ Tempo\n" +
        "2️⃣ Open Truck\n" +
        "3️⃣ Container\n" +
        "4️⃣ Trailer / ODC\n\n" +
        "Reply with *1, 2, 3 or 4*\n\n_(Reply *Back* to return to Main Menu)_";
    }
  } else if (state === "provider_tempo_size") {
    if (message === "6") {
      state = "provider_custom_size";
      response = "📏 Enter your *Vehicle Dimensions / Size*:\n(e.g., 28 Ft, 45 Ft, Low Bed 50 Ton)\n\n_(Reply *Back* to edit Tempo Size)_";
    } else if (tempoSizeMap[message]) {
      data.provider_vehicleSize = tempoSizeMap[message];
      state = "provider_vehicle_number";
      response = "🔢 Enter *Vehicle Registration Number*:\n(e.g., MH 04 AB 1234)\n\n_(Reply *Back* to edit Vehicle Size)_";
    } else {
      response = "❌ Invalid choice. Reply with *1 - 6*:\n1️⃣ 7 Ft\n2️⃣ 8 Ft\n3️⃣ 9 Ft\n4️⃣ 14 Ft\n5️⃣ 17 Ft\n6️⃣ Other (Any other dimension)\n\n_(Reply *Back* to edit Category)_";
    }
  } else if (state === "provider_truck_size") {
    if (message === "5") {
      state = "provider_custom_size";
      response = "📏 Enter your *Vehicle Dimensions / Size*:\n(e.g., 28 Ft, 45 Ft, Low Bed 50 Ton)\n\n_(Reply *Back* to edit Truck Size)_";
    } else if (truckTypeMap[message]) {
      data.provider_vehicleSize = truckTypeMap[message];
      state = "provider_vehicle_number";
      response = "🔢 Enter *Vehicle Registration Number*:\n(e.g., MH 04 AB 1234)\n\n_(Reply *Back* to edit Vehicle Size)_";
    } else {
      response = "❌ Invalid choice. Reply with *1 - 5*:\n1️⃣ 19 Ft Open\n2️⃣ 22 Ft Open\n3️⃣ 24 Ft Open\n4️⃣ 32 Ft Open\n5️⃣ Other (Any other dimension)\n\n_(Reply *Back* to edit Category)_";
    }
  } else if (state === "provider_container_size") {
    if (message === "5") {
      state = "provider_custom_size";
      response = "📏 Enter your *Vehicle Dimensions / Size*:\n(e.g., 28 Ft, 45 Ft, Low Bed 50 Ton)\n\n_(Reply *Back* to edit Container Size)_";
    } else if (containerTypeMap[message]) {
      data.provider_vehicleSize = containerTypeMap[message];
      state = "provider_vehicle_number";
      response = "🔢 Enter *Vehicle Registration Number*:\n(e.g., MH 04 AB 1234)\n\n_(Reply *Back* to edit Vehicle Size)_";
    } else {
      response = "❌ Invalid choice. Reply with *1 - 5*:\n1️⃣ 20 Ft Close Body\n2️⃣ 24 Ft Close Body\n3️⃣ 32 Ft SXL Close Body\n4️⃣ 32 Ft MXL Close Body\n5️⃣ Other (Any other dimension)\n\n_(Reply *Back* to edit Category)_";
    }
  } else if (state === "provider_trailer_size") {
    if (message === "5") {
      state = "provider_custom_size";
      response = "📏 Enter your *Vehicle Dimensions / Size*:\n(e.g., 28 Ft, 45 Ft, Low Bed 50 Ton)\n\n_(Reply *Back* to edit Trailer Type)_";
    } else if (trailerTypeMap[message]) {
      data.provider_vehicleSize = trailerTypeMap[message];
      state = "provider_vehicle_number";
      response = "🔢 Enter *Vehicle Registration Number*:\n(e.g., MH 04 AB 1234)\n\n_(Reply *Back* to edit Vehicle Size)_";
    } else {
      response = "❌ Invalid choice. Reply with *1 - 5*:\n1️⃣ 40 Ft High Bed\n2️⃣ 40 Ft Low Bed\n3️⃣ Semi Low Bed\n4️⃣ Hydraulic Axle\n5️⃣ Other (Any other dimension)\n\n_(Reply *Back* to edit Category)_";
    }
  } else if (state === "provider_custom_size") {
    if (message.trim().length >= 2) {
      data.provider_vehicleSize = message.trim();
      state = "provider_vehicle_number";
      response = "🔢 Enter *Vehicle Registration Number*:\n(e.g., MH 04 AB 1234)\n\n_(Reply *Back* to edit Vehicle Size)_";
    } else {
      response = "❌ Invalid dimensions.\n\nPlease enter valid vehicle dimensions or size (e.g., 28 Ft, 45 Ft, Low Bed 50 Ton):\n\n_(Reply *Back* to edit Previous Size)_";
    }
  } else if (state === "provider_vehicle_number") {
    const regRegex = /^([A-Z]{2}\s*[-]?\s*\d{2}\s*[-]?\s*[A-Z]{1,3}\s*[-]?\s*\d{4}|\d{2}\s*BH\s*\d{4}\s*[A-Z]{1,2})$/i;
    if (regRegex.test(message.trim())) {
      data.provider_vehicleNumber = message.trim().toUpperCase();
      state = "provider_driver_name";
      response = "👤 Enter *Driver / Owner Name*:\n\n_(Reply *Back* to edit Registration Number)_";
    } else {
      response = "❌ Invalid Vehicle Registration Number.\n\nPlease enter a valid registration number (e.g., MH 04 AB 1234):\n\n_(Reply *Back* to edit Vehicle Size)_";
    }
  } else if (state === "provider_driver_name") {
    const hasLetters = /[a-zA-Z]{2,}/.test(message);
    if (hasLetters) {
      data.provider_driverName = message.trim();
      state = "provider_capacity";
      response = "⚖️ Enter *Payload Capacity* (in Tons / Kgs):\n(e.g., 9 Tons or 2500 Kgs)\n\n_(Reply *Back* to edit Driver Name)_";
    } else {
      response = "❌ Invalid name.\n\nPlease enter a valid Driver / Owner Name (e.g., Rahul Sharma):\n\n_(Reply *Back* to edit Registration Number)_";
    }
  } else if (state === "provider_capacity") {
    const isLiquid = /(litre|liter|ml|gallon)/i.test(message);
    const hasNumber = /\d+/.test(message);
    const hasValidUnitOrNum = (hasNumber || /(ton|mt|kg|quintal)/i.test(message)) && !isLiquid;
    if (hasValidUnitOrNum) {
      data.provider_capacity = message.trim();
      state = "provider_routes";
      response = "🛣️ Enter *Preferred Routes / Operating Cities*:\n(e.g., Mumbai - Ahmedabad - Delhi)\n\n_(Reply *Back* to edit Payload Capacity)_";
    } else {
      response = "❌ Invalid payload capacity.\n\nPlease enter payload capacity in Tons or Kgs (e.g., 9 Tons, 2500 Kgs, 10 MT):\n\n_(Reply *Back* to edit Driver Name)_";
    }
  } else if (state === "provider_routes") {
    const hasLetters = /[a-zA-Z]{2,}/.test(message);
    if (hasLetters) {
      data.provider_routes = message.trim();
      data.provider_driverPhone = phone;
      state = "cta_menu";
      response =
        "✅ *Vehicle Registered Successfully!*\n\n" +
        `🚛 *Vehicle:* ${data.provider_vehicleType}${data.provider_vehicleSize ? ` (${data.provider_vehicleSize})` : ""} (${data.provider_vehicleNumber})\n` +
        `👤 *Owner/Driver:* ${data.provider_driverName}\n` +
        `⚖️ *Capacity:* ${data.provider_capacity}\n` +
        `🛣️ *Routes:* ${data.provider_routes}\n\n` +
        "We will assign loads matching your routes and vehicle capacity! 🚛🤝";
    } else {
      response = "❌ Invalid route.\n\nPlease enter operating routes or cities (e.g., Mumbai - Ahmedabad - Delhi):\n\n_(Reply *Back* to edit Capacity)_";
    }
  }

  // =====================================================================
  // 4. CTA MENU ACTIONS
  // =====================================================================
  else if (state === "cta_menu" || lowerMessage.startsWith("cta_")) {
    if (message === "cta_new" || lowerMessage === "main menu" || lowerMessage === "post new order") {
      const newSessionId = `${phone}_${Date.now()}`;
      return {
        user_id: newSessionId,
        phone: phone,
        state: "main_menu",
        updated_at: new Date().toISOString(),
        response: "",
        flowType: "",
        data: "{}",
      };
    } else if (message === "cta_ai" || lowerMessage === "know about traket" || lowerMessage.includes("know about traket") || lowerMessage.includes("about traket")) {
      state = "cta_ai";
      response =
        "🌐 *Welcome to Traket Transport* 🚛\n\n" +
        "We provide fast, reliable, and technology-driven logistics solutions across India 🇮🇳\n\n" +
        "🔗 *Visit our official website:* https://traket.in/\n\n" +
        "Type *Hi* anytime to return to the main menu!";
    } else if (message === "cta_support" || lowerMessage === "support") {
      state = "support";
      flowType = "support";
      response = "📞 *Traket Support Desk*\n\n📧 Email: support@traket.in\n🌐 Web: https://traket.in\n\nOur team is here to help you!";
    } else {
      state = "main_menu";
      response = "";
    }
  } else {
    // Default fallback
    state = "main_menu";
    response = "";
  }

  return {
    user_id: row.user_id || `${phone}_${Date.now()}`,
    phone: phone,
    state: state,
    updated_at: new Date().toISOString(),
    response: response,
    flowType: flowType,
    data: JSON.stringify(data),
  };
}

// =====================================================================
// MAIN SERVE HANDLER
// =====================================================================
serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    console.log(`[${req.method}] ${url.pathname}`);

    // 1. Health check
    if (req.method === "GET" && url.pathname.endsWith("/health")) {
      return new Response("ok", { status: 200 });
    }


    // 2. Webhook verification GET
    if (req.method === "GET") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      if (mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN) {
        console.log("Webhook verified successfully with Meta");
        return new Response(challenge, { status: 200 });
      }
      return new Response("Forbidden", { status: 403 });
    }

    // 3. Webhook event POST
    if (req.method === "POST") {
      const rawBody = await req.text();
      const signature = req.headers.get("x-hub-signature-256");

      if (WHATSAPP_APP_SECRET && !(await isValidSignature(rawBody, signature))) {
        console.warn("Invalid webhook signature — skipping signature check in dev fallback");
      }

      let payload: any = {};
      try {
        payload = JSON.parse(rawBody);
      } catch {
        return new Response("Bad Request", { status: 400 });
      }

      const entries = payload.entry || [];
      for (const entry of entries) {
        const changes = entry.changes || [];
        for (const change of changes) {
          const val = change.value;
          if (!val?.messages?.length) {
            console.log("Webhook received status update / non-message payload, skipping.");
            continue;
          }

          const incomingMsg = val.messages[0];
          const phone = incomingMsg?.from;
          const msgId = incomingMsg?.id;
          const msgText = incomingMsg?.text?.body;
          console.log(`Incoming message from ${phone} (msgId: ${msgId}): "${msgText}"`);

          // 1. Send WhatsApp typing indicator immediately in background (gives blue ticks + typing animation)
          if (msgId) {
            sendWhatsAppTypingIndicator(phone, msgId).catch((e) => console.warn("Typing indicator error:", e));
          }

          // 2. Get existing session from Supabase
          let masterRows: any[] = [];
          try {
            const { data } = await supabase
              .from("users_master")
              .select("*")
              .eq("phone", phone);
            masterRows = data || [];
          } catch (dbErr) {
            console.warn("Failed to fetch master row from Supabase:", dbErr);
          }

          // 3. Process state machine with asynchronous postal PIN validation
          const output = await processConversation(val, masterRows);
          console.log(`Next state: "${output.state}", response: "${output.response?.slice(0, 30)}..."`);

          // 4. Send WhatsApp reply
          try {
            let parsedData: any = {};
            try {
              parsedData = JSON.parse(output.data || "{}");
            } catch {
              parsedData = {};
            }

            if (output.state === "cargo_type") {
              await sendWhatsAppCargoTypeButtons(output.phone, output.response);
            } else if (output.state === "vehicle_type") {
              if (output.response && output.response.startsWith("❌")) {
                await sendWhatsAppText(output.phone, output.response);
              }
              await sendWhatsAppVehicleTypeList(output.phone, output.response);
            } else if (output.state === "tempo_type") {
              if (output.response && output.response.startsWith("❌")) {
                await sendWhatsAppText(output.phone, output.response);
              }
              await sendWhatsAppTempoSizeList(output.phone, output.response);
            } else if (output.state === "tempo_body_type") {
              if (output.response && output.response.startsWith("❌")) {
                await sendWhatsAppText(output.phone, output.response);
              }
              await sendWhatsAppTempoBodyList(output.phone, output.response);
            } else if (output.state === "fcl_type") {
              if (output.response && output.response.startsWith("❌")) {
                await sendWhatsAppText(output.phone, output.response);
              }
              await sendWhatsAppFclTypeButtons(output.phone);
            } else if (output.state === "fcl_20_container") {
              if (output.response && output.response.startsWith("❌")) {
                await sendWhatsAppText(output.phone, output.response);
              }
              await sendWhatsAppFcl20ContainerButtons(output.phone);
            } else if (output.state === "fcl_40_container") {
              if (output.response && output.response.startsWith("❌")) {
                await sendWhatsAppText(output.phone, output.response);
              }
              await sendWhatsAppFcl40ContainerButtons(output.phone);
            } else if (output.state === "fcl_40_vehicle") {
              if (output.response && output.response.startsWith("❌")) {
                await sendWhatsAppText(output.phone, output.response);
              }
              await sendWhatsAppFcl40VehicleButtons(output.phone, parsedData.containerType || "FCL 40");
            } else if (output.state === "truck_type") {
              if (output.response && output.response.startsWith("❌")) {
                await sendWhatsAppText(output.phone, output.response);
              }
              await sendWhatsAppTruckSizeList(output.phone, output.response);
            } else if (output.state === "truck_body_type") {
              if (output.response && output.response.startsWith("❌")) {
                await sendWhatsAppText(output.phone, output.response);
              }
              await sendWhatsAppTruckBodyButtons(output.phone);
            } else if (output.state === "truck_open_close") {
              if (output.response && output.response.startsWith("❌")) {
                await sendWhatsAppText(output.phone, output.response);
              }
              await sendWhatsAppTruckOpenCloseButtons(output.phone);
            } else if (output.state === "truck_remarks") {
              if (output.response && output.response.startsWith("❌")) {
                await sendWhatsAppText(output.phone, output.response);
              }
              await sendWhatsAppTruckRemarksButtons(output.phone);
            } else if (output.state === "container_type") {
              if (output.response && output.response.startsWith("❌")) {
                await sendWhatsAppText(output.phone, output.response);
              }
              await sendWhatsAppContainerList(output.phone, output.response);
            } else if (output.state === "trailer_dim_type") {
              if (output.response && output.response.startsWith("❌")) {
                await sendWhatsAppText(output.phone, output.response);
              }
              await sendWhatsAppTrailerDimList(output.phone, output.response);
            } else if (output.state === "trailer_bed_type") {
              if (output.response && output.response.startsWith("❌")) {
                await sendWhatsAppText(output.phone, output.response);
              }
              await sendWhatsAppTrailerBedList(output.phone, output.response);
            } else if (output.state === "trailer_model") {
              if (output.response && output.response.startsWith("❌")) {
                await sendWhatsAppText(output.phone, output.response);
              }
              await sendWhatsAppTrailerModelList(output.phone, output.response);
            } else if (output.state === "loading_date" && WHATSAPP_FLOW_ID) {
              try {
                await sendWhatsAppFlowDatePicker(output.phone, WHATSAPP_FLOW_ID);
              } catch (flowErr) {
                console.warn("Failed to send WhatsApp Flow DatePicker, falling back to text:", flowErr);
                if (output.response) {
                  await sendWhatsAppText(output.phone, output.response);
                }
              }
            } else if (output.state === "loading_time") {
              const backHint = parsedData.cargoType === "Domestic" ? "Reply Back to edit Unloading Pincode" : "Reply Back to edit Loading Date";
              if (output.response && output.response.startsWith("❌")) {
                await sendWhatsAppText(output.phone, output.response);
                await sendWhatsAppTimeSlotButtons(output.phone, undefined, backHint);
              } else {
                await sendWhatsAppTimeSlotButtons(output.phone, output.response, backHint);
              }
            } else if (output.state === "main_menu") {
              await sendWhatsAppMainMenuButtons(output.phone);
            } else if (output.response) {
              if (output.response.includes("Reply *Back*")) {
                await sendWhatsAppWithBackButton(output.phone, output.response);
              } else {
                await sendWhatsAppText(output.phone, output.response);
              }
            }

            if (output.state === "cta_ai") {
              await sendWhatsAppCtaUrlButton(output.phone);
            } else if (output.state === "cta_menu") {
              await sendWhatsAppCtaButtons(output.phone);
            }
          } catch (waErr) {
            console.error("Error sending WhatsApp message:", waErr);
          }

          // 5. Upsert session and cleared/updated data to Supabase
          try {
            await supabase.from("users_master").upsert({
              user_id: output.user_id,
              phone: output.phone,
              state: output.state,
              updated_at: output.updated_at,
              flow_type: output.flowType,
              data: JSON.parse(output.data || "{}"),
            });

            const parsedData = JSON.parse(output.data || "{}");
            if (output.flowType === "book") {
              const origin = parsedData.loadingYard || parsedData.stuffingAddress || parsedData.loadingPin || "";
              const destination = parsedData.unloadingAddress || parsedData.portCfs || parsedData.unloadingPin || "";

              let vehicleOrContainer = "";
              if (parsedData.fclType) {
                vehicleOrContainer = `${parsedData.fclType}${parsedData.containerType ? ` (${parsedData.containerType})` : ""}`;
              } else if (parsedData.vehicleType) {
                vehicleOrContainer = parsedData.vehicleType;
                if (parsedData.vehicleSubType) vehicleOrContainer += ` – ${parsedData.vehicleSubType}`;
                if (parsedData.bodyType) vehicleOrContainer += ` (${parsedData.bodyType})`;
              }

              const materialOrLine = parsedData.shippingLine || parsedData.material || "";

              let remarks = parsedData.remarks || "";
              if (parsedData.emptyYard && !remarks.includes(parsedData.emptyYard)) {
                remarks = remarks ? `Empty Yard: ${parsedData.emptyYard} | ${remarks}` : `Empty Yard: ${parsedData.emptyYard}`;
              }
              if (parsedData.alternatePhone && !remarks.includes(parsedData.alternatePhone)) {
                remarks = remarks ? `Alt Phone: ${parsedData.alternatePhone} | ${remarks}` : `Alt Phone: ${parsedData.alternatePhone}`;
              // Only save to book_vehicle if order is completed (state === 'cta_menu')
              // Incomplete/half-chats remain in users_master (Live Bot Sessions)
              if (output.state === "cta_menu") {
                await supabase.from("book_vehicle").upsert({
                  user_id: output.user_id,
                  phone: parsedData.phone || phone,
                  state: output.state,
                  cargo_type: parsedData.cargoType || "",
                  origin: origin,
                  destination: destination,
                  vehicle_or_container: vehicleOrContainer,
                  material_or_line: materialOrLine,
                  weight: parsedData.weight || "",
                  loading_date: parsedData.loadingDate || "",
                  time_slot: parsedData.loadingTime || "",
                  company_name: parsedData.company || "",
                  contact_name: parsedData.contactName || "",
                  email: parsedData.email || "",
                  remarks: remarks,
                  flow_data: {
                    loading_pin: parsedData.loadingPin || "",
                    loading_location: parsedData.loadingLocation || "",
                    loading_district: parsedData.loadingDistrict || "",
                    unloading_pin: parsedData.unloadingPin || "",
                    unloading_location: parsedData.unloadingLocation || "",
                    unloading_district: parsedData.unloadingDistrict || "",
                    vehicle_type: parsedData.vehicleType || "",
                    vehicle_sub_type: parsedData.vehicleSubType || "",
                    body_type: parsedData.bodyType || "",
                    open_close: parsedData.openClose || "",
                    trailer_bed_type: parsedData.trailerBedType || "",
                    trailer_dim_type: parsedData.trailerDimType || "",
                    fcl_type: parsedData.fclType || "",
                    container_type: parsedData.containerType || "",
                    shipping_line: parsedData.shippingLine || "",
                    loading_yard: parsedData.loadingYard || "",
                    unloading_address: parsedData.unloadingAddress || "",
                    empty_yard: parsedData.emptyYard || "",
                    stuffing_address: parsedData.stuffingAddress || "",
                    port_cfs: parsedData.portCfs || "",
                    cargo_dimensions: parsedData.dimensions || "",
                    alternate_phone: parsedData.alternatePhone || "",
                  },
                  updated_at: output.updated_at,
                });
              }
            } else if (output.flowType === "provider") {
              await supabase.from("provide_vehicle").upsert({
                user_id: output.user_id,
                state: output.state,
                updated_at: output.updated_at,
                vehicle_type: parsedData.provider_vehicleType || "",
                vehicle_number: parsedData.provider_vehicleNumber || "",
                driver_name: parsedData.provider_driverName || "",
                capacity: parsedData.provider_capacity || "",
                route_preference: parsedData.provider_routes || "",
                driver_phone: parsedData.provider_driverPhone || phone,
              });
            }
          } catch (dbSaveErr) {
            console.warn("Failed to persist session to Supabase:", dbSaveErr);
          }
        }
      }

      return new Response("EVENT_RECEIVED", { status: 200 });
    }

    return new Response("Method not allowed", { status: 405 });
  } catch (err: any) {
    console.error("Fatal error handling request:", err);
    return new Response(JSON.stringify({ error: err?.message || String(err), stack: err?.stack || "" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
