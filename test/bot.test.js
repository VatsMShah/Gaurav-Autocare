const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { processConversation } = require('../src/automation/processConversation');
const config = require('../src/config');

let passedTests = 0;
let totalTests = 0;

function it(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    process.exitCode = 1;
  }
}

function runTests() {
  console.log('====================================================');
  console.log('🧪 GAURAV AUTO CARE — WHATSAPP BOT TEST SUITE');
  console.log('====================================================\n');

  const sheetalCustomer = {
    company_name: 'Sheetal Parivahan',
    phone: '9076021348',
    isRegistered: true,
  };

  const managerCustomer = {
    company_name: 'Sheetal Parivahan',
    phone: '9820500159',
    isRegistered: true,
  };

  const activeRates = {
    Diesel: 98.18,
    Petrol: 111.55,
    XP95: 120.58,
    CNG: 90.00,
  };

  const dynamicManagers = new Set(['9323265076', '9820500159', '8680922991']);

  // ----------------------------------------------------------------
  console.log('📦 1. Access Control & Role Routing:');
  // ----------------------------------------------------------------

  it('Driver from Sheetal Parivahan sending "Hi" receives fuel booking flow directly', () => {
    const payload = {
      messages: [{ from: '9076021348', type: 'text', text: { body: 'Hi' } }],
    };
    const res = processConversation(payload, [], activeRates, sheetalCustomer, dynamicManagers);
    assert.strictEqual(res.action, 'send_fuel_flow');
    assert.strictEqual(res.state, 'awaiting_details');
    assert.ok(res.response.includes('Sheetal Parivahan'));
  });

  it('Fleet Manager sending "Hi" receives 3-button management menu', () => {
    const payload = {
      messages: [{ from: '9820500159', type: 'text', text: { body: 'Hi' } }],
    };
    const res = processConversation(payload, [], activeRates, managerCustomer, dynamicManagers);
    assert.strictEqual(res.action, 'send_manager_menu');
    assert.strictEqual(res.buttons?.length, 3);
    assert.strictEqual(res.buttons[0].title, '📋 Book Fuel');
    assert.strictEqual(res.buttons[1].title, '🚛 Modify Vehicle');
    assert.strictEqual(res.buttons[2].title, '👥 Modify Manager');
  });

  it('Unauthorized stranger phone number is blocked with access denied', () => {
    const strangerCustomer = { phone: '9999999999', isRegistered: false };
    const payload = {
      messages: [{ from: '9999999999', type: 'text', text: { body: 'Hi' } }],
    };
    const res = processConversation(payload, [], activeRates, strangerCustomer, dynamicManagers);
    assert.strictEqual(res.action, 'send_text');
    assert.strictEqual(res.state, 'access_denied');
    assert.ok(res.response.includes('Access Restricted'));
  });

  // ----------------------------------------------------------------
  console.log('\n⛽ 2. Fuel Ordering & Pricing Calculations:');
  // ----------------------------------------------------------------

  it('Calculates Diesel order correctly (@ ₹98.18/L)', () => {
    const flowPayload = {
      messages: [
        {
          from: '9076021348',
          type: 'interactive',
          interactive: {
            type: 'nfm_reply',
            nfm_reply: {
              response_json: JSON.stringify({
                vehicle_number: 'MH04JU8948',
                fuel_type: 'HSD (Diesel)',
                is_full_tank: 'No',
                litres: '100',
                driver_name: 'Suresh Yadav',
                driver_number: '9820500159',
              }),
            },
          },
        },
      ],
    };
    const res = processConversation(flowPayload, [], activeRates, sheetalCustomer, dynamicManagers);
    assert.strictEqual(res.action, 'send_ticket');
    assert.strictEqual(res.orderDetails.rate_per_litre, 98.18);
    assert.strictEqual(parseFloat(res.orderDetails.amount), 9818.00);
    assert.strictEqual(res.orderDetails.driver_name, 'Suresh Yadav');
    assert.strictEqual(res.orderDetails.driver_number, '9820500159');
  });

  it('Calculates Petrol order correctly (@ ₹111.55/L)', () => {
    const flowPayload = {
      messages: [
        {
          from: '9076021348',
          type: 'interactive',
          interactive: {
            type: 'nfm_reply',
            nfm_reply: {
              response_json: JSON.stringify({
                vehicle_number: 'MH04MH4857',
                fuel_type: 'MS (Petrol)',
                is_full_tank: 'No',
                litres: '50',
                driver_name: 'Amit Patil',
                driver_number: '9076021348',
              }),
            },
          },
        },
      ],
    };
    const res = processConversation(flowPayload, [], activeRates, sheetalCustomer, dynamicManagers);
    assert.strictEqual(res.action, 'send_ticket');
    assert.strictEqual(res.orderDetails.rate_per_litre, 111.55);
    assert.strictEqual(parseFloat(res.orderDetails.amount), 5577.50);
  });

  it('Handles Full Tank Auto Cut-off properly', () => {
    const flowPayload = {
      messages: [
        {
          from: '9076021348',
          type: 'interactive',
          interactive: {
            type: 'nfm_reply',
            nfm_reply: {
              response_json: JSON.stringify({
                vehicle_number: 'MH04MH4857',
                fuel_type: 'HSD (Diesel)',
                is_full_tank: 'Yes',
                driver_name: 'Dinesh',
                driver_number: '9820500159',
              }),
            },
          },
        },
      ],
    };
    const res = processConversation(flowPayload, [], activeRates, sheetalCustomer, dynamicManagers);
    assert.strictEqual(res.action, 'send_ticket');
    assert.strictEqual(res.orderDetails.is_full_tank, 'Yes');
    assert.strictEqual(res.orderDetails.amount, 'Cut-Off');
    assert.ok(res.response.includes('Full Tank (Dispenser Cut-off)'));
  });

  it('Option B Driver Mobile Normalization: Strips country code +91 and spaces to clean 10 digits', () => {
    const flowPayload = {
      messages: [
        {
          from: '9076021348',
          type: 'interactive',
          interactive: {
            type: 'nfm_reply',
            nfm_reply: {
              response_json: JSON.stringify({
                vehicle_number: 'MH04JU8948',
                fuel_type: 'HSD (Diesel)',
                litres: '80',
                driver_name: 'Ramesh Kumar',
                driver_number: '+919820500159',
              }),
            },
          },
        },
      ],
    };
    const res = processConversation(flowPayload, [], activeRates, sheetalCustomer, dynamicManagers);
    assert.strictEqual(res.action, 'send_ticket');
    assert.strictEqual(res.orderDetails.driver_number, '9820500159');
    assert.ok(res.response.includes('• *Driver Number:* 9820500159'));
  });

  // ----------------------------------------------------------------
  console.log('\n🚛 3. Fleet Vehicle Management Actions:');
  // ----------------------------------------------------------------

  it('Manager clicking "Modify Vehicle" button gets vehicle action menu', () => {
    const payload = {
      messages: [
        {
          from: '9820500159',
          type: 'interactive',
          interactive: {
            type: 'button_reply',
            button_reply: { id: 'btn_modify_vehicle', title: '🚛 Modify Vehicle' },
          },
        },
      ],
    };
    const res = processConversation(payload, [], activeRates, managerCustomer, dynamicManagers);
    assert.strictEqual(res.action, 'send_vehicle_menu');
    assert.strictEqual(res.buttons?.length, 3);
    assert.strictEqual(res.buttons[0].id, 'btn_action_add_vehicle');
    assert.strictEqual(res.buttons[1].id, 'btn_action_edit_vehicle');
    assert.strictEqual(res.buttons[2].id, 'btn_action_delete_vehicle');
  });

  it('Manager clicking "➕ Add Vehicle" triggers Add Vehicle Flow', () => {
    const payload = {
      messages: [
        {
          from: '9820500159',
          type: 'interactive',
          interactive: {
            type: 'button_reply',
            button_reply: { id: 'btn_action_add_vehicle', title: '➕ Add Vehicle' },
          },
        },
      ],
    };
    const res = processConversation(payload, [], activeRates, managerCustomer, dynamicManagers);
    assert.strictEqual(res.action, 'send_add_vehicle_flow');
  });

  it('Valid Add Vehicle flow response registers new vehicle', () => {
    const payload = {
      messages: [
        {
          from: '9820500159',
          type: 'interactive',
          interactive: {
            type: 'nfm_reply',
            nfm_reply: {
              response_json: JSON.stringify({
                action: 'add_vehicle',
                vehicle_number: 'MH04MH9999',
              }),
            },
          },
        },
      ],
    };
    const res = processConversation(payload, [], activeRates, managerCustomer, dynamicManagers);
    assert.strictEqual(res.action, 'save_and_confirm_add_vehicle');
    assert.strictEqual(res.vehicleNumber, 'MH04MH9999');
    assert.ok(res.response.includes('Fleet Vehicle Added Successfully'));
  });

  it('Invalid Add Vehicle format rejects with format explanation', () => {
    const payload = {
      messages: [
        {
          from: '9820500159',
          type: 'interactive',
          interactive: {
            type: 'nfm_reply',
            nfm_reply: {
              response_json: JSON.stringify({
                action: 'add_vehicle',
                vehicle_number: 'INVALID_TRUCK',
              }),
            },
          },
        },
      ],
    };
    const res = processConversation(payload, [], activeRates, managerCustomer, dynamicManagers);
    assert.strictEqual(res.action, 'send_vehicle_menu');
    assert.ok(res.response.includes('Invalid Vehicle Number Format'));
  });

  // ----------------------------------------------------------------
  console.log('\n👥 4. Fleet Manager Management Actions:');
  // ----------------------------------------------------------------

  it('Manager clicking "Modify Manager" gets manager action menu', () => {
    const payload = {
      messages: [
        {
          from: '9820500159',
          type: 'interactive',
          interactive: {
            type: 'button_reply',
            button_reply: { id: 'btn_modify_manager', title: '👥 Modify Manager' },
          },
        },
      ],
    };
    const res = processConversation(payload, [], activeRates, managerCustomer, dynamicManagers);
    assert.strictEqual(res.action, 'send_manager_admin_menu');
    assert.strictEqual(res.buttons?.length, 2);
    assert.strictEqual(res.buttons[0].id, 'btn_action_add_manager');
    assert.strictEqual(res.buttons[1].id, 'btn_action_delete_manager');
  });

  it('Add Manager flow response authorizes new mobile number', () => {
    const payload = {
      messages: [
        {
          from: '9820500159',
          type: 'interactive',
          interactive: {
            type: 'nfm_reply',
            nfm_reply: {
              response_json: JSON.stringify({
                action: 'add_manager',
                manager_phone: '9811223344',
              }),
            },
          },
        },
      ],
    };
    const res = processConversation(payload, [], activeRates, managerCustomer, dynamicManagers);
    assert.strictEqual(res.action, 'save_and_confirm_add_manager');
    assert.strictEqual(res.managerPhone, '9811223344');
    assert.ok(res.response.includes('Authorized Manager Added Successfully'));
  });

  // ----------------------------------------------------------------
  console.log('\n📋 5. Meta WhatsApp Flows JSON Schema & Integrity:');
  // ----------------------------------------------------------------

  const flowFiles = [
    'fuel-order-flow.json',
    'add-vehicle-flow.json',
    'edit-vehicle-flow.json',
    'delete-vehicle-flow.json',
    'add-manager-flow.json',
    'delete-manager-flow.json',
  ];

  for (const file of flowFiles) {
    it(`Flow file "${file}" has valid JSON syntax and required screens`, () => {
      const p = path.join(__dirname, '../flows', file);
      assert.ok(fs.existsSync(p), `File ${file} does not exist`);
      const raw = fs.readFileSync(p, 'utf8');
      const data = JSON.parse(raw);
      assert.ok(data.version, 'Missing flow version');
      assert.ok(Array.isArray(data.screens), 'screens must be an array');
      assert.ok(data.screens.length > 0, 'Must have at least one screen');
    });
  }

  it('Fuel Order Flow driver_number complies with Option B validation (10–13 chars)', () => {
    const p = path.join(__dirname, '../flows/fuel-order-flow.json');
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const children = data.screens[0].layout.children;
    const driverInput = children.find((c) => c.name === 'driver_number');
    assert.ok(driverInput, 'driver_number component missing');
    assert.strictEqual(driverInput['min-chars'], 10);
    assert.strictEqual(driverInput['max-chars'], 13);
    assert.ok(driverInput.label.includes('+91'));
  });

  // ----------------------------------------------------------------
  console.log('\n⚙️ 6. Environment & Configuration Check:');
  // ----------------------------------------------------------------

  it('Config has all 6 Flow IDs defined', () => {
    assert.ok(config.whatsapp.flowId, 'Missing flowId');
    assert.ok(config.whatsapp.addVehicleFlowId, 'Missing addVehicleFlowId');
    assert.ok(config.whatsapp.editVehicleFlowId, 'Missing editVehicleFlowId');
    assert.ok(config.whatsapp.deleteVehicleFlowId, 'Missing deleteVehicleFlowId');
    assert.ok(config.whatsapp.addManagerFlowId, 'Missing addManagerFlowId');
    assert.ok(config.whatsapp.deleteManagerFlowId, 'Missing deleteManagerFlowId');
  });

  console.log('\n====================================================');
  console.log(`📊 TEST SUMMARY: ${passedTests}/${totalTests} Tests Passed`);
  console.log('====================================================');

  if (passedTests === totalTests) {
    console.log('🎉 ALL WHATSAPP BOT UNIT & INTEGRATION TESTS PASSED!\n');
    process.exit(0);
  } else {
    console.error('❌ SOME TESTS FAILED!\n');
    process.exit(1);
  }
}

runTests();
