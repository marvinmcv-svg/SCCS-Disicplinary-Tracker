import { useState, useEffect } from 'react';
import {
  FileText, Download, Calendar, Users, AlertTriangle, BarChart3,
  PieChart, TrendingUp, Loader, Check, X, ChevronRight, Printer
} from 'lucide-react';
import api from '../lib/api';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useNavigate } from 'react-router-dom';

interface Incident {
  id: number;
  incident_id: string;
  date: string;
  student_id: number;
  violation_id: number;
  category: string;
  violation_type: string;
  status: string;
  last_name?: string;
  first_name?: string;
  grade?: string;
  [key: string]: any;
}

interface Student {
  id: number;
  student_id: string;
  last_name: string;
  first_name: string;
  grade: string;
  [key: string]: any;
}

interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  type: 'incidents_by_grade' | 'top_students' | 'incidents_by_category' | 'monthly_summary';
}

export default function Reports() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [reportData, setReportData] = useState<any>(null);
  const [generating, setGenerating] = useState(false);

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [students, setStudents] = useState<Student[]>([]);

  const reportTemplates: ReportTemplate[] = [
    {
      id: 'incidents_by_grade_month',
      name: 'Incidents by Grade This Month',
      description: 'Summary of all incidents grouped by grade level for the current month',
      icon: <BarChart3 className="w-6 h-6" />,
      type: 'incidents_by_grade'
    },
    {
      id: 'top_students',
      name: 'Top 10 Students by Incident Count',
      description: 'List of students with the highest number of recorded incidents',
      icon: <Users className="w-6 h-6" />,
      type: 'top_students'
    },
    {
      id: 'incidents_by_category_semester',
      name: 'Incidents by Category This Semester',
      description: 'Breakdown of incidents by violation category for the semester',
      icon: <PieChart className="w-6 h-6" />,
      type: 'incidents_by_category'
    },
    {
      id: 'monthly_summary',
      name: 'Monthly Incident Summary',
      description: 'Comprehensive overview of all incidents for the current month',
      icon: <TrendingUp className="w-6 h-6" />,
      type: 'monthly_summary'
    }
  ];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [incidentsRes, studentsRes] = await Promise.all([
        api.get('/incidents'),
        api.get('/students'),
      ]);
      setIncidents(incidentsRes.data);
      setStudents(studentsRes.data);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCurrentMonthStart = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  };

  const getCurrentMonthEnd = () => {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
  };

  const getSemesterStart = () => {
    const now = new Date();
    const month = now.getMonth();
    // Semester typically Aug-Dec (8-12) or Jan-May (0-4)
    if (month >= 7) {
      return `${now.getFullYear()}-08-01`;
    }
    return `${now.getFullYear()}-01-01`;
  };

  const generateReport = async (templateId: string) => {
    setGenerating(true);
    setSelectedReport(templateId);

    try {
      const now = new Date();
      const monthStart = getCurrentMonthStart();
      const monthEnd = getCurrentMonthEnd();
      const semesterStart = getSemesterStart();

      let data: any = null;

      switch (templateId) {
        case 'incidents_by_grade_month': {
          const monthIncidents = incidents.filter(i => i.date >= monthStart && i.date <= monthEnd);
          const byGrade: Record<string, { total: number; open: number; resolved: number; pending: number }> = {};

          students.forEach(s => {
            const gradeKey = s.grade || 'Unknown';
            if (!byGrade[gradeKey]) {
              byGrade[gradeKey] = { total: 0, open: 0, resolved: 0, pending: 0 };
            }
          });

          monthIncidents.forEach(inc => {
            const student = students.find(s => s.id === inc.student_id);
            const gradeKey = student?.grade || 'Unknown';
            if (!byGrade[gradeKey]) {
              byGrade[gradeKey] = { total: 0, open: 0, resolved: 0, pending: 0 };
            }
            byGrade[gradeKey].total++;
            if (inc.status === 'Open') byGrade[gradeKey].open++;
            else if (inc.status === 'Resolved') byGrade[gradeKey].resolved++;
            else byGrade[gradeKey].pending++;
          });

          const gradeOrder = ['6', '7', '8', '9', '10', '11', '12'].filter(g => byGrade[g]);
          data = {
            title: 'Incidents by Grade - This Month',
            dateRange: `${monthStart} to ${monthEnd}`,
            generatedAt: now.toLocaleString(),
            headers: ['Grade', 'Total', 'Open', 'Pending', 'Resolved'],
            rows: gradeOrder.map(grade => [
              `Grade ${grade}`,
              byGrade[grade].total,
              byGrade[grade].open,
              byGrade[grade].pending,
              byGrade[grade].resolved
            ]),
            summary: {
              totalIncidents: gradeOrder.reduce((sum, g) => sum + byGrade[g].total, 0),
              totalStudents: students.filter(s => gradeOrder.includes(s.grade)).length
            }
          };
          break;
        }

        case 'top_students': {
          const incidentCounts: Record<number, number> = {};
          incidents.forEach(inc => {
            incidentCounts[inc.student_id] = (incidentCounts[inc.student_id] || 0) + 1;
          });

          const topStudents = Object.entries(incidentCounts)
            .map(([studentId, count]) => {
              const student = students.find(s => s.id === parseInt(studentId));
              return {
                studentId,
                name: student ? `${student.last_name}, ${student.first_name}` : `Student #${studentId}`,
                grade: student?.grade || 'N/A',
                incidentCount: count
              };
            })
            .sort((a, b) => b.incidentCount - a.incidentCount)
            .slice(0, 10);

          data = {
            title: 'Top 10 Students by Incident Count',
            generatedAt: now.toLocaleString(),
            headers: ['Rank', 'Student Name', 'Grade', 'Incident Count'],
            rows: topStudents.map((s, i) => [i + 1, s.name, `Grade ${s.grade}`, s.incidentCount]),
            summary: {
              totalIncidents: incidents.length,
              uniqueStudents: Object.keys(incidentCounts).length
            }
          };
          break;
        }

        case 'incidents_by_category_semester': {
          const semesterIncidents = incidents.filter(i => i.date >= semesterStart);
          const byCategory: Record<string, { total: number; open: number; resolved: number; pending: number }> = {};

          semesterIncidents.forEach(inc => {
            const cat = inc.category || 'Unknown';
            if (!byCategory[cat]) {
              byCategory[cat] = { total: 0, open: 0, resolved: 0, pending: 0 };
            }
            byCategory[cat].total++;
            if (inc.status === 'Open') byCategory[cat].open++;
            else if (inc.status === 'Resolved') byCategory[cat].resolved++;
            else byCategory[cat].pending++;
          });

          const sortedCategories = Object.entries(byCategory)
            .sort((a, b) => b[1].total - a[1].total);

          data = {
            title: 'Incidents by Category - This Semester',
            dateRange: `${semesterStart} to ${monthEnd}`,
            generatedAt: now.toLocaleString(),
            headers: ['Category', 'Total', 'Open', 'Pending', 'Resolved'],
            rows: sortedCategories.map(([cat, stats]) => [
              cat,
              stats.total,
              stats.open,
              stats.pending,
              stats.resolved
            ]),
            summary: {
              totalIncidents: semesterIncidents.length,
              totalCategories: sortedCategories.length
            }
          };
          break;
        }

        case 'monthly_summary': {
          const monthIncidents = incidents.filter(i => i.date >= monthStart && i.date <= monthEnd);
          const byStatus = { open: 0, pending: 0, resolved: 0 };
          const byCategory: Record<string, number> = {};
          const byLocation: Record<string, number> = {};
          const byGrade: Record<string, number> = {};

          monthIncidents.forEach(inc => {
            if (inc.status === 'Open') byStatus.open++;
            else if (inc.status === 'Resolved') byStatus.resolved++;
            else byStatus.pending++;

            byCategory[inc.category] = (byCategory[inc.category] || 0) + 1;
            byLocation[inc.location || 'Not Specified'] = (byLocation[inc.location || 'Not Specified'] || 0) + 1;

            const student = students.find(s => s.id === inc.student_id);
            if (student) {
              byGrade[student.grade] = (byGrade[student.grade] || 0) + 1;
            }
          });

          const sortedCategories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
          const sortedGrades = Object.entries(byGrade).sort((a, b) => b[1] - a[1]);

          data = {
            title: 'Monthly Incident Summary',
            dateRange: `${monthStart} to ${monthEnd}`,
            generatedAt: now.toLocaleString(),
            summary: {
              total: monthIncidents.length,
              open: byStatus.open,
              pending: byStatus.pending,
              resolved: byStatus.resolved
            },
            byCategory: sortedCategories,
            byLocation: Object.entries(byLocation).sort((a, b) => b[1] - a[1]).slice(0, 5),
            byGrade: sortedGrades.slice(0, 7),
            recentIncidents: monthIncidents.slice(0, 10)
          };
          break;
        }
      }

      setReportData(data);
    } catch (error) {
      console.error('Failed to generate report:', error);
      alert('Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  const exportToPDF = () => {
    if (!reportData) return;
    const doc = new jsPDF();

    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(reportData.title, 105, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Date Range: ${reportData.dateRange || 'All Time'}`, 105, 28, { align: 'center' });
    doc.text(`Generated: ${reportData.generatedAt}`, 105, 34, { align: 'center' });

    let yPos = 45;

    // Summary section
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary', 14, yPos);
    yPos += 8;

    if (reportData.summary) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      Object.entries(reportData.summary).forEach(([key, value]) => {
        doc.text(`${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}: ${value}`, 14, yPos);
        yPos += 6;
      });
      yPos += 5;
    }

    // Table section
    if (reportData.headers && reportData.rows) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Detailed Data', 14, yPos);
      yPos += 5;

      autoTable(doc, {
        startY: yPos,
        head: [reportData.headers],
        body: reportData.rows,
        theme: 'striped',
        didDrawPage: (data) => {
          yPos = data.cursor.y;
        }
      });
    }

    // Monthly summary specific
    if (reportData.byCategory) {
      yPos = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('By Category', 14, yPos);
      yPos += 5;

      autoTable(doc, {
        startY: yPos,
        head: [['Category', 'Count']],
        body: reportData.byCategory,
        theme: 'striped'
      });
    }

    doc.save(`${reportData.title.replace(/\s+/g, '_')}.pdf`);
  };

  const exportToExcel = () => {
    if (!reportData) return;

    if (reportData.rows) {
      const ws = XLSX.utils.json_to_sheet(reportData.rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Report');
      XLSX.writeFile(wb, `${reportData.title.replace(/\s+/g, '_')}.xlsx`);
    } else {
      // For monthly summary, create multiple sheets
      const wb = XLSX.utils.book_new();

      if (reportData.byCategory) {
        const catWs = XLSX.utils.json_to_sheet(reportData.byCategory);
        XLSX.utils.book_append_sheet(wb, catWs, 'By Category');
      }

      if (reportData.byGrade) {
        const gradeWs = XLSX.utils.json_to_sheet(reportData.byGrade);
        XLSX.utils.book_append_sheet(wb, gradeWs, 'By Grade');
      }

      XLSX.writeFile(wb, `${reportData.title.replace(/\s+/g, '_')}.xlsx`);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[50vh]">
        <Loader className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in pb-20 md:pb-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-500">Generate and export disciplinary reports</p>
        </div>
      </div>

      {/* Report Templates */}
      {!selectedReport && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reportTemplates.map(template => (
            <button
              key={template.id}
              onClick={() => generateReport(template.id)}
              disabled={generating}
              className="bg-white rounded-xl shadow-sm p-6 text-left hover:shadow-md transition-shadow disabled:opacity-50"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
                  {template.icon}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{template.name}</h3>
                  <p className="text-sm text-gray-500 mt-1">{template.description}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Generated Report */}
      {selectedReport && reportData && (
        <div className="space-y-4">
          {/* Report Header */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{reportData.title}</h2>
                <p className="text-sm text-gray-500">
                  {reportData.dateRange ? `${reportData.dateRange} | ` : ''}
                  Generated: {reportData.generatedAt}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handlePrint} className="btn btn-secondary">
                  <Printer className="w-4 h-4" />
                  Print
                </button>
                <button onClick={exportToPDF} className="btn btn-secondary">
                  <FileText className="w-4 h-4" />
                  PDF
                </button>
                <button onClick={exportToExcel} className="btn btn-secondary">
                  <Download className="w-4 h-4" />
                  Excel
                </button>
                <button
                  onClick={() => { setSelectedReport(null); setReportData(null); }}
                  className="btn btn-danger"
                >
                  <X className="w-4 h-4" />
                  Close
                </button>
              </div>
            </div>

            {/* Summary Cards */}
            {reportData.summary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {Object.entries(reportData.summary).map(([key, value]) => (
                  <div key={key} className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs text-gray-500 uppercase">
                      {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                    </p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{value as string}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Data Table */}
            {reportData.headers && reportData.rows && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      {reportData.headers.map((header: string, i: number) => (
                        <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {reportData.rows.map((row: any[], i: number) => (
                      <tr key={i} className="hover:bg-gray-50">
                        {row.map((cell: any, j: number) => (
                          <td key={j} className="px-4 py-3 text-sm text-gray-900">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Monthly Summary Details */}
            {reportData.byCategory && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">Incidents by Category</h3>
                  <div className="space-y-2">
                    {reportData.byCategory.map(([cat, count]: [string, number]) => (
                      <div key={cat} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="text-sm font-medium">{cat}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-600"
                              style={{ width: `${(count / reportData.byCategory[0][1]) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm font-semibold w-8 text-right">{count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">Incidents by Grade</h3>
                  <div className="space-y-2">
                    {reportData.byGrade.map(([grade, count]: [string, number]) => (
                      <div key={grade} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="text-sm font-medium">Grade {grade}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-600"
                              style={{ width: `${(count / reportData.byGrade[0][1]) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm font-semibold w-8 text-right">{count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Recent Incidents Table */}
            {reportData.recentIncidents && (
              <div className="mt-6">
                <h3 className="font-semibold text-gray-900 mb-3">Recent Incidents</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">ID</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Student</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Violation</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {reportData.recentIncidents.map((inc: Incident) => (
                        <tr key={inc.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/incidents/${inc.id}`)}>
                          <td className="px-4 py-3 text-sm font-mono">{inc.incident_id}</td>
                          <td className="px-4 py-3 text-sm">{inc.date}</td>
                          <td className="px-4 py-3 text-sm">{inc.last_name}, {inc.first_name}</td>
                          <td className="px-4 py-3 text-sm">{inc.violation_type}</td>
                          <td className="px-4 py-3">
                            <span className={`badge ${
                              inc.status === 'Open' ? 'badge-danger' :
                              inc.status === 'Pending' ? 'badge-warning' : 'badge-success'
                            }`}>
                              {inc.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Generating Indicator */}
      {generating && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 flex flex-col items-center gap-4">
            <Loader className="w-8 h-8 animate-spin text-blue-600" />
            <p className="text-gray-600">Generating report...</p>
          </div>
        </div>
      )}
    </div>
  );
}