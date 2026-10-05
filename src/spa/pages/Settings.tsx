import { useState, useEffect } from 'react';
import { Save, Settings as SettingsIcon, Bell, Shield } from 'lucide-react';
import api from '../lib/api';
import { useI18n } from '../i18n';

interface Alert {
  id: number;
  alert_type: string;
  threshold: number;
  action: string;
  enabled: string;
}

export default function Settings() {
  const [settings, setSettings] = useState({
    school_name: '',
    academic_year: '',
    max_points: '',
    passing_threshold: '',
  });
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const { t } = useI18n();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [settingsRes, alertsRes] = await Promise.all([
        api.get('/settings'),
        api.get('/alerts'),
      ]);
      setSettings(settingsRes.data);
      setAlerts(alertsRes.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/settings', settings);
      setMessage(t('Settings saved!'));
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleAlertChange = async (id: number, field: string, value: any) => {
    const alert = alerts.find(a => a.id === id);
    if (!alert) return;
    try {
      await api.put(`/alerts/${id}`, {
        ...alert,
        [field]: value,
      });
      loadSettings();
    } catch (error) {
      console.error(error);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-400">{t('Loading...')}</div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('Settings')}</h1>
          <p className="text-gray-500">{t('Configure system preferences and alerts')}</p>
        </div>
      </div>

      {/* General Settings */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <SettingsIcon className="w-5 h-5 text-gray-500" />
          <h2 className="text-lg font-semibold">{t('General Settings')}</h2>
        </div>

        <form onSubmit={handleSaveSettings} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">{t('School Name')}</label>
              <input
                type="text"
                value={settings.school_name}
                onChange={(e) => setSettings({ ...settings, school_name: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="form-label">{t('Academic Year')}</label>
              <input
                type="text"
                value={settings.academic_year}
                onChange={(e) => setSettings({ ...settings, academic_year: e.target.value })}
                className="input"
                placeholder="2025-2026"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">{t('Max Points')}</label>
              <input
                type="number"
                value={settings.max_points}
                onChange={(e) => setSettings({ ...settings, max_points: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="form-label">{t('Passing Threshold')}</label>
              <input
                type="number"
                value={settings.passing_threshold}
                onChange={(e) => setSettings({ ...settings, passing_threshold: e.target.value })}
                className="input"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button type="submit" disabled={saving} className="btn btn-primary">
              <Save className="w-4 h-4" />
              {saving ? t('Saving...') : t('Save Settings')}
            </button>
            {message && <span className="text-green-600">{message}</span>}
          </div>
        </form>
      </div>

      {/* Alert Thresholds */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-5 h-5 text-gray-500" />
          <h2 className="text-lg font-semibold">{t('Alert Thresholds')}</h2>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>{t('Alert Type')}</th>
              <th>{t('Threshold')}</th>
              <th>{t('Action')}</th>
              <th>{t('Enabled')}</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert) => (
              <tr key={alert.id}>
                <td className="font-medium">{alert.alert_type}</td>
                <td>
                  <input
                    type="number"
                    value={alert.threshold}
                    onChange={(e) => handleAlertChange(alert.id, 'threshold', parseInt(e.target.value))}
                    className="input w-20"
                    min="1"
                  />
                </td>
                <td className="text-gray-600">{alert.action}</td>
                <td>
                  <select
                    value={alert.enabled}
                    onChange={(e) => handleAlertChange(alert.id, 'enabled', e.target.value)}
                    className="select w-24"
                  >
                    <option value="Yes">{t('Yes')}</option>
                    <option value="No">{t('No')}</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* About */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-gray-500" />
          <h2 className="text-lg font-semibold">{t('About')}</h2>
        </div>
        <div className="text-gray-600">
          <p><strong>{t('Discipline Tracker Pro')}</strong></p>
          <p className="text-sm">{t('Version')} 1.0.0</p>
          <p className="text-sm mt-2">{t('A comprehensive school discipline management system built with React, Node.js, and SQLite.')}</p>
          <p className="text-sm mt-2">{t('Features include incident tracking, student management, MTSS interventions, rewards system, and real-time analytics.')}</p>
        </div>
      </div>
    </div>
  );
}