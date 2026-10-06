// Converts the school's roster spreadsheet (UNIQUE ID | APID | GRADE LEVEL |
// LAST NAME | FIRST NAME) into db/roster.csv, which the seed loads instead of
// the demo students. db/roster*.csv is git-ignored: real student data never
// goes into the repository.
//
//   node scripts/roster-from-xlsx.mjs "Secondary Student List.xlsx"
//   node scripts/roster-from-xlsx.mjs list.xlsx --base64   # for SCCS_ROSTER_B64
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import XLSX from 'xlsx';

const [file, flag] = process.argv.slice(2);
if (!file) {
  console.error('usage: node scripts/roster-from-xlsx.mjs <roster.xlsx> [--base64]');
  process.exit(1);
}
const wb = XLSX.readFile(file);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false });
const headerAt = rows.findIndex((r) => r.map((c) => String(c).trim().toUpperCase()).includes('UNIQUE ID'));
if (headerAt < 0) throw new Error('No "UNIQUE ID" header row found');
const header = rows[headerAt].map((c) => String(c).trim().toUpperCase());
const col = (name) => {
  const i = header.indexOf(name);
  if (i < 0) throw new Error(`Missing column ${name}`);
  return i;
};
const [cId, cApid, cGrade, cLast, cFirst] = ['UNIQUE ID', 'APID', 'GRADE LEVEL', 'LAST NAME', 'FIRST NAME'].map(col);

const seen = new Set();
const out = [];
for (const r of rows.slice(headerAt + 1)) {
  const v = (i) => String(r[i] ?? '').trim().replace(/\s+/g, ' ');
  if (!v(cId) && !v(cLast) && !v(cFirst)) continue;
  const id = v(cId);
  if (!id || !v(cLast) || !v(cFirst) || !/^\d+$/.test(v(cGrade))) throw new Error(`Incomplete row: ${JSON.stringify(r)}`);
  if (seen.has(id)) throw new Error(`Duplicate UNIQUE ID ${id}`);
  seen.add(id);
  out.push([id, v(cApid), String(parseInt(v(cGrade), 10)), v(cLast), v(cFirst)]);
}
const csvCell = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const csv = ['student_id,apid,grade,last_name,first_name', ...out.map((r) => r.map(csvCell).join(','))].join('\n') + '\n';

if (flag === '--base64') {
  process.stdout.write(gzipSync(csv).toString('base64'));
} else {
  writeFileSync('db/roster.csv', csv);
  console.log(`db/roster.csv: ${out.length} students`);
}
