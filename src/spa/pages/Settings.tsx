import { useState, useEffect } from 'react';
import { Save, Settings as SettingsIcon, Bell, Shield, Smartphone } from 'lucide-react';
import api from '../lib/api';
import { useI18n } from '../i18n';
import { AppearanceControl, InstallAppButton } from '../components/AppPreferences';
import { FingerprintSettings } from '../components/FingerprintSettings';

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
          <h1 className="page-title">{t('Settings')}</h1>
          <p className="page-subtitle">{t('Configure system preferences and alerts')}</p>
        </div>
      </div>

      {/* This device */}
      <div className="card">
        <div className="flex items-center gap-2 mb-1">
          <Smartphone className="w-5 h-5 text-gray-500" />
          <h2 className="text-lg font-semibold">{t('App')}</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">{t('Use SCCS like a native app: its own icon, full screen, and quicker to open.')}</p>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-gray-700">{t('Appearance')}</span>
            <AppearanceControl />
          </div>
          <InstallAppButton variant="button" />
        </div>
        <div className="border-t border-gray-200 mt-5 pt-5">
          <FingerprintSettings />
        </div>
      </div>

      {/* General Settings */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <SettingsIcon className="w-5 h-5 text-gray-500" />
          <h2 className="text-lg font-semibold">{t('General Settings')}</h2>
        </div>

        <form onSubmit={handleSaveSettings} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

        {/* One row per alert; stacks on phones so nothing is cut off. */}
        <ul className="list-inset">
          {alerts.map((alert) => (
            <li key={alert.id} className="py-4 first:pt-0 last:pb-0 flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900">{alert.alert_type}</p>
                <p className="text-sm text-gray-500">{alert.action}</p>
              </div>
              <div className="flex items-end gap-3 shrink-0">
                <label className="block">
                  <span className="form-label">{t('Threshold')}</span>
                  <input
                    type="number"
                    value={alert.threshold}
                    onChange={(e) => handleAlertChange(alert.id, 'threshold', parseInt(e.target.value))}
                    className="input w-24"
                    min="1"
                  />
                </label>
                <label className="block">
                  <span className="form-label">{t('Enabled')}</span>
                  <select
                    value={alert.enabled}
                    onChange={(e) => handleAlertChange(alert.id, 'enabled', e.target.value)}
                    className="select w-28"
                  >
                    <option value="Yes">{t('Yes')}</option>
                    <option value="No">{t('No')}</option>
                  </select>
                </label>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* About */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-gray-500" />
          <h2 className="text-lg font-semibold">{t('About')}</h2>
        </div>
        <div className="text-gray-600">
          <p><strong>SCCS Student OS</strong></p>
          <p className="text-sm">{t('Version')} 2.3.0</p>
          <p className="text-sm mt-2">{t('Discipline, learning support, recognition and early warning for SCCS, in English and Spanish.')}</p>
          <p className="text-sm mt-2">{t('Features include incident tracking, student management, MTSS interventions, rewards system, and real-time analytics.')}</p>
        </div>
      </div>
    </div>
  );
}