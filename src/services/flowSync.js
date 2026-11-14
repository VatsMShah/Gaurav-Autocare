const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

const FLOW_CONFIGS = [
  {
    name: 'Fuel Order Flow',
    flowIdKey: 'flowId',
    filePath: path.join(__dirname, '../../flows/fuel-order-flow.json'),
  },
  {
    name: 'Edit Vehicle Flow',
    flowIdKey: 'editVehicleFlowId',
    filePath: path.join(__dirname, '../../flows/edit-vehicle-flow.json'),
  },
  {
    name: 'Delete Vehicle Flow',
    flowIdKey: 'deleteVehicleFlowId',
    filePath: path.join(__dirname, '../../flows/delete-vehicle-flow.json'),
  },
];

/**
 * Group flat vehicle array into standard series buckets (LY, JU, LE, LQ, KF, MR, MH, KU, OTHER)
 */
function groupVehiclesBySeries(vehicles) {
  const buckets = {
    ly: [],
    ju: [],
    le: [],
    lq: [],
    kf: [],
    mr: [],
    mh: [],
    ku: [],
    other: [],
  };

  const seen = new Set();
  for (const rawV of vehicles) {
    const v = String(rawV || '').toUpperCase().replace(/[\s-]/g, '');
    if (!v || v === 'N/A' || seen.has(v)) continue;

    // Safety: ignore pure digits (phone numbers) or strings without letters
    if (/^\d+$/.test(v) || v.length < 6 || !/^[A-Z]{2}/.test(v)) continue;

    seen.add(v);

    const m = v.match(/^[A-Z]{2}[0-9]{2}([A-Z]{1,2})[0-9]{4}$/);
    if (m) {
      const sCode = m[1].toLowerCase();
      if (buckets[sCode]) {
        buckets[sCode].push(v);
      } else {
        buckets.other.push(v);
      }
    } else {
      buckets.other.push(v);
    }
  }

  return buckets;
}

/**
 * Upload updated flow JSON and publish it on Meta WhatsApp Cloud API
 */
async function uploadAndPublishFlow(flowId, flowJsonStr, flowName) {
  const boundary = '----WebKitFormBoundary' + Date.now().toString(16);
  const crlf = '\r\n';

  let postData = '';
  postData += `--${boundary}${crlf}`;
  postData += `Content-Disposition: form-data; name="name"${crlf}${crlf}flow.json${crlf}`;

  postData += `--${boundary}${crlf}`;
  postData += `Content-Disposition: form-data; name="asset_type"${crlf}${crlf}FLOW_JSON${crlf}`;

  postData += `--${boundary}${crlf}`;
  postData += `Content-Disposition: form-data; name="file"; filename="flow.json"${crlf}`;
  postData += `Content-Type: application/json${crlf}${crlf}`;
  postData += `${flowJsonStr}${crlf}`;
  postData += `--${boundary}--${crlf}`;

  const uploadUrl = `https://graph.facebook.com/${config.whatsapp.graphApiVersion}/${flowId}/assets`;
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.whatsapp.accessToken}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: postData,
  });

  const uploadJson = await uploadRes.json().catch(() => ({}));
  if (!uploadJson.success) {
    logger.warn(`[FlowSync] Asset upload note for ${flowName} (${flowId}):`, uploadJson);
    return false;
  }

  // Publish
  const publishUrl = `https://graph.facebook.com/${config.whatsapp.graphApiVersion}/${flowId}/publish`;
  const pubRes = await fetch(publishUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.whatsapp.accessToken}`,
    },
  });

  const pubJson = await pubRes.json().catch(() => ({}));
  if (pubJson.success) {
    logger.info(`✅ [FlowSync] Flow ${flowName} (${flowId}) published live on Meta with latest vehicles!`);
    return true;
  } else {
    logger.warn(`[FlowSync] Publish note for ${flowName}:`, pubJson);
    return false;
  }
}

/**
 * Synchronizes Meta WhatsApp Flow forms with the latest list of vehicles.
 * @param {Array<string>} activeVehicles
 */
async function syncFlowsWithLiveVehicles(activeVehicles) {
  if (!Array.isArray(activeVehicles) || activeVehicles.length === 0) {
    return;
  }

  const buckets = groupVehiclesBySeries(activeVehicles);
  const totalValid = Object.values(buckets).reduce((sum, b) => sum + b.length, 0);
  if (totalValid === 0) {
    logger.warn('[FlowSync] No valid vehicles found to sync. Aborting sync.');
    return;
  }
  const seriesTitles = {
    ly: `MH04 LY Series (${buckets.ly.length} Trucks)`,
    ju: `MH04 JU Series (${buckets.ju.length} Trucks)`,
    le: `MH04 LE Series (${buckets.le.length} Trucks)`,
    lq: `MH04 LQ Series (${buckets.lq.length} Trucks)`,
    kf: `MH04 KF Series (${buckets.kf.length} Trucks)`,
    mr: `MH04 MR Series (${buckets.mr.length} Trucks)`,
    mh: `MH04 MH Series (${buckets.mh.length} Trucks)`,
    ku: `MH04 KU Series (${buckets.ku.length} Trucks)`,
    other: `Other Series (${buckets.other.length} Trucks)`,
  };

  for (const cfg of FLOW_CONFIGS) {
    const flowId = config.whatsapp[cfg.flowIdKey];
    if (!flowId) continue;

    try {
      if (!fs.existsSync(cfg.filePath)) continue;
      const rawFile = fs.readFileSync(cfg.filePath, 'utf8');
      const flowData = JSON.parse(rawFile);

      const children = flowData.screens?.[0]?.layout?.children;
      if (!Array.isArray(children)) continue;

      for (const comp of children) {
        if (comp.type === 'Dropdown' && comp.name === 'vehicle_series') {
          for (const opt of comp['data-source'] || []) {
            if (seriesTitles[opt.id]) {
              opt.title = seriesTitles[opt.id];
            }
          }
        }

        if (comp.type === 'If') {
          const cond = comp.condition || '';
          for (const [sId, vList] of Object.entries(buckets)) {
            if (cond.includes(`'${sId}'`)) {
              for (const sub of comp.then || []) {
                if (sub.type === 'Dropdown') {
                  sub['data-source'] = vList.map((v) => ({ id: v, title: v }));
                }
              }
            }
          }
        }
      }

      const updatedJson = JSON.stringify(flowData, null, 2);
      fs.writeFileSync(cfg.filePath, updatedJson, 'utf8');

      // Upload and publish in background
      await uploadAndPublishFlow(flowId, updatedJson, cfg.name);
    } catch (err) {
      logger.warn(`[FlowSync] Failed to sync ${cfg.name}:`, err.message);
    }
  }
}

/**
 * Synchronize the Delete Manager flow dropdown with current managers
 */
async function syncDeleteManagerFlow(managerPhones) {
  const flowId = config.whatsapp.deleteManagerFlowId;
  const filePath = path.join(__dirname, '../../flows/delete-manager-flow.json');
  if (!flowId || !fs.existsSync(filePath)) return false;

  try {
    const rawFile = fs.readFileSync(filePath, 'utf8');
    const flowData = JSON.parse(rawFile);
    const children = flowData.screens?.[0]?.layout?.children;
    if (!Array.isArray(children)) return false;

    const cleanPhones = Array.from(
      new Set(
        (managerPhones || [])
          .map((p) => String(p).replace(/\D/g, '').slice(-10))
          .filter((p) => p.length === 10)
      )
    );

    for (const comp of children) {
      if (comp.type === 'Dropdown' && comp.name === 'manager_phone') {
        comp['data-source'] = cleanPhones.map((p) => ({
          id: p,
          title: `+91 ${p}`,
        }));
      }
    }

    const updatedJson = JSON.stringify(flowData, null, 2);
    fs.writeFileSync(filePath, updatedJson, 'utf8');

    return await uploadAndPublishFlow(flowId, updatedJson, 'Delete Manager Flow');
  } catch (err) {
    logger.warn('[FlowSync] Failed to sync Delete Manager flow:', err.message);
    return false;
  }
}

module.exports = {
  syncFlowsWithLiveVehicles,
  syncDeleteManagerFlow,
  groupVehiclesBySeries,
};

