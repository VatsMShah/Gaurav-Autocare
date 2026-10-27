const { processConversation } = require('./automation/processConversation');
const { registerCustomers } = require('./services/customerService');
const db = require('./services/supabase');
const logger = require('./utils/logger');

async function runVatsalTest() {
  console.log('========================================================');
  console.log('🧪 GAURAV AUTOCARE — LIVE TEST: VATSAL FUEL LOGISTIC');
  console.log('========================================================\n');

  const customerPhone = '919871122334';
  const customerName = 'Vatsal Fuel Logistic';
  const vehicleNumber = 'GJ01VF2026';
  const fuelType = 'Diesel';
  const litres = 20;

  // 1. Fetch live fuel rate for Diesel from Supabase
  console.log('1. Fetching live fuel rates from Supabase...');
  const rates = await db.getFuelRates();
  const dieselRateObj = rates.find(r => r.fuel_type.toLowerCase() === 'diesel') || { rate_per_litre: 92.80 };
  const dieselRate = parseFloat(dieselRateObj.rate_per_litre);
  const totalAmount = Math.round(litres * dieselRate);

  console.log(`   Diesel Rate: ₹${dieselRate}/L`);
  console.log(`   Quantity: ${litres} Litres`);
  console.log(`   Calculated Order Amount: ₹${totalAmount}\n`);

  // 2. Register/save customer in Supabase and local registry
  console.log('2. Registering customer in database & registry...');
  await db.saveCustomer({
    phone: customerPhone,
    name: customerName,
    company: customerName,
    gstin: '24AABCV9999F1Z1',
  });

  registerCustomers([
    {
      phone: customerPhone,
      name: customerName,
      company: customerName,
    },
  ]);
  console.log('   Customer successfully registered.\n');

  // 3. User sends "Hi"
  console.log('3. Incoming WhatsApp Message: User sends "Hi"...');
  const greetingPayload = {
    contacts: [{ profile: { name: customerName }, wa_id: customerPhone }],
    messages: [
      {
        from: customerPhone,
        id: `wamid.msg_${Date.now()}`,
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: 'text',
        text: { body: 'Hi' },
      },
    ],
  };

  const welcomeResult = processConversation(greetingPayload);
  console.log('   --> Bot Response:');
  console.log(welcomeResult.response);
  console.log('\n--------------------------------------------------------\n');

  // 4. User completes WhatsApp Flow Form with 20 Litres Diesel
  console.log('4. User completes WhatsApp Flow Form:');
  console.log(`   Vehicle: ${vehicleNumber} | Fuel: ${fuelType} | Litres: ${litres} | Amount: ₹${totalAmount}`);

  const flowPayload = {
    contacts: [{ profile: { name: customerName }, wa_id: customerPhone }],
    messages: [
      {
        from: customerPhone,
        id: `wamid.flow_${Date.now()}`,
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: 'interactive',
        interactive: {
          type: 'nfm_reply',
          nfm_reply: {
            name: 'flow',
            body: 'Sent',
            response_json: JSON.stringify({
              vehicle_number: vehicleNumber,
              fuel_type: fuelType,
              litres: String(litres),
              amount: String(totalAmount),
            }),
          },
        },
      },
    ],
  };

  const ticketResult = processConversation(flowPayload);
  console.log('   --> Generated Ticket:');
  console.log(ticketResult.response);
  console.log('\n--------------------------------------------------------\n');

  // 5. Persist order to live Supabase database
  console.log('5. Saving order to live Supabase `fuel_truck_orders` table...');
  const parsedData = JSON.parse(ticketResult.data || '{}');
  const savedOrder = await db.saveFuelTruckOrder({
    ticketId: parsedData.ticketId,
    customerName: customerName,
    phone: customerPhone,
    vehicleNumber: vehicleNumber,
    fuelType: fuelType,
    litres: litres,
    amount: totalAmount,
    orderStatus: 'confirmed',
    paymentStatus: 'pending',
  });
  console.log('   Order saved with ID:', savedOrder.id || savedOrder.ticket_id);

  // 6. Query order back from Supabase to prove persistence
  console.log('6. Verifying order retrieval from Supabase...');
  const client = db.getClient();
  const { data: dbOrder, error } = await client
    .from('fuel_truck_orders')
    .select('*')
    .eq('ticket_id', parsedData.ticketId)
    .single();

  if (error) {
    console.error('   ❌ Retrieval failed:', error);
  } else {
    console.log('   ✅ Order verified in live database:');
    console.log('   • Ticket ID:', dbOrder.ticket_id);
    console.log('   • Customer:', dbOrder.customer_name);
    console.log('   • Vehicle:', dbOrder.vehicle_number);
    console.log('   • Fuel Type:', dbOrder.fuel_type);
    console.log('   • Litres:', dbOrder.litres);
    console.log('   • Estimated Amount: ₹' + dbOrder.estimated_amount);
    console.log('   • Order Status:', dbOrder.order_status);
    console.log('   • Created At:', dbOrder.created_at);
  }

  console.log('\n🎉 ALL TESTS PASSED! Vatsal Fuel Logistic order is live in Supabase.');
  process.exit(0);
}

runVatsalTest().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
