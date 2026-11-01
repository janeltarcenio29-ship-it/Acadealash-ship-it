/* Writes backend/config.js (the public browser settings) from .env.
   Run by run.bat:  node --env-file=.env scripts/generate-config.js
   Only the project URL and the PUBLISHABLE key are written. It refuses a secret or service-role key. */
'use strict';
const fs = require('fs');
const path = require('path');

const fail = m => { console.error('[error] ' + m); process.exit(1); };
const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const key = (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

if (!/^https:\/\/[^\s/]+$/i.test(url)) fail('SUPABASE_URL must look like https://your-project.supabase.co');
if (!key) fail('SUPABASE_PUBLISHABLE_KEY is empty.');
if (/^sb_secret_/i.test(key)) fail('That is a SECRET key. Put the publishable key (sb_publishable_...) in SUPABASE_PUBLISHABLE_KEY.');
if (key.split('.').length === 3) {                    // older JWT-style keys: refuse the service role
  try {
    const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
    if (claims.role === 'service_role') fail('That is a service-role key. Use the publishable (anon) key.');
  } catch (e) { /* not decodable: keep going */ }
}

const out = path.join(__dirname, '..', 'config.js');
fs.writeFileSync(out, 'window.APP_CONFIG = {\n  SUPABASE_URL: ' + JSON.stringify(url) + ',\n  SUPABASE_KEY: ' + JSON.stringify(key) + '\n};\n');
console.log('config.js written (URL and publishable key only).');
