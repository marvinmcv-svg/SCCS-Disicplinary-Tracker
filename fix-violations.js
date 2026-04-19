const initSqlJs = require('sql.js');
const fs = require('fs');

async function fixViolations() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync('./data/discipline.db'));

  console.log('Before fix:', db.exec('SELECT COUNT(*) FROM violations')[0].values[0][0]);

  // Drop table and recreate with unique constraint
  db.run('DROP TABLE IF EXISTS violations');
  db.run(`
    CREATE TABLE violations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      violation_type TEXT NOT NULL,
      description TEXT,
      points_deduction INTEGER DEFAULT -2,
      default_consequence TEXT,
      min_oss_days INTEGER DEFAULT 0,
      max_oss_days INTEGER DEFAULT 1,
      UNIQUE(category, violation_type)
    )
  `);

  // Insert all violations
  const violations = [
    ["Attendance", "Tardy to School", "Arriving late to school without proper excuse (1st: Warning, 4+/week: Friday Detention)", -2, "Warning/Detention", 0, 0],
    ["Attendance", "Tardy to Class", "Arriving late to class without a pass (1st: Warning, 4+/week: Friday Detention)", -2, "Warning/Detention", 0, 0],
    ["Attendance", "Unexcused Absence", "Missing school without parent notification", -3, "Detention/Saturday School", 0, 1],
    ["Attendance", "Class Cut/AWOL", "Deliberately skipping a class or leaving school", -5, "Saturday School/ISS", 0, 2],
    ["Attendance", "Truancy", "Pattern of unexcused absences", -5, "Saturday School/ISS", 1, 3],
    ["Attendance", "Leaving Campus", "Leaving school grounds without permission", -3, "ISS/Parent Conference", 0, 2],
    ["Attendance", "Failure to Serve Detention", "Not reporting to assigned detention", -2, "Extra Detention/ISS", 0, 1],
    ["Classroom Behavior", "Classroom Disruption", "Behavior that interrupts learning", -2, "Warning/Detention", 0, 0],
    ["Classroom Behavior", "Insubordination", "Refusing to comply with staff requests", -3, "Detention/ISS", 0, 1],
    ["Classroom Behavior", "Defiant Behavior", "Openly desafying authority", -3, "ISS/OSS", 0, 3],
    ["Classroom Behavior", "Rude Behavior", "Disrespectful behavior toward staff", -2, "Warning/Detention", 0, 0],
    ["Classroom Behavior", "Inappropriate Language", "Using profanity or vulgar language", -2, "Warning/Detention", 0, 0],
    ["Classroom Behavior", "Leaving Class", "Leaving classroom without permission", -2, "Warning/Detention", 0, 0],
    ["Classroom Behavior", "Out of Area", "Being in unauthorized location", -2, "Warning/Detention", 0, 0],
    ["Classroom Behavior", "No Hall Pass", "Not having proper pass during class time", -1, "Warning", 0, 0],
    ["Classroom Behavior", "Phone Violation", "Using phone during school hours (1st: confiscate 1 week, 2nd: 1 month, 3rd: end of semester)", -2, "Phone Confiscation", 0, 0],
    ["Physical Behavior", "Physical Altercation", "Getting into physical confrontation", -5, "OSS/Behavior Contract", 1, 3],
    ["Physical Behavior", "Fighting", "Engaging in physical combat", -10, "OSS (3-10 days)/Expulsion", 3, 10],
    ["Physical Behavior", "Instigating Fight", "Encouraging or organizing fighting", -5, "OSS/Behavior Contract", 1, 3],
    ["Physical Behavior", "Horseplay", "Rough or unsafe play", -2, "Warning/Detention", 0, 0],
    ["Academic Integrity", "Plagiarism", "Using work without proper citation (1st: resubmit max 60, 2nd: zero, 3rd: suspension)", -5, "Zero/Conference", 0, 0],
    ["Academic Integrity", "Cheating", "Academic dishonesty on tests/assignments (1st: resubmit max 60, 2nd: zero, 3rd: suspension)", -5, "Zero/Suspension", 0, 1],
    ["Academic Integrity", "Forgery", "Falsifying documents or signatures", -5, "OSS/Expulsion", 0, 5],
    ["Academic Integrity", "Homework Copying", "Copying homework from another student", -3, "Zero/Detention", 0, 0],
    ["Dress Code", "Dress Code Violation", "Not adhering to school dress code (1st-2nd: change clothes, 3rd: Friday detention)", -2, "Warning/Detention", 0, 0],
    ["Dress Code", "Inappropriate PDA", "Public displays not appropriate", -2, "Warning/Parent Call", 0, 0],
    ["Tobacco/Alcohol/Drugs", "Tobacco Possession", "Possessing tobacco products on campus", -5, "3-Day OSS", 3, 3],
    ["Tobacco/Alcohol/Drugs", "Tobacco Use", "Using tobacco on campus", -5, "5-Day OSS", 5, 5],
    ["Tobacco/Alcohol/Drugs", "Alcohol Possession", "Possessing alcohol on campus", -10, "5-Day OSS", 5, 5],
    ["Tobacco/Alcohol/Drugs", "Alcohol Use", "Using alcohol on campus", -10, "10-Day OSS", 10, 10],
    ["Tobacco/Alcohol/Drugs", "Drug Possession", "Possessing illegal drugs/medication without prescription", -15, "10+ Day OSS/Expulsion", 10, 30],
    ["Tobacco/Alcohol/Drugs", "Drug Distribution", "Selling or distributing drugs on campus", -20, "Expulsion", 30, 99],
    ["Tobacco/Alcohol/Drugs", "Vaping", "Using e-cigarettes on campus", -5, "3-Day OSS", 3, 3],
    ["Bullying/Harassment", "Bullying", "Intimidating or harassing behavior", -5, "OSS/Behavior Contract", 3, 5],
    ["Bullying/Harassment", "Harassment", "Repeated unwanted behavior", -5, "OSS/Behavior Contract", 3, 5],
    ["Bullying/Harassment", "Cyberbullying", "Online harassment", -5, "OSS/Behavior Contract", 3, 5],
    ["Bullying/Harassment", "Threats", "Threatening to harm others", -10, "OSS/Expulsion", 5, 10],
    ["Bullying/Harassment", "Inappropriate Gestures", "Inappropriate gestures toward others", -3, "Warning/Detention", 0, 1],
    ["Hazing", "Hazing", "Forced behavior for group initiation", -10, "OSS/Expulsion", 3, 10],
    ["Weapons", "Weapons Possession", "Possessing weapons on campus", -25, "Expulsion", 99, 99],
    ["Weapons", "Look-alike Weapons", "Items resembling weapons", -15, "OSS/Expulsion", 5, 15],
    ["Weapons", "Dangerous Objects", "Possessing dangerous objects", -15, "OSS/Expulsion", 5, 15],
    ["Property", "Theft", "Stealing property", -10, "OSS/Restitution", 0, 5],
    ["Property", "Vandalism", "Deliberately damaging property", -10, "OSS/Restitution", 0, 5],
    ["Property", "Locker Damage", "Damaging school-issued locker", -5, "Restitution/Warning", 0, 0],
    ["Technology", "AUP Violation", "Violating technology use policy", -2, "Warning/Loss of Access", 0, 0],
    ["Technology", "Unauthorized Access", "Hacking or unauthorized system access", -5, "OSS/Referral", 0, 3],
    ["Technology", "Teacher Computer Use", "Using teacher's computer without permission", -10, "Immediate Suspension", 1, 3],
    ["Technology", "Cyber Violation", "Misuse of institutional email or social media", -5, "OSS/Behavior Contract", 0, 5],
    ["Safety", "Fire Alarm Misuse", "Pulling fire alarm without cause", -5, "OSS", 1, 3],
    ["Safety", "False Reports", "Making false emergency reports", -5, "OSS", 1, 3],
    ["Safety", "Safety Violation", "Compromising safety of others", -5, "ISS/OSS", 0, 5],
  ];

  const stmt = db.prepare('INSERT INTO violations (category, violation_type, description, points_deduction, default_consequence, min_oss_days, max_oss_days) VALUES (?, ?, ?, ?, ?, ?, ?)');

  for (const v of violations) {
    stmt.run(v);
  }
  stmt.free();

  fs.writeFileSync('./data/discipline.db', db.export());

  console.log('After fix:', db.exec('SELECT COUNT(*) FROM violations')[0].values[0][0]);
  db.close();
  console.log('Done! 52 unique violations.');
}

fixViolations().catch(console.error);