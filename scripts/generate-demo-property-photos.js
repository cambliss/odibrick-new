const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../apps/api/.env') });
const mysql = require('mysql2/promise');

function generateRoomSvg(caption, roomTag, id) {
  const tag = (roomTag || caption || 'LIVING_ROOM').toUpperCase();
  let title = caption || 'Property Photograph';
  let themeColor = '#1d4337'; // seal
  let accentColor = '#ca8a04'; // ochre

  if (tag.includes('KITCHEN')) {
    themeColor = '#1e3a5f';
    accentColor = '#f59e0b';
    title = title || 'Modular Kitchen';
  } else if (tag.includes('BEDROOM')) {
    themeColor = '#3b2d54';
    accentColor = '#ec4899';
    title = title || 'Master Bedroom';
  } else if (tag.includes('BALCONY')) {
    themeColor = '#155e75';
    accentColor = '#10b981';
    title = title || 'Balcony & Panoramic View';
  } else {
    themeColor = '#1e293b';
    accentColor = '#0ea5e9';
    title = title || 'Living & Dining Lounge';
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
  <defs>
    <linearGradient id="bg_${id}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${themeColor}"/>
      <stop offset="50%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>
    <linearGradient id="glow_${id}" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${accentColor}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.05"/>
    </linearGradient>
    <pattern id="grid_${id}" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#ffffff" stroke-width="0.5" stroke-opacity="0.07"/>
    </pattern>
  </defs>

  <rect width="800" height="600" fill="url(#bg_${id})"/>
  <rect width="800" height="600" fill="url(#glow_${id})"/>
  <rect width="800" height="600" fill="url(#grid_${id})"/>

  <!-- Architectural room structure -->
  <g transform="translate(80, 60)" opacity="0.95">
    <!-- Floor perspective -->
    <polygon points="0,400 640,400 560,320 80,320" fill="#ffffff" fill-opacity="0.04"/>
    <!-- Back wall -->
    <rect x="80" y="40" width="480" height="280" fill="#ffffff" fill-opacity="0.02" stroke="#ffffff" stroke-opacity="0.12" stroke-width="1.5" rx="4"/>
    <!-- Scenic daylight window -->
    <rect x="130" y="70" width="160" height="180" fill="#ffffff" fill-opacity="0.08" stroke="${accentColor}" stroke-opacity="0.5" stroke-width="2" rx="2"/>
    <line x1="210" y1="70" x2="210" y2="250" stroke="${accentColor}" stroke-opacity="0.35" stroke-width="1.5"/>
    <line x1="130" y1="160" x2="290" y2="160" stroke="${accentColor}" stroke-opacity="0.35" stroke-width="1.5"/>
    <!-- Modern interior artwork frame -->
    <rect x="340" y="90" width="170" height="120" fill="${accentColor}" fill-opacity="0.15" stroke="#ffffff" stroke-opacity="0.2" stroke-width="1.5" rx="2"/>
    <circle cx="425" cy="150" r="35" fill="${accentColor}" fill-opacity="0.3"/>
    <!-- Furniture accent silhouette -->
    <rect x="180" y="270" width="280" height="50" rx="6" fill="#ffffff" fill-opacity="0.06" stroke="#ffffff" stroke-opacity="0.15" stroke-width="1"/>
  </g>

  <!-- Title Pill -->
  <g transform="translate(400, 480)" text-anchor="middle">
    <rect x="-170" y="-45" width="340" height="75" rx="10" fill="#0f172a" fill-opacity="0.9" stroke="${accentColor}" stroke-width="1.5"/>
    <text y="-12" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="600" letter-spacing="0.5">${title}</text>
    <text y="18" fill="${accentColor}" font-family="ui-monospace, monospace" font-size="12" font-weight="600" letter-spacing="1.5">ODIBRICK VERIFIED MEDIA</text>
  </g>

  <!-- Top Brand Seal -->
  <g transform="translate(40, 40)">
    <rect width="120" height="30" rx="6" fill="#000000" fill-opacity="0.65" stroke="#ffffff" stroke-opacity="0.2" stroke-width="1"/>
    <text x="60" y="20" text-anchor="middle" fill="#ffffff" font-family="system-ui, sans-serif" font-size="12" font-weight="700" letter-spacing="1.5">ODIBRICK</text>
  </g>
</svg>`;
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3307,
    user: process.env.DB_USER || 'odibrick',
    password: process.env.DB_PASSWORD || 'odibrick_dev',
    database: process.env.DB_NAME || 'odibrick',
  });

  const [images] = await conn.query('SELECT id, property_id, storage_key, caption, room_tag FROM property_images');
  console.log(`Generating files for ${images.length} property image records...`);

  const roots = [
    path.resolve(process.cwd(), 'storage'),
    path.resolve(process.cwd(), 'apps/api/storage'),
  ];

  let generated = 0;
  for (const img of images) {
    const svgContent = generateRoomSvg(img.caption, img.room_tag, img.id);
    for (const root of roots) {
      const filePath = path.resolve(root, img.storage_key);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, svgContent, 'utf8');
    }
    generated++;
  }
  console.log(`Successfully generated ${generated} property image files across storage folders.`);
  await conn.end();
}

main().catch(console.error);
