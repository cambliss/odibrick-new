#!/usr/bin/env node
/**
 * Odibrick — Retrieve Cloudinary Root Folder external_id
 *
 * Read-only lookup:
 * - Calls GET https://api.cloudinary.com/v1_1/<cloud_name>/folders
 * - Filters for exact root folder whose name and path are both 'odibrick-dev-test'.
 * - Prints only the matching folder's name, path, and external_id.
 * - Does not create, modify, or delete any resources.
 * - Never prints or commits secrets.
 */

const cloudName = process.env.CLOUDINARY_CLOUD_NAME || 'defxtdiis';
const adminApiKey = process.env.CLOUDINARY_ADMIN_API_KEY;
const adminApiSecret = process.env.CLOUDINARY_ADMIN_API_SECRET;

async function lookupFolderId() {
  if (!adminApiKey || !adminApiKey.trim()) {
    console.error('[CONFIG_ERROR] CLOUDINARY_ADMIN_API_KEY is missing or empty.');
    process.exit(1);
  }
  if (!adminApiSecret || !adminApiSecret.trim()) {
    console.error('[CONFIG_ERROR] CLOUDINARY_ADMIN_API_SECRET is missing or empty.');
    process.exit(1);
  }

  const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/folders`;
  const authHeader = 'Basic ' + Buffer.from(`${adminApiKey.trim()}:${adminApiSecret.trim()}`).toString('base64');

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
      },
    });

    const data = await res.json();

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        console.error(`[AUTH_ERROR] HTTP ${res.status}: The provided API key lacks permission to call the Admin API (GET /folders).`);
        console.error('Note: An API key with the Media Library User role cannot query the Admin API.');
      } else {
        console.error(`[API_ERROR] HTTP ${res.status}: ${data.error?.message || JSON.stringify(data)}`);
      }
      process.exit(1);
    }

    const folders = data.folders || [];
    const target = folders.find(
      (f) => f.name === 'odibrick-dev-test' && f.path === 'odibrick-dev-test',
    );

    if (!target) {
      console.error('[NOT_FOUND] Folder "odibrick-dev-test" not found among root folders.');
      if (folders.length > 0) {
        console.error(`Available root folders (${folders.length}):`, folders.map((f) => f.name).join(', '));
      } else {
        console.error('No root folders found in this product environment.');
      }
      process.exit(1);
    }

    // Print ONLY the matching folder's name, path, and external_id
    console.log(JSON.stringify(
      {
        name: target.name,
        path: target.path,
        external_id: target.external_id,
      },
      null,
      2,
    ));
  } catch (err) {
    console.error('[ERROR] Request failed:', err.message);
    process.exit(1);
  }
}

lookupFolderId();
