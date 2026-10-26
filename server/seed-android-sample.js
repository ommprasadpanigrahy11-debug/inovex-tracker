import db from './db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const recDir = path.join(__dirname, 'data', 'recordings');
if (!fs.existsSync(recDir)) {
  fs.mkdirSync(recDir, { recursive: true });
}

const sampleFile = path.join(recDir, 'android_sprint_sample.webm');
if (!fs.existsSync(sampleFile)) {
  fs.writeFileSync(sampleFile, Buffer.from([0x1A, 0x45, 0xDF, 0xA3, 0x01, 0x00, 0x00, 0x00]));
}

db.prepare(`
  INSERT OR REPLACE INTO sprint_audits (
    id, task_id, user_id, employee_name, device_type, video_filename, video_url,
    duration_seconds, ai_health_score, anomaly_count, anomalies_json,
    focus_breakdown_json, ai_summary, verdict, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  'aud_android_sample_01',
  'tsk_002',
  'usr_emp_02',
  'Elena Rostova (Pipeline Eng)',
  'android',
  'android_sprint_sample.webm',
  '/recordings/android_sprint_sample.webm',
  1800,
  88,
  1,
  JSON.stringify([
    {
      timeOffsetSec: 1920,
      timeFormatted: '32:00',
      type: 'background_app_switch',
      description: 'Mobile screen focus shifted to Telegram notifications',
      severity: 'medium'
    }
  ]),
  JSON.stringify({
    sprint_work: 78,
    docs_research: 14,
    flagged_or_idle: 8
  }),
  'AI Agent processed Android background screen stream. Maintained active development on mobile workbench with 1 brief notification switch.',
  'MINOR_ANOMALIES',
  Date.now() - 3600000
);

console.log('Android mobile sample audit successfully registered in SQLite database.');
