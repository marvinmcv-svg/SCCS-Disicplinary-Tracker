import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Save, Clock, User, MapPin, AlertTriangle, CheckCircle,
  FileText, Upload, Send, ChevronUp, Loader, X, Check, Bell, Shield,
  Calendar, Phone, Mail, Eye, Printer, Download
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../App';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Incident {
  id: number;
  incident_id: string;
  date: string;
  time: string | null;
  student_id: number;
  violation_id: number;
  location: string | null;
  description: string | null;
  witnesses: string | null;
  advisor: string | null;
  parent_contacted: string;
  contact_date: string | null;
  action_taken: string | null;
  consequence: string | null;
  points_deducted: number;
  days_iss: number;
  days_oss: number;
  detention_hours: number;
  notes: string | null;
  follow_up_needed: string;
  follow_up_date: string | null;
  status: string;
  resolved_date: string | null;
  evidence: string | null;
  created_at: string;
  last_name?: string;
  first_name?: string;
  student_id_raw?: string;
  violation_type?: string;
  category?: string;
  reported_by?: string;
  escalated_to_principal?: boolean;
  principal_notified_at?: string | null;
  grade?: string;
}

interface Violation {
  id: number;
  category: string;
  violation_type: string;
  description: string | null;
  points_deduction: number;
  default_consequence: string | null;
}

interface UserType {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  role: string;
}

interface StatusChangeLog {
  id: number;
  incident_id: number;
  changed_by: number;
  changed_by_name: string;
  previous_status: string;
  new_status: string;
  changed_at: string;
  notes: string | null;
}

interface Evidence {
  id: number;
  incident_id: number;
  file_name: string;
  file_url: string;
  file_type: string;
  uploaded_by: number;
  uploaded_by_name: string;
  uploaded_at: string;
}

const LOCATION_OPTIONS = [
  'Classroom', 'Hallway', 'Cafeteria', 'Playground', 'Gym',
  'Bathroom', 'Front Office', 'Parking Lot', 'Bus', 'Other'
];

const CONSEQUENCE_OPTIONS = [
  'Warning', 'Parent Call', 'Detention', 'Saturday School', 'ISS', 'OSS', 'Expulsion'
];

export default function IncidentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [evidenceFiles, setEvidenceFiles] = useState<Evidence[]>([]);
  const [statusLogs, setStatusLogs] = useState<StatusChangeLog[]>([]);
  const [showStatusLog, setShowStatusLog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    date: '',
    time: '',
    location: '',
    violation_id: '' as string | number,
    description: '',
    witnesses: '',
    reported_by: '',
    advisor: '',
    action_taken: '',
    consequence: '',
    notes: '',
    follow_up_needed: 'No',
    follow_up_date: '',
    parent_contacted: 'No',
    contact_date: '',
    points_deducted: 0,
    days_iss: 0,
    days_oss: 0,
    detention_hours: 0,
  });

  const loadData = useCallback(async () => {
    try {
      const [incidentRes, violationsRes, usersRes, logsRes] = await Promise.all([
        api.get(`/incidents/${id}`),
        api.get('/violations'),
        api.get('/users'),
        api.get(`/incidents/${id}/status-logs`),
      ]);

      const incidentData = incidentRes.data;
      setIncident(incidentData);
      setViolations(violationsRes.data);
      setUsers(usersRes.data);
      setStatusLogs(logsRes.data || []);

      // Populate form
      setFormData({
        date: incidentData.date || '',
        time: incidentData.time || '',
        location: incidentData.location || '',
        violation_id: incidentData.violation_id || '',
        description: incidentData.description || '',
        witnesses: incidentData.witnesses || '',
        reported_by: incidentData.reported_by || '',
        advisor: incidentData.advisor || '',
        action_taken: incidentData.action_taken || '',
        consequence: incidentData.consequence || '',
        notes: incidentData.notes || '',
        follow_up_needed: incidentData.follow_up_needed || 'No',
        follow_up_date: incidentData.follow_up_date || '',
        parent_contacted: incidentData.parent_contacted || 'No',
        contact_date: incidentData.contact_date || '',
        points_deducted: incidentData.points_deducted || 0,
        days_iss: incidentData.days_iss || 0,
        days_oss: incidentData.days_oss || 0,
        detention_hours: incidentData.detention_hours || 0,
      });

      // Load evidence if exists
      if (incidentData.evidence) {
        try {
          const evidenceRes = await api.get(`/incidents/${id}/evidence`);
          setEvidenceFiles(evidenceRes.data || []);
        } catch (e) {
          console.error('Failed to load evidence:', e);
        }
      }
    } catch (error) {
      console.error('Failed to load incident:', error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.put(`/incidents/${id}`, {
        date: formData.date,
        time: formData.time || null,
        location: formData.location || null,
        violation_id: Number(formData.violation_id),
        description: formData.description || null,
        witnesses: formData.witnesses || null,
        reported_by: formData.reported_by || null,
        advisor: formData.advisor || null,
        action_taken: formData.action_taken || null,
        consequence: formData.consequence || null,
        notes: formData.notes || null,
        follow_up_needed: formData.follow_up_needed,
        follow_up_date: formData.follow_up_date || null,
        parent_contacted: formData.parent_contacted,
        contact_date: formData.contact_date || null,
        points_deducted: formData.points_deducted,
        days_iss: formData.days_iss,
        days_oss: formData.days_oss,
        detention_hours: formData.detention_hours,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      loadData();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      const resolvedDate = newStatus === 'Resolved' ? new Date().toISOString().split('T')[0] : null;
      await api.put(`/incidents/${id}`, {
        status: newStatus,
        resolved_date: resolvedDate,
      });
      loadData();
    } catch (error) {
      console.error('Failed to update status:', error);
      alert('Failed to update status');
    }
  };

  const handleEscalate = async () => {
    if (!confirm('Are you sure you want to escalate this incident to the principal?')) return;
    try {
      await api.put(`/incidents/${id}/escalate`, {
        escalated: true,
      });
      loadData();
      alert('Incident escalated to principal. They will be notified.');
    } catch (error) {
      console.error('Failed to escalate:', error);
      alert('Failed to escalate incident');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingEvidence(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formDataUpload = new FormData();
        formDataUpload.append('file', file);

        await api.post(`/incidents/${id}/evidence`, formDataUpload);
      }
      loadData();
      alert('Evidence uploaded successfully');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to upload evidence');
    } finally {
      setUploadingEvidence(false);
    }
  };

  const handleDeleteEvidence = async (evidenceId: number) => {
    if (!confirm('Delete this evidence?')) return;
    try {
      await api.delete(`/incidents/${id}/evidence/${evidenceId}`);
      loadData();
    } catch (error) {
      console.error('Failed to delete evidence:', error);
      alert('Failed to delete evidence');
    }
  };

  const handleSendToParent = () => {
    if (!incident) return;
    const studentName = `${incident.first_name} ${incident.last_name}`;
    const message = `Dear Parent/Guardian,

This is to inform you that an incident involving your child (${studentName}) was recorded at SCCS.

Incident Details:
- Date: ${incident.date}
- Type: ${incident.violation_type}
- Category: ${incident.category}
- Location: ${incident.location || 'N/A'}
- Description: ${incident.description || 'N/A'}
- Action Taken: ${incident.action_taken || 'Under Review'}

Please contact the school if you have any questions.

SCCS Administration`;

    const encodedMessage = encodeURIComponent(message);
    // Try WhatsApp first, fallback to email
    const phone = ''; // Would need parent phone from student record
    const email = ''; // Would need parent email from student record

    // Create email link
    const mailtoLink = `mailto:?subject=Discipline Incident Notification - ${studentName}&body=${encodedMessage}`;
    window.open(mailtoLink, '_blank');
  };

  const handleExportPDF = () => {
    if (!incident) return;
    const doc = new jsPDF();

    // Header
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('SCCS Disciplinary Incident Report', 105, 20, { align: 'center' });

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Incident ID: ${incident.incident_id}`, 105, 30, { align: 'center' });
    doc.text(`Date: ${incident.date}${incident.time ? ' ' + incident.time : ''}`, 105, 36, { align: 'center' });

    // Student Info
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Student Information', 14, 50);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    autoTable(doc, {
      startY: 54,
      head: [['Field', 'Value']],
      body: [
        ['Student Name', `${incident.first_name} ${incident.last_name}`],
        ['Student ID', incident.student_id_raw || ''],
        ['Grade', incident.grade || ''],
        ['Status', incident.status],
      ],
      theme: 'striped',
    });

    // Incident Details
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Incident Details', 14, (doc as any).lastAutoTable.finalY + 16);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [['Field', 'Value']],
      body: [
        ['Violation Type', incident.violation_type || ''],
        ['Category', incident.category || ''],
        ['Location', incident.location || ''],
        ['Description', incident.description || ''],
        ['Witnesses', incident.witnesses || ''],
        ['Reported By', incident.reported_by || ''],
        ['Advisor', incident.advisor || ''],
      ],
      theme: 'striped',
    });

    // Consequences
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Consequence & Follow-up', 14, (doc as any).lastAutoTable.finalY + 16);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [['Field', 'Value']],
      body: [
        ['Action Taken', incident.action_taken || ''],
        ['Consequence', incident.consequence || ''],
        ['Points Deducted', String(incident.points_deducted || 0)],
        ['ISS Days', String(incident.days_iss || 0)],
        ['OSS Days', String(incident.days_oss || 0)],
        ['Detention Hours', String(incident.detention_hours || 0)],
        ['Follow-up Needed', incident.follow_up_needed || ''],
        ['Follow-up Date', incident.follow_up_date || ''],
      ],
      theme: 'striped',
    });

    // Notes
    if (incident.notes) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Notes', 14, (doc as any).lastAutoTable.finalY + 16);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      const noteLines = doc.splitTextToSize(incident.notes, 180);
      doc.text(noteLines, 14, (doc as any).lastAutoTable.finalY + 22);
    }

    // Footer
    doc.setFontSize(10);
    doc.text(`Generated on ${new Date().toLocaleString()}`, 105, 285, { align: 'center' });

    doc.save(`incident_${incident.incident_id}.pdf`);
  };

  const handleExportExcel = () => {
    if (!incident) return;
    const data = [{
      'Incident ID': incident.incident_id,
      'Date': incident.date,
      'Time': incident.time || '',
      'Student Name': `${incident.first_name} ${incident.last_name}`,
      'Student ID': incident.student_id_raw || '',
      'Grade': incident.grade || '',
      'Violation Type': incident.violation_type || '',
      'Category': incident.category || '',
      'Location': incident.location || '',
      'Description': incident.description || '',
      'Witnesses': incident.witnesses || '',
      'Reported By': incident.reported_by || '',
      'Advisor': incident.advisor || '',
      'Action Taken': incident.action_taken || '',
      'Consequence': incident.consequence || '',
      'Points Deducted': incident.points_deducted || 0,
      'ISS Days': incident.days_iss || 0,
      'OSS Days': incident.days_oss || 0,
      'Detention Hours': incident.detention_hours || 0,
      'Follow-up Needed': incident.follow_up_needed || '',
      'Follow-up Date': incident.follow_up_date || '',
      'Parent Contacted': incident.parent_contacted || '',
      'Contact Date': incident.contact_date || '',
      'Status': incident.status,
      'Notes': incident.notes || '',
    }];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Incident Details');
    XLSX.writeFile(wb, `incident_${incident.incident_id}.xlsx`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Open': return 'badge-danger';
      case 'Pending': return 'badge-warning';
      case 'Resolved': return 'badge-success';
      default: return 'badge-info';
    }
  };

  const filteredViolations = formData.violation_id
    ? violations.filter(v => v.id === Number(formData.violation_id))
    : [];

  const getViolationCategories = () => {
    const cats: Record<string, Violation[]> = {};
    violations.forEach(v => {
      if (!cats[v.category]) cats[v.category] = [];
      cats[v.category].push(v);
    });
    return cats;
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[50vh]">
        <Loader className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh]">
        <AlertTriangle className="w-12 h-12 text-gray-400 mb-4" />
        <p className="text-gray-500 mb-4">Incident not found</p>
        <Link to="/incidents" className="btn btn-primary">Back to Incidents</Link>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto pb-24 md:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/incidents')}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Incident {incident.incident_id}
            </h1>
            <p className="text-sm text-gray-500">
              {incident.date}{incident.time ? ` at ${incident.time}` : ''} — {incident.first_name} {incident.last_name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`badge ${getStatusColor(incident.status)}`}>
            {incident.status}
          </span>
          {incident.escalated_to_principal && (
            <span className="badge bg-red-100 text-red-700 flex items-center gap-1">
              <Shield className="w-3 h-3" /> Escalated
            </span>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button onClick={handleSave} disabled={saving} className="btn btn-primary">
          {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </button>
        <button onClick={() => setShowStatusLog(!showStatusLog)} className="btn btn-secondary">
          <Clock className="w-4 h-4" />
          Status Log
        </button>
        <button onClick={handleExportPDF} className="btn btn-secondary">
          <FileText className="w-4 h-4" />
          Export PDF
        </button>
        <button onClick={handleExportExcel} className="btn btn-secondary">
          <Download className="w-4 h-4" />
          Export Excel
        </button>
        <button onClick={handleSendToParent} className="btn bg-green-600 text-white hover:bg-green-700">
          <Mail className="w-4 h-4" />
          Send to Parent
        </button>
        {!incident.escalated_to_principal && (
          <button onClick={handleEscalate} className="btn bg-red-600 text-white hover:bg-red-700">
            <ChevronUp className="w-4 h-4" />
            Escalate to Principal
          </button>
        )}
      </div>

      {saved && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50 animate-fade-in">
          <Check className="w-5 h-5" />
          Changes saved successfully!
        </div>
      )}

      {/* Status Change Log */}
      {showStatusLog && (
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
          <h3 className="font-semibold flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5" />
            Status Change History
          </h3>
          {statusLogs.length === 0 ? (
            <p className="text-gray-500 text-sm">No status changes recorded.</p>
          ) : (
            <div className="space-y-3">
              {statusLogs.map(log => (
                <div key={log.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    log.new_status === 'Resolved' ? 'bg-green-100 text-green-600' :
                    log.new_status === 'Pending' ? 'bg-yellow-100 text-yellow-600' :
                    'bg-red-100 text-red-600'
                  }`}>
                    <CheckCircle className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">
                        {log.previous_status} → {log.new_status}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(log.changed_at).toLocaleString()}
                      </p>
                    </div>
                    <p className="text-sm text-gray-600">
                      Changed by: {log.changed_by_name || `User #${log.changed_by}`}
                    </p>
                    {log.notes && <p className="text-sm text-gray-500 mt-1">{log.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Form */}
      <div className="bg-white rounded-xl shadow-sm p-6 space-y-6">
        {/* Date, Time, Location Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="form-label">Date</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="form-label">Time</label>
            <input
              type="time"
              value={formData.time}
              onChange={(e) => setFormData({ ...formData, time: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="form-label">Location</label>
            <select
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="select"
            >
              <option value="">Select location...</option>
              {LOCATION_OPTIONS.map(loc => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Student Info (Read-only) */}
        <div className="p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold mb-2">Student Information</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-500">Name</p>
              <p className="font-medium">{incident.first_name} {incident.last_name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Student ID</p>
              <p className="font-medium">{incident.student_id_raw || incident.student_id}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Grade</p>
              <p className="font-medium">{incident.grade || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Violation Category</p>
              <p className="font-medium">{incident.category}</p>
            </div>
          </div>
        </div>

        {/* Violation Type */}
        <div>
          <label className="form-label">Violation Type</label>
          <select
            value={formData.violation_id}
            onChange={(e) => setFormData({ ...formData, violation_id: e.target.value })}
            className="select"
          >
            <option value="">Select violation...</option>
            {Object.entries(getViolationCategories()).map(([category, viols]) => (
              <optgroup key={category} label={category}>
                {viols.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.violation_type} ({v.points_deduction} pts)
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {filteredViolations[0] && (
            <div className="mt-2 p-3 bg-blue-50 rounded-lg text-sm">
              <p><strong>Default Consequence:</strong> {filteredViolations[0].default_consequence}</p>
              <p><strong>Max OSS:</strong> {filteredViolations[0].max_oss_days} days</p>
            </div>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="form-label">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="input min-h-[100px]"
            placeholder="Describe what happened..."
          />
        </div>

        {/* Witnesses and Reported By */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="form-label">Reported By</label>
            <select
              value={formData.reported_by}
              onChange={(e) => setFormData({ ...formData, reported_by: e.target.value })}
              className="select"
            >
              <option value="">Select staff...</option>
              {users.map(u => (
                <option key={u.id} value={`${u.first_name} ${u.last_name}`.trim()}>
                  {u.first_name} {u.last_name} ({u.role})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Witness(es)</label>
            <input
              type="text"
              value={formData.witnesses}
              onChange={(e) => setFormData({ ...formData, witnesses: e.target.value })}
              className="input"
              placeholder="Names of witnesses..."
            />
          </div>
        </div>

        {/* Advisor */}
        <div>
          <label className="form-label">Advisor / Assigned Staff</label>
          <select
            value={formData.advisor}
            onChange={(e) => setFormData({ ...formData, advisor: e.target.value })}
            className="select"
          >
            <option value="">Select advisor...</option>
            {users.map(u => (
              <option key={u.id} value={`${u.first_name} ${u.last_name}`.trim()}>
                {u.first_name} {u.last_name}
              </option>
            ))}
          </select>
        </div>

        {/* Consequences */}
        <div className="p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold mb-4">Consequence & Disciplinary Action</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="form-label">Action Taken</label>
              <select
                value={formData.action_taken}
                onChange={(e) => setFormData({ ...formData, action_taken: e.target.value })}
                className="select"
              >
                <option value="">Select...</option>
                {CONSEQUENCE_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Consequence</label>
              <input
                type="text"
                value={formData.consequence}
                onChange={(e) => setFormData({ ...formData, consequence: e.target.value })}
                className="input"
                placeholder="Specific consequence..."
              />
            </div>
            <div>
              <label className="form-label">Points Deducted</label>
              <input
                type="number"
                value={formData.points_deducted}
                onChange={(e) => setFormData({ ...formData, points_deducted: Number(e.target.value) })}
                className="input"
              />
            </div>
            <div>
              <label className="form-label">Days ISS</label>
              <input
                type="number"
                value={formData.days_iss}
                onChange={(e) => setFormData({ ...formData, days_iss: Number(e.target.value) })}
                className="input"
              />
            </div>
            <div>
              <label className="form-label">Days OSS</label>
              <input
                type="number"
                value={formData.days_oss}
                onChange={(e) => setFormData({ ...formData, days_oss: Number(e.target.value) })}
                className="input"
              />
            </div>
            <div>
              <label className="form-label">Detention Hours</label>
              <input
                type="number"
                step="0.5"
                value={formData.detention_hours}
                onChange={(e) => setFormData({ ...formData, detention_hours: Number(e.target.value) })}
                className="input"
              />
            </div>
          </div>
        </div>

        {/* Follow-up */}
        <div className="p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold mb-4">Follow-up</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.follow_up_needed === 'Yes'}
                  onChange={(e) => setFormData({ ...formData, follow_up_needed: e.target.checked ? 'Yes' : 'No' })}
                  className="w-4 h-4 rounded"
                />
                <span>Follow-up Required</span>
              </label>
              {formData.follow_up_needed === 'Yes' && (
                <input
                  type="date"
                  value={formData.follow_up_date}
                  onChange={(e) => setFormData({ ...formData, follow_up_date: e.target.value })}
                  className="input flex-1"
                />
              )}
            </div>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="form-label">Notes</label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            className="input min-h-[80px]"
            placeholder="Additional notes..."
          />
        </div>

        {/* Parent Contact */}
        <div className="p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold mb-4">Parent Contact</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.parent_contacted === 'Yes'}
                  onChange={(e) => setFormData({ ...formData, parent_contacted: e.target.checked ? 'Yes' : 'No' })}
                  className="w-4 h-4 rounded"
                />
                <span>Parent Notified</span>
              </label>
              {formData.parent_contacted === 'Yes' && (
                <input
                  type="date"
                  value={formData.contact_date}
                  onChange={(e) => setFormData({ ...formData, contact_date: e.target.value })}
                  className="input flex-1"
                />
              )}
            </div>
          </div>
        </div>

        {/* Evidence Upload */}
        <div>
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Evidence Attachments
          </h3>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif"
              multiple
            />
            <div className="text-center">
              {uploadingEvidence ? (
                <Loader className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
              ) : (
                <>
                  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-600 mb-2">Upload photos, documents, or other evidence</p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="btn btn-primary"
                  >
                    Choose Files
                  </button>
                </>
              )}
            </div>
          </div>
          {evidenceFiles.length > 0 && (
            <div className="mt-4 space-y-2">
              {evidenceFiles.map(file => (
                <div key={file.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="font-medium text-sm">{file.file_name}</p>
                      <p className="text-xs text-gray-500">
                        Uploaded by {file.uploaded_by_name} on {new Date(file.uploaded_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={file.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 hover:bg-gray-200 rounded"
                    >
                      <Eye className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => handleDeleteEvidence(file.id)}
                      className="p-2 hover:bg-red-100 text-red-600 rounded"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Status Update */}
        <div className="border-t pt-6">
          <h3 className="font-semibold mb-4">Update Status</h3>
          <div className="flex flex-wrap gap-3">
            {incident.status !== 'Open' && (
              <button
                onClick={() => handleStatusChange('Open')}
                className="btn bg-red-100 text-red-700 hover:bg-red-200"
              >
                <AlertTriangle className="w-4 h-4" />
                Open
              </button>
            )}
            {incident.status !== 'Pending' && (
              <button
                onClick={() => handleStatusChange('Pending')}
                className="btn bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
              >
                <Clock className="w-4 h-4" />
                Pending
              </button>
            )}
            {incident.status !== 'Resolved' && (
              <button
                onClick={() => handleStatusChange('Resolved')}
                className="btn btn-success"
              >
                <CheckCircle className="w-4 h-4" />
                Resolved
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}