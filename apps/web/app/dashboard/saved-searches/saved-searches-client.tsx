'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, CardHeader, EmptyState } from '@/components/ui';
import { inr, shortDate } from '@/lib/format';

export function SavedSearchesClient({ initialSearches }: { initialSearches: any[] }) {
  const [searches, setSearches] = useState<any[]>(initialSearches);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    city: 'Pune',
    locality: '',
    minBhk: '',
    maxBhk: '',
    minRent: '',
    maxRent: '',
    furnishing: '',
    frequency: 'INSTANT',
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const payload = {
        name: formData.name || `${formData.minBhk || 'All'} BHK in ${formData.locality || formData.city}`,
        city: formData.city || undefined,
        locality: formData.locality || undefined,
        minBhk: formData.minBhk ? parseInt(formData.minBhk, 10) : undefined,
        maxBhk: formData.maxBhk ? parseInt(formData.maxBhk, 10) : undefined,
        minRent: formData.minRent ? parseInt(formData.minRent, 10) : undefined,
        maxRent: formData.maxRent ? parseInt(formData.maxRent, 10) : undefined,
        furnishing: formData.furnishing || undefined,
        frequency: formData.frequency,
        isAlertEnabled: true,
      };

      const res = await fetch('/api/customer/saved-searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const created = await res.json();
        setSearches((prev) => [created, ...prev]);
        setShowModal(false);
        setFormData({
          name: '',
          city: 'Pune',
          locality: '',
          minBhk: '',
          maxBhk: '',
          minRent: '',
          maxRent: '',
          furnishing: '',
          frequency: 'INSTANT',
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (id: number, currentEnabled: boolean) => {
    try {
      const res = await fetch(`/api/customer/saved-searches/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAlertEnabled: !currentEnabled }),
      });
      if (res.ok) {
        setSearches((prev) =>
          prev.map((s) => (s.id === id ? { ...s, isAlertEnabled: !currentEnabled } : s)),
        );
      }
    } catch {
      setSearches((prev) =>
        prev.map((s) => (s.id === id ? { ...s, isAlertEnabled: !currentEnabled } : s)),
      );
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this saved search?')) return;
    try {
      const res = await fetch(`/api/customer/saved-searches/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setSearches((prev) => prev.filter((s) => s.id !== id));
      }
    } catch {
      setSearches((prev) => prev.filter((s) => s.id !== id));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Saved Searches & Alerts</h1>
          <p className="text-sm text-muted">
            Get instant notifications when new properties matching your exact criteria get listed.
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowModal(true)}>
          + Create Saved Search
        </Button>
      </div>

      {searches.length === 0 ? (
        <EmptyState
          title="No saved searches yet"
          body="Create a saved search to get alerts via email/in-app whenever matching properties are published."
          action={
            <Button variant="primary" onClick={() => setShowModal(true)}>
              Create Your First Alert
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {searches.map((search) => (
            <Card key={search.id} className="p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <h3 className="text-base font-bold text-ink">{search.name}</h3>
                  <Badge tone={search.isAlertEnabled ? 'seal' : 'neutral'}>
                    {search.isAlertEnabled ? `${search.frequency} Alert` : 'Disabled'}
                  </Badge>
                </div>

                <div className="space-y-1.5 text-xs text-muted">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink">Location:</span>
                    <span>{search.locality ? `${search.locality}, ` : ''}{search.city || 'Any City'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink">Budget:</span>
                    <span>
                      {search.minRent || search.maxRent
                        ? `${search.minRent ? inr(search.minRent) : '₹0'} - ${search.maxRent ? inr(search.maxRent) : 'Any'}`
                        : 'Any budget'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink">Configuration:</span>
                    <span>{search.minBhk ? `${search.minBhk} BHK` : 'Any BHK'} • {search.furnishing || 'Any Furnishing'}</span>
                  </div>
                  {search.lastAlertedAt && (
                    <div className="text-[11px] text-seal font-medium pt-1">
                      Last matched: {shortDate(search.lastAlertedAt)}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-line flex items-center justify-between">
                <Button
                  variant="secondary"
                  size="sm"
                  className="text-xs"
                  onClick={() => handleToggle(search.id, search.isAlertEnabled)}
                >
                  {search.isAlertEnabled ? 'Disable Alert' : 'Enable Alert'}
                </Button>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/properties?city=${search.city || ''}&locality=${search.locality || ''}&minRent=${search.minRent || ''}&maxRent=${search.maxRent || ''}`}
                  >
                    <Button variant="secondary" size="sm" className="text-xs">
                      Search Now
                    </Button>
                  </Link>
                  <Button
                    variant="danger"
                    size="sm"
                    className="text-xs"
                    onClick={() => handleDelete(search.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-card max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h2 className="text-lg font-bold text-ink">Create Saved Search & Alert</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-ink text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4 text-sm">
              <div>
                <label className="block font-semibold text-ink mb-1">Search Name</label>
                <input
                  className="w-full h-10 px-3 border border-line rounded-card text-sm bg-white"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. 3 BHK in Baner under ₹45k"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-ink mb-1">City</label>
                  <input
                    className="w-full h-10 px-3 border border-line rounded-card text-sm bg-white"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="Pune, Mumbai..."
                  />
                </div>
                <div>
                  <label className="block font-semibold text-ink mb-1">Locality</label>
                  <input
                    className="w-full h-10 px-3 border border-line rounded-card text-sm bg-white"
                    value={formData.locality}
                    onChange={(e) => setFormData({ ...formData, locality: e.target.value })}
                    placeholder="Baner, Koregaon Park..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-ink mb-1">Min Budget (₹)</label>
                  <input
                    type="number"
                    className="w-full h-10 px-3 border border-line rounded-card text-sm bg-white"
                    value={formData.minRent}
                    onChange={(e) => setFormData({ ...formData, minRent: e.target.value })}
                    placeholder="20000"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-ink mb-1">Max Budget (₹)</label>
                  <input
                    type="number"
                    className="w-full h-10 px-3 border border-line rounded-card text-sm bg-white"
                    value={formData.maxRent}
                    onChange={(e) => setFormData({ ...formData, maxRent: e.target.value })}
                    placeholder="50000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-ink mb-1">BHK</label>
                  <select
                    className="w-full h-10 px-3 border border-line rounded-card text-sm bg-white"
                    value={formData.minBhk}
                    onChange={(e) => setFormData({ ...formData, minBhk: e.target.value, maxBhk: e.target.value })}
                  >
                    <option value="">Any BHK</option>
                    <option value="1">1 BHK</option>
                    <option value="2">2 BHK</option>
                    <option value="3">3 BHK</option>
                    <option value="4">4+ BHK</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-ink mb-1">Alert Frequency</label>
                  <select
                    className="w-full h-10 px-3 border border-line rounded-card text-sm bg-white"
                    value={formData.frequency}
                    onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                  >
                    <option value="INSTANT">Instant Alert</option>
                    <option value="DAILY">Daily Digest</option>
                    <option value="WEEKLY">Weekly Summary</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-line flex justify-end gap-3">
                <Button variant="secondary" size="md" type="button" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="md" type="submit" disabled={creating}>
                  {creating ? 'Saving...' : 'Save & Enable Alert'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
