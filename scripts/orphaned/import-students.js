const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Gmc190494mcv@db.cpdrclazmvboenhlsccf.supabase.co:5432/postgres'
});

const students = [
  { student_id: '001', last_name: 'CHAIN SPITZ', first_name: 'ESTEBAN', grade: 11, house_team: 'TEAM A', counselor: 'MS GABRIELA MOLINA' },
  { student_id: '002', last_name: 'FERNANDEZ ALTAMIRANO DIEGO JOSE', first_name: 'DIEGO JOSE', grade: 11, house_team: 'TEAM A', counselor: 'MS GABRIELA MOLINA' },
  { student_id: '003', last_name: 'GUARDIA LOPEZ', first_name: 'TOMAS', grade: 11, house_team: 'TEAM A', counselor: 'MS GABRIELA MOLINA' },
  { student_id: '004', last_name: 'HSIEH SHIH', first_name: 'SEBASTIAN', grade: 11, house_team: 'TEAM A', counselor: 'MS GABRIELA MOLINA' },
  { student_id: '005', last_name: 'JUSTINIANO CHAVEZ', first_name: 'MARCO', grade: 11, house_team: 'TEAM A', counselor: 'MS GABRIELA MOLINA' },
  { student_id: '006', last_name: 'KEMPFF NIELSEN', first_name: 'ISABELLA', grade: 11, house_team: 'TEAM A', counselor: 'MS GABRIELA MOLINA' },
  { student_id: '007', last_name: 'KIM KIM', first_name: 'THOMAS', grade: 11, house_team: 'TEAM A', counselor: 'MS GABRIELA MOLINA' },
  { student_id: '008', last_name: 'LANDIVAR BENDEK', first_name: 'SOFIA', grade: 11, house_team: 'TEAM A', counselor: 'MS GABRIELA MOLINA' },
  { student_id: '009', last_name: 'LAZZO BARBERY', first_name: 'GIULIANA', grade: 11, house_team: 'TEAM A', counselor: 'MS GABRIELA MOLINA' },
  { student_id: '010', last_name: 'MANSILLA SALEM', first_name: 'SOPHIA MERCEDES', grade: 11, house_team: 'TEAM A', counselor: 'MS GABRIELA MOLINA' },
  { student_id: '011', last_name: 'MARINKOVIC CAMACHO', first_name: 'LUKA', grade: 11, house_team: 'TEAM A', counselor: 'MS GABRIELA MOLINA' },
  { student_id: '012', last_name: 'MONTAÑO TAPIA', first_name: 'TAMARA', grade: 11, house_team: 'TEAM A', counselor: 'MS GABRIELA MOLINA' },
  { student_id: '013', last_name: 'NOGALES CUELLAR', first_name: 'SANTIAGO', grade: 11, house_team: 'TEAM A', counselor: 'MS GABRIELA MOLINA' },
  { student_id: '014', last_name: 'OROSCO SAAVEDRA', first_name: 'SILVANA ENOÉ', grade: 11, house_team: 'TEAM A', counselor: 'MS GABRIELA MOLINA' },
  { student_id: '015', last_name: 'PAZ GASSER', first_name: 'CAROLINA', grade: 11, house_team: 'TEAM A', counselor: 'MS GABRIELA MOLINA' },
  { student_id: '016', last_name: 'QUINTANILLA PETRICEVIC', first_name: 'MARTINA', grade: 11, house_team: 'TEAM A', counselor: 'MS GABRIELA MOLINA' },
  { student_id: '017', last_name: 'REALE', first_name: 'JOAQUIN', grade: 11, house_team: 'TEAM A', counselor: 'MS GABRIELA MOLINA' },
  { student_id: '018', last_name: 'RIVERA GAMARRA', first_name: 'VALENTINA', grade: 11, house_team: 'TEAM A', counselor: 'MS GABRIELA MOLINA' },
  { student_id: '019', last_name: 'ROJAS LOZADA', first_name: 'SARA GABRIELA', grade: 11, house_team: 'TEAM A', counselor: 'MS GABRIELA MOLINA' },
  { student_id: '020', last_name: 'SAAVEDRA HINOJOSA', first_name: 'MATIAS', grade: 11, house_team: 'TEAM A', counselor: 'MS GABRIELA MOLINA' },
  { student_id: '021', last_name: 'SUAREZ BULLAIN', first_name: 'ANDRÉ', grade: 11, house_team: 'TEAM A', counselor: 'MS GABRIELA MOLINA' },
  { student_id: '022', last_name: 'SUAREZ PEÑA', first_name: 'VALENTINA', grade: 11, house_team: 'TEAM A', counselor: 'MS GABRIELA MOLINA' },
  { student_id: '023', last_name: 'THURSTON VON LUNEN', first_name: 'KAILAH BEATRIZ', grade: 11, house_team: 'TEAM A', counselor: 'MS GABRIELA MOLINA' },
  { student_id: '024', last_name: 'VILAPLANA REK', first_name: 'CATALINA', grade: 11, house_team: 'TEAM A', counselor: 'MS GABRIELA MOLINA' },
];

async function insertStudents() {
  try {
    await client.connect();
    console.log('Connected to database!');

    for (const student of students) {
      await client.query(
        'INSERT INTO students (student_id, last_name, first_name, grade, house_team, counselor, gpa, total_points, conduct_status) VALUES ($1, $2, $3, $4, $5, $6, 0.0, 100, $7)',
        [student.student_id, student.last_name, student.first_name, student.grade, student.house_team, student.counselor, 'Good Standing']
      );
      console.log(`Added: ${student.first_name} ${student.last_name}`);
    }

    console.log('\nAll 24 students inserted successfully!');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

insertStudents();