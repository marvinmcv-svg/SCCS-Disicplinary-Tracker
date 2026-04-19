import { useState, useEffect } from 'react';
import api from '../lib/api';

interface Violation {
  id: number;
  category: string;
  violation_type: string;
  description: string;
  points_deduction: number;
  default_consequence: string;
  min_oss_days: number;
  max_oss_days: number;
}

export default function Violations() {
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('');

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

  const categories = [...new Set(violations.map(v => v.category))];
  const filteredViolations = selectedCategory 
    ? violations.filter(v => v.category === selectedCategory)
    : violations;

  const groupedViolations = filteredViolations.reduce((acc, v) => {
    if (!acc[v.category]) acc[v.category] = [];
    acc[v.category].push(v);
    return acc;
  }, {} as Record<string, Violation[]>);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Violation Reference</h1>
          <p className="text-gray-500">View all violation types and consequences</p>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-4 mb-4">
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
          <div className="space-y-6">
            {Object.entries(groupedViolations).map(([category, items]) => (
              <div key={category}>
                <h3 className="text-lg font-semibold text-gray-800 mb-3">{category}</h3>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Violation Type</th>
                      <th>Description</th>
                      <th>Points</th>
                      <th>Default Consequence</th>
                      <th>OSS Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((violation) => (
                      <tr key={violation.id}>
                        <td className="font-medium">{violation.violation_type}</td>
                        <td className="text-gray-500">{violation.description}</td>
                        <td>
                          <span className={`font-bold ${violation.points_deduction < -5 ? 'text-red-600' : 'text-red-500'}`}>
                            {violation.points_deduction}
                          </span>
                        </td>
                        <td>{violation.default_consequence}</td>
                        <td>{violation.min_oss_days}-{violation.max_oss_days}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}