const { processConversation } = require('./automation/processConversation');
const { registerCustomers } = require('./services/customerService');

console.log('--- TEST 1: User sends "hi" (unregistered customer) ---');
const inboundGreetingPayload = {
  contacts: [{ profile: { name: 'Vikram Singh' }, wa_id: '919876543210' }],
  messages: [
    {
      from: '919876543210',
      id: 'wamid.HBg12345',
      timestamp: '1730044800',
      type: 'text',
      text: { body: 'hi' },
    },
  ],
};

const result1 = processConversation(inboundGreetingPayload);
console.log('Result 1:');
console.log('State:', result1.state);
console.log('Action:', result1.action);
console.log('Customer:', result1.customer);
console.log('Response:\n' + result1.response);
console.log('\n----------------------------------------\n');

console.log('--- TEST 2: User submits WhatsApp Flow Form (nfm_reply) ---');
const flowSubmitPayload = {
  contacts: [{ profile: { name: 'Vikram Singh' }, wa_id: '919876543210' }],
  messages: [
    {
      from: '919876543210',
      id: 'wamid.HBg67890',
      timestamp: '1730044860',
      type: 'interactive',
      interactive: {
        type: 'nfm_reply',
        nfm_reply: {
          name: 'flow',
          body: 'Sent',
          response_json: JSON.stringify({
            vehicle_number: 'MH04AB1234',
            fuel_type: 'Diesel',
            litres: '1500',
            amount: '135000',
          }),
        },
      },
    },
  ],
};

const result2 = processConversation(flowSubmitPayload);
console.log('Result 2:');
console.log('State:', result2.state);
console.log('Action:', result2.action);
console.log('Order Details:', result2.orderDetails);
console.log('Final Ticket:\n' + result2.response);
console.log('\n----------------------------------------\n');

console.log('--- TEST 3: Pre-registered Customer data ---');
registerCustomers([
  {
    phone: '919123456789',
    name: 'Sharma Logistics Fleet',
    company: 'Sharma Freight Ltd',
  },
]);

const registeredUserPayload = {
  messages: [
    {
      from: '919123456789',
      id: 'wamid.HBg99999',
      timestamp: '1730044900',
      type: 'text',
      text: { body: 'Hello' },
    },
  ],
};

const result3 = processConversation(registeredUserPayload);
console.log('Result 3:');
console.log('Customer identified:', result3.customer);
console.log('Response:\n' + result3.response);
