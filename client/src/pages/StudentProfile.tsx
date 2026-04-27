import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, User, Calendar, Phone, Mail, MapPin, Clock, AlertTriangle, CheckCircle, Printer, ChevronRight, GraduationCap } from 'lucide-react';
import api from '../lib/api';
import { Incident } from '../lib/api';

interface Student {
  id: number;
  student_id: string;
  last_name: string;
  first_name: string;
  grade: string;
  section?: string;
  counselor: string;
  advisory: string;
  gpa: number;
  total_points: number;
  conduct_status: string;
  observations: string;
  date_of_birth?: string;
  parent_name?: string;
  parent_phone?: string;
  gender?: string;
  created_at: string;
}

interface MTSSIntervention {
  id: number;
  student_id: number;
  tier: number;
  intervention: string;
  advisor: string;
  start_date: string;
  end_date: string | null;
  progress: string;
  notes: string | null;
}

interface StudentIncident extends Incident {
  violation_type: string;
  category: string;
}

export default function StudentProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [student, setStudent] = useState<Student | null>(null);
  const [incidents, setIncidents] = useState<StudentIncident[]>([]);
  const [mtss, setMtss] = useState<MTSSIntervention | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [studentRes, incidentsRes, mtssRes] = await Promise.all([
        api.get(`/students/${id}`),
        api.get(`/incidents`),
        api.get(`/mtss`),
      ]);

      const studentData = studentRes.data;
      setStudent(studentData);

      // Filter incidents for this student and sort by date descending
      const studentIncidents = (incidentsRes.data as StudentIncident[])
        .filter(i => i.student_id === parseInt(id || '0'))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setIncidents(studentIncidents);

      // Get latest active MTSS for this student
      const studentMtss = (mtssRes.data as MTSSIntervention[])
        .filter(m => m.student_id === parseInt(id || '0'))
        .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0] || null;
      setMtss(studentMtss);
    } catch (error) {
      console.error('Failed to load student profile:', error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getGradeColor = (grade: string): string => {
    const gradeNum = parseInt(grade);
    switch (gradeNum) {
      case 6: return 'bg-blue-100 text-blue-700';
      case 7: return 'bg-green-100 text-green-700';
      case 8: return 'bg-orange-100 text-orange-700';
      case 9: return 'bg-purple-100 text-purple-700';
      case 10: return 'bg-pink-100 text-pink-700';
      case 11: return 'bg-indigo-100 text-indigo-700';
      case 12: return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getInitials = (firstName: string, lastName: string): string => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'Open': return 'badge-danger';
      case 'Pending': return 'badge-warning';
      case 'Resolved': return 'badge-success';
      default: return 'badge-info';
    }
  };

  const getMtssTierLabel = (tier: number | undefined): string => {
    if (!tier) return 'Not Enrolled';
    return `Tier ${tier}`;
  };

  const getMtssTierColor = (tier: number | undefined): string => {
    if (!tier) return 'bg-gray-100 text-gray-600';
    switch (tier) {
      case 1: return 'bg-blue-100 text-blue-700';
      case 2: return 'bg-yellow-100 text-yellow-700';
      case 3: return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const formatDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[50vh]">
        <div className="text-gray-400">Loading profile...</div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh]">
        <AlertTriangle className="w-12 h-12 text-gray-400 mb-4" />
        <p className="text-gray-500 mb-4">Student not found</p>
        <button onClick={() => navigate('/students')} className="btn btn-primary">
          Back to Students
        </button>
      </div>
    );
  }

  const activeIncidents = incidents.filter(i => i.status !== 'Resolved');
  const resolvedIncidents = incidents.filter(i => i.status === 'Resolved');

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto pb-24 md:pb-6">
      <button
        onClick={() => navigate('/students')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="w-5 h-5" />
        Back to Students
      </button>

      {/* Print Button - only show when printing */}
      <div className="hidden print:flex justify-end mb-4">
        <button onClick={handlePrint} className="btn btn-secondary flex items-center gap-2">
          <Printer className="w-5 h-5" />
          Print Report
        </button>
      </div>

      {/* Student Header Card */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-6 print:shadow-none">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6">
          <div className="flex items-start gap-6">
            {/* Grade-colored Avatar */}
            <div className={`w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center text-2xl md:text-3xl font-bold ${getGradeColor(student.grade)}`}>
              {getInitials(student.first_name, student.last_name)}
            </div>
            <div className="flex-1 text-white">
              <h1 className="text-2xl md:text-3xl font-bold">
                {student.last_name}, {student.first_name}
              </h1>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-blue-100">
                <span className="flex items-center gap-1">
                  <GraduationCap className="w-4 h-4" />
                  Grade {student.grade}{student.section ? `-${student.section}` : ''}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {student.advisory || 'No Advisory'}
                </span>
                <span className="flex items-center gap-1">
                  <User className="w-4 h-4" />
                  ID: {student.student_id}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-3">
                {mtss ? (
                  <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${getMtssTierColor(mtss.tier)}`}>
                    MTSS {getMtssTierLabel(mtss.tier)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-600">
                    MTSS Not Enrolled
                  </span>
                )}
                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${
                  student.conduct_status === 'Good Standing' ? 'bg-green-200 text-green-800' :
                  student.conduct_status === 'Warning' ? 'bg-yellow-200 text-yellow-800' :
                  student.conduct_status === 'Probation' ? 'bg-red-200 text-red-800' : 'bg-blue-200 text-blue-800'
                }`}>
                  {student.conduct_status || 'Unknown'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Info Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-gray-100 bg-gray-50">
          <div className="flex items-center gap-3 p-4">
            <User className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">Counselor</p>
              <p className="text-sm font-medium text-gray-900">{student.counselor || '-'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4">
            <Phone className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">Parent Contact</p>
              <p className="text-sm font-medium text-gray-900">{student.parent_phone || '-'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4">
            <Calendar className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">Date of Birth</p>
              <p className="text-sm font-medium text-gray-900">{formatDate(student.date_of_birth)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4">
            <Mail className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">Parent/Guardian</p>
              <p className="text-sm font-medium text-gray-900 truncate">{student.parent_name || '-'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Incident Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-4 text-center">
          <p className="text-3xl font-bold text-gray-900">{incidents.length}</p>
          <p className="text-xs text-gray-500 mt-1">Total Incidents</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 text-center">
          <p className="text-3xl font-bold text-yellow-600">{activeIncidents.length}</p>
          <p className="text-xs text-gray-500 mt-1">Active Incidents</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 text-center">
          <p className="text-3xl font-bold text-green-600">{resolvedIncidents.length}</p>
          <p className="text-xs text-gray-500 mt-1">Resolved</p>
        </div>
      </div>

      {/* Incident Timeline */}
      <div className="bg-white rounded-2xl shadow-sm p-6 mb-6 print:page-break-inside-avoid">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5" />
          Incident Timeline
        </h2>

        {incidents.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <AlertTriangle className="w-12 h-12 mx-auto mb-2" />
            <p>No incidents on record</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-6 md:left-1/2 top-0 bottom-0 w-0.5 bg-gray-200 transform md:-translate-x-1/2" />

            <div className="space-y-6">
              {incidents.map((incident, index) => (
                <div key={incident.id} className="relative flex items-start gap-4">
                  {/* Timeline dot */}
                  <div className={`relative z-10 w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                    incident.status === 'Resolved'
                      ? 'bg-green-100 text-green-600'
                      : incident.status === 'Pending'
                      ? 'bg-yellow-100 text-yellow-600'
                      : 'bg-red-100 text-red-600'
                  }`}>
                    {incident.status === 'Resolved' ? (
                      <CheckCircle className="w-6 h-6" />
                    ) : (
                      <AlertTriangle className="w-6 h-6" />
                    )}
                  </div>

                  {/* Incident card */}
                  <div className="flex-1 bg-gray-50 rounded-xl p-4 print:bg-white print:border">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="font-semibold text-gray-900">{incident.violation_type}</p>
                        <p className="text-xs text-gray-500">{incident.category}</p>
                      </div>
                      <span className={`badge ${getStatusColor(incident.status)}`}>
                        {incident.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-500">Date: </span>
                        <span className="text-gray-700">{formatDate(incident.date)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Location: </span>
                        <span className="text-gray-700">{incident.location || '-'}</span>
                      </div>
                      {incident.consequence && (
                        <div className="col-span-2">
                          <span className="text-gray-500">Consequence: </span>
                          <span className="text-gray-700">{incident.consequence}</span>
                        </div>
                      )}
                      {incident.points_deducted !== undefined && incident.points_deducted !== 0 && (
                        <div>
                          <span className="text-gray-500">Points: </span>
                          <span className={`font-medium ${incident.points_deducted < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {incident.points_deducted}
                          </span>
                        </div>
                      )}
                    </div>
                    {incident.description && (
                      <p className="text-sm text-gray-600 mt-2 border-t pt-2">
                        {incident.description}
                      </p>
                    )}
                    {incident.notes && (
                      <p className="text-sm text-gray-500 mt-1 italic">
                        Note: {incident.notes}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* MTSS Information */}
      {mtss && (
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6 print:page-break-inside-avoid">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <GraduationCap className="w-5 h-5" />
            MTSS Intervention
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Tier</p>
              <p className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium mt-1 ${getMtssTierColor(mtss.tier)}`}>
                {getMtssTierLabel(mtss.tier)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Intervention</p>
              <p className="font-medium text-gray-900">{mtss.intervention}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Start Date</p>
              <p className="font-medium text-gray-900">{formatDate(mtss.start_date)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">End Date</p>
              <p className="font-medium text-gray-900">{mtss.end_date ? formatDate(mtss.end_date) : 'Ongoing'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Progress</p>
              <p className="font-medium text-gray-900">{mtss.progress}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Advisor</p>
              <p className="font-medium text-gray-900">{mtss.advisor}</p>
            </div>
            {mtss.notes && (
              <div className="md:col-span-2">
                <p className="text-sm text-gray-500">Notes</p>
                <p className="font-medium text-gray-900">{mtss.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Observations */}
      {student.observations && (
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6 print:page-break-inside-avoid">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <User className="w-5 h-5" />
            Observations / Notes
          </h2>
          <p className="text-gray-700">{student.observations}</p>
        </div>
      )}

      {/* Print-only footer */}
      <div className="hidden print:mt-8 pt-4 border-t text-center text-xs text-gray-500">
        <p>SCCS Disciplinary Tracker - Student Report</p>
        <p>Generated on {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>
    </div>
  );
}