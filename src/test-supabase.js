const db = require('./services/supabase');
const logger = require('./utils/logger');

async function testSupabase() {
  logger.info('Testing connection and permissions to Supabase for Gaurav Autocare...');

  try {
    // 1. Test Fuel Rates Retrieval
    logger.info('1. Fetching fuel rates...');
    const rates = await db.getFuelRates();
    logger.info('Fuel Rates retrieved:', rates);

    // 2. Test Customer Upsert
    const testPhone = '919876543210';
    logger.info('2. Testing customer upsert...');
    await db.saveCustomer({
      phone: testPhone,
      name: 'Vikram Logistics',
      company: 'Vikram Freight Carriers Pvt Ltd',
      gstin: '27AABCV1234F1Z5',
    });
    logger.info('Customer saved successfully.');

    // 3. Test Customer Fetch
    const customer = await db.getCustomerByPhone(testPhone);
    logger.info('Customer fetched:', customer);

    // 4. Test Fuel Truck Order Creation
    const testTicketId = `GA-TEST-${Date.now().toString().slice(-4)}`;
    logger.info(`3. Testing fuel truck order creation (#${testTicketId})...`);
    const order = await db.saveFuelTruckOrder({
      ticketId: testTicketId,
      customerName: customer?.name || 'Vikram Logistics',
      phone: testPhone,
      vehicleNumber: 'MH04AB1234',
      fuelType: 'Diesel',
      litres: 1000,
      amount: 92800,
      orderStatus: 'confirmed',
    });
    logger.info('Fuel order created:', order);

    logger.info('🎉 Gaurav Autocare Supabase database test PASSED successfully!');
    process.exit(0);
  } catch (err) {
    logger.error('❌ Supabase verification test FAILED:', err);
    process.exit(1);
  }
}

testSupabase();
