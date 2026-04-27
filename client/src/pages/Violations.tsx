import { useState, useEffect, useMemo } from 'react';
import { Search, Edit2, X, Anchor, Phone, ShieldAlert, Gavel } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../App';

interface Violation {
  id: number;
  category: string;
  violation_type: string;
  description: string;
  points_deduction: number;
  default_consequence: string;
  min_oss_days: number;
  max_oss_days: number;
  severity: string;
  mandatory_parent_contact: boolean;
  mandatory_admin_review: boolean;
  progressive_consequences: Array<[string, string]> | string;
}

interface EditingViolation {
  id: number;
  category: string;
  violation_type: string;
  description: string;
  points_deduction: number;
  default_consequence: string;
  min_oss_days: number;
  max_oss_days: number;
  severity: string;
  mandatory_parent_contact: boolean;
  mandatory_admin_review: boolean;
  progressive_consequences: Array<[string, string]>;
}

export default function Violations() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingViolation, setEditingViolation] = useState<EditingViolation | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadViolations();
  }, []);

  const loadViolations = async () => {
    try {
      const res = await api.get('/violations');
      setViolations(res.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const categories = useMemo(() => [...new Set(violations.map(v => v.category))], [violations]);

  const filteredViolations = useMemo(() => {
    let result = violations;
    if (selectedCategory) {
      result = result.filter(v => v.category === selectedCategory);
    }
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter(v =>
        v.violation_type.toLowerCase().includes(keyword) ||
        v.description.toLowerCase().includes(keyword)
      );
    }
    return result;
  }, [violations, selectedCategory, searchKeyword]);

  const groupedViolations = useMemo(() => {
    return filteredViolations.reduce((acc, v) => {
      if (!acc[v.category]) acc[v.category] = [];
      acc[v.category].push(v);
      return acc;
    }, {} as Record<string, Violation[]>);
  }, [filteredViolations]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'Low': return 'bg-green-100 text-green-700 border-green-200';
      case 'Medium': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'High': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'Critical': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const parseProgressiveConsequences = (pc: Violation['progressive_consequences']): Array<[string, string]> => {
    if (!pc) return [];
    if (Array.isArray(pc)) return pc;
    try {
      return JSON.parse(pc as string);
    } catch {
      return [];
    }
  };

  const handleRowClick = (violation: Violation) => {
    // Prefill incident form with this violation
    const prefilledState = {
      violation_id: violation.id,
      violation_type: violation.violation_type,
      category: violation.category,
      default_consequence: violation.default_consequence,
    };
    navigate('/incidents/new', { state: prefilledState });
  };

  const openEditModal = (violation: Violation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingViolation({
      ...violation,
      progressive_consequences: parseProgressiveConsequences(violation.progressive_consequences),
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editingViolation) return;
    setSaving(true);
    try {
      await api.put(`/violations/${editingViolation.id}`, {
        category: editingViolation.category,
        violation_type: editingViolation.violation_type,
        description: editingViolation.description,
        points_deduction: editingViolation.points_deduction,
        default_consequence: editingViolation.default_consequence,
        min_oss_days: editingViolation.min_oss_days,
        max_oss_days: editingViolation.max_oss_days,
        severity: editingViolation.severity,
        mandatory_parent_contact: editingViolation.mandatory_parent_contact,
        mandatory_admin_review: editingViolation.mandatory_admin_review,
        progressive_consequences: editingViolation.progressive_consequences,
      });
      setShowEditModal(false);
      loadViolations();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Error saving violation');
    } finally {
      setSaving(false);
    }
  };

  const scrollToCategory = (category: string) => {
    setSelectedCategory(category);
    const element = document.getElementById(`category-${category.replace(/[^a-zA-Z0-9]/g, '-')}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Violation Reference</h1>
          <p className="text-gray-500">View all violation types and consequences</p>
        </div>
      </div>

      {/* Anchor Navigation */}
      <div className="card">
        <div className="flex items-center gap-2 flex-wrap">
          <Anchor className="w-4 h-4 text-gray-400" />
          <button
            onClick={() => { setSelectedCategory(''); setSearchKeyword(''); }}
            className={`px-3 py-1 text-sm rounded-full transition-colors ${!selectedCategory ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => scrollToCategory(cat)}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${selectedCategory === cat ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-4 mb-4 flex-wrap">
          {/* Keyword Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search violations..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="input pl-10"
            />
            {searchKeyword && (
              <button
                onClick={() => setSearchKeyword('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="select w-48"
          >
            <option value="">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <span className="text-sm text-gray-500">
            {filteredViolations.length} violations
          </span>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-400">Loading...</div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedViolations).map(([category, items]) => (
              <div key={category} id={`category-${category.replace(/[^a-zA-Z0-9]/g, '-')}`}>
                <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  {category}
                  <span className="text-sm font-normal text-gray-500">({items.length})</span>
                </h3>
                <div className="space-y-3">
                  {items.map((violation) => {
                    const progressive = parseProgressiveConsequences(violation.progressive_consequences);
                    return (
                      <div
                        key={violation.id}
                        onClick={() => handleRowClick(violation)}
                        className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 hover:border-blue-300 transition-all cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                              <span className="font-medium text-gray-900">{violation.violation_type}</span>
                              <span className={`px-2 py-0.5 text-xs rounded-full border ${getSeverityColor(violation.severity)}`}>
                                {violation.severity}
                              </span>
                              {violation.mandatory_parent_contact && (
                                <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 flex items-center gap-1" title="Mandatory Parent Contact">
                                  <Phone className="w-3 h-3" /> Parent
                                </span>
                              )}
                              {violation.mandatory_admin_review && (
                                <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700 flex items-center gap-1" title="Mandatory Admin Review">
                                  <ShieldAlert className="w-3 h-3" /> Admin
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-500 mb-3">{violation.description}</p>

                            {/* Progressive Consequences */}
                            {progressive.length > 0 && (
                              <div className="mb-3">
                                <p className="text-xs font-medium text-gray-500 mb-1">Progressive Consequences:</p>
                                <div className="flex flex-wrap gap-2">
                                  {progressive.map(([occurrence, consequence], idx) => (
                                    <span key={idx} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                                      {occurrence}: {consequence}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-gray-500">
                                <Gavel className="w-4 h-4 inline mr-1" />
                                {violation.default_consequence}
                              </span>
                              <span className="text-gray-500">
                                {violation.points_deduction} pts
                              </span>
                              <span className="text-gray-500">
                                OSS: {violation.min_oss_days}-{violation.max_oss_days} days
                              </span>
                            </div>
                          </div>

                          {/* Admin Edit Button */}
                          {user?.role === 'admin' && (
                            <button
                              onClick={(e) => openEditModal(violation, e)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Edit Violation"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal (Admin Only) */}
      {showEditModal && editingViolation && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Edit Violation</h2>
              <button onClick={() => setShowEditModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Category</label>
                  <input
                    type="text"
                    value={editingViolation.category}
                    onChange={(e) => setEditingViolation({ ...editingViolation, category: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="form-label">Violation Type</label>
                  <input
                    type="text"
                    value={editingViolation.violation_type}
                    onChange={(e) => setEditingViolation({ ...editingViolation, violation_type: e.target.value })}
                    className="input"
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Description</label>
                <textarea
                  value={editingViolation.description}
                  onChange={(e) => setEditingViolation({ ...editingViolation, description: e.target.value })}
                  className="input min-h-[60px]"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="form-label">Severity</label>
                  <select
                    value={editingViolation.severity}
                    onChange={(e) => setEditingViolation({ ...editingViolation, severity: e.target.value })}
                    className="select"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Points Deduction</label>
                  <input
                    type="number"
                    value={editingViolation.points_deduction}
                    onChange={(e) => setEditingViolation({ ...editingViolation, points_deduction: parseInt(e.target.value) })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="form-label">Default Consequence</label>
                  <input
                    type="text"
                    value={editingViolation.default_consequence}
                    onChange={(e) => setEditingViolation({ ...editingViolation, default_consequence: e.target.value })}
                    className="input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Min OSS Days</label>
                  <input
                    type="number"
                    value={editingViolation.min_oss_days}
                    onChange={(e) => setEditingViolation({ ...editingViolation, min_oss_days: parseInt(e.target.value) })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="form-label">Max OSS Days</label>
                  <input
                    type="number"
                    value={editingViolation.max_oss_days}
                    onChange={(e) => setEditingViolation({ ...editingViolation, max_oss_days: parseInt(e.target.value) })}
                    className="input"
                  />
                </div>
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editingViolation.mandatory_parent_contact}
                    onChange={(e) => setEditingViolation({ ...editingViolation, mandatory_parent_contact: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  <span className="text-sm">Mandatory Parent Contact</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editingViolation.mandatory_admin_review}
                    onChange={(e) => setEditingViolation({ ...editingViolation, mandatory_admin_review: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  <span className="text-sm">Mandatory Admin Review</span>
                </label>
              </div>

              <div>
                <label className="form-label">Progressive Consequences</label>
                <div className="space-y-2">
                  {editingViolation.progressive_consequences.map(([occurrence, consequence], idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        type="text"
                        value={occurrence}
                        onChange={(e) => {
                          const updated = [...editingViolation.progressive_consequences];
                          updated[idx] = [e.target.value, consequence];
                          setEditingViolation({ ...editingViolation, progressive_consequences: updated });
                        }}
                        className="input w-24"
                        placeholder="1st, 2nd..."
                      />
                      <input
                        type="text"
                        value={consequence}
                        onChange={(e) => {
                          const updated = [...editingViolation.progressive_consequences];
                          updated[idx] = [occurrence, e.target.value];
                          setEditingViolation({ ...editingViolation, progressive_consequences: updated });
                        }}
                        className="input flex-1"
                        placeholder="Consequence"
                      />
                      <button
                        onClick={() => {
                          const updated = editingViolation.progressive_consequences.filter((_, i) => i !== idx);
                          setEditingViolation({ ...editingViolation, progressive_consequences: updated });
                        }}
                        className="p-2 text-red-600 hover:bg-red-50 rounded"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      setEditingViolation({
                        ...editingViolation,
                        progressive_consequences: [...editingViolation.progressive_consequences, ['', '']],
                      });
                    }}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    + Add Consequence
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button onClick={() => setShowEditModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button onClick={handleSaveEdit} disabled={saving} className="btn btn-primary">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}